# 订单模块四级可回退风格体系 + 京东搭积木版式 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让订单模块接入与商品详情页一致的四级可回退风格体系：新增 `OrderDetailRenderer`（按配置切 `jd`/`classic` 版式）、`OrderListRenderer` 封装，京东积木版式设为默认，现有固定结构作为 `classic` 兜底备用，并上线部署。

**Architecture:** 前端在 `layers/base` 新增纯函数解析层 `utils/order-config.ts` + composables 读取 `GetChannelTheme.activeChannel.customFields.orderDetailConfig` 的 JSON，渲染器按 `layout` 选版式，块组件按 `blocks[key].visible/title/text` 逐级兜底拼装。后端在 `dev-config.ts` 的 Channel customFields 注册 `orderDetailConfig`/`orderListConfig`（`text` + `public`）。现有 `[code].vue` 内容整体迁入 `OrderDetailClassic.vue` 作为备用。

**Tech Stack:** Nuxt 4、nuxt-graphql-client、Vue 3 composition、Vendure（dev-server 配置）、Tailwind、vitest（纯函数 spec，当前未接线 runner）。

**前置说明（关键）:** 前端解析层在配置缺失时默认回退 `'jd'`，因此**前端可先独立上线**（默认京东版式），后端字段注册只影响“后台可配置 JSON”，不阻塞默认版式。

---

## 文件结构

**后端（vendure）**
- 改：`packages/dev-server/dev-config.ts` — Channel customFields 加 `orderDetailConfig`/`orderListConfig`
- （部署）`_deploy.ps1` 已纳入 dev-server，无需新增

**前端（nshop layers/base）**
- 新：`app/utils/order-config.ts`（L2/L3/L4 纯函数）
- 新：`app/composables/useOrderDetailConfig.ts`、`app/composables/useOrderListConfig.ts`
- 新：`app/components/order/OrderDetailRenderer.vue`
- 新：`app/components/order/OrderDetailClassic.vue`（备用 = 现 `[code].vue` `<main>` 迁移）
- 新：`app/components/order/OrderDetailJd.vue`（默认京东积木）
- 新：`app/components/order/OrderDetailStatusBlock.vue`、`OrderDetailProgressBlock.vue`、`OrderDetailRedemptionBlock.vue`、`OrderDetailAddressBlock.vue`、`OrderDetailItemsBlock.vue`、`OrderDetailPickupBlock.vue`、`OrderDetailTotalsBlock.vue`（含 ShippingBreakdown）、`OrderDetailMetaBlock.vue`、`OrderDetailActionsBlock.vue`
- 新：`app/components/order/OrderListRenderer.vue`
- 新：`app/utils/__tests__/order-config.spec.ts`
- 改：`app/pages/account/orders/[code].vue`（接渲染器）
- 改：`app/pages/account/orders/index.vue`（接 `OrderListRenderer`）
- 改：`gql/queries/context.gql`（`GetChannelTheme` 补 2 字段）+ `npx nuxt prepare` 再生类型
- 改（如需）：`i18n/locales/zh-CN.ts`、`i18n/locales/en-US.ts`

---

## Task 1: 后端注册订单版式自定义字段

