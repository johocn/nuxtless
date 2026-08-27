# nshop C 端详情页体验强化 — 图集视频 / 就近库存兜底 / 城市配送提示 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 C 端详情页三项体验断点：①图集支持视频优先展示并自动播放、修手机端主图空白；②就近库存作纯展示层、根治"有货却就近失败"矛盾并降级；③城市配送限制提示 + 「可购买城市」折叠查看。

**Architecture:** 前端 `useProductStore` 单一响应式源，新增 `mediaAssets` 视频优先的有序媒体数组驱动 `ProductGallery` 首帧渲染；就近库存后端 inventory-plugin 统一城市匹配（与前端 `matchCity` 一致）+ 前端四态平滑降级；城市配送基于 `useCityService` 结构化结果在三版式购买栏下加折叠「可购买城市」。全程对齐多语言/多城市/四级回退规则。

**Tech Stack:** Nuxt 3 / Vue 3 / Pinia / NuxtUI / GraphQL Codegen（前端）；Vendure + inventory-plugin TypeScript（后端）。

**Spec:** `docs/superpowers/specs/2026-08-27-nshop-c-detail-ux-design.md`

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `packages/inventory-plugin/src/inventory.service.ts` | 修改 | `locationServesCity` 改为前缀/包含匹配 |
| `layers/base/gql/fragments/product.gql` | 修改 | fragment 补 `videoUrl`（商品+变体）|
| `layers/base/stores/useProductStore.ts` | 修改 | 新增 `mediaAssets`（视频优先）、修 `galleryAssets` 空兜底 |
| `layers/base/app/components/product/ProductGallery.vue` | 修改 | 支持视频首帧渲染、空图集占位 |
| `layers/base/app/composables/useNearbyStock.ts` | 修改 | 返回四态而非吞错空数组 |
| `layers/base/app/components/product/NearbyStores.vue` | 修改 | 四态平滑降级渲染 |
| `layers/base/app/composables/useCityService.ts` | 修改 | 返回结构化 `{serviceable,reason,serviceCities,belongCity}` |
| `layers/base/app/components/product-detail/DetailClassic.vue` | 修改 | 购买栏下可购买城市折叠入口 |
| `layers/base/app/components/product-detail/DetailFloor.vue` | 修改 | 同上 |
| `layers/base/app/components/product-detail/DetailDualBuy.vue` | 修改 | 同上 |
| `layers/base/app/components/product-detail/ServiceableCityPanel.vue` | 新建 | 可购买城市折叠面板（三版式共用）|
| `layers/base/i18n/locales/zh-CN.ts` | 修改 | 补 i18n 词条 |
| `layers/base/i18n/locales/en-US.ts` | 修改 | 补 i18n 词条 |
| `packages/inventory-plugin/src/.../*.spec.ts` | 新建 | 后端匹配单测 |

---

## Task 1: 后端就近库存城市匹配统一（TDD）

**Files:**
- Modify: `packages/inventory-plugin/src/inventory.service.ts:511-517`
- Test: `packages/inventory-plugin/src/inventory.service.spec.ts`

- [ ] **Step 1: 写失败单测（前缀/包含匹配）**

```ts
import { InventoryService } from "./inventory.service";

describe("InventoryService.locationServesCity", () => {
  // locationServesCity 是 private，通过 describe 可访问 _p 实例方法（或改为可测的纯函数 helper）
  function call(loc: any, city: string): boolean {
    // 假 stockservice 最小化构造
    return (InventoryService.prototype as any).locationServesCity.call(
      { /* no deps used */ },
      loc,
      city,
    );
  }

  const loc = (serviceCities: string[]) =>
    ({ customFields: { serviceCities } }) as any;

  it("精确匹配", () => {
    expect(call(loc(["杭州", "上海"]), "杭州")).toBe(true);
  });
  it("前缀匹配（客户城市=市+省后缀）", () => {
    expect(call(loc(["杭州"]), "杭州市")).toBe(true);
    expect(call(loc(["杭州市"]), "杭州")).toBe(true);
  });
  it("大小写归一", () => {
    expect(call(loc(["Hangzhou"]), "hangzhou")).toBe(true);
  });
  it("无 serviceCities 返回 true（全仓可服务）", () => {
    expect(call(loc([]), "杭州")).toBe(true);
    expect(call({ customFields: {} }, "杭州")).toBe(true);
  });
  it("不匹配返回 false", () => {
    expect(call(loc(["上海"]), "杭州")).toBe(false);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --filter inventory-plugin test -- --run`
