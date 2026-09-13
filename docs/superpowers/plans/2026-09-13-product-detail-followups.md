# 商品详情页后续三问题修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复三个遗留问题：就近库存全仓库可见（含距离未知/城市标记）、商品标题与 SKU 区不再显示 P+时间戳自动编码、商品 9 张图片编辑保存落库成功。

**Architecture:** 后端库存查询放宽过滤（删除城市/坐标两处 continue），前端就近库存显示「距离未知/服务全城」；新建商品变体名改用商品名（不再用 SKU 编码），详情页标题按「无规格隐藏变体名、多规格显示」规则拼接、SKU 区自动编码降级为规格名；web-admin 图片渠道保险去掉静默吞错并纳入 featuredAssetId，重建部署后对存量数据（P 编码变体名、商品 72 渠道关联）做一次性修正。

**Tech Stack:** Vendure（inventory-plugin）、Nuxt（nshop 前端）、Vite+uni-app（web-admin）、Vitest、Playwright（手机视口回归）、MySQL。

**关联设计文档：** `docs/superpowers/specs/2026-09-13-product-detail-followups-design.md`

---

## 任务概览与文件地图

| 任务 | 仓库 | 文件 |
|---|---|---|
| T1 后端库存全展示 | vendure | `packages/inventory-plugin/src/inventory.service.ts` |
| T2 就近库存显示优化 | nshop | `layers/base/app/utils/nearby-stock.ts`（新建）、`layers/base/app/components/product/NearbyStores.vue`、`layers/base/app/utils/__tests__/nearby-stock.spec.ts`（新建） |
| T3 标题/SKU 显示规则 | nshop | `layers/base/app/utils/product-title.ts`（新建）、`layers/base/app/utils/__tests__/product-title.spec.ts`（新建）、`layers/base/app/composables/useProductDetailView.ts`、`layers/base/app/components/product-detail/DetailClassic.vue`、`layers/base/app/components/product-detail/DetailFloor.vue`、`layers/base/i18n/locales/*.ts`（12 个） |
| T4 web-admin 修复 | vshop | `web-admin/src/apis/product.ts` |
| T5 本地构建验证 | vendure/nshop/vshop | 各端 build 命令 |
| T6 线上部署 | 三端 | vendure `_deploy.ps1` / nshop `scripts/deploy.mjs` / web-admin `scripts/deploy.mjs` |
| T7 存量数据修正 | MySQL | P 编码变体名、商品 72 渠道关联 |
| T8 回归验证与文档 | nshop | Playwright 手机视口截图 + 操作手册 |

---

### Task 1: 后端就近库存改为全仓库展示

**Files:**
- Modify: `d:\zhao\vendure\packages\inventory-plugin\src\inventory.service.ts:491-497`

背景：线上 3 个仓库中默认仓有货但无坐标、长春仓只服务长春市，双重过滤导致带定位用户查询结果为空，前端显示「暂无可查看的门店库存」。设计已批准：全部仓库返回，无坐标仓库排末尾（`distanceKm = MAX_SAFE_INTEGER`），由前端显示「距离未知」。

- [ ] **Step 1: 删除两处过滤**

将 `findNearbyStock` 中的循环体：

```ts
for (const loc of locations) {
    if (options.city && !this.locationServesCity(loc, options.city)) {
        continue;
    }
    // 带定位时跳过无坐标仓库：无法计算“就近”距离，避免 9e15/INF 干扰结果与前端展示
    if (origin && !this.locationHasCoords(loc)) {
        continue;
    }
    const distanceKm = ...
```

改为（删除两个 if 块，保留距离计算与排序逻辑）：

```ts
for (const loc of locations) {
    const distanceKm = ...
```

同时删除不再被引用的私有方法（若确认无其他调用点）：

```ts
private locationServesCity(loc: StockLocation, city: string): boolean { ... }
private locationHasCoords(loc: StockLocation): boolean { ... }
```

先用 `rg -n "locationServesCity|locationHasCoords" d:\zhao\vendure\packages\inventory-plugin\src` 确认除 491-497 与定义处外无其他调用点后删除。

- [ ] **Step 2: 编译验证**