**Files:**
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts:258-270`（Channel customFields）

- [ ] **Step 1: 在 Channel customFields 追加字段**

在 `dev-config.ts` 的 `Channel: [ ... ]` 数组里，`detailConfig` 那一行后追加：

```ts
// orderDetailConfig 存订单详情页装修 JSON（结构化 schema 见 nshop layers/base/app/utils/order-config.ts）
{ name: 'orderDetailConfig', type: 'text', public: true },
// orderListConfig 存订单列表版式 JSON（本期仅 card）
{ name: 'orderListConfig', type: 'text', public: true },
```

- [ ] **Step 2: 构建后端（本地）**

```bash
cd d:\zhao\vendure\packages\dev-server
pnpm build    # 若顶层已配置 workspace，则 cd d:\zhao\vendure && pnpm -w build 或按 dev-server 既有脚本
```
Expected: dist 生成，`dist/dev-config.js` 含新字段，无 TS 错误。

- [ ] **Step 3: 提交并部署后端**

```bash
git add packages/dev-server/dev-config.ts packages/dev-server/dist/dev-config.js
git commit -m "feat(dev-server): Channel 新增 orderDetailConfig/orderListConfig 版式字段"
git push
```
服务器执行 `git pull` + `pm2 restart vendure`（Vendure 启动时对自定义字段自动做 schema 迁移，补齐 `orderDetailConfig`/`orderListConfig` 列）。
Expected: `pm2 status` 中 `vendure` online；日志无 custom field 迁移报错。

> 注：`_deploy.ps1` 已在既有部署链路中构建并部署 dev-server，本任务如已通过该脚本部署可不重复。

---

## Task 2: 配置解析层 `utils/order-config.ts`（纯函数 + spec）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\order-config.ts`
- Create: `d:\zhao\nshop\layers\base\app\utils\__tests__\order-config.spec.ts`

- [ ] **Step 1: 写 spec（对照现有 `detail-config.spec.ts` 风格）**

`app/utils/__tests__/order-config.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  orderDetailLayout, orderListLayout, orderDetailBlockVisible,
  parseOrderDetailConfig, parseOrderListConfig, localizeOrderText,
} from "../order-config";

describe("order-config", () => {
  it("坏 JSON / 空 → null", () => {
    expect(parseOrderDetailConfig("not-json")).toBeNull();
    expect(parseOrderDetailConfig('{bad')).toBeNull();
    expect(parseOrderDetailConfig(null)).toBeNull();
    expect(parseOrderDetailConfig("42")).toBeNull(); // 非对象
    expect(parseOrderListConfig("not-json")).toBeNull();
  });

  it("缺省 layout 回退 jd（默认京东版式）", () => {
    expect(orderDetailLayout(null)).toBe("jd");
    expect(orderDetailLayout({ version: 1 })).toBe("jd");
    expect(orderDetailLayout({ version: 1, layout: "bogus" as any })).toBe("jd");
  });

  it("classic 透传", () => {
    expect(orderDetailLayout({ version: 1, layout: "classic" })).toBe("classic");
  });

  it("列表版式本期恒 card", () => {
    expect(orderListLayout(null)).toBe("card");
    expect(orderListLayout({ version: 1, layout: "card" })).toBe("card");
  });

  it("块显隐逐级兜底：定制→内建→true", () => {
    const cfg = { version: 1, blocks: { items: { visible: false } } };
    expect(orderDetailBlockVisible(cfg, "items")).toBe(false);
    expect(orderDetailBlockVisible(cfg, "status")).toBe(true); // 未配置→内建
    expect(orderDetailBlockVisible(null, "actions")).toBe(true); // null→全局
    expect(orderDetailBlockVisible(null, "unknown_key")).toBe(true); // 未知 key→true
  });

  it("localizeOrderText 逐级回退", () => {
    const obj = { "zh-CN": "中文", "en-US": "English" };
    expect(localizeOrderText(obj, "en-US")).toBe("English");
    expect(localizeOrderText(obj, "de-DE")).toBe("中文");      // 缺→defaultLocale
    expect(localizeOrderText("共用", "de-DE")).toBe("共用");    // 字符串共用
    expect(localizeOrderText(null, "de-DE")).toBe("");          // 空
    expect(localizeOrderText({ "en-US": "Only EN" }, "fr-FR")).toBe("Only EN"); // 首值
  });
});
```

- [ ] **Step 2: 运行验证**

```bash
cd d:\zhao\nshop
npx nuxt typecheck    # 现有仓库未接线 vitest runner（与 detail-config.spec.ts 一致），以类型检查作为纯函数门槛
```
若 `npx vitest run layers/base/app/utils/__tests__/order-config.spec.ts` 可解析则优先执行它；不可解析则以上述 typecheck 为准（spec 保留为文档 + 未来接入 runner）。

