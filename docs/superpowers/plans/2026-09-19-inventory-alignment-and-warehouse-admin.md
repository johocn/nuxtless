# 方案3：库存体系对齐方案1 + web-admin 网点管理 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让已落地的虚拟/物理库存体系支撑方案1 的配送方式三态与多城市语义（网点可仅自提/仅邮寄/两者兼备），并在 web-admin 补全租户物理网点管理。

**Architecture:** 后端在 cjk-plugin 库存域扩展 StockLocation（`channelCode` 租户归属 + `deliveryMethods` 三态），抽纯函数做「网点×配送方式」匹配；分配策略（physical-aware）与店铺可售库存查询链路叠加该过滤。前端详情页加配送切换，库存口径随切换（邮寄=可发仓/虚拟、自提=可自提点合计）。web-admin 扩展 inventory 模块（网点 CRUD，配送方式多选、无类型单选）。

**Tech Stack:** Vendure（cjk-plugin）、Nuxt 3（nshop）、Vue3 uni-app 风格（vshop web-admin）、Vitest、Playwright、GraphQL codegen

**依赖（按序先行）：** 方案1（Product.deliveryMethods 字段、isProductVisible 语义）→ 方案2（DeliveryFilterBar 组件与五级配置解析）→ 本方案。三个仓库独立提交：vendure / nshop / vshop。

**仓库路径速查：** 后端 `d:\zhao\vendure\packages\cjk-plugin\src\inventory\`；前端 `d:\zhao\nshop\layers\base\app\`；web-admin `d:\zhao\vshop\web-admin\src\`。

---

### Task 0: 方案1 前置确认

**Files:**
- Read: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-location-custom-fields.ts`（对照现有风格）
- Read: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\virtual-physical-stock.service.ts`（确认店铺可售查询段）
- Read: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\physical-aware-stock-location-strategy.ts`

- [ ] **Step 1: 确认方案1 已落地**
  检查 `d:\zhao\nshop\docs\superpowers\plans\2026-09-19-home-filter-language-city-delivery.md` 已完成（Product customFields 含 `deliveryMethods`）。若未完成，先执行方案1 Task 0-3 再进入本计划。

- [ ] **Step 2: 读三个后端文件，记录行号**
  分别 Read 上面三个文件，记下 `stock-location-custom-fields.ts` 的 `customFields` 数组尾部、`virtual-physical-stock.service.ts` 店铺可售查询函数（约 L180-247）、`physical-aware-stock-location-strategy.ts` 的 `forAllocation` 候选过滤段（约 L64-114）。后续 Task 按函数名定位，行号偏移以实际为准。

- [ ] **Step 3: 确认测试框架**
  查看 `d:\zhao\vendure\package.json` 与 `packages/cjk-plugin/package.json` 的 scripts：有无 vitest/jest。若包内已有测试脚本，后续 Task 2 复用；否则按 Task 2 Step 1 新增最小 vitest 配置。

---

