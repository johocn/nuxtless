# 订单列表 / 订单详情 三版式（cn · jd · mall）— 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 订单列表与订单详情（自提·含核销码）各落地 cn / jd / mall 三版式，1:1 对照已定稿 mockup，接入既有 `orderListConfig` / `orderDetailConfig` layout 配置体系。

**Architecture:** 配置层（`utils/order-config.ts`）扩类型 + 白名单兜底（非法/缺省 → 现状默认 `card` / `jd`）。版式容器（`OrderList{Cn,Jd,Mall}`、`OrderDetail{Cn,Jd,Mall}`）自持容器与配色，复用既有功能积木；仅 4 个确有版式差异的显示积木（`OrderStatusBanner` / `OrderProgress` / `OrderRedemptionCard` / `OrderActions`）加 `variant`，缺省 `"cn"` 保证 `classic` 零回归。列表取数逻辑抽为 `useOrderList()` 供 4 处复用。

**Tech Stack:** Nuxt 3 `layers/base`、vue-i18n、Tailwind（Nuxt UI）、GraphQL（`GetOrderHistory` / `GetOrderByCode` / `GetChannelTheme`）、Playwright（截图）。

**视觉真源（勿重画）：** `d:\zhao\_mockup_gallery\mockups\order-{list,detail}-{cn,jd,mall}.html`

**约定：** 仓库 `d:\zhao\nshop`（分支 `nshop`）；`git add` 精确枚举，勿 `git add -A`；`_` 前缀脚本为本地探针。

---

## 文件结构

**改**
- `layers/base/app/utils/order-config.ts` — 类型 + 白名单兜底
- `layers/base/app/components/order/OrderStatusBanner.vue` — `variant`
- `layers/base/app/components/order/OrderProgress.vue` — `variant`
- `layers/base/app/components/order/OrderRedemptionCard.vue` — `variant`
- `layers/base/app/components/order/OrderActions.vue` — `variant`
- `layers/base/app/components/order/OrderCardList.vue` — 改用 `useOrderList`
- `layers/base/app/components/order/OrderListRenderer.vue` — map 扩展
- `layers/base/app/components/order/OrderDetailRenderer.vue` — map 扩展
- `layers/base/app/components/order/OrderDetailJd.vue` — 京东风容器（对齐 mockup）
- `layers/base/i18n/locales/zh-CN.ts`、`en-US.ts` — 双语言词条

**新**
- `layers/base/app/composables/useOrderList.ts`
- `layers/base/app/components/order/OrderListCn.vue`
- `layers/base/app/components/order/OrderListJd.vue`
- `layers/base/app/components/order/OrderListMall.vue`
- `layers/base/app/components/order/OrderDetailCn.vue`
- `layers/base/app/components/order/OrderDetailMall.vue`
- `scripts/_shot_order_layouts.py`

---

### Task 1: 配置层类型扩展 + 白名单兜底

**Files:** `layers/base/app/utils/order-config.ts`

- [ ] **Step 1: 扩展类型并重写两个 layout 解析**

把文件顶部类型区改为：

```ts
/** 订单版式视觉变体（供共享积木选择圆角/配色） */
export type OrderVisualVariant = "cn" | "jd" | "mall";
export type OrderDetailLayout = "jd" | "classic" | "confirmation" | "cn" | "mall";
export type OrderListLayout = "card" | "cn" | "jd" | "mall";

const ORDER_DETAIL_LAYOUTS: readonly OrderDetailLayout[] = ["jd", "classic", "confirmation", "cn", "mall"];
const ORDER_LIST_LAYOUTS: readonly OrderListLayout[] = ["card", "cn", "jd", "mall"];
```

把两个 layout 函数改为（替换现有的 `orderDetailLayout` / `orderListLayout`）：

```ts
export function orderDetailLayout(cfg: OrderDetailConfig | null): OrderDetailLayout {
  // 白名单校验：非法/缺省 → jd（沿用现状默认）；confirmation 为结算确认场景专用版式
  const v = cfg?.layout as OrderDetailLayout | undefined;
  return v && ORDER_DETAIL_LAYOUTS.includes(v) ? v : "jd";
}

export function orderListLayout(cfg: OrderListConfig | null): OrderListLayout {
  // 白名单校验：非法/缺省 → card（沿用现状默认，视觉零回归）
  const v = cfg?.layout as OrderListLayout | undefined;
  return v && ORDER_LIST_LAYOUTS.includes(v) ? v : "card";
}
```