- [ ] **Step 3: 实现 `app/utils/order-config.ts`**

```ts
// 订单版式解析：类型 + 逐级兜底 + 国际化文案（纯函数，SSR 友好）
// 兜底链：块级定制字段 → 块内建默认 → 全局默认(true / 'jd' / 占位)
// 文案兜底链：当前 locale → defaultLocale → 首值 → ''（块内建占位 / i18n 兜底）

export type OrderDetailLayout = "jd" | "classic";
export type OrderListLayout = "card";
export type LocalizedText = string | Record<string, string>;

export interface OrderBlockCfg {
  visible?: boolean;
  title?: LocalizedText;
  text?: LocalizedText;
}
export interface OrderDetailConfig {
  version: number;
  layout?: OrderDetailLayout;
  blocks?: Record<string, OrderBlockCfg>;
}
export interface OrderListConfig {
  version: number;
  layout?: OrderListLayout;
}

export const ORDER_DETAIL_BLOCK_KEYS = [
  "status", "progress", "redemption", "address", "items",
  "pickup", "totals", "shippingBreakdown", "meta", "actions",
] as const;

const ORDER_DETAIL_DEFAULT_VISIBLE: Record<string, boolean> = {
  status: true, progress: true, redemption: true, address: true, items: true,
  pickup: true, totals: true, shippingBreakdown: true, meta: true, actions: true,
};

export function orderDetailLayout(cfg: OrderDetailConfig | null): OrderDetailLayout {
  return cfg?.layout === "classic" ? "classic" : "jd"; // 缺省/非法 → jd（默认京东版式）
}
export function orderListLayout(_cfg: OrderListConfig | null): OrderListLayout {
  return "card"; // 本期仅卡片
}
export function orderDetailBlockVisible(cfg: OrderDetailConfig | null, key: string): boolean {
  return cfg?.blocks?.[key]?.visible ?? ORDER_DETAIL_DEFAULT_VISIBLE[key] ?? true;
}
export function parseOrderDetailConfig(raw: string | null | undefined): OrderDetailConfig | null {
  if (!raw) return null;
  try {
    const d: unknown = JSON.parse(raw);
    if (typeof d !== "object" || d === null) return null;
    return d as OrderDetailConfig;
  } catch { return null; }
}
export function parseOrderListConfig(raw: string | null | undefined): OrderListConfig | null {
  if (!raw) return null;
  try {
    const d: unknown = JSON.parse(raw);
    if (typeof d !== "object" || d === null) return null;
    return d as OrderListConfig;
  } catch { return null; }
}
export function localizeOrderText(
  text: LocalizedText | undefined | null, locale: string, defaultLocale = "zh-CN",
): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[locale] ?? text[defaultLocale] ?? Object.values(text)[0] ?? "";
}
```

- [ ] **Step 4: 类型检查通过 + 提交**

```bash
cd d:\zhao\nshop
npx nuxt typecheck
git add layers/base/app/utils/order-config.ts layers/base/app/utils/__tests__/order-config.spec.ts
git commit -m "feat(order): 订单版式解析层（四级兜底纯函数）"
```

---

## Task 3: Composables（读 Channel 配置）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\composables\useOrderDetailConfig.ts`
- Create: `d:\zhao\nshop\layers\base\app\composables\useOrderListConfig.ts`

- [ ] **Step 1: `useOrderDetailConfig.ts`**（仿 `useDetailConfig.ts`）

```ts
import { useAsyncData } from "#imports";
import {
  parseOrderDetailConfig, orderDetailLayout, orderDetailBlockVisible,
  type OrderDetailConfig, type OrderDetailLayout,
} from "../utils/order-config";

export function useOrderDetailConfig() {
  const { data } = useAsyncData(
    "order-detail-config",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields?.orderDetailConfig ?? null;
    },
    { server: true },
  );
  const config = computed<OrderDetailConfig | null>(() => parseOrderDetailConfig(data.value ?? null));
  const layout = computed<OrderDetailLayout>(() => orderDetailLayout(config.value));
  const visible = (key: string) => orderDetailBlockVisible(config.value, key);
  return { config, layout, visible };
}
```