Expected: `locationServesCity` 前缀/大小写用例 FAIL（当前 `serviceCities.includes` 精确匹配）

- [ ] **Step 3: 实现前缀/包含匹配**

`inventory.service.ts:511-517` 替换为：

```ts
private locationServesCity(loc: StockLocation, city: string): boolean {
    const serviceCities = (loc.customFields as any)?.serviceCities;
    if (!Array.isArray(serviceCities) || serviceCities.length === 0) {
        return true;
    }
    const norm = (s: string) => s.trim().toLowerCase();
    return serviceCities.some((s: unknown) => {
        if (typeof s !== "string") return false;
        const a = norm(city);
        const b = norm(s);
        return a === b || a.startsWith(b) || b.startsWith(a);
    });
}
```

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --filter inventory-plugin test -- --run`
Expected: 全部用例 PASS

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vendure
git add packages/inventory-plugin/src/inventory.service.ts packages/inventory-plugin/src/inventory.service.spec.ts
git commit -m "fix(inventory): 就近库存城市匹配改为前缀/包含，与前端 matchCity 一致"
```

---

## Task 2: fragment 补 `videoUrl` + 类型 codegen

**Files:**
- Modify: `layers/base/gql/fragments/product.gql`

- [ ] **Step 1: 修改 fragment**

`layers/base/gql/fragments/product.gql`：

```
 1→fragment ProductVariantFragment on ProductVariant {
 2→  ...
 9→  assets {
10→    id
11→    preview
12→  }
13         customFields {
14           videoUrl
15         }
16}
58→fragment ProductBaseFragment on Product {
59→  ...
62→  customFields {
63→    belongCity
64→    serviceCities
65→    displayTemplate
66→        videoUrl
67→  }
68→}
```

- [ ] **Step 2: 触发 codegen**