其余（`OrderBlockCfg` / `ORDER_DETAIL_BLOCK_KEYS` / `orderDetailBlockVisible` / `parseOrder*Config` / `localizeOrderText` / `orderBlock*`）**逐字不动**。

- [ ] **Step 2: 校验兜底行为**

Run: `cd d:\zhao\nshop && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | Select-String "order-config"`
Expected: 无 `order-config.ts` 相关新增错误。

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/utils/order-config.ts
git commit -m "feat(order): 订单版式类型扩展 cn/jd/mall + 白名单兜底"
```

---

### Task 2: 共享积木加 `variant`（状态头 / 进度 / 核销卡 / 操作）

**Files:** `layers/base/app/components/order/{OrderStatusBanner,OrderProgress,OrderRedemptionCard,OrderActions}.vue`

> 统一口径：`variant?: OrderVisualVariant`，**缺省 `"cn"` = 现有观感**（保证 `classic` 与其调用方零回归）。

- [ ] **Step 1: `OrderStatusBanner.vue`**

`defineProps` 增 `variant?: OrderVisualVariant`，并按 variant 选择容器圆角、渐变、角标圆角：

```ts
const props = withDefaults(defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
  variant?: OrderVisualVariant;
}>(), { variant: "cn" });

const badge = computed(() => stateBadge(props.order.state, props.order));

// cn：按订单状态取语义渐变（现有行为）；jd / mall：固定品牌渐变
const stateGradient: Record<string, string> = {
  neutral: "from-neutral-500 to-neutral-400",
  warning: "from-amber-500 to-yellow-400",
  info: "from-sky-500 to-indigo-500",
  success: "from-emerald-500 to-green-500",
  error: "from-red-500 to-rose-500",
};
const gradientClass = computed(() => {
  if (props.variant === "jd") return "from-[#c8161d] via-[#e1251b] to-[#f04b2f]";
  if (props.variant === "mall") return "from-[#e0433f] to-[#ff6a6c]";
  return stateGradient[badge.value.color] ?? stateGradient.neutral;
});
const radiusClass = computed(() =>
  props.variant === "jd" ? "rounded-md" : props.variant === "mall" ? "rounded-2xl" : "rounded-xl",
);
const chipClass = computed(() =>
  props.variant === "jd" ? "rounded-sm" : "rounded-full",
);
```

模板根 `<div>` 的 `:class` 改为 `[radiusClass, 'bg-gradient-to-r', gradientClass]`（去掉硬编码 `rounded-xl`），角标 `:class="chipClass"`，其余不动。

- [ ] **Step 2: `OrderProgress.vue`**

```ts
const props = withDefaults(defineProps<{
  state: string;
  order?: any;
  variant?: OrderVisualVariant;
}>(), { variant: "cn" });

const stepClass = computed(() =>
  props.variant === "jd"
    ? "rounded-[3px] px-2 py-0.5"
    : props.variant === "mall"
      ? "rounded-full px-2.5 py-0.5"
      : "rounded-full px-2 py-0.5",
);
const activeClass = computed(() =>
  props.variant === "jd"
    ? "bg-[#e1251b] font-semibold text-white"
    : props.variant === "mall"
      ? "bg-gradient-to-r from-[#e0433f] to-[#ff6a6c] font-semibold text-white shadow-sm"
      : "bg-brand-600 text-white",
);
```

模板 `li > div` 的 `:class` 改为 `[stepClass, !isCancelled && i <= current ? activeClass : 'bg-neutral-100 text-neutral-500']`；mall 的非激活态用白底轻投影（`bg-white text-neutral-500 shadow-sm`），用 `isActive` computed 承载即可：

```ts
const isActive = (i: number) => !isCancelled.value && i <= current.value;
const inactiveClass = computed(() =>
  props.variant === "mall" ? "bg-white text-neutral-500 shadow-sm" : "bg-neutral-100 text-neutral-500",
);
```

分隔线 `class` 保留 `h-px w-4 bg-neutral-300`。

- [ ] **Step 3: `OrderRedemptionCard.vue`**

`withDefaults(defineProps<...>(), { highlight: true, pickupName: null, variant: "cn" })`，并把样式拆为 3 组 computed：

```ts
const sectionClass = computed(() => {
  if (props.variant === "jd") {
    return ["overflow-hidden rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,.05)]",
      props.highlight && "border-t-2 border-t-[#e1251b]"];
  }
  if (props.variant === "mall") {
    return ["overflow-hidden rounded-2xl border bg-white",
      props.highlight ? "border-[#ffe0dd] shadow-[0_4px_18px_rgba(224,67,63,.16)]" : "border-neutral-200"];
  }
  return ["overflow-hidden rounded-2xl border shadow-sm",
    props.highlight ? "border-amber-150 from-amber-50 to-white bg-gradient-to-b" : "border-neutral-200 bg-white"];
});