- [ ] **Step 2: `useOrderListConfig.ts`**

```ts
import { useAsyncData } from "#imports";
import { parseOrderListConfig, orderListLayout, type OrderListConfig, type OrderListLayout } from "../utils/order-config";

export function useOrderListConfig() {
  const { data } = useAsyncData(
    "order-list-config",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields?.orderListConfig ?? null;
    },
    { server: true },
  );
  const config = computed<OrderListConfig | null>(() => parseOrderListConfig(data.value ?? null));
  const layout = computed<OrderListLayout>(() => orderListLayout(config.value));
  return { config, layout };
}
```

- [ ] **Step 3: typecheck + 提交**

```bash
npx nuxt typecheck
git add layers/base/app/composables/useOrderDetailConfig.ts layers/base/app/composables/useOrderListConfig.ts
git commit -m "feat(order): 订单版式/列表配置 composables"
```

---

## Task 4: `GetChannelTheme` 补字段 + 类型再生

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\context.gql`

- [ ] **Step 1: 更新查询**

`context.gql` 的 `GetChannelTheme`：

```graphql
query GetChannelTheme {
  activeChannel {
    customFields {
      themeId
      shopContent
      detailConfig
      orderDetailConfig
      orderListConfig
    }
  }
}
```

- [ ] **Step 2: 再生 GQL 类型**

```bash
cd d:\zhao\nshop
npx nuxt prepare
```
若报缺新字段类型（本地 schema 缓存未含），手动在根 `graphql.schema.json` 中 `activeChannel.customFields` 补 `orderDetailConfig`/`orderListConfig`（`{"type":"String","kind":"SCALAR"}`）后重跑 `npx nuxt prepare`。

- [ ] **Step 3: 提交**

```bash
git add layers/base/gql/queries/context.gql graphql.schema.json
git commit -m "feat(order): GetChannelTheme 下发订单版式配置字段"
```

---

## Task 5: 订单详情块组件（L3 定制入口）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\order\OrderDetailStatusBlock.vue`
- Create: `.../OrderDetailProgressBlock.vue`
- Create: `.../OrderDetailRedemptionBlock.vue`
- Create: `.../OrderDetailAddressBlock.vue`
- Create: `.../OrderDetailItemsBlock.vue`
- Create: `.../OrderDetailPickupBlock.vue`
- Create: `.../OrderDetailTotalsBlock.vue`
- Create: `.../OrderDetailMetaBlock.vue`
- Create: `.../OrderDetailActionsBlock.vue`

> 命名：需在 `components/order/` 下，Nuxt 自动注册为 `<OrderDetailXxxBlock>`（完整注册名，避免 SSR 渲染为空注释）。

- [ ] **Step 1: `OrderDetailStatusBlock.vue`**（含 title/text 定制，title 兜底到块内文案）

```vue
<script setup lang="ts">
import { localizeOrderText, type OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; block?: OrderBlockCfg }>();
const { locale } = useI18n();
const blockTitle = computed(() =>
  props.block?.title ? localizeOrderText(props.block.title, locale.value) : "",
);
</script>
<template>
  <section v-if="blockTitle" class="mb-4">
    <h2 class="mb-2 font-semibold">{{ blockTitle }}</h2>
  </section>
  <OrderStatusBanner :order="props.order" class="mb-4" />
</template>
```

- [ ] **Step 2: `OrderDetailProgressBlock.vue`**

```vue
<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
defineProps<{ order: any; block?: OrderBlockCfg }>();
</script>
<template>
  <OrderProgress :state="props.order.state" class="mb-8" />
</template>
```

- [ ] **Step 3: `OrderDetailRedemptionBlock.vue`**