Run: `pnpm codegen`
Expected: 无错误；`.nuxt/gql/default` 中 `Product.customFields.videoUrl` 与 `ProductVariant.customFields.videoUrl` 可选类型生成

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/gql/fragments/product.gql
git commit -m "feat(detail): fragment 增加 videoUrl（商品+变体 customFields）"
```

---

## Task 3: `useProductStore` 新增媒体数组 + 空图集兜底

**Files:**
- Modify: `layers/base/stores/useProductStore.ts:48-52`

- [ ] **Step 1: 新增类型与 `mediaAssets` / 原图集空兜底**

顶层新增导出类型：

```ts
export interface DetailMedia {
  type: "image" | "video";
  id: string;
  src: string;      // 图片=preview / 视频=videoUrl
  preview?: string; // 图片预览（视频无）
}
```

`galleryAssets` 改为始终返回图片数组，空则占位；新增 `mediaAssets`（视频优先）：

```ts
const galleryAssets = computed(() => {
  const variantAssets = selectedVariant.value?.assets ?? [];
  const productAssets = product.value?.assets ?? [];
  const imgs = variantAssets.length > 0 ? variantAssets : productAssets;
  if (imgs.length > 0) return imgs;
  // 空图集兜底占位，避免手机端空白
  return [{ id: "placeholder", preview: assetPlaceholderSrc() } as any];
});
```

`useProductStore.ts` 新增 import 与 `assetPlaceholderSrc` 工具（放在 `layers/base/app/utils/image.ts`）。在 store 返回对象加入 `mediaAssets`：

```ts
const mediaAssets = computed<DetailMedia[]>(() => {
  const imgs: any[] = galleryAssets.value.filter(
    (a: any) => a.id && a.id !== "placeholder",
  );
  const images: DetailMedia[] = imgs.map((a) => ({
    type: "image",
    id: a.id,
    src: a.preview ?? "",
    preview: a.preview,
  }));
  // 视频优先：选中变体 videoUrl 优先，回退商品 videoUrl
  const variantVideo = selectedVariant.value?.customFields?.videoUrl;
  const productVideo = product.value?.customFields?.videoUrl;
  const videoUrl = (variantVideo || productVideo || "").trim();
  if (videoUrl) {
    return [
      { type: "video", id: "video", src: videoUrl },
      ...images,
    ];
  }
  return images;
});
```

（若 `selectedVariant`/`product` 的 `customFields` 类型未含 `videoUrl`，本次仅作可空访问，TS codegen 后即有。）

- [ ] **Step 2: 工具文件加占位图常量**

`layers/base/app/utils/image.ts` 新增：

```ts
export function assetPlaceholderSrc(): string {
  return "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" fill="#9ca3af" font-size="14" text-anchor="middle" dominant-baseline="middle">暂无图片</text></svg>`,
    );
}
```

- [ ] **Step 3: verify 类型**

Run: `pnpm typecheck`
Expected: 无新增错误（`.nuxt` 类型含 `customFields.videoUrl?`）

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/stores/useProductStore.ts layers/base/app/utils/image.ts
git commit -m "feat(detail): store 新增 mediaAssets 视频优先媒体数组 + 空图集占位兜底"
```

---

## Task 4: `ProductGallery` 支持视频首帧渲染 + 空占位

**Files:**
- Modify: `layers/base/app/components/product/ProductGallery.vue`

- [ ] **Step 1: 引入 mediaAssets 并决定首帧媒体**

`<script setup>` 中：

```ts
import { assetSrc } from "../../utils/image";
const { product, selectedVariant, galleryAssets, mediaAssets } =
  storeToRefs(useProductStore());
// firstIsVideo: 首项为视频
const firstIsVideo = computed(() => mediaAssets.value[0]?.type === "video");
const carousel = useTemplateRef("carousel");
const activeIndex = ref(0);
```

- [ ] **Step 2: 首帧视频渲染**

模板顶部，`firstIsVideo` 时渲染视频卡片；图集 `UCarousel` 用图片 `galleryAssets`（不含视频，lightbox 不变）。视频自动播放（静音+playsinline）：

```vue
<template>
  <div class="w-full flex-1">
    <video
      v-if="firstIsVideo"
      :src="mediaAssets[0].src"
      class="mx-auto h-62.5 w-full rounded-lg object-contain sm:h-87.5"
      autoplay muted loop playsinline preload="metadata"
      controls
    />
    <UCarousel
      v-else
      ref="carousel"
      v-slot="{ item }"
      :items="galleryAssets"
      ...
    >
      <NuxtImg ... />
    </UCarousel>
    <!-- 缩略图：视频角标 + 图片缩略 -->
    <div class="mx-auto flex max-w-xs justify-center gap-4 pt-4">
      <div v-if="firstIsVideo" class="relative">
        <video :src="mediaAssets[0].src" class="h-11.25 w-11.25 rounded-lg object-cover" muted preload="metadata" />
        <span class="absolute bottom-0 right-0 rounded bg-black/60 px-0.5 text-[9px] text-white">▶</span>
      </div>
      <div
        v-for="(item, index) in galleryAssets"
        :key="item.id"
        ...
        <NuxtImg ... />
      </div>
    </div>
  </div>
</template>
```

> 说明：`autoplay muted loop playsinline` 满足 iOS/各浏览器自动播放策略；`preload="metadata"` 避免 SSR/首帧全量下载。

- [ ] **Step 3: 验证**

Run: `pnpm dev`
Expected: 有 `videoUrl` 商品首帧视频自动播放 + 缩略图；纯图片商品图集不回归；无图商品显示占位。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/components/product/ProductGallery.vue
git commit -m "feat(detail): ProductGallery 支持视频首帧自动播放 + 空图集占位"
```

---

## Task 5: `useNearbyStock` 四态返回（不再吞错）

**Files:**
- Modify: `layers/base/app/composables/useNearbyStock.ts`

- [ ] **Step 1: 重写返回状态**

`useNearbyStock.ts`：`fetchNearbyStock` 返回 `{ state, items, message }` 而非裸数组：

```ts
export type NearbyState = "ok" | "no-coords" | "no-stock" | "error";
export interface NearbyResult {
  state: NearbyState;
  items: NearStockLocation[];
  message: string | null;
}
```

`fetchNearbyStock` 逻辑：

```ts
loading.value = true;
error.value = null;
try {
  const { variantNearbyStock } = await GqlVariantNearbyStock({ ... });
  const items = (variantNearbyStock ?? []) as NearStockLocation[];
  return { state: items.length ? "ok" : "no-stock", items, message: null };
} catch (e) {
  error.value = e instanceof Error ? e.message : "就近库存查询失败";
  return { state: "error", items: [], message: error.value };
} finally {
  loading.value = false;
}
```

顶部补充导出 `isNoCoords(city)` 或由调用方（NearbyStores）在无 coords 时置 `no-coords` 态——`fetchNearbyStock` 不感知坐标，坐标态由组件决定。组件内判断：

```ts
const state = computed<NearbyState>(() => {
  if (!locationStore.coords) return "no-coords";
  return result.value?.state ?? (loading.value ? "ok" : "no-stock");
});
```

- [ ] **Step 2: verify 类型**

Run: `pnpm typecheck`
Expected: 无新增错误

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/composables/useNearbyStock.ts
git commit -m "feat(detail): useNearbyStock 返回四态，不再吞错为空数组"
```

---

## Task 6: `NearbyStores` 四态平滑降级

**Files:**
- Modify: `layers/base/app/components/product/NearbyStores.vue`

- [ ] **Step 1: 结合四态渲染**

不再用顶层 `v-if="locationStore.coords"` 整块隐藏。改为始终渲染 section + 状态分支（平滑降级）：

```ts
const result = ref<NearbyResult | null>(null);
async function loadStock() {
  if (!props.productId) { result.value = { state: "no-stock", items: [], message: null }; return; }
  if (!locationStore.coords) { result.value = { state: "no-coords", items: [], message: null }; return; }
  result.value = await fetchNearbyStock({ productId: props.productId, variantId: props.variantId, coords: locationStore.coords, city: locationStore.city?.name ?? null });
}
```

模板状态分支：

```vue
<section aria-labelledby="nearby-stock-heading">
  <h2 id="nearby-stock-heading" class="mb-4 text-2xl font-semibold">就近库存</h2>
  <p v-if="loading" class="text-sm text-neutral-500">{{ t('messages.detail.nearbyLoading') }}</p>
  <p v-else-if="result?.state === 'no-coords'" class="text-sm text-neutral-500">{{ t('messages.detail.nearbyNoCoords') }}</p>
  <p v-else-if="result?.state === 'error'" class="text-sm text-neutral-500">{{ t('messages.detail.nearbyError') }}</p>
  <p v-else-if="result?.state === 'no-stock'" class="text-sm text-neutral-500">{{ t('messages.detail.nearbyNoStock') }}</p>
  <ul v-else-if="result?.state === 'ok'" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    ... 原有列表 ...
  </ul>
</section>
```

`onMounted(loadStock)` 与两个 `watch` 保留（但 `watch(locationStore.coords)` → `loadStock` 会在不同 state 间刷新）。

- [ ] **Step 2: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/components/product/NearbyStores.vue
git commit -m "feat(detail): NearbyStores 四态平滑降级渲染"
```

---

## Task 7: `useCityService` 结构化结果

**Files:**
- Modify: `layers/base/app/composables/useCityService.ts`

- [ ] **Step 1: 新增结构化返回**

保留 `isServiceable`，新增 `getServiceInfo` 返回结构化结果：

```ts
export type ServiceReason = "ok" | "no-city" | "not-served";
export interface ServiceInfo {
  serviceable: boolean;
  reason: ServiceReason;
  serviceCities: string[];  // 去重、trim、过滤空
  belongCity?: string | null;
}

function getServiceInfo(product: ServiceableProduct | null | undefined): ServiceInfo {
  const city = locationStore.cityName;
  if (!city) return { serviceable: true, reason: "no-city", serviceCities: [], belongCity: null };
  const cf = product?.customFields;
  if (!cf) return { serviceable: true, reason: "ok", serviceCities: [], belongCity: null };
  const belong = cf.belongCity?.trim();
  const services = (cf.serviceCities ?? []).map((s)=>s?.trim()??"").filter(Boolean);
  const dedup = Array.from(new Set(services));
  if (!belong && dedup.length === 0) return { serviceable: true, reason: "ok", serviceCities: [], belongCity: belong ?? null };
  const served = (belong && matchCity(belong, city)) || dedup.some((s)=>matchCity(s, city));
  return { serviceable: served, reason: served ? "ok" : "not-served", serviceCities: dedup, belongCity: belong ?? null };
}

// isServiceable 复用 getServiceInfo
function isServiceable(product: ServiceableProduct | null | undefined): boolean {
  return getServiceInfo(product).serviceable;
}

return { isServiceable, getServiceInfo, matchCity };
```

- [ ] **Step 2: verify**

Run: `pnpm typecheck`
Expected: 无新增错误

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/composables/useCityService.ts
git commit -m "feat(detail): useCityService 返回结构化服务信息（含可购买城市）"
```

---

## Task 8: 可购买城市折叠面板组件

**Files:**
- Create: `layers/base/app/components/product-detail/ServiceableCityPanel.vue`

- [ ] **Step 1: 新建组件**

```vue
<script setup lang="ts">
import { useCityService } from "../../composables/useCityService";
const props = defineProps<{
  product: { customFields?: { belongCity?: string | null; serviceCities?: Array<string | null> | null } | null } | null;
}>();
const { getServiceInfo } = useCityService();
const info = computed(() => getServiceInfo(props.product));
const open = ref(false);
const { t } = useI18n();
const cities = computed(() => {
  const list = [...(info.value.serviceCities ?? [])];
  if (info.value.belongCity && !list.includes(info.value.belongCity)) list.unshift(info.value.belongCity);
  return list;
});
</script>
<template>
  <div v-if="!info.serviceable" class="mt-3">
    <p class="text-sm text-amber-600">
      {{ t("messages.detail.notServiceable") }}
    </p>
    <UButton
      color="neutral" variant="ghost" size="xs" icon="i-lucide-map"
      class="mt-1" @click="open = !open"
    >
      {{ t("messages.detail.viewServiceCities") }}
    </UButton>
    <Transition name="fade">
      <div v-if="open" class="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p class="mb-1 font-medium">{{ t("messages.detail.serviceCitiesTitle") }}</p>
        <p v-if="cities.length" class="text-neutral-600 dark:text-neutral-400 line-clamp-3">{{ cities.join("、") }}</p>
        <p v-else class="text-neutral-500">{{ t("messages.detail.nationwide") }}</p>
      </div>
    </Transition>
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/components/product-detail/ServiceableCityPanel.vue
git commit -m "feat(detail): 可购买城市折叠面板组件"
```

> 注意：Nuxt 自动注册为 `ProductDetailServiceableCityPanel`，模板中必须用完整注册名。

---

## Task 9: 三版式接入可购买城市面板

**Files:**
- Modify: `layers/base/app/components/product-detail/DetailClassic.vue`
- Modify: `layers/base/app/components/product-detail/DetailFloor.vue`
- Modify: `layers/base/app/components/product-detail/DetailDualBuy.vue`

- [ ] **Step 1: 各 view 在购买栏下引入面板**

三版式模板中，`purchase` 块渲染后追加：

```vue
<ProductDetailServiceableCityPanel :product="product" />
```

（需确认各 view 已 `useProductDetailView` 提供 `product`；若仅提供 `productName/selectedVariant`，补 `product`。核查现有 script——floor 版未暴露 `product`，需解构加入。）

floor 版 dup：在现有 `const { ... } = useProductDetailView()` 中确保包含 `product`，模板购买栏 section 内加入上列。

- [ ] **Step 2: 验证**

Run: `pnpm dev`
Expected: 三版式在不可服务城市时购买栏下显示警示 + 「可购买城市」展开城市列表；可服务时无面板。

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/components/product-detail/DetailClassic.vue layers/base/app/components/product-detail/DetailFloor.vue layers/base/app/components/product-detail/DetailDualBuy.vue
git commit -m "feat(detail): 三版式购买栏接入可购买城市折叠入口"
```

---

## Task 10: i18n 词条

**Files:**
- Modify: `layers/base/i18n/locales/zh-CN.ts`
- Modify: `layers/base/i18n/locales/en-US.ts`

- [ ] **Step 1: zh-CN 补词条**

`messages.detail` 下追加：

```ts
notServiceable: "该商品暂不支持配送至当前城市",
viewServiceCities: "查看可购买城市",
serviceCitiesTitle: "可购买城市",
nationwide: "全城配送",
nearbyLoading: "正在查询就近库存…",
nearbyNoCoords: "开启定位可查看就近库存",
nearbyError: "就近门店库存暂不可查",
nearbyNoStock: "暂无可查看的门店库存",
```

- [ ] **Step 2: en-US 补词条**

```ts
notServiceable: "This product is not deliverable to your current city",
viewServiceCities: "View deliverable cities",
serviceCitiesTitle: "Deliverable cities",
nationwide: "Nationwide delivery",
nearbyLoading: "Checking nearby stock…",
nearbyNoCoords: "Enable location to view nearby stock",
nearbyError: "Nearby stock temporarily unavailable",
nearbyNoStock: "No nearby store stock available",
```

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "feat(detail): 就近库存+可购买城市 i18n 词条（zh/en）"
```

---

## Task 11: 端到端验收 & 部署

**Files:**
- Modify: 无（验证 + 部署）

- [ ] **Step 1: 本地 dev + Playwright 全项验收**

1. 有 `videoUrl` 商品：首帧视频自动播放、缩略图视频角标。
2. 纯图片商品：图集不回归。
3. 无图商品：显示占位图（手机端不再空白）。
4. 就近：无定位→"开启定位"提示；有定位无仓→"暂无可查"；有货→购买不受就近失败影响。
5. 城市：不可服务→警示+「可购买城市」展开列出城市；可服务→无面板。

- [ ] **Step 2: 后端部署**

按部署铁律（本地构建）：
```bash
cd d:\zhao\vendure
# 本地构建 inventory-plugin（tsc）
node_modules/.bin/tsc.cmd -p packages/inventory-plugin/tsconfig.build.json
# 提交产物 → git push → 服务器 git pull → pm2 restart vendure
```

- [ ] **Step 3: 前端构建部署**

```bash
cd d:\zhao\nshop
pnpm build
node scripts/deploy.mjs   # 本地已构建，推 dist，服务器 pm2 restart nshop
```

- [ ] **Step 4: 线上验证**

公网 `https://www.youshop.cn` 商品详情页抽查上述 5 项；后端就近库存城市匹配生效（杭州/杭州市都能查到仓）。

- [ ] **Step 5: 提交任何残余改动**

```bash
cd d:\zhao\nshop
git add -A && git commit -m "chore: 验收与部署残余修正"
```