const codeBoxClass = computed(() => {
  const radius = props.variant === "jd" ? "rounded" : props.variant === "mall" ? "rounded-2xl" : "rounded-xl";
  if (!props.highlight) return [radius, "border border-neutral-200"];
  const grad = props.variant === "jd"
    ? "from-[#c8161d] via-[#e1251b] to-[#f04b2f]"
    : props.variant === "mall"
      ? "from-[#e0433f] to-[#ff6a6c]"
      : "from-brand-600 to-brand-500";
  return [radius, "bg-gradient-to-r text-white", grad];
});

const badgeRadius = computed(() => (props.variant === "jd" ? "rounded-sm" : "rounded-full"));
/** mall 标题珊瑚竖条；cn/jd 无竖条 */
const titleBar = computed(() => (props.variant === "mall" ? "mr-2 h-[15px] w-[5px] rounded bg-[#e0433f]" : ""));
```

模板：`<section :class="sectionClass">`；`<h2>` 内前插 `<span v-if="titleBar" :class="titleBar" />` 并用 `flex items-center`；5 个状态徽标加 `:class="badgeRadius"`；码区 `<div :class="codeBoxClass">`。

> `dark:` 变体：cn 分支保留现有 `dark:` 颜色（`dark:from-neutral-800 dark:to-neutral-900` / `dark:border-neutral-800 dark:bg-neutral-900`）；jd / mall 分支不加 `dark:`（与 mockup 一致）。cjk 高光卡为浅色主题优先，允许 jd/mall 深色下仍为浅色卡。

- [ ] **Step 4: `OrderActions.vue`**

```ts
const props = withDefaults(defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
  variant?: OrderVisualVariant;
}>(), { variant: "cn" });

const rounded = computed(() => (props.variant === "jd" ? "rounded" : "rounded-full"));
const ghostRounded = computed(() => (props.variant === "jd" ? "rounded" : "rounded-full"));
const reorderClass = computed(() =>
  props.variant === "mall"
    ? "border-0 bg-gradient-to-r from-[#e0433f] to-[#ff6a6c] text-white shadow-[0_5px_14px_rgba(224,67,63,.3)]"
    : "",
);
const linkVariant = computed(() => (props.variant === "cw" ? "ghost" : props.variant === "jd" ? "outline" : "ghost"));
```

模板 3 个 `UButton` 加 `:ui="{ rounded }"`；「再次购买」加 `:class="reorderClass"`；「获取链接」`:variant="props.variant === 'jd' ? 'outline' : 'ghost'"`、jd 时 `color="primary"`。取消按钮：jd 用 `variant="outline" color="neutral"`，cn/mall 保持 `variant="soft" color="error"`。

- [ ] **Step 5: 局部 typecheck**

Run: `cd d:\zhao\nshop && npm run typecheck`
Expected: 这 4 个文件无新增错误。

- [ ] **Step 6: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/components/order/OrderStatusBanner.vue layers/base/app/components/order/OrderProgress.vue layers/base/app/components/order/OrderRedemptionCard.vue layers/base/app/components/order/OrderActions.vue
git commit -m "feat(order): 状态头/进度/核销卡/操作积木支持 cn|jd|mall 变体"
```

---

### Task 3: 抽取 `useOrderList()` 并让 `OrderCardList` 复用

**Files:** `layers/base/app/composables/useOrderList.ts`（新）、`layers/base/app/components/order/OrderCardList.vue`（改）

- [ ] **Step 1: 新建 composable（行为逐字保留现有 `OrderCardList` 逻辑）**