```vue
<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
defineProps<{ order: any; block?: OrderBlockCfg }>();
</script>
<template>
  <OrderRedemptionCard :order-code="props.order.code" class="mb-4" />
</template>
```

- [ ] **Step 4: `OrderDetailAddressBlock.vue`**

```vue
<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
defineProps<{ order: any; block?: OrderBlockCfg }>();
</script>
<template>
  <section class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <OrderAddress :address="props.order.shippingAddress" />
  </section>
</template>
```

- [ ] **Step 5: `OrderDetailItemsBlock.vue`**（转发 `#line-actions` 售后插槽）

```vue
<script setup lang="ts">
import { localizeOrderText, type OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; block?: OrderBlockCfg }>();
const { locale } = useI18n();
const blockTitle = computed(() =>
  props.block?.title ? localizeOrderText(props.block.title, locale.value) : t("messages.shop.orderSummary"),
);
</script>
<template>
  <section class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <h2 class="mb-3 font-semibold">{{ blockTitle }}</h2>
    <OrderItems :order="props.order">
      <template #line-actions="scope">
        <slot name="line-actions" v-bind="scope" />
      </template>
    </OrderItems>
  </section>
</template>
```

- [ ] **Step 6: `OrderDetailPickupBlock.vue`**

```vue
<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
defineProps<{ order: any; block?: OrderBlockCfg }>();
</script>
<template>
  <OrderPickupCard
    :order="props.order"
    class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
  />
</template>
```

- [ ] **Step 7: `OrderDetailTotalsBlock.vue`**（Totals + ShippingBreakdown）

```vue
<script setup lang="ts">
import { localizeOrderText, type OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; block?: OrderBlockCfg }>();
const { locale } = useI18n();
const blockTitle = computed(() =>
  props.block?.title ? localizeOrderText(props.block.title, locale.value) : t("messages.general.amount"),
);
</script>
<template>
  <section class="mb-4 max-w-md rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <h2 class="mb-3 font-semibold">{{ blockTitle }}</h2>
    <OrderTotals :order="props.order" />
    <OrderShippingBreakdown :order="props.order" />
  </section>
</template>
```

- [ ] **Step 8: `OrderDetailMetaBlock.vue`**

```vue
<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
defineProps<{ order: any; block?: OrderBlockCfg }>();
</script>
<template>
  <section class="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <OrderMetaCard :order="props.order" />
  </section>
</template>
```

- [ ] **Step 9: `OrderDetailActionsBlock.vue`**

```vue
<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; block?: OrderBlockCfg }>();
const emit = defineEmits<{ (e: "updated"): void }>();
</script>
<template>
  <OrderActions :order="props.order" @updated="emit('updated')" class="mb-10" />
</template>
```

> `localizeOrderText` / `useI18n` 的 `t` 需在块内 `useI18n()` 取（Step1/5/7 里的 `localizeOrderText`/`t` 应写成组件内已引用的样子；若 title 本期可仅用字符串且走 i18n，可统一简化为 `t('messages.shop.xxx')`。为避免散落，若 `config.blocks[key].title` 未配置则直接不渲染定制标题，保持现状块内标题来自各组件自身的 i18n 文案）。

- [ ] **Step 10: 提交**

```bash
git add layers/base/app/components/order/
git commit -m "feat(order): 订单详情 Block 组件（L3 定制入口）"
```

---

## Task 6: `OrderDetailClassic.vue`（备用模板 = 现 `[code].vue` 迁移）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\order\OrderDetailClassic.vue`

- [ ] **Step 1: 迁移现有 `<main>` 内容为经典版式**

将现 `account/orders/[code].vue` 中 `<main v-else-if="order">` 的全部子节点迁入，props 收 `order`、`refresh`，并透传 `#line-actions` 售后插槽：