### Task 1: 后端 StockLocation 新增 channelCode + deliveryMethods

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-location-custom-fields.ts`

- [ ] **Step 1: 追加两个字段定义**

在 `stock-location-custom-fields.ts` 的 `StockLocation` customFields 数组末尾（现有 `kind`/`code` 之后）追加：

```ts
{
    name: 'channelCode',
    type: 'string',
    nullable: true,
    label: [{ languageCode: LanguageCode.zh_Hans, value: '归属租户编码' }],
},
{
    name: 'deliveryMethods',
    type: 'string',
    list: true,
    nullable: true,
    label: [{ languageCode: LanguageCode.zh_Hans, value: '配送方式（空=邮寄与自提都支持）' }],
    ui: {
        component: 'multiple-select-form-input',
        options: [
            { value: 'MAIL', label: [{ languageCode: LanguageCode.zh_Hans, value: '邮寄' }] },
            { value: 'SELF_PICKUP', label: [{ languageCode: LanguageCode.zh_Hans, value: '自提' }] },
        ],
    },
},
```

确认文件顶部已 import `LanguageCode`（与现有字段一致）。

- [ ] **Step 2: 语法检查**

Run（cwd: `d:\zhao\vendure`）：`npx tsc --noEmit -p packages/cjk-plugin/tsconfig.json`
Expected: 无该文件相关错误。

- [ ] **Step 3: 验证 schema 生效（本地起 dev）**

Run（cwd: `d:\zhao\vendure`）：`npm run dev:cjk`（或仓库既有的 dev 脚本；若无，起 `npm run dev`）。
用浏览器或 curl 访问 `<admin-api>/graphql` 的 schema introspection，确认 `StockLocation.customFields` 含 `channelCode`、`deliveryMethods` 两个新字段。

- [ ] **Step 4: Commit**

Run（cwd: `d:\zhao\vendure`）：
```bash
git add packages/cjk-plugin/src/inventory/stock-location-custom-fields.ts
git commit -m "feat(cjk-inventory): StockLocation 新增 channelCode/deliveryMethods 字段"
```

---

### Task 2: 网点×配送方式匹配纯函数（TDD）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\delivery-methods.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\delivery-methods.test.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\vitest.config.ts`（若包内已有测试框架则跳过）

- [ ] **Step 1: 准备最小 vitest 配置（若包内无测试框架）**

Create `d:\zhao\vendure\packages\cjk-plugin\vitest.config.ts`：
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```
并在 `packages/cjk-plugin/package.json` 的 `scripts` 追加：`"test": "vitest run"`。

- [ ] **Step 2: 写失败测试**

Create `delivery-methods.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import {
  locationSupports,
  filterLocationsByDelivery,
  type DeliveryMethod,
  type LocationLike,
} from './delivery-methods';

const loc = (methods: string[] | null): LocationLike => ({ customFields: { deliveryMethods: methods } });
const methods = (m: DeliveryMethod[]) => m;

describe('locationSupports 三态矩阵', () => {
  it('仅 MAIL：支持邮寄、不支持自提', () => {
    expect(locationSupports(loc(['MAIL']), 'MAIL')).toBe(true);
    expect(locationSupports(loc(['MAIL']), 'SELF_PICKUP')).toBe(false);
  });
  it('仅 SELF_PICKUP：支持自提、不支持邮寄', () => {
    expect(locationSupports(loc(['SELF_PICKUP']), 'SELF_PICKUP')).toBe(true);
    expect(locationSupports(loc(['SELF_PICKUP']), 'MAIL')).toBe(false);
  });
  it('双模式：都支持', () => {
    expect(locationSupports(loc(['MAIL', 'SELF_PICKUP']), 'MAIL')).toBe(true);
    expect(locationSupports(loc(['MAIL', 'SELF_PICKUP']), 'SELF_PICKUP')).toBe(true);
  });
  it('空数组 / undefined：兼容旧数据，都支持', () => {
    expect(locationSupports(loc([]), 'MAIL')).toBe(true);
    expect(locationSupports(loc([]), 'SELF_PICKUP')).toBe(true);
    expect(locationSupports(loc(null), 'MAIL')).toBe(true);
  });
});