```ts
import { SortOrder } from "~~/types/default";
import type { OrderTabKey } from "../utils/order-state";
import { tabOfState } from "../utils/order-state";

/**
 * 订单列表取数（card / cn / jd / mall 四版式共用）。
 * 过滤口径：幽灵单（0 件 0 元）与商户子单（type=Seller）不上榜。
 */
export function useOrderList(activeTab: Ref<OrderTabKey>) {
  const take = ref(10);
  const loading = ref(true);

  const { data, refresh, error } = await useAsyncGql(
    "GetOrderHistory",
    computed(() => ({ options: { sort: { createdAt: SortOrder.DESC }, take: take.value } })),
    { immediate: false, server: false },
  );

  const rawItems = computed(() => data.value?.activeCustomer?.orders?.items ?? []);
  const orders = computed(() =>
    rawItems.value.filter(
      (o) => Number((o as any).totalQuantity ?? 0) > 0 && (o as any).type !== "Seller",
    ),
  );
  const total = computed(() => data.value?.activeCustomer?.orders?.totalItems ?? 0);
  const filtered = computed(() =>
    activeTab.value === "ALL" ? orders.value : orders.value.filter((o) => tabOfState(o.state) === activeTab.value),
  );

  async function loadMore() {
    take.value += 10;
    await refresh();
  }
  async function changed() {
    await refresh();
  }

  onMounted(async () => {
    await refresh();
    loading.value = false;
  });

  return { loading, error, rawItems, orders, filtered, total, loadMore, changed };
}
```

- [ ] **Step 2: `OrderCardList.vue` 改为消费**

`<script setup>` 替换为：

```ts
import type { OrderTabKey } from "../../utils/order-state";

const activeTab = defineModel<OrderTabKey>("tab", { default: "ALL" });
const { loading, error, orders, filtered, rawItems, total, loadMore, changed } = useOrderList(activeTab);
```

模板**逐字不动**（仍用 `loading/error/orders/filtered/rawItems/total/loadMore/changed`）。

- [ ] **Step 3: 校验**

Run: `cd d:\zhao\nshop && npm run typecheck`
Expected: 无新增错误。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/composables/useOrderList.ts layers/base/app/components/order/OrderCardList.vue
git commit -m "refactor(order): 列表取数抽为 useOrderList 供多版式复用"
```

---

### Task 4: 三个列表版式容器 + 渲染器 map

**Files:** `OrderListCn.vue` / `OrderListJd.vue` / `OrderListMall.vue`（新）、`OrderListRenderer.vue`（改）

> 视觉真源：`_mockup_gallery\mockups\order-list-{cn,jd,mall}.html`（类名/尺寸 1:1 对照）。三容器**均不含标题栏**（页面 header 承担）。

- [ ] **Step 1: `OrderListCn.vue`**

结构与要点（tab 内联渲染，因为 `OrderTabBar` 样式固定为既有 card 风格）：

```vue
<script setup lang="ts">
import type { OrderTabKey } from "../../utils/order-state";
import { ORDER_TABS } from "../../utils/order-state";

const activeTab = defineModel<OrderTabKey>({ required: true });
const { t, locale } = useI18n();
const { loading, error, orders, filtered, rawItems, total, loadMore, changed } = useOrderList(activeTab);

const tabs = computed(() => ORDER_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) })));
const fmt = (amount: number, currency?: string) =>
  new Intl.NumberFormat(locale.value, { style: "currency", currency: currency || "CNY" }).format(amount / 100);