```vue
<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; refresh: () => void; block?: OrderBlockCfg }>();
const { t } = useI18n();
function isPickup(order: any) { return (order?.customFields?.deliveryType ?? "") === "pickup"; }
</script>
<template>
  <OrderStatusBanner :order="order" class="mb-4" />
  <OrderProgress :state="order.state" class="mb-8" />
  <OrderRedemptionCard :order-code="order.code" class="mb-4" />
  <section class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <OrderAddress :address="order.shippingAddress" />
  </section>
  <section class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <h2 class="mb-3 font-semibold">{{ t("messages.shop.orderSummary") }}</h2>
    <OrderItems :order="order">
      <template #line-actions="scope">
        <slot name="line-actions" v-bind="scope" />
      </template>
    </OrderItems>
  </section>
  <OrderPickupCard v-if="isPickup(order)" :order="order" class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900" />
  <section class="mb-4 max-w-md rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <h2 class="mb-3 font-semibold">{{ t("messages.general.amount") }}</h2>
    <OrderTotals :order="order" />
    <OrderShippingBreakdown :order="order" />
  </section>
  <section class="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <OrderMetaCard :order="order" />
  </section>
  <OrderActions :order="order" @updated="refresh" class="mb-10" />
</template>
```

`isPickup` 是纯函数，移到组件内：

```ts
function isPickup(order: any) { return (order?.customFields?.deliveryType ?? "") === "pickup"; }
```

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/components/order/OrderDetailClassic.vue
git commit -m "feat(order): 订单详情经典版式（备用模板，逐块可回退）"
```

---

## Task 7: `OrderDetailJd.vue`（京东积木版式，默认）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\order\OrderDetailJd.vue`

- [ ] **Step 1: 实现**（按 `visible(key)` 拼装块，层内透传 `#line-actions` 与 `@updated`）

```vue
<script setup lang="ts">
import type { OrderDetailConfig } from "../../utils/order-config";
import { useOrderDetailConfig } from "../../composables/useOrderDetailConfig";
const props = defineProps<{ order: any; refresh: () => void; config?: OrderDetailConfig | null }>();
const emit = defineEmits<{ (e: "apply", line: any): void }>();
const { visible } = useOrderDetailConfig();
const block = (key: string) => props.config?.blocks?.[key];
</script>
<template>
  <OrderDetailStatusBlock v-if="visible('status')" :order="order" :block="block('status')" />
  <OrderDetailProgressBlock v-if="visible('progress')" :order="order" :block="block('progress')" />
  <OrderDetailRedemptionBlock v-if="visible('redemption')" :order="order" :block="block('redemption')" />
  <OrderDetailAddressBlock v-if="visible('address')" :order="order" :block="block('address')" />
  <OrderDetailItemsBlock v-if="visible('items')" :order="order" :block="block('items')">
    <template #line-actions="scope">
      <slot name="line-actions" v-bind="scope" />
    </template>
  </OrderDetailItemsBlock>
  <OrderDetailPickupBlock v-if="visible('pickup')" :order="order" :block="block('pickup')" />
  <OrderDetailTotalsBlock v-if="visible('totals')" :order="order" :block="block('totals')" />
  <OrderDetailMetaBlock v-if="visible('meta')" :order="order" :block="block('meta')" />
  <OrderDetailActionsBlock v-if="visible('actions')" :order="order" :block="block('actions')" @updated="refresh" />
</template>
```

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/components/order/OrderDetailJd.vue
git commit -m "feat(order): 订单详情京东积木版式（默认）"
```

---

## Task 8: `OrderDetailRenderer.vue`（版式切换）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\order\OrderDetailRenderer.vue`

- [ ] **Step 1: 实现**

```vue
<script setup lang="ts">
import OrderDetailClassic from "./OrderDetailClassic.vue";
import OrderDetailJd from "./OrderDetailJd.vue";
import { useOrderDetailConfig } from "../../composables/useOrderDetailConfig";
const props = defineProps<{ order: any; refresh: () => void }>();
const emit = defineEmits<{ (e: "apply", line: any): void }>();
const { layout, config } = useOrderDetailConfig();
const map = { jd: OrderDetailJd, classic: OrderDetailClassic } as const;
</script>
<template>
  <component :is="map[layout] ?? OrderDetailJd" :order="order" :refresh="refresh" :config="config" @apply="emit('apply', $event)">
    <template #line-actions="scope">
      <slot name="line-actions" v-bind="scope" />
    </template>
  </component>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/components/order/OrderDetailRenderer.vue
git commit -m "feat(order): 订单详情渲染器（jd/classic 切换，缺省回退 jd）"
```