Run: `cd d:\zhao\vendure && npx tsc --noEmit -p packages/inventory-plugin/tsconfig.json`
Expected: 无报错（若该包无独立 tsconfig，则运行 `npm run build` 全量编译，见 T5）

- [ ] **Step 3: Commit**

```bash
git -C d:\zhao\vendure add packages/inventory-plugin/src/inventory.service.ts
git -C d:\zhao\vendure commit -m "fix(inventory): 就近库存返回全部仓库，不因城市/坐标过滤"
```

---

### Task 2: 就近库存前端显示「距离未知」与「服务全城」

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\nearby-stock.ts`
- Create: `d:\zhao\nshop\layers\base\app\utils\__tests__\nearby-stock.spec.ts`
- Modify: `d:\zhao\nshop\layers\base\app\components\product\NearbyStores.vue`

背景：后端无坐标仓库返回 `Number.MAX_SAFE_INTEGER`（约 9e15），当前 `formatDistance` 只处理 `null`，会渲染成超长数字串；`serviceCities` 为空时不显示服务城市行。设计已批准：距离超阈值显示「距离未知」、城市为空显示「服务全城」。

- [ ] **Step 1: 写失败测试**

Create: `d:\zhao\nshop\layers\base\app\utils\__tests__\nearby-stock.spec.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatNearbyDistance, serviceCityLabel } from "../nearby-stock";

describe("formatNearbyDistance", () => {
  it("null 显示距离未知", () => {
    expect(formatNearbyDistance(null)).toBe("距离未知");
  });
  it("超大值（后端无坐标返回 MAX_SAFE_INTEGER）显示距离未知", () => {
    expect(formatNearbyDistance(Number.MAX_SAFE_INTEGER)).toBe("距离未知");
    expect(formatNearbyDistance(1e10)).toBe("距离未知");
  });
  it("小于 1km 显示米", () => {
    expect(formatNearbyDistance(0.45)).toBe("450m");
  });
  it("大于等于 1km 显示一位小数 km", () => {
    expect(formatNearbyDistance(2.33)).toBe("2.3km");
  });
});