</script>
```

模板：药丸 tab（`rounded-full bg-[#f4f5f7] text-[#4b5563]`，选中 `bg-[#e1251b] text-white font-semibold`）→ `loading / error / empty / list` 四态（文案用 `messages.general.loading` / `messages.order.loadFailed` / `messages.order.empty`）→ 卡片（`rounded-xl border border-[#ececec] shadow-[0_1px_3px_rgba(0,0,0,.05)]`）：

- 头部：`🏬` + （`deliveryType === "pickup"` ? `messages.shop.pickupInfo` : `messages.account.selfOperated`）+ `OrderStateBadge :state="o.state"`（描边丸）
- 商品行：`NuxtImg :src="assetSrc(line.featuredAsset?.preview, 96)"`（`h-12 w-12 rounded-lg`）+ 名称/数量 + 行金额 + `×N`
- 底部：`messages.order.totalItems` / `messages.order.actualPaid` + 金额（`text-[#111827] font-semibold`）
- 操作：`OrderCardActions :order="o" variant="cn" @changed="changed"`（`OrderCardActions` 加 `variant` 透传至 `UButton` 圆角/色彩；见 Step 4）

整卡可点跳详情：头部/商品/底部包在 `<NuxtLink :to="localePath(`/account/orders/${o.code}`)">` 内，操作区独立于链接外（沿用 `OrderCard` 既有防误触模式）。

- [ ] **Step 2: `OrderListMall.vue`**

同 Step 1 骨架，差异：tab 为渐变药丸（选中 `bg-gradient-to-r from-[#e0433f] to-[#ff6a6c] text-white font-semibold`，未选 `bg-white shadow-[0_1px_3px_rgba(0,0,0,.04)]`）；卡片 `rounded-[18px] shadow-[0_3px_14px_rgba(17,24,39,.06)]` 无描边；缩略图 `h-[50px] w-[50px] rounded-xl`；状态徽标为实心浅底丸；底部分隔线 `border-t border-dashed border-[#eef0f2]`；实付金额 `text-[#e0433f] text-[15px] font-bold`；CTA `OrderCardActions variant="mall"`（查看详情/再次购买为珊瑚渐变实心药丸）。

- [ ] **Step 3: `OrderListJd.vue`**

```ts
/** 按配送类型分组（自营 / 自提门店）：OrderBase 片段无商家名，故以 deliveryType 为口径 */
const groups = computed(() => {
  const self = filtered.value.filter((o) => (o as any).customFields?.deliveryType !== "pickup");
  const pickup = filtered.value.filter((o) => (o as any).customFields?.deliveryType === "pickup");
  return [
    { key: "self", label: t("messages.account.selfOperated"), items: self },
    { key: "pickup", label: t("messages.order.merchantPickup"), items: pickup },
  ].filter((g) => g.items.length > 0);
});
```

模板：下划线 tab（选中 `border-b-2 border-[#e1251b] text-[#e1251b] font-bold`）→ 分区（`border-t-2 border-t-[#e1251b] bg-white`，分区头 3px 红竖条 + 名称）→ 订单行（日期时间 + `#code` + 状态色文字；商品行虚线分隔；`共 N 件 / 实付 ¥`；`OrderCardActions variant="jd"` 4px 圆角按钮）→ 加载更多。

日期时间：`new Date(o.orderPlacedAt).toLocaleString(locale.value, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })`。

- [ ] **Step 4: `OrderCardActions.vue` 支持 variant**

加 `variant?: OrderVisualVariant`（缺省 `"cn"`）：`rounded` → jd `rounded` / cn·mall `rounded-full`；「查看详情」mall 用珊瑚渐变实心（`class="border-0 bg-gradient-to-r from-[#e0433f] to-[#ff6a6c] text-white shadow-[0_3px_10px_rgba(224,67,63,.28)]"`）；jd「查看详情」保持 `variant="soft" color="primary"`。

- [ ] **Step 5: `OrderListRenderer.vue` map 扩展**

```vue
<script setup lang="ts">
import { useOrderListConfig } from "../../composables/useOrderListConfig";
import type { OrderTabKey } from "../../utils/order-state";

const activeTab = defineModel<OrderTabKey>({ required: true });
const { layout } = useOrderListConfig();
</script>

<template>
  <!-- card（默认，沿用现状）｜cn｜jd｜mall：非法值已被 orderListLayout 收敛为 card -->
  <template v-if="layout === 'cn'">
    <OrderListCn v-model="activeTab" />
  </template>
  <template v-else-if="layout === 'jd'">
    <OrderListJd v-model="activeTab" />
  </template>
  <template v-else-if="layout === 'mall'">
    <OrderListMall v-model="activeTab" />
  </template>
  <template v-else>
    <OrderTabBar v-model="activeTab" />
    <OrderCardList v-model:tab="activeTab" />
  </template>
</template>
```

- [ ] **Step 6: typecheck + 提交**

Run: `cd d:\zhao\nshop && npm run typecheck`

```bash
cd d:\zhao\nshop
git add layers/base/app/components/order/OrderListCn.vue layers/base/app/components/order/OrderListJd.vue layers/base/app/components/order/OrderListMall.vue layers/base/app/components/order/OrderCardActions.vue layers/base/app/components/order/OrderListRenderer.vue
git commit -m "feat(order): 订单列表 cn/jd/mall 三版式 + 渲染器接入"
```

---

### Task 5: 详情版式容器（cn / mall / jd 对齐 mockup）+ 渲染器 map

**Files:** `OrderDetailCn.vue` / `OrderDetailMall.vue`（新）、`OrderDetailJd.vue`（改）、`OrderDetailRenderer.vue`（改）

> 视觉真源：`_mockup_gallery\mockups\order-detail-{cn,jd,mall}.html`。三容器**不含标题栏**。
> 共同顺序：`Status → Progress → [pickup ? Redemption : Address] → Items → [pickup ? Pickup] → Totals(+ShippingBreakdown) → Meta → Actions`。

- [ ] **Step 1: 三容器共用的脚手架**

每个容器 `<script setup>` 顶部：

```ts
import type { OrderDetailConfig } from "../../utils/order-config";
import { isPickupOrder, localizeOrderText } from "../../utils/order-config";
import { useOrderDetailConfig } from "../../composables/useOrderDetailConfig";

const props = defineProps<{ order: any; refresh: () => void; config?: OrderDetailConfig | null }>();
const emit = defineEmits<{ (e: "apply", line: any): void }>();
const { t, locale } = useI18n();
const { visible } = useOrderDetailConfig();
const block = (key: string) => props.config?.blocks?.[key];
const pickup = computed(() => isPickupOrder(props.order));
/** 块标题：块定制 title 优先（L3），缺省回退 i18n 兜底（L4） */
function title(key: string, dft: string) {
  const raw = block(key)?.title;
  return raw ? localizeOrderText(raw, locale.value) : dft;
}
```

`line-actions` 插槽必须逐层透传（售后申请依赖）：

```vue
<OrderItems :order="order">
  <template #line-actions="scope">
    <slot name="line-actions" v-bind="scope" />
  </template>
</OrderItems>
```

- [ ] **Step 2: `OrderDetailCn.vue`**

容器 `rounded-xl border border-neutral-200 bg-white p-4 shadow-sm`（＝既有 `*Block` 容器样式，故 cn 观感与现状一致）；标题 `font-semibold`。积木调用：

```vue
<OrderStatusBanner v-if="visible('status')" :order="order" variant="cn" class="mb-4" />
<OrderProgress v-if="visible('progress')" :state="order.state" :order="order" variant="cn" class="mb-8" />
<OrderRedemptionCard v-if="pickup && visible('redemption')" :order-code="order.code" :pickup-name="pickupName" :highlight="orderBlockHighlight(config ?? null, 'redemption')" variant="cn" class="mb-4" />
<section v-if="!pickup && visible('address')" class="mb-4 ...容器类"><OrderAddress :address="order.shippingAddress" /></section>
<section v-if="visible('items')" class="mb-4 ...容器类"><h2 class="mb-3 font-semibold">{{ title('items', t('messages.shop.orderSummary')) }}</h2><OrderItems ... /></section>
<OrderPickupCard v-if="pickup && visible('pickup')" :order="order" class="mb-4 ...容器类" />
<section v-if="visible('totals')" class="mb-4 ...容器类"><h2 class="mb-3 font-semibold">{{ title('totals', t('messages.general.amount')) }}</h2><OrderTotals :order="order" /><OrderShippingBreakdown :order="order" /></section>
<section v-if="visible('meta')" class="mb-6 ...容器类"><OrderMetaCard :order="order" /></section>
<OrderActions v-if="visible('actions')" :order="order" variant="cn" class="mb-10" @updated="refresh" />
```

`pickupName` 取值沿用 `OrderDetailRedemptionBlock` 现有口径（`customFields.pickupStoreName ?? delivery.method.name ?? shippingMethod.name ?? null`）。

- [ ] **Step 3: `OrderDetailMall.vue`**

同上顺序，容器 `rounded-[18px] bg-white p-4 shadow-[0_3px_14px_rgba(17,24,39,.06)]`（**无描边**）；标题 `mb-3 flex items-center text-[14.5px] font-extrabold` + 前插 `<span class="mr-2 h-[15px] w-[5px] rounded bg-[#e0433f]" />`；状态头/进度/核销卡/操作传 `variant="mall"`。

- [ ] **Step 4: `OrderDetailJd.vue` 重写为京东风容器**

同上顺序；容器 `rounded-md bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,.05)]`（**无描边**）；标题 `mb-2.5 flex items-center text-[13.5px] font-bold` + 前插 `<span class="mr-1.5 h-[13px] w-[3px] rounded-sm bg-[#e1251b]" />`；状态头/进度/核销卡/操作传 `variant="jd"`。

> 保留原文件的 `props` / `emit` / `slot #line-actions` 契约与 `visible()/block()/isPickupOrder()` 口径，仅替换容器样式与积木 variant；不再调用 `OrderDetail*Block` 薄封装（后者仍服务 `classic` / `confirmation`）。

- [ ] **Step 5: `OrderDetailRenderer.vue` map 扩展**

```ts
const map = {
  jd: OrderDetailJd,
  classic: OrderDetailClassic,
  confirmation: OrderDetailJd, // 映射保持现状
  cn: OrderDetailCn,
  mall: OrderDetailMall,
} as const;
```

`<component :is="map[layout] ?? OrderDetailJd" ...>` 不变（`layout` 已被 `orderDetailLayout()` 收敛，`?? OrderDetailJd` 为双保险）。

- [ ] **Step 6: typecheck + 提交**

Run: `cd d:\zhao\nshop && npm run typecheck`

```bash
cd d:\zhao\nshop
git add layers/base/app/components/order/OrderDetailCn.vue layers/base/app/components/order/OrderDetailMall.vue layers/base/app/components/order/OrderDetailJd.vue layers/base/app/components/order/OrderDetailRenderer.vue
git commit -m "feat(order): 订单详情 cn/mall 版式 + jd 对齐定稿 mockup"
```

---

### Task 6: i18n 双语言词条

**Files:** `layers/base/i18n/locales/zh-CN.ts`、`layers/base/i18n/locales/en-US.ts`

- [ ] **Step 1: 新增词条（两文件同步，插在 `messages.order` 组末尾 `graphqlError` 之后）**

zh-CN：

```ts
      merchantPickup: '自提门店',
      pickupRedeemInfo: '自提 / 核销信息',
```

en-US：

```ts
      merchantPickup: 'Pickup store',
      pickupRedeemInfo: 'Pickup / redemption info',
```

其余全部复用既有词条：`messages.order.{tabAll,tabPaymentPending,tabToShip,tabToReceive,tabCompleted,tabCancelled,cancel,reorder,viewDetail,actualPaid,totalItems,empty,loadMore,loadFailed,redemptionTitle,redemptionCodeLabel,redeemStatusPending,redeemExpiresTo,redeemExpireSoonTip,redeemPoint}`、`messages.shop.{pickupInfo,orderSummary,orderCode,contactPhone}`、`messages.general.{amount,date,paymentMethod,shippingSelect,shippingAddress,getLink,loading}`、`messages.account.{selfOperated,contactName}`。

- [ ] **Step 2: 校验双语言同 key**

Run（PowerShell）：

```powershell
Select-String -Path "d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts","d:\zhao\nshop\layers\base\i18n\locales\en-US.ts" -Pattern "merchantPickup|pickupRedeemInfo"
```

Expected: 两文件各命中 2 行。

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "i18n(order): 三版式新增词条（自提门店 / 自提·核销信息）双语言同步"
```

---

### Task 7: 构建 + 手机视口截图

**Files:** `scripts/_shot_order_layouts.py`（新）、`scripts/shots/*.png`（产物）

- [ ] **Step 1: typecheck + 构建**

Run:
```
cd d:\zhao\nshop
npm run typecheck
pnpm build
```
Expected: 本次涉及文件零新增 typecheck 错误；`.output` 生成无报错。

- [ ] **Step 2: 写截图探针（Playwright 移动视口 390×844 / dpr=2）**

`scripts/_shot_order_layouts.py`：以已登录会话打开 `account/orders` 与某自提单 `account/orders/<code>`，通过 query/临时注入把 `useOrderListConfig()/useOrderDetailConfig()` 的 layout 依次置为 `cn / jd / mall`，各截 `fullPage` 一张，输出：

```
scripts/shots/order-list-cn.png   order-list-jd.png   order-list-mall.png
scripts/shots/order-detail-cn.png order-detail-jd.png order-detail-mall.png
```

Playwright 需显式 `executablePath='C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'`（默认 1223 路径不存在）。

- [ ] **Step 3: 核对无 i18n 裸显**

截图（或 `page.content()`）中不得出现 `messages.` 字样；出现即词条缺失，回 Task 6 补齐。

- [ ] **Step 4: 提交截图**

```bash
cd d:\zhao\nshop
git add scripts/_shot_order_layouts.py scripts/shots/order-list-cn.png scripts/shots/order-list-jd.png scripts/shots/order-list-mall.png scripts/shots/order-detail-cn.png scripts/shots/order-detail-jd.png scripts/shots/order-detail-mall.png
git commit -m "test(order): 三版式订单列表/详情手机视口截图"
```

---

### Task 8: 操作手册章节

**Files:** `docs/superpowers/manual/orders-multi-layout/README.md`（新）

- [ ] **Step 1: 写手册**

内容：三版式一览（附 6 张截图）、如何切换（channel `customFields.orderListConfig` / `orderDetailConfig` 写 `{"version":1,"layout":"cn|jd|mall"}`）、默认值与非法值回退（`card` / `jd`）、`classic` / `confirmation` 不受影响、与 mockup 的偏差说明（页面 chrome 不重复实现；jd 按配送类型分组）。

- [ ] **Step 2: 提交**

```bash
cd d:\zhao\nshop
git add docs/superpowers/manual/orders-multi-layout/README.md
git commit -m "docs(order): 三版式订单列表/详情操作手册"
```

---

### Task 9: mockup 归档

**Files:** `docs/superpowers/mockups/orders-multi-layout/`（新）

- [ ] **Step 1: 归档 6 份源 + 6 张截图 + 索引 README**

从 `d:\zhao\_mockup_gallery\mockups\` 复制 6 份 HTML、`_mockup_gallery\shots2\` 复制 6 张 PNG 到 `docs/superpowers/mockups/orders-multi-layout/`，并写 `README.md` 索引（版式 → 源文件 → 截图 → 对应实现组件）。

- [ ] **Step 2: 回填分叉说明**

README 中注明：`brainstorm/671-1788361862/content/detail-finalize.html` 画的是**行级「− 2 ＋」数量步进**，但提交 `9f50263` 已把逐箱结算收敛为**整行粒度**——该稿已过时，**勿照错稿做**。

- [ ] **Step 3: 提交并推送**

```bash
cd d:\zhao\nshop
git add docs/superpowers/mockups/orders-multi-layout
git commit -m "docs(order): 归档三版式订单列表/详情 mockup 与索引"
git push origin nshop
```

---

## Self-Review

**1. Spec 覆盖**
- 三版式列表 → Task 4（`OrderList{Cn,Jd,Mall}` + renderer map）。✓
- 三版式详情 → Task 5（`OrderDetail{Cn,Mall,Jd}` + renderer map）。✓
- 接入 layout 配置体系 + 逐级兜底 → Task 1（白名单 + 默认 `card`/`jd`）。✓
- 默认沿用现状（card 列表零回归）→ Task 1 + Task 3（`OrderCardList` 外观不动）+ Task 4 Step 5（`else` 分支保留原结构）。✓
- `classic` / `confirmation` 不受影响 → Task 2（`variant` 缺省 `cn`）＋ Task 5（`classic` 未改、`confirmation` 映射不变）。✓
- 积木式 + 四级可回退 → Task 5（容器持样式、块标题仍走 `blocks[key].title` + `localizeOrderText` 兜底；`visible()` 口径不变）。✓
- 多语言同步 → Task 6。✓
- 手机截图 + 手册 → Task 7 / 8。✓
- mockup 归档 → Task 9。✓

**2. 占位符扫描**
无 TBD/TODO。mockup 为视觉真源文件（已存在、已定稿），Task 4/5 以「结构 + 关键类名」描述并指明真源文件，非计划缺口。

**3. 类型一致性**
- `OrderVisualVariant` 在 Task 1 定义，Task 2/4/5 消费，取值 `"cn" | "jd" | "mall"` 一致。
- `variant` 均为可选 + 缺省 `"cn"`，`classic` 调用方无需改动即保持既有观感。
- `useOrderList(activeTab)` 返回键（`loading/error/rawItems/orders/filtered/total/loadMore/changed`）与 `OrderCardList` 现有模板引用逐字对齐。
- `title(key, dft)` 在 Task 5 三容器内一致；`visible/block/isPickupOrder` 口径与 `OrderDetailJd` 现实现一致。
- 新增 i18n key `merchantPickup` / `pickupRedeemInfo` 在 Task 6 定义、Task 4/5 引用，一致。

**4. 风险与已定对策**
- jd 详情视觉对齐 mockup ⇒ 默认版式外观变化：已在 spec §0 决策基线显式声明；如需冻结现状，只需把 `orderDetailLayout()` 默认值改指向 `cn`（cn 容器即为既有观感），无需改容器代码。
- 列表 jd 按配送类型分组（非商家名）：已在 spec §0.1 声明偏差与理由。