---

## Task 9: 改造订单详情页 `[code].vue` 接入渲染器

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\orders\[code].vue`

- [ ] **Step 1: `<main>` 内替换为渲染器 + 保留取数/售后态**

保留 script 的取数与售后逻辑，把既有 `<main>` 的 `OrderStatusBanner...OrderActions` 段落整体替换为 `<OrderDetailRenderer>`，把售后申请按钮作为 `#line-actions` 插槽从页面层提供（沿用 `canApplyAfterSales`）：

```vue
<template>
  <UError v-if="hasError" :error="{ statusCode: 404, statusMessage: t('messages.error.noOrder'), message: t('messages.error.orderNotFound') }" />
  <main v-else-if="order" class="container mb-14">
    <header class="my-14 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ t("messages.shop.orderDetails") }}</h1>
      <ULink :to="localePath('/account/orders')" class="text-sm text-neutral-500">
        {{ t("messages.account.orders") }}
      </ULink>
    </header>
    <OrderDetailRenderer :order="order" :refresh="refresh" @apply="applyLine = $event; applyModalOpen = true">
      <template #line-actions="{ line, order: o }">
        <UButton
          v-if="canApplyAfterSales(o.state)"
          size="xs" variant="soft" color="primary" icon="i-lucide-receipt"
          :label="t('messages.afterSales.apply')" class="shrink-0"
          @click="applyLine = line; applyModalOpen = true"
        />
      </template>
    </OrderDetailRenderer>
    <AfterSalesCreateModal
      v-if="applyLine"
      v-model:open="applyModalOpen"
      :order-id="order.id" :order-line="applyLine" :max-amount="applyLine.proratedLinePrice"
    />
  </main>
</template>
```

> `isPickup` 计算属性可删除（已移入 Classic/Pickup 块）。`OrderDetailJd` 的 `@apply` → renderer `emit('apply')` → 页面置 `applyLine`，与插槽触发一致。

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/pages/account/orders/[code].vue
git commit -m "refactor(order): 订单详情页接入 OrderDetailRenderer"
```

---

## Task 10: 订单列表 `OrderListRenderer` + 列表页改造

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\order\OrderListRenderer.vue`
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\orders\index.vue`

- [ ] **Step 1: `OrderListRenderer.vue`**（本期仅 card，封装占位）

```vue
<script setup lang="ts">
import { useOrderListConfig } from "../../composables/useOrderListConfig";
import type { OrderTabKey } from "../../utils/order-state";
const tab = defineModel<OrderTabKey>({ required: true });
const { layout } = useOrderListConfig();
</script>
<template>
  <!-- 本期仅卡片版式；未来按 layout 扩展 classic/table -->
  <OrderTabBar v-model="tab" />
  <OrderCardList v-model:tab="tab" />
</template>
```

- [ ] **Step 2: 列表页改用渲染器**

`account/orders/index.vue` 模板：

```vue
<main class="container py-8">
  <header class="mb-6">
    <h1 class="text-2xl font-semibold">{{ t("messages.account.orders") }}</h1>
    <button class="mt-1 text-sm text-neutral-500 underline" @click="onCopy(customer?.emailAddress ?? '')">
      {{ customer?.emailAddress }}
    </button>
  </header>
  <OrderListRenderer v-model="activeTab" />
</main>
```

- [ ] **Step 3: 提交**

```bash
git add layers/base/app/components/order/OrderListRenderer.vue layers/base/app/pages/account/orders/index.vue
git commit -m "feat(order): 订单列表渲染器封装"
```

---

## Task 11: i18n 词条同步（如涉及新文案）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts`