describe("serviceCityLabel", () => {
  it("有城市 join 顿号", () => {
    expect(serviceCityLabel(["长春市", "沈阳市"])).toBe("长春市、沈阳市");
  });
  it("空数组显示全城", () => {
    expect(serviceCityLabel([])).toBe("全城");
  });
  it("undefined 显示全城", () => {
    expect(serviceCityLabel(undefined)).toBe("全城");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd d:\zhao\nshop && npx vitest run layers/base/app/utils/__tests__/nearby-stock.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

Create: `d:\zhao\nshop\layers\base\app\utils\nearby-stock.ts`

```ts
export const DISTANCE_UNKNOWN_THRESHOLD = 1e9;

export function formatNearbyDistance(km: number | null): string {
  if (km == null || km >= DISTANCE_UNKNOWN_THRESHOLD) return "距离未知";
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

export function serviceCityLabel(
  cities: string[] | null | undefined,
): string {
  return cities?.length ? cities.join("、") : "全城";
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd d:\zhao\nshop && npx vitest run layers/base/app/utils/__tests__/nearby-stock.spec.ts`
Expected: PASS（4+3 用例）

- [ ] **Step 5: 接入组件**

Modify: `d:\zhao\nshop\layers\base\app\components\product\NearbyStores.vue`

在 `<script setup>` 顶部导入：

```ts
import {
  formatNearbyDistance,
  serviceCityLabel,
} from "~~/layers/base/app/utils/nearby-stock";
```

删除组件内 `formatDistance` 函数（第 20-23 行）：

```ts
function formatDistance(km: number | null): string {
  if (km == null) return "距离未知";
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}
```

模板中两处替换：

```html
{{ formatDistance(loc.distanceKm) }}
```
改为：
```html
{{ formatNearbyDistance(loc.distanceKm) }}
```

```html
<span v-if="loc.location.serviceCities?.length" class="truncate">
  服务城市：{{ loc.location.serviceCities.join("、") }}
</span>
```
改为：
```html
<span class="truncate">
  服务城市：{{ serviceCityLabel(loc.location.serviceCities) }}
</span>
```

- [ ] **Step 6: Commit**

```bash
git -C d:\zhao\nshop add layers/base/app/utils/nearby-stock.ts layers/base/app/utils/__tests__/nearby-stock.spec.ts layers/base/app/components/product/NearbyStores.vue
git -C d:\zhao\nshop commit -m "feat(nearby): 距离未知与服务全城显示，后端全仓库返回"
```

---

### Task 3: 标题与 SKU 区显示规则（无规格隐藏变体名 / 自动编码降级）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\product-title.ts`
- Create: `d:\zhao\nshop\layers\base\app\utils\__tests__\product-title.spec.ts`
- Modify: `d:\zhao\nshop\layers\base\app\composables\useProductDetailView.ts:3-15`
- Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\DetailClassic.vue:36-38`
- Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\DetailFloor.vue:81-83`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\*.ts`（12 个：bg-BG/de-DE/en-US/es-ES/fa-IR/fr-FR/it-IT/ja-JP/ko-KR/pt-BR/ru-RU/zh-CN）

背景：新建商品时 `createVariantsForProduct` 用 `name: input.sku` 导致变体名 = `p1788780326947`；详情页标题 `productName` 在变体名≠商品名时拼接变体名；SKU 区直接渲染 `selectedVariant.sku`。设计已批准（用户确认）：**无变体（无规格）隐藏变体名，有变体（多规格）显示变体名称**；自动编码降级为规格名/默认。

- [ ] **Step 1: 写失败测试**

Create: `d:\zhao\nshop\layers\base\app\utils\__tests__\product-title.spec.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  composeProductTitle,
  isAutoSku,
  resolveSkuLabel,
} from "../product-title";

describe("isAutoSku", () => {
  it("P+时间戳 判定为自动编码", () => {
    expect(isAutoSku("p1788780326947")).toBe(true);
    expect(isAutoSku("P1788780326947")).toBe(true);
  });
  it("真实 SKU 非自动编码", () => {
    expect(isAutoSku("SPU-2024-001")).toBe(false);
    expect(isAutoSku("")).toBe(false);
    expect(isAutoSku(null)).toBe(false);
  });
});

describe("composeProductTitle", () => {
  it("无规格（单 SKU）隐藏变体名，即使变体名是自动编码", () => {
    expect(composeProductTitle("国信南山温泉节假日房间", "p1788780326947", false)).toBe(
      "国信南山温泉节假日房间",
    );
  });
  it("无规格且变体名等于商品名时只显示商品名", () => {
    expect(composeProductTitle("智能手环", "智能手环", false)).toBe("智能手环");
  });
  it("多规格显示「商品名 规格组合」", () => {
    expect(composeProductTitle("智能手环", "经典黑", true)).toBe("智能手环 经典黑");
  });
  it("多规格但变体名等于商品名时不重复", () => {
    expect(composeProductTitle("智能手环", "智能手环", true)).toBe("智能手环");
  });
});

describe("resolveSkuLabel", () => {
  it("真实 SKU 原样返回", () => {
    expect(resolveSkuLabel("SPU-2024-001", "经典黑", true)).toEqual({
      type: "sku",
      text: "SPU-2024-001",
    });
  });
  it("自动编码 + 无规格 → 规格：默认（text 空串）", () => {
    expect(resolveSkuLabel("p1788780326947", "p1788780326947", false)).toEqual({
      type: "spec",
      text: "",
    });
  });
  it("自动编码 + 多规格 → 规格：变体名", () => {
    expect(resolveSkuLabel("p1788780326947", "经典黑", true)).toEqual({
      type: "spec",
      text: "经典黑",
    });
  });
  it("无 SKU 返回 null", () => {
    expect(resolveSkuLabel(null, "经典黑", true)).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd d:\zhao\nshop && npx vitest run layers/base/app/utils/__tests__/product-title.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

Create: `d:\zhao\nshop\layers\base\app\utils\product-title.ts`

```ts
const AUTO_SKU = /^P\d+$/;

export function isAutoSku(sku: string | null | undefined): boolean {
  return !!sku && AUTO_SKU.test(sku);
}

export function composeProductTitle(
  productName: string,
  variantName: string | null | undefined,
  hasOptions: boolean,
): string {
  if (hasOptions && variantName && variantName !== productName) {
    return `${productName} ${variantName}`.trim();
  }
  return productName || "";
}

export type SkuLabel =
  | { type: "sku"; text: string }
  | { type: "spec"; text: string };

export function resolveSkuLabel(
  sku: string | null | undefined,
  variantName: string | null | undefined,
  hasOptions: boolean,
): SkuLabel | null {
  if (!sku) return null;
  if (!isAutoSku(sku)) return { type: "sku", text: sku };
  if (hasOptions && variantName) return { type: "spec", text: variantName };
  return { type: "spec", text: "" };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd d:\zhao\nshop && npx vitest run layers/base/app/utils/__tests__/product-title.spec.ts`
Expected: PASS（11 用例）

- [ ] **Step 5: 接入 useProductDetailView**

Modify: `d:\zhao\nshop\layers\base\app\composables\useProductDetailView.ts`

当前内容（3-15 行）：

```ts
import { storeToRefs } from "pinia";

export function useProductDetailView() {
  const productStore = useProductStore();
  const { product, selectedVariant } = storeToRefs(productStore);
  const { isServiceable } = useCityService();
  const productServiceable = computed(() => isServiceable(product.value));
  // 详情页标题应体现商品名 + 所选项变体名（例：智能手环 6 经典黑），缺省时依次回退
  const productName = computed(() => {
    const pName = product.value?.name ?? "";
    const vName = selectedVariant.value?.name;
    if (vName && vName !== pName) return `${pName} ${vName}`.trim();
    return pName || vName || "";
  });
  return { product, selectedVariant, productName, productServiceable };
}
```

改为：

```ts
import { storeToRefs } from "pinia";
import { composeProductTitle, resolveSkuLabel } from "../utils/product-title";

export function useProductDetailView() {
  const productStore = useProductStore();
  const { product, selectedVariant, hasOptions } = storeToRefs(productStore);
  const { isServiceable } = useCityService();
  const productServiceable = computed(() => isServiceable(product.value));
  // 无规格商品隐藏变体名（新建单 SKU 商品变体名=自动编码，无意义）；多规格显示「商品名 规格组合」
  const productName = computed(() =>
    composeProductTitle(
      product.value?.name ?? "",
      selectedVariant.value?.name,
      hasOptions.value,
    ),
  );
  // SKU 区：真实 SKU 展示编码；自动编码降级为规格名/默认
  const skuLabel = computed(() =>
    resolveSkuLabel(
      selectedVariant.value?.sku,
      selectedVariant.value?.name,
      hasOptions.value,
    ),
  );
  return { product, selectedVariant, productName, skuLabel, productServiceable };
}
```

确认 `hasOptions` 已由 store 返回（`useProductStore.ts` 第 149 行 `hasOptions`，见 Task 3 文件上下文）。

- [ ] **Step 6: 接入 DetailClassic**

Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\DetailClassic.vue`

第 6 行解构增加 `skuLabel`：

```ts
const { product, selectedVariant, productName, skuLabel, productServiceable } = useProductDetailView();
```

第 36-38 行：

```html
<span v-if="selectedVariant?.sku" class="text-[11px] text-gray-400">{{ t('messages.detail.sku', { code: selectedVariant!.sku }) }}</span>
```
改为：

```html
<span v-if="skuLabel" class="text-[11px] text-gray-400">
  <template v-if="skuLabel.type === 'sku'">
    {{ t('messages.detail.sku', { code: skuLabel.text }) }}
  </template>
  <template v-else>
    {{ t('messages.detail.spec', { name: skuLabel.text || t('messages.detail.specDefault') }) }}
  </template>
</span>
```

- [ ] **Step 7: 接入 DetailFloor**

Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\DetailFloor.vue`

第 6 行解构增加 `skuLabel`（与 DetailClassic 相同）。

第 81-83 行 SKU 渲染（先读文件确认精确代码，模式与 DetailClassic 相同）：

```html
<span v-if="selectedVariant.sku" class="text-[11px] text-gray-400">{{ t('messages.detail.sku', { code: selectedVariant.sku }) }}</span>
```
改为与 Step 6 相同的三行模板（注意此处 `selectedVariant` 无 `!`，`skuLabel` 逻辑一致）。

- [ ] **Step 8: 补充 i18n 词条（12 个语言包）**

在每个 `d:\zhao\nshop\layers\base\i18n\locales\<xx>.ts` 的 `messages.detail` 对象中，`sku` 词条旁新增：

```ts
spec: "规格: {name}",       // en-US: "Spec: {name}"，各语言按既有风格翻译
specDefault: "默认",        // en-US: "Default"，各语言按既有风格翻译
```

以 zh-CN 为例，先读 `zh-CN.ts` 找到 `detail` 节点内 `sku: 'SKU: {code}'` 行，在其后追加。其余 11 个语言包（bg-BG/de-DE/es-ES/fa-IR/fr-FR/it-IT/ja-JP/ko-KR/pt-BR/ru-RU）同样追加对应翻译（翻译可参考该语言包内 `detail` 节点既有措辞风格；en-US 必须准确，其余可用机器翻译级文案）。

- [ ] **Step 9: Commit**

```bash
git -C d:\zhao\nshop add layers/base/app/utils/product-title.ts layers/base/app/utils/__tests__/product-title.spec.ts layers/base/app/composables/useProductDetailView.ts layers/base/app/components/product-detail/DetailClassic.vue layers/base/app/components/product-detail/DetailFloor.vue layers/base/i18n/locales
git -C d:\zhao\nshop commit -m "feat(detail): 标题按规格规则拼接，SKU 区隐藏自动编码降级为规格名"
```

---

### Task 4: web-admin 变体名与图片渠道保险修复

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\product.ts:423-435`（CreateVariantInput）
- Modify: `d:\zhao\vshop\web-admin\src\apis\product.ts:464`（translations.name）
- Modify: `d:\zhao\vshop\web-admin\src\apis\product.ts:741-753`（createProductFull 单变体）
- Modify: `d:\zhao\vshop\web-admin\src\apis\product.ts:67-85`（ensureAssetsInCurrentChannel）
- Modify: `d:\zhao\vshop\web-admin\src\apis\product.ts:724`（createProductFull 调用保险）

背景：新建商品变体名 = SKU 编码（`p+时间戳`）；图片渠道保险静默吞错且未覆盖 featuredAssetId。设计已批准：变体名改用商品名；保险去静默、纳入 featuredAssetId。

- [ ] **Step 1: CreateVariantInput 增加 productName**

Modify: `d:\zhao\vshop\web-admin\src\apis\product.ts`，`export interface CreateVariantInput`（423 行起）增加字段：

```ts
export interface CreateVariantInput {
  productId: string;
  sku: string;
  /** 变体显示名；缺省回退 sku（多规格矩阵由调用方传规格组合，单品传商品名） */
  productName?: string;
  // ...其余字段保持
}
```

- [ ] **Step 2: 变体名不再等于 SKU**

Modify: 第 464 行：

```ts
translations: [{ languageCode: PRODUCT_LANGUAGE_CODE, name: input.sku }],
```
改为：
```ts
translations: [{ languageCode: PRODUCT_LANGUAGE_CODE, name: input.productName || input.sku }],
```

- [ ] **Step 3: createProductFull 单变体传商品名**

Modify: 第 741-753 行 `createVariantsForProduct({` 调用处，在 `productId: pid,` 之后新增一行：

```ts
productName: input.name,
```

- [ ] **Step 4: 图片保险去静默并纳入 featuredAssetId**

Modify: `ensureAssetsInCurrentChannel`（67-85 行）：

当前：

```ts
async function ensureAssetsInCurrentChannel(assetIds: string[]): Promise<void> {
  const ids = (assetIds || []).filter(Boolean);
  if (!ids.length) return;
  try {
    const { activeChannel } = await getAdminClient().request<{ activeChannel: { id: string } }>(
      `query ActiveChannel { activeChannel { id } }`,
    );
    const channelId = activeChannel?.id;
    if (!channelId) return;
    await getAdminClient().request(
      `mutation AssignAssets($input: AssignAssetsToChannelInput!) {
        assignAssetsToChannel(input: $input) { id }
      }`,
      { input: { assetIds: ids, channelId } },
    );
  } catch {
    // 幂等且非阻断：权限/网络异常不影响主体保存（资产也已存在，assign 失败仅个别渠道临时不可见）
  }
}
```

改为：

```ts
async function ensureAssetsInCurrentChannel(
  assetIds: string[],
  featuredAssetId?: string,
): Promise<void> {
  const ids = Array.from(
    new Set([...(assetIds || []).filter(Boolean), ...(featuredAssetId ? [featuredAssetId] : [])]),
  );
  if (!ids.length) return;
  try {
    const { activeChannel } = await getAdminClient().request<{ activeChannel: { id: string } }>(
      `query ActiveChannel { activeChannel { id } }`,
    );
    const channelId = activeChannel?.id;
    if (!channelId) return;
    await getAdminClient().request(
      `mutation AssignAssets($input: AssignAssetsToChannelInput!) {
        assignAssetsToChannel(input: $input) { id }
      }`,
      { input: { assetIds: ids, channelId } },
    );
  } catch (err) {
    // 幂等且非阻断：assign 失败仅个别渠道临时不可见；但必须留痕，避免跨渠道图片被静默清空难排查
    console.error('[ensureAssetsInCurrentChannel] assignAssetsToChannel 失败', err);
  }
}
```

- [ ] **Step 5: createProductFull / updateProductFull 调用保险传 featuredAssetId**

Modify: 第 724 行（createProductFull 内）：

```ts
if (input.assetIds?.length) await ensureAssetsInCurrentChannel(input.assetIds);
```
改为：
```ts
if (input.assetIds?.length || input.featuredAssetId) {
  await ensureAssetsInCurrentChannel(input.assetIds, input.featuredAssetId);
}
```

再定位 `updateProductFull` 中调用 `ensureAssetsInCurrentChannel(input.assetIds)` 的位置（用 `rg -n "ensureAssetsInCurrentChannel" d:\zhao\vshop\web-admin\src\apis\product.ts` 确认行号），同步改为：

```ts
if (input.assetIds?.length || input.featuredAssetId) {
  await ensureAssetsInCurrentChannel(input.assetIds, input.featuredAssetId);
}
```

- [ ] **Step 6: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/apis/product.ts
git -C d:\zhao\vshop commit -m "fix(admin): 新建商品变体名用商品名；图片渠道保险去静默并纳入主图"
```

---

### Task 5: 三端本地构建验证

- [ ] **Step 1: vendure 编译**

Run: `cd d:\zhao\vendure && npm run build`
Expected: 全部包编译成功（inventory-plugin 无 TS 报错）

- [ ] **Step 2: nshop 构建 + 单测**

Run: `cd d:\zhao\nshop && npx vitest run`
Expected: 全部用例 PASS（含新增 nearby-stock / product-title）

Run: `cd d:\zhao\nshop && npm run build`
Expected: 构建成功（若无 schema 变更，线上 shop-api schema 兼容；如遇 gql schema 校验失败，先执行 T6 的 vendure 部署再重跑）

- [ ] **Step 3: web-admin 构建 + 产物校验**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 构建成功

Run: `rg -n "assignAssetsToChannel" d:\zhao\vshop\web-admin\dist\build\h5\assets`
Expected: 至少一处命中（产物含有效保险 mutation 字段名），同时确认无 `n(input: $input)` 残留。

- [ ] **Step 4: Commit 构建产物（若仓库惯例跟踪 dist）**

web-admin 仓库惯例跟踪 `web-admin/dist`（git log 存在构建产物提交 10c04c5），提交新产物：

```bash
git -C d:\zhao\vshop add web-admin/dist
git -C d:\zhao\vshop commit -m "build(h5): 商品详情三问题修复后的管理端构建产物"
```

---

### Task 6: 线上部署（⚠️ 需用户确认后执行，见 Step 0）

- [ ] **Step 0: 用户确认**

部署涉及线上环境，执行前向用户确认以下清单：
- vendure 后端 `_deploy.ps1`（构建 marketplace-plugin → 提交 → 服务器 git pull + pm2 restart）
- nshop 前端 `node scripts/deploy.mjs`（scp 产物 → 服务器解压）
- web-admin 前端 `node scripts/deploy.mjs`（本地 build:h5 → tar → scp → 解压 + nginx reload）

- [ ] **Step 1: 部署 vendure 后端**

按既有机制（先确认 `d:\zhao\vendure\packages\dev-server\_deploy.ps1` 内容，按其流程执行：构建插件 → git push → 服务器 pull + pm2 restart）。

- [ ] **Step 2: 部署 nshop**

Run: `cd d:\zhao\nshop && node scripts/deploy.mjs`
（若 scripts/deploy.mjs 不存在则按上一轮六项修复的部署记录执行同等操作）

- [ ] **Step 3: 部署 web-admin**

Run: `cd d:\zhao\vshop\web-admin && node scripts/deploy.mjs`
Expected: 输出 `产物校验通过` 与 `deploy done`

- [ ] **Step 4: 线上产物复核**

Run: 浏览器打开 `https://e.joho.cn/guanli/` 确认管理端可正常登录加载；开发者工具 Network 检索产物 js 含 `assignAssetsToChannel`（或直接请求最新 `assets/apis-product.*.js` grep）。

---

### Task 7: 存量数据修正

**Files:**
- Create: `d:\zhao\vshop\web-admin\scripts\fix-auto-variant-names.sql`（临时脚本，执行后删除或保留在 scripts 下）
- Create: `d:\zhao\vshop\web-admin\scripts\fix-product72-assets.mjs`（临时脚本）

背景：存量变体名 `p+时间戳` 需批量改回商品名；商品 72 的 featuredAsset(42) 只属于 t1 渠道，需补渠道关联使各端可见。

- [ ] **Step 1: 备份并统计 P 编码变体**

连线上数据库（先确认连接方式，可复用 `d:\zhao\vendure\packages\dev-server` 的数据库凭据配置）：

```sql
-- 统计
SELECT COUNT(*) FROM product_variant_translation pvt
JOIN product_variant pv ON pvt.variantId = pv.id
WHERE pvt.name REGEXP '^[Pp][0-9]+$';
```

- [ ] **Step 2: 批量修正变体名**

```sql
UPDATE product_variant_translation pvt
JOIN product_variant pv ON pvt.variantId = pv.id
JOIN (
  SELECT pt.productId, pt.name
  FROM product_translation pt
  WHERE pt.languageCode = 'zh_Hans'
) zh ON zh.productId = pv.productId
SET pvt.name = zh.name
WHERE pvt.name REGEXP '^[Pp][0-9]+$';
```

执行后抽查国信南山商品变体名：

```sql
SELECT pvt.name, pv.sku FROM product_variant_translation pvt
JOIN product_variant pv ON pvt.variantId = pv.id
JOIN product p ON pv.productId = p.id
WHERE p.name LIKE '%国信南山%' AND pvt.languageCode = 'zh_Hans';
```

Expected: 变体名 = 商品名，无 P 编码残留。

- [ ] **Step 3: 商品 72 渠道与资产关系核对**

```sql
SELECT id, name FROM product WHERE id = 72;
SELECT pa.productId, pa.assetId, a.name FROM product_asset pa
JOIN asset a ON pa.assetId = a.id WHERE pa.productId = 72;
-- 资产所属渠道
SELECT ac.assetId, c.code FROM asset_channel ac
JOIN channel c ON ac.channelId = c.id WHERE ac.assetId = 42;
-- 商品所属渠道
SELECT pc.productId, c.code FROM product_channel pc
JOIN channel c ON pc.channelId = c.id WHERE pc.productId = 72;
```

- [ ] **Step 4: 补资产渠道关联**

对商品 72 的每个资产（含 featuredAssetId=42），将其写入商品所在渠道的 `asset_channel`（幂等，防重复）：

```sql
INSERT IGNORE INTO asset_channel (assetId, channelId)
SELECT pa.assetId, pc.channelId
FROM product_asset pa
JOIN product_channel pc ON pc.productId = pa.productId
WHERE pa.productId = 72
  AND pa.assetId NOT IN (
    SELECT assetId FROM asset_channel ac
    WHERE ac.channelId IN (SELECT channelId FROM product_channel WHERE productId = 72)
  );
```

若商品 72 当前 `product_asset` 已被清空（保存失败所致），先确认识别用户保存的 9 张图来源（媒体库资产仍在），由用户在修复后的后台重新编辑保存一次回填（T8 回归），本步骤仅保证现有 featuredAsset(42) 与历史资产跨渠道可见。

- [ ] **Step 5: Commit 脚本（若保留）或删除临时文件**

```bash
git -C d:\zhao\vshop add web-admin/scripts/fix-auto-variant-names.sql
git -C d:\zhao\vshop commit -m "chore(scripts): 存量 P 编码变体名修正 SQL（执行过一次后保留供审计）"
```

---

### Task 8: 回归验证与操作手册

**Files:**
- Modify: `d:\zhao\nshop\tmp\verify-final.py`（或新建回归脚本 `verify-followups.py`）
- Modify: 操作手册（商户端/管理端，按既有文档位置补充）

- [ ] **Step 1: 就近库存回归（手机视口）**

新建 `d:\zhao\nshop\tmp\verify-followups.py`（复用 `verify-final.py` 的 Playwright 基建：390×844 视口、cookie 注入城市、DOMAIN 常量）：
1. 访问有货商品详情页（如国信南山温泉），断言就近库存区出现「默认仓」「距离未知」「服务城市：全城」；长春仓带距离与服务城市。
2. 截图 `verify-followups-nearby.png`。

- [ ] **Step 2: 标题/SKU 回归（手机视口）**

同一脚本：
1. 断言标题不含 `p\d{13}`；SKU 区无 `SKU: p1` 前缀的自动编码；多规格商品标题含「商品名 规格名」。
2. 截图 `verify-followups-title.png`（单规格商品）与 `verify-followups-title-matrix.png`（多规格商品）。

- [ ] **Step 3: 商品 72 保存回归（管理端，桌面视口）**

1. 登录 `https://e.joho.cn/guanli/`（用 `scripts/smoke-login.mjs` 的登录凭据流程）。
2. 打开商品 72 编辑页，选择 9 张图片保存。
3. 断言保存成功、刷新后 `assetIds` 回填 9 张；C 端详情页 gallery 出现 9 张图。
4. 截图 `verify-followups-product72-saved.png`。

- [ ] **Step 4: 操作手册补充**

按既有文档位置（`d:\zhao\vshop\docs\demo\` 或 nshop 操作手册）补充：
- 就近库存：说明「全仓库展示、无坐标显示距离未知、服务城市为空显示全城」。
- 标题/SKU：说明「无规格商品标题只显示商品名；SKU 区自动编码不展示」。
- 商品编辑：说明图片保存的渠道绑定机制与失败排查（后台 console 有 ensureAssetsInCurrentChannel 错误留痕）。
- 附上 Task 8 Step 1-3 全部手机/桌面截图。

- [ ] **Step 5: 提交截图与文档**

```bash
git -C d:\zhao\nshop add tmp/verify-followups.py tmp/verify-followups-*.png
git -C d:\zhao\nshop commit -m "test(regression): 三问题修复回归截图"
```

---

## 自审结论

- **Spec 覆盖**：设计文档三问题（就近库存/标题 SKU/图片保存）均有对应任务：T1-T2（就近库存）、T3-T4（标题 SKU + 变体名）、T4-T7（图片保险 + 部署 + 数据修复）；验收标准覆盖在 T2/T3/T6/T8。
- **占位符**：无 TBD/TODO；所有代码改动给出完整片段或精确行号与确认命令。
- **类型一致性**：`formatNearbyDistance`/`serviceCityLabel`/`composeProductTitle`/`resolveSkuLabel`/`isAutoSku` 在测试与实现、组件调用处命名一致；`skuLabel.type` 为 `'sku' | 'spec'`，组件分支一致；`ensureAssetsInCurrentChannel(assetIds, featuredAssetId?)` 两处调用签名一致。