describe('filterLocationsByDelivery', () => {
  const mail = loc(['MAIL']);
  const pickup = loc(['SELF_PICKUP']);
  const both = loc(['MAIL', 'SELF_PICKUP']);
  const legacy = loc(null);

  it('请求 MAIL：仅保留含 MAIL 的网点', () => {
    expect(filterLocationsByDelivery([mail, pickup, both, legacy], methods(['MAIL']))).toEqual([mail, both, legacy]);
  });
  it('请求 SELF_PICKUP：仅保留含 SELF_PICKUP 的网点', () => {
    expect(filterLocationsByDelivery([mail, pickup, both, legacy], methods(['SELF_PICKUP']))).toEqual([pickup, both, legacy]);
  });
  it('请求两者：全部保留', () => {
    expect(filterLocationsByDelivery([mail, pickup, both, legacy], methods(['MAIL', 'SELF_PICKUP']))).toEqual([mail, pickup, both, legacy]);
  });
  it('请求为空：全部保留（不做过滤）', () => {
    expect(filterLocationsByDelivery([mail, pickup], [])).toEqual([mail, pickup]);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run（cwd: `d:\zhao\vendure\packages\cjk-plugin`）：`npx vitest run src/inventory/delivery-methods.test.ts`
Expected: FAIL（`delivery-methods` 模块不存在）。

- [ ] **Step 4: 写最小实现**

Create `delivery-methods.ts`：
```ts
export type DeliveryMethod = 'MAIL' | 'SELF_PICKUP';

export interface LocationLike {
  customFields?: {
    deliveryMethods?: Array<string | null> | null;
    [key: string]: unknown;
  } | null;
}

/** 网点是否支持某配送方式。deliveryMethods 空/未配置 = 兼容旧数据，两者都支持。 */
export function locationSupports(loc: LocationLike | null | undefined, method: DeliveryMethod): boolean {
  const methods = loc?.customFields?.deliveryMethods?.filter((m): m is string => !!m) ?? [];
  return methods.length === 0 || methods.includes(method);
}

/** 按请求配送方式过滤网点候选。请求为空 = 不做过滤（全放行）。 */
export function filterLocationsByDelivery<T extends LocationLike>(
  locations: T[],
  requested: DeliveryMethod[],
): T[] {
  if (!requested.length) return locations;
  return locations.filter((l) => requested.some((m) => locationSupports(l, m)));
}
```

- [ ] **Step 5: 运行确认通过**

Run（cwd: `d:\zhao\vendure\packages\cjk-plugin`）：`npx vitest run src/inventory/delivery-methods.test.ts`
Expected: 6 tests PASS。

- [ ] **Step 6: Commit**

Run（cwd: `d:\zhao\vendure`）：
```bash
git add packages/cjk-plugin/src/inventory/delivery-methods.ts packages/cjk-plugin/src/inventory/delivery-methods.test.ts packages/cjk-plugin/vitest.config.ts packages/cjk-plugin/package.json
git commit -m "feat(cjk-inventory): 网点×配送方式三态匹配纯函数 + 单测"
```

---

### Task 3: 分配策略接入 deliveryMethods 过滤

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\physical-aware-stock-location-strategy.ts`

- [ ] **Step 1: 定位 forAllocation 候选过滤段**

Read `physical-aware-stock-location-strategy.ts`，找到 `forAllocation` 中「按绑定仓库过滤候选 stockLocations」的位置（约 L64-114）。若当前默认分配策略不是本文件（检查 `stock-location-strategy.ts` 或配置），则改实际生效的策略文件。

- [ ] **Step 2: 候选过滤前叠加 deliveryMethods 过滤**

在候选列表构建后、执行现有距离/优先级逻辑前，插入（并用 `// deliveryMethods` 注释标注）：

```ts
const productCf = (product as any)?.customFields ?? {};
const deliveryMethods = (productCf.deliveryMethods ?? []) as string[];
if (deliveryMethods.length) {
    candidates = filterLocationsByDelivery(candidates, deliveryMethods as DeliveryMethod[]);
}
```

顶部 import：`import { filterLocationsByDelivery, type DeliveryMethod } from './delivery-methods';`

语义：商品 `['SELF_PICKUP']` → 仅自提候选；`['MAIL']` → 仅可发仓；`['MAIL','SELF_PICKUP']` → 全量；空（商品未配置，兼容旧数据）→ 不过滤。

- [ ] **Step 3: 类型检查**

Run（cwd: `d:\zhao\vendure`）：`npx tsc --noEmit -p packages/cjk-plugin/tsconfig.json`
Expected: 无错误。

- [ ] **Step 4: 验证过滤逻辑（复用 Task 2 单测语义）**

在 `physical-aware-stock-location-strategy.ts` 抽取的候选过滤为纯函数逻辑（即 Task 2 的 `filterLocationsByDelivery`），其行为已由单测覆盖。本 Task 只需确认接线处类型正确（Step 3）。

- [ ] **Step 5: Commit**

Run（cwd: `d:\zhao\vendure`）：
```bash
git add packages/cjk-plugin/src/inventory/physical-aware-stock-location-strategy.ts
git commit -m "feat(cjk-inventory): 分配策略按商品 deliveryMethods 过滤候选网点"
```

---

### Task 4: C 端可售库存查询支持配送口径

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\virtual-physical-stock.service.ts`（店铺可售查询段，约 L180-247）

- [ ] **Step 1: 定位店铺可售查询函数**

Read `virtual-physical-stock.service.ts` L150-260，找到按 `physicalStockEnabled` + `serviceCities` 过滤网点的可售库存查询函数（输入含 variantId、当前城市等），记下函数签名与调用方（`inventory-shop.resolver.ts`）。

- [ ] **Step 2: 查询函数加 deliveryMethod 参数**

在查询函数参数追加可选 `deliveryMethod?: 'MAIL' | 'SELF_PICKUP' | null`，在现有 `serviceCities` 城市过滤段之后叠加：

```ts
const requested: ('MAIL' | 'SELF_PICKUP')[] = deliveryMethod ? [deliveryMethod] : [];
if (requested.length) {
    eligible = filterLocationsByDelivery(eligible, requested);
}
```

其中 `eligible` 为已按城市过滤后的网点数组（沿用现有变量名）。语义与 Task 3 一致：自提口径=可自提点合计、邮寄=可发仓合计、空=全部。

- [ ] **Step 3: resolver 透传参数**

Read `inventory-shop.resolver.ts`，找到调用上述查询的 Query（如 `variantStockInfo`），在其 GraphQL 参数中增加可选 `deliveryMethod: 'MAIL' | 'SELF_PICKUP'`（Vendure `@ArgsType`/`@Arg` 声明），并透传给 service 函数。

- [ ] **Step 4: 类型检查**

Run（cwd: `d:\zhao\vendure`）：`npx tsc --noEmit -p packages/cjk-plugin/tsconfig.json`
Expected: 无错误。

- [ ] **Step 5: 验证（可选手工）**

若本地 dev 可起：用 Shop API 查询 `variantStockInfo(variantId, city, deliveryMethod: "SELF_PICKUP")`，对比无参数结果，确认自提口径只统计含 SELF_PICKUP 的网点。

- [ ] **Step 6: Commit**

Run（cwd: `d:\zhao\vendure`）：
```bash
git add packages/cjk-plugin/src/inventory/virtual-physical-stock.service.ts packages/cjk-plugin/src/inventory/inventory-shop.resolver.ts
git commit -m "feat(cjk-inventory): 可售库存查询支持 deliveryMethod 配送口径"
```

---

### Task 5: 前端 VariantStockInfo 查询加配送参数 + codegen

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\product.gql`（`VariantStockInfo` 查询，约 L96-110）
- Read: `d:\zhao\nshop\layers\base\app\composables\useProductStockInfo.ts`

- [ ] **Step 1: 查询加 deliveryMethod 参数**

Read `product.gql` 的 `VariantStockInfo` 定义，在其查询变量中增加 `deliveryMethod`（若该查询无变量则新增）：

```graphql
query VariantStockInfo(
  $variantId: ID!
  $deliveryMethod: String
  # ...保留既有参数（city/coords 等，按现有定义）
) {
  # ...保留既有字段
}
```

（GraphQL 参数名/类型以现有查询为准，只新增 `deliveryMethod` 透传。）

- [ ] **Step 2: 触发 codegen**

Run（cwd: `d:\zhao\nshop`）：`npx nuxt prepare`
Expected: `graphql-client` 重新生成类型（`.nuxt` 下 types 更新），无 schema 错误。若报「字段不存在」说明后端未部署新 schema（Task 4 未生效），本地可用仓库内 `graphql.schema.json` 同步（按方案1 流程更新 schema 文件后再 prepare）。

- [ ] **Step 3: Commit**

Run（cwd: `d:\zhao\nshop`）：
```bash
git add layers/base/gql/queries/product.gql
git commit -m "feat(nshop): VariantStockInfo 查询支持 deliveryMethod 参数"
```

---

### Task 6: 详情页配送切换 + 库存口径联动

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\product-detail\ProductDeliverySwitch.vue`（若方案2 的 `DeliveryFilterBar` 已存在则复用，不重复创建）
- Modify: `d:\zhao\nshop\layers\base\app\composables\useProductStockInfo.ts`（透传 deliveryMethod）
- Modify: `d:\zhao\nshop\layers\base\app\components\product\StockInfoBlock.vue`（自提口径分支）
- Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\DetailFloor.vue`（接入切换组件，约 L91-140 库存区）
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`、`en-US.ts` 等全部四语言包

- [ ] **Step 1: 确认方案2 组件是否可用**

搜索 `d:\zhao\nshop\layers\base\app\components` 下是否存在 `DeliveryFilterBar.vue`（或 home/blocks 下同类组件）。存在 → 详情页复用（import 同组件，props 配置走方案2 五级体系）；不存在 → 创建下面 Step 2 的轻量组件，方案2 落地后再替换。

- [ ] **Step 2: 创建切换组件（仅当 Step 1 不存在）**

Create `ProductDeliverySwitch.vue`（v-model 语义，与首页模块切换一致）：
```vue
<script setup lang="ts">
const props = defineProps<{ modelValue: 'MAIL' | 'SELF_PICKUP' }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: 'MAIL' | 'SELF_PICKUP'): void }>();
const { t } = useI18n();
const options = [
  { value: 'MAIL', label: t('messages.detail.deliveryMail') },
  { value: 'SELF_PICKUP', label: t('messages.detail.deliveryPickup') },
] as const;
</script>
<template>
  <div class="flex gap-2">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="rounded-full border px-3 py-1 text-xs"
      :class="modelValue === opt.value ? 'border-primary text-primary' : 'text-gray-500'"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
```

- [ ] **Step 3: useProductStockInfo 透传 deliveryMethod**

Modify `useProductStockInfo.ts`：新增入参 `deliveryMethod?: Ref<'MAIL' | 'SELF_PICKUP' | null>`，`refresh()` 调用 `GqlVariantStockInfo` 时将该值作为 `deliveryMethod` 变量传入（值需 `unref`）。返回结构不变。

- [ ] **Step 4: StockInfoBlock 自提口径分支**

Modify `StockInfoBlock.vue`：
- 新增 prop `deliveryMethod: 'MAIL' | 'SELF_PICKUP'`（默认 `'MAIL'`）
- `useProductStockInfo` 传入 `deliveryMethod`（ref）
- 自提模式下 `physicalStockEnabled=false` → 不显示库存数字，仅保留可达性（由 `ServiceableCityPanel` 负责），`inStock` 计算跳过
- 沿用 `showNearby`（`physicalStockEnabled && stockDetail.length`）规则不变，折叠块标题按配送方式显示

- [ ] **Step 5: DetailFloor 集成**

Modify `DetailFloor.vue`（约 L91-140）：在库存区上方渲染 `ProductDetailDeliverySwitch`（若复用方案2 组件则用其注册名），`v-model` 绑定本地 `const delivery = ref<'MAIL'|'SELF_PICKUP'>('MAIL')`，并传给 `ProductStockInfoBlock`（若该区块 props 已透传则扩展）。

- [ ] **Step 6: i18n 四语言词条**

在全部语言包（`zh-CN.ts`/`en-US.ts` 及方案1 已同步的其他语言）`messages.detail` 下新增：
- `deliveryMail`: 邮寄 / Mail
- `deliveryPickup`: 自提 / Self Pickup
- 空态词条复用方案1 `messages.home.emptyAfterFilter`（若详情页需要独立词条则新增 `deliveryNoStock` 对应文案）

- [ ] **Step 7: 本地验证**

Run（cwd: `d:\zhao\nshop`）：`npm run dev`，打开任一支持自提的商品详情页，切换 邮寄→自提，确认库存数字随口径变化、无 console 错误。

- [ ] **Step 8: Commit**

Run（cwd: `d:\zhao\nshop`）：
```bash
git add layers/base/app/composables/useProductStockInfo.ts layers/base/app/components/product/StockInfoBlock.vue layers/base/app/components/product-detail/ layers/base/i18n/locales/
git commit -m "feat(nshop): 详情页配送方式切换 + 库存口径联动 + 四语言词条"
```

---

### Task 7: Playwright 手机截图（详情页配送切换）

**Files:**
- Create: `d:\zhao\nshop\tests\e2e\delivery-switch-stock.spec.ts`（或既有 e2e 目录/既有测试框架，按方案1 Task 7 的方式）

- [ ] **Step 1: 写截图脚本**

按方案1 的 Playwright 移动视口规范（390×844，dpr=2）：
- 打开一个同时支持邮寄+自提的商品详情页
- 截图①：默认（邮寄）库存区
- 点击「自提」切换后截图②：自提库存区
- 断言：切换按钮可见、截图成功保存

- [ ] **Step 2: 运行并保存截图**

Run（cwd: `d:\zhao\nshop`）：仓库既有 e2e 命令（按方案1 Task 7 用过的命令）。
Expected: 两张截图生成（邮寄/自提），供操作手册使用。

- [ ] **Step 3: Commit**

Run（cwd: `d:\zhao\nshop`）：`git add tests/e2e/delivery-switch-stock.spec.ts`，提交 `test(nshop): 详情页配送切换库存口径截图`。

---

### Task 8: web-admin 租户物理网点管理（扩展 inventory 模块）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\inventory.ts`（新增网点 CRUD）
- Create: `d:\zhao\vshop\web-admin\src\pages\inventory\locations\index.vue`（网点列表）
- Create: `d:\zhao\vshop\web-admin\src\pages\inventory\locations\edit.vue`（新建/编辑）
- Read: `d:\zhao\vshop\web-admin\src\stores\tenantStore.ts`（取当前租户 code）

- [ ] **Step 1: API 层新增网点 CRUD**

在 `apis/inventory.ts` 追加（沿用现有 `gql`/`request` 模式）：
- `fetchLocations()`：查询 `stockLocations` 并取 `customFields`（channelCode/deliveryMethods/lat/lng/serviceCities）
- `createLocation(input)`：`createStockLocation` mutation，输入含 `name/customFields`（channelCode/deliveryMethods/经纬度/服务城市）
- `updateLocation(id, input)`：`updateStockLocation` mutation 同上

> Vendure 原生 admin API 名：`createStockLocation` / `updateStockLocation` / `deleteStockLocation`，输入类型 `StockLocationInput`（name/customFields）。字段名以 `@vendure/core` schema 为准（若本地 schema 不符，按 schema 文档调整）。

- [ ] **Step 2: 网点列表页**

Create `pages/inventory/locations/index.vue`，参照 `pages/inventory/stock/index.vue` 的移动端风格：
- 顶部展示当前租户（`tenantStore.code`），按 `channelCode` 过滤展示本租户网点
- 列表项：名称、配送方式标签（仅邮寄/仅自提/双模式，由 deliveryMethods 计算）、服务城市（serviceCities 或「全国」）、经纬度
- 「新建」按钮 → `edit.vue`；点击项 → `edit.vue?id=` 编辑
- 删除（`deleteStockLocation`，带确认）

- [ ] **Step 3: 新建/编辑页**

Create `pages/inventory/locations/edit.vue`：
- 表单：名称（必填）、配送方式多选（复选框：邮寄/自提，互不排斥，两者都不勾=两者都支持）、服务城市（文本/多值输入，参照现有城市输入风格）、经度/纬度（数字输入）、归属租户（默认当前 `tenantStore.code`，可改）
- 保存：id 存在→`updateLocation`，否则→`createLocation`
- 参照现有页面表单/弹窗组件风格（与 `inventory/stock/index.vue` 一致）

- [ ] **Step 4: 路由注册**

若 web-admin 用 pages 自动路由，新建文件即生效；若是手动路由配置，在 `src/router`（或 main.ts）注册 `inventory/locations` 两个页面，并确认 inventory 模块入口可进入（入口从现有 inventory 模块菜单扩展）。

- [ ] **Step 5: Playwright 截图（web-admin）**

按 vshop 既有截图/测试方式（若无则复用 nshop 的 Playwright 配置，指向 web-admin dev 地址）：
- 截图①：网点列表（含配送方式标签）
- 截图②：新建/编辑表单（配送方式多选状态）
Expected: 两张截图保存，供操作手册。

- [ ] **Step 6: Commit**

Run（cwd: `d:\zhao\vshop`）：
```bash
git add web-admin/src/apis/inventory.ts web-admin/src/pages/inventory/
git commit -m "feat(web-admin): 租户物理网点管理（列表/新建/编辑/配送方式多选）"
```

---

### Task 9: 统一部署 + 操作手册

**Files:**
- Modify: `d:\zhao\nshop\docs\操作手册*.md`（或既有手册文件，按方案1 手册路径）

- [ ] **Step 1: 后端部署（vendure）**

Run（在 vendure 服务器，遵循部署铁律——本地构建、服务器不构建）：
```bash
git pull && pm2 restart <vendure-process>
```
Expected: 启动日志无错误；admin-api schema 含新字段（可用 introspection 抽查）。

- [ ] **Step 2: 前端部署（nshop）**

Run（cwd: `d:\zhao\nshop`）：`node scripts/deploy.mjs`（本地构建 + scp + 服务器解压 + pm2 restart）。

- [ ] **Step 3: web-admin 部署（vshop）**

按 vshop 既有部署机制（若与 nshop 不同，查 `d:\zhao\vshop\scripts\deploy*.mjs` 或文档），本地构建后部署。

- [ ] **Step 4: 线上回归 + 手机验证**

用手机浏览器（微信/普通）打开线上商品详情页：切换 邮寄→自提，确认库存口径变化、无报错；web-admin 新建一个仅自提网点并保存，确认列表展示配送标签。

- [ ] **Step 5: 操作手册补丁**

在既有操作手册追加方案3 章节：库存口径随配送切换说明 + 截图①（邮寄/自提）、web-admin 网点管理流程 + 截图（列表/表单），并补充「配送方式三态语义」说明（仅邮寄/仅自提/双模式/空=兼容）。

- [ ] **Step 6: Commit 手册**

Run（cwd: `d:\zhao\nshop`）：`git add docs/`，提交 `docs(nshop): 方案3 操作手册补丁`。

---

## Self-Review 记录

- **Spec 覆盖**：§4 数据模型→Task 1；§3 三态矩阵→Task 2；§6.1 分配→Task 3；§6.2 C 端口径→Task 4；§5.1 切换→Task 5/6；§5.2 口径+边界→Task 6；§7 web-admin→Task 8；§8 测试交付→Task 2/7/8；部署手册→Task 9；§10 YAGNI 已遵守（不新建网点类型字段、不动 matrix 策略与对账/配送记录）。
- **占位符扫描**：无 TBD/TODO；Task 4 Step 5 的「可选手工验证」与 Task 1 Step 3 为确定性验证步骤。
- **类型一致性**：`DeliveryMethod` 只在 Task 2 定义并导出，Task 3/4/5/6 复用；`filterLocationsByDelivery` 命名全计划一致；`deliveryMethod` 参数名在 resolver/service/.gql/composable 全链路一致。