- [ ] **Step 1: 盘点并补齐**

若块定制 title 用到了 `messages.order.*` 新 key（如订单详情默认标题），在 `zh-CN.ts` / `en-US.ts` 同步新增；若完全复用既有 `messages.shop.orderDetails / orderSummary / general.amount`，此任务可跳过，仅在块内确认 key 存在。

- [ ] **Step 2: 提交（如有改动）**

```bash
git add layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "i18n(order): 订单版式词条"
```

---

## Task 12: 构建 / 手机截图 / 操作手册 / 部署

**Files:**
- Create（截图脚本）: `d:\zhao\nshop\scripts\_shot_order_templates.py`
- Modify（手册）: `d:\zhao\nshop\docs\...\订单操作手册.md`（如有）

- [ ] **Step 1: 本地构建**

```bash
cd d:\zhao\nshop
pnpm build
```
Expected: 构建成功，无类型/模板编译错误（重点看 OrderDetailRenderer/块组件 hydrate 相关的自动注册名是否正确解析）。

- [ ] **Step 2: 手机视口截图**（390×844, dpr=2, Playwright）

写 `scripts/_shot_order_templates.py`，登录测试账号（`zhao@163.com`），分别访问：
- 订单详情（含核销码卡）—— 默认 `jd` 版式 → `e2e-shots/order-detail-jd.png`
- 临时将 `orderDetailConfig` 配置为 `{"version":1,"layout":"classic"}` 后 → `e2e-shots/order-detail-classic.png`（回退备用模板）
- 订单列表 → `e2e-shots/order-list-card.png`

把三张图补进订单操作手册。

- [ ] **Step 3: 部署链路（前端）**

```bash
node scripts/deploy.mjs   # 本地构建 → 上传 www.youshop.cn 站点目录 → pm2 restart nshop
```
（后端字段已在 Task 1 部署；若 Task 1 未走 `_deploy.ps1`，此处补跑后端部署）

- [ ] **Step 4: 线上回归**

访问线上订单详情：默认呈现京东积木版式（核销码卡显示、售后申请按钮可用、自提单提货码可见）；构造经典版式配置后切回旧模板正常。

- [ ] **Step 5: 收尾**

```bash
git add scripts/_shot_order_templates.py docs/
git commit -m "test(order): 订单版式手机截图 + 手册补图"
```

---

## Self-Review（按 spec 核对）

- **L1 全局 Token**：块组件沿用现有 `bg-brand-600` 等，未破坏全局 Token 使用（spec 要求系统化但不强制本期重构 L1，现有组件已间接使用品牌色，符合本期「先 detail 补 L2/L3/L4」）。✅
- **L2 页面级配置**：Task 1 + Task 3 + Task 4（`orderDetailConfig`/`orderListConfig` 走 `GetChannelTheme`）。✅
- **L3 块级定制**：Task 5 块组件收 `block` prop（visible/title/text）。✅
- **L4 兜底链**：Task 2 纯函数（坏 JSON→null→jd / 块显隐→内建→true / 文案→locale→default→首值→''），渲染器缺省回退 `OrderDetailJd`。✅
- **默认京东版式上线**：`orderDetailLayout` 缺省返回 `'jd'`；前端可先于后端字段独立上线。✅
- **保留当前模板备用**：Task 6 `OrderDetailClassic.vue` = 现 `[code].vue` 内容迁移，可配置 `classic` 回退。✅
- **列表渲染器**：Task 10 `OrderListRenderer`（本期仅 card，不改视觉）。✅
- **测试/交付**：Task 2 spec + Task 12 构建/手机截图/手册/部署。✅

**边界说明（诚实）**: 前端纯函数 spec 与 `detail-config.spec.ts` 一致，但 nshop 当前未接线 vitest runner，故以 `npx nuxt typecheck` 作为纯函数门槛，spec 保留为 func 文档 + 未来接线。