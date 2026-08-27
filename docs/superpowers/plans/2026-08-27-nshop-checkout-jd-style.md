# nshop /checkout 京东风格改造 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将结账页 `/checkout` 改造为京东风格交互（积木式 + 可切换回退），实现配送方式上移、地址默认加载与新增更改、配送↔自提联动、自提最近预选、支付默认选中，仅改前端。

**Architecture:** 采用项目既有「积木式 UI + 可回退」体系：`CheckoutRenderer` 按 `checkoutConfig.layout` 动态组装功能块组件（`CheckoutLayoutJd` / legacy 回退）；前端状态 `deliveryMode` 作为全页联动单一事实源，通过 `provide/inject` 共享并驱动地址块/自提块显隐与门闩式提交流程。

**Tech Stack:** Nuxt 4 (SSR, layers/base) + Vue 3 + Pinia + Nuxt UI (reka-ui URadioGroup) + vue-i18n + Vendure GraphQL。

**前置（spec）：** `docs/superpowers/specs/2026-08-27-nshop-checkout-jd-style-design.md`（已提交 cd62e4e）。

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `layers/base/app/utils/checkout-config.ts` | 布局常量 `checkoutConfig`、配送/自提类型映射、坐标解析、Haversine 距离（纯函数，SSR 友好） |
| `layers/base/app/composables/useCheckoutFlow.ts` | `deliveryMode` 单一事实源 + `provide/inject` 共享各功能块提交函数 |
| `layers/base/app/components/checkout/CheckoutRenderer.vue` | 积木式渲染器：按 layout 加载 `CheckoutLayoutJd`，否则回退 slot（legacy） |
| `layers/base/app/components/checkout/CheckoutLayoutJd.vue` | 京东新版布局：配送方式 → 地址块/自提块 → 支付块 顺序组装 |
| `layers/base/app/components/checkout/DeliveryModeBlock.vue` | 配送方式块：物流方式单选 + 自提类型按钮组，联动 `deliveryMode` |
| `layers/base/app/components/checkout/AddressBlock.vue` | 配送至块：京东摘要卡 + 默认地址加载 + 新增/切换 |
| `layers/base/app/components/checkout/PickupBlock.vue` | 自提块：按类型加载自提点 + Haversine 最近预选 |
| `layers/base/app/components/checkout/PaymentBlock.vue` | 支付块：默认选中第一项可用支付方式 |
| `layers/base/app/pages/checkout/index.vue` | 集成渲染器、门闩式提交（jd/legacy 分支）、保留 legacy 版式 |
| `layers/base/i18n/locales/zh-CN.ts` / `en-US.ts` | 新增 `messages.checkout.*` 词条（中英同步） |

**复用（不改）：** `useOrderStore`、`useAddressBook`、`useLocationStore`、`useAuthStore`、`useCheckout`、`CheckoutOrderSummary`、`AddressPicker`、`CheckoutAddressForm`、`CheckoutShippingForm`、`PickupLocationSelect`、`CheckoutPaymentForm`（后者四个归 legacy 引用）。

---

### Task 1: 配置工具 `checkout-config.ts`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\checkout-config.ts`

- [ ] **Step 1: 创建工具（布局常量 + 类型映射 + Haversine）**

```ts
export type CheckoutLayout = "jd" | "legacy";
export interface CheckoutPageConfig { layout: CheckoutLayout; }
/** 前端常量；默认 jd（京东新版），legacy 备选回退 */
export const checkoutConfig: CheckoutPageConfig = { layout: "jd" };
/** 纯函数：解析布局，非法值回退默认 jd，保证 SSR/客户端一致 */
export function checkLayout(raw: string | null | undefined): CheckoutLayout {
  return raw === "legacy" ? "legacy" : "jd";
}
export type CheckoutDeliveryMode = "shipping" | "store" | "employee" | "point";
export const DELIVERY_MODE_TO_PICKUP_TYPE: Record<
  Exclude<CheckoutDeliveryMode, "shipping">, "store" | "employee" | "point"
> = { store: "store", employee: "employee", point: "point" };
export function isShippingMode(m: CheckoutDeliveryMode): boolean { return m === "shipping"; }
export function isPickupMode(m: CheckoutDeliveryMode): boolean { return m !== "shipping"; }
/** 解析后端自提点坐标（simple-json），坏数据返回 null */
export function parseCoordinates(coordinates: unknown): { lat: number; lng: number } | null { /* 支持 "lat,lng" 字符串或 {lat,lng} 对象 */ }
/** Haversine 距离（公里） */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number { /* R=6371 标准公式 */ }
```

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/utils/checkout-config.ts
git commit -m "feat(checkout): 新增 checkout 配置工具（布局常量+自提类型映射+Haversine）"
```

---

### Task 2: 全页联动 composable `useCheckoutFlow`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\composables\useCheckoutFlow.ts`

- [ ] **Step 1: 创建 composable（deliveryMode 单一事实源 + provide/inject）**

```ts
import { provide, inject, useState, type Ref } from "vue";
import type { CheckoutDeliveryMode } from "~~/layers/base/app/utils/checkout-config";

const MODE_KEY = "checkout-delivery-mode";
const FLOW_KEY = "checkout-flow";

export interface CheckoutSubmitFns {
  submitAddress?: (() => Promise<boolean>) | null;
  submitDelivery?: (() => Promise<boolean>) | null;
  submitPayment?: (() => Promise<boolean>) | null;
}
export interface CheckoutFlowContext {
  mode: Ref<CheckoutDeliveryMode>;
  setMode: (m: CheckoutDeliveryMode) => void;
  submitFns: CheckoutSubmitFns;
}
/** 页面级：创建/提供全页上下文（deliveryMode + 提交函数注册表） */
export function provideCheckoutFlow(): CheckoutFlowContext {
  const mode = useState<CheckoutDeliveryMode>(MODE_KEY, () => "shipping");
  const submitFns: CheckoutSubmitFns = { submitAddress: null, submitDelivery: null, submitPayment: null };
  const ctx: CheckoutFlowContext = { mode, setMode: (m) => { mode.value = m; }, submitFns };
  provide(FLOW_KEY, ctx);
  return ctx;
}
/** 功能块：注入共享上下文（须在 provideCheckoutFlow 之后使用） */
export function useCheckoutFlow(): CheckoutFlowContext {
  const ctx = inject<CheckoutFlowContext>(FLOW_KEY);
  if (!ctx) throw new Error("useCheckoutFlow must be used within provideCheckoutFlow");
  return ctx;
}
```

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/composables/useCheckoutFlow.ts
git commit -m "feat(checkout): useCheckoutFlow 提供 deliveryMode 单一事实源与提交函数注册表"
```

---

### Task 3: 渲染器与京东新版布局

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\checkout\CheckoutRenderer.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\checkout\CheckoutLayoutJd.vue`

- [ ] **Step 1: 创建 `CheckoutRenderer.vue`（积木式渲染器）**

```vue
<script setup lang="ts">
import CheckoutLayoutJd from "./CheckoutLayoutJd.vue";
import { checkoutConfig } from "~~/layers/base/app/utils/checkout-config";
const layout = checkoutConfig.layout;
</script>
<template>
  <CheckoutLayoutJd v-if="layout === 'jd'" />
  <slot v-else />
</template>
```

> 说明：`layout` 为 SSR/客户端一致的纯前端常量；未来渠道级下发只需改 `checkoutConfig` 来源，组件不动。

- [ ] **Step 2: 创建 `CheckoutLayoutJd.vue`（顺序：配送方式 → 地址块/自提块 → 支付块）**

```vue
<script setup lang="ts">
import { isShippingMode } from "~~/layers/base/app/utils/checkout-config";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";
const flow = useCheckoutFlow();
const isShipping = computed(() => isShippingMode(flow.mode.value));
</script>
<template>
  <div class="space-y-6">
    <CheckoutDeliveryModeBlock />
    <CheckoutAddressBlock v-if="isShipping" />
    <CheckoutPickupBlock v-else />
    <CheckoutPaymentBlock />
  </div>
</template>
```

> 注意：Nuxt 自动注册组件按目录前缀命名，模板必须用完整注册名（如 `CheckoutDeliveryModeBlock`），避免 SSR 渲染为空注释导致 hydration mismatch。

- [ ] **Step 3: 提交**

```bash
git add layers/base/app/components/checkout/CheckoutRenderer.vue layers/base/app/components/checkout/CheckoutLayoutJd.vue
git commit -m "feat(checkout): 新增积木式渲染器与京东新版布局"
```

---

### Task 4: 配送方式块 `DeliveryModeBlock`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\checkout\DeliveryModeBlock.vue`

- [ ] **Step 1: 创建组件（物流单选 + 自提类型联动 + radio 事件修复）**

核心要点（含关键修复，见自检）：
- 加载物流方式 `await orderStore.getShippingMethods()`，默认预选第一项（`onMounted` 应用）。
- 物流方式用 `URadioGroup`（受控 `:model-value="selectedShippingModel"`）。
- **关键**：模式切换必须用**事件监听** `@update:model-value="onChooseShipping"`，绝不能写成 `:update:model-value="..."`（prop 绑定不会触发回调，导致自提切回配送时 radio 反选且点击无效——已修复）。
- 自提类型按钮组（门店/职工单位/自提点）`@click` 调 `flow.setMode(key)` 联动全页。
- 注册 `flow.submitFns.submitDelivery`：选中物流方式时调 `setShippingMethod`，无可用方式提示 `noShippingMethod`。

```ts
const flow = useCheckoutFlow();
const { mode } = flow;
await orderStore.getShippingMethods();
const { shippingMethods } = storeToRefs(orderStore);
const shippingMethodList = computed(() => shippingMethods.value ?? []);
const appliedId = ref<string | null>(null);
const selectedShippingModel = computed(() =>
  isShippingMode(mode.value) ? appliedId.value || shippingMethodList.value[0]?.id || "" : "",
);
async function applyShipping(id: string) { appliedId.value = id; /* await orderStore.setShippingMethod(id) */ }
onMounted(() => { const first = shippingMethodList.value[0]; if (first) void applyShipping(first.id); });
function onChooseShipping(id: string) { flow.setMode("shipping"); void applyShipping(id); }
function onChoosePickup(key: Exclude<CheckoutDeliveryMode, "shipping">) { flow.setMode(key); }
flow.submitFns.submitDelivery = async () => { /* 校验 appliedId 后 setShippingMethod */ };
```

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/components/checkout/DeliveryModeBlock.vue
git commit -m "feat(checkout): 配送方式块（物流单选+自提类型联动，修复 radio 事件绑定）"
```

---

### Task 5: 地址块 `AddressBlock`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\checkout\AddressBlock.vue`

- [ ] **Step 1: 创建组件（配送至摘要 + 默认加载 + 新增/切换）**

核心要点：
- 登录态 `onMounted` → `fetchAddresses()` 取第一条应用（后端按 `isDefault` 排序保证默认优先）；未登录走 `showCreate` 引导新增。
- 京东式摘要卡：`收货人 电话` + `城市 街道`，`addressSummary.has` 控制显隐。
- 「切换地址」→ 展开 `AddressPicker`（地址簿）+ `CheckoutAddressForm`（可编辑表单）+ 保存按钮。
- 注册 `flow.submitFns.submitAddress`：地址摘要缺失提示 `invalidAddress`；未登录补 `emailAddress` 后 `setCustomerForOrder`；再 `setOrderShippingAddress`。

```ts
const flow = useCheckoutFlow();
const { isAuthenticated } = storeToRefs(useAuthStore());
const { addresses, fetchAddresses } = useAddressBook();
const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.addressForm;
const appliedAddressId = ref<string | null>(null);
const editing = ref(false);
function applyAddress(record: AddressRecord) {
  appliedAddressId.value = record.id;
  // fullName 拆分 firstName/lastName，回填 state.*
  editing.value = false;
}
const addressSummary = computed(() => ({ fullName, phone, crude: [state.city], street, has: !!(street && fullName) }));
onMounted(() => {
  if (isAuthenticated.value) {
    void fetchAddresses().then((list) => { if (!appliedAddressId.value && list.length) { const first = list[0]; if (first) applyAddress(first); } });
  }
});
flow.submitFns.submitAddress = async () => { /* 校验→未登录补 email→setCustomerForOrder→setOrderShippingAddress */ };
```

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/components/checkout/AddressBlock.vue
git commit -m "feat(checkout): 地址块（配送至摘要+默认加载+新增/切换）"
```

---

### Task 6: 自提块 `PickupBlock`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\checkout\PickupBlock.vue`

- [ ] **Step 1: 创建组件（按类型加载 + 最近预选）**

核心要点：
- `currentType` 由 `deliveryMode` 映射 `DELIVERY_MODE_TO_PICKUP_TYPE`；`watch(currentType)` 重新加载对应类型自提点。
- `GqlGetPickupLocations({ type, lat, lng })` 拉取列表。
- **最近预选**：有定位（`locationStore.coords`）→ 按 `haversineKm` 距离升序取最近预选（`preselectedByNearest=true` 显示 `nearestHint`）；无定位 → 取 `list[0]` 预选 + 提示 `locateHint`。
- 定位变化 `watch(locationStore.coords)` 重新加载。
- 选中 `select(id)` → `orderStore.setPickupLocation(id, type)`；失败回退原选中。
- 空列表提示 `noPickup`（**无占位符纯文本**，避免 vue-i18n 嵌套占位符编译错误——已修复）。

```ts
const currentType = computed<"store" | "employee" | "point" | null>(() => {
  if (mode.value === "shipping") return null;
  return DELIVERY_MODE_TO_PICKUP_TYPE[mode.value] ?? null;
});
function distanceKm(loc: PickupLocation): number {
  const c = parseCoordinates(loc.coordinates);
  if (!locationStore.coords || !c) return Infinity;
  return haversineKm(locationStore.coords, c);
}
async function preselect() {
  const list = locations.value;
  if (!list.length) { selectedId.value = null; return; }
  const hasCoords = !!locationStore.coords;
  const pick = hasCoords ? [...list].sort((a, b) => distanceKm(a) - distanceKm(b))[0] : list[0];
  preselectedByNearest.value = hasCoords;
  if (pick) await select(pick.id, true);
}
onMounted(load);
watch(currentType, (n, o) => { if (n !== o) { selectedId.value = null; locations.value = []; load(); } });
watch(() => locationStore.coords, load);
```

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/components/checkout/PickupBlock.vue
git commit -m "feat(checkout): 自提块（门店/职工/自提点按类型加载+Haversine 最近预选）"
```

---

### Task 7: 支付块 `PaymentBlock`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\checkout\PaymentBlock.vue`

- [ ] **Step 1: 创建组件（默认选中第一项可用支付方式）**

核心要点：
- `await orderStore.getPaymentMethods()`；`onMounted` 时若未选且列表非空，取第一项写入 `state.code`（空值判断防 TS 报错）。
- 注册 `flow.submitFns.submitPayment`：校验 `state.code` 后调 `setPaymentMethod`（沿用现有 `useCheckout`/orderStore 提交流程）。

```ts
const flow = useCheckoutFlow();
await orderStore.getPaymentMethods();
const { paymentMethods } = storeToRefs(orderStore);
const paymentMethodList = computed(() => paymentMethods.value ?? []);
const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.paymentForm;
onMounted(() => {
  if (!state.code && paymentMethodList.value.length) {
    const first = paymentMethodList.value[0];
    if (first) state.code = first.code;
  }
});
flow.submitFns.submitPayment = async () => { /* 校验 code → setPaymentMethod */ };
```

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/components/checkout/PaymentBlock.vue
git commit -m "feat(checkout): 支付块（默认选中第一项可用支付方式）"
```

---

### Task 8: 集成页面 `checkout/index.vue`

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\checkout\index.vue`

- [ ] **Step 1: 集成渲染器 + 门闩式提交（jd/legacy 分支）**

- 顶部 `const layout = checkoutConfig.layout;`、`const flow = provideCheckoutFlow();`。
- 新增 `submitJd()`：配送模式按 `地址 → 物流 → 支付` 顺序门闩推进（任一失败即返回）；自提模式校验 `customFields.selectedPickupLocationId` 已选后推进支付。`submitLegacy()` 保留原有分步流程。
- `onSubmit()`：`layout === "jd"` 走 `submitJd()`，否则 `submitLegacy()`。
- 模板：`<CheckoutRenderer v-if="layout === 'jd'" />`；`<template v-else>` 保留旧版式（AddressPicker/AddressForm/ShippingForm/PickupLocationSelect/PaymentForm），并给 `CheckoutOrderSummary :on-submit="onSubmit"`。

```ts
async function submitJd() {
  if (isShippingMode(flow.mode.value)) {
    const okAddress = (await flow.submitFns.submitAddress?.()) ?? false;
    if (!okAddress) return;
    const okDelivery = (await flow.submitFns.submitDelivery?.()) ?? false;
    if (!okDelivery) return;
  } else {
    const cf = order.value?.customFields as { selectedPickupLocationId?: { id: string } | null } | undefined;
    if (!cf?.selectedPickupLocationId) { orderStore.error = t("messages.checkout.needPickup"); /* toast */ return; }
  }
  const okPayment = (await flow.submitFns.submitPayment?.()) ?? false;
  if (!okPayment) return;
  successRedirect();
}
async function onSubmit() {
  if (layout === "jd") { await submitJd(); return; }
  await submitLegacy();
}
```

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/pages/checkout/index.vue
git commit -m "feat(checkout): 页面集成渲染器+门闩式提交，保留 legacy 版式回退"
```

---

### Task 9: i18n 中英词条（含嵌套占位符编译错误修复）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts`

- [ ] **Step 1: zh-CN `messages.checkout` 新增**

```ts
deliveryMethod: "配送方式",
pickupMethod: "自提方式",
logisticsDelivery: "物流配送",
storePickup: "门店自提",
employeePickup: "职工单位自提",
pointPickup: "自提点自提",
deliveryTo: "配送至",
addAddress: "新增地址",
switchAddress: "切换地址",
saveAddress: "保存收货地址",
needAddress: "请先填写收货地址",
invalidAddress: "收货地址不完整",
choosePickup: "选择自提点",
nearestHint: "已按就近预选，可手动更改",
locateHint: "开启定位可按距离就近排序并自动预选最近自提点",
// 注意：占位符必须为 {{xxx}} 单层、与 t() 传参匹配；纯文本词条不要传多余参数
noPickup: "当前定位附近暂无可自提点，可切换其他方式",
needPickup: "请先选择自提点",
noShippingMethod: "暂无可配送方式",
noShippingMethodDesc: "当前收货地址暂无可配送方式，可尝试门店自提/自提点，或修改收货地址。",
```

> **关键修复（已发生）：** `noPickup` 原词条含 `{{type}}` 占位符，而 `t()` 调用参数与占位符不匹配会触发 vue-i18n 编译错误 `Not allowed nest placeholder`（JS 运行时被当作嵌套占位符），导致自提块静默渲染失败。修复方式：词条改为**无占位符纯文本**，并移除模板中多余的 `{ type }` 传参。

- [ ] **Step 2: en-US `messages.checkout` 同步新增（对应英文翻译，保持词条结构一致）**

- [ ] **Step 3: 提交**

```bash
git add layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "feat(i18n): checkout 京东版式中英词条 + 修复 noPickup 嵌套占位符编译错误"
```

---

### Task 10: 本地验证 + 部署

**Files:**
- 无新文件

- [ ] **Step 1: typecheck + 构建**

Run: `pnpm typecheck`
Expected: 无 checkout 相关类型错误（报告中的 index.vue/JdPcHeader/detail-config 等为 pre-existing，与本任务无关）。

Run: `pnpm build`
Expected: 构建成功。

- [ ] **Step 2: 本地 `pnpm dev` 浏览器回归（agent-browser，devProxy 连线上后端）**

Expected:
- 初始配送态：物流方式默认预选第一项 + 「配送至」地址块显示。
- 点「自提点自提」→ 配送至隐藏、自提块出现、无 JS 错误。
- 点「门店自提」→ 自提块标题切换、加载门店列表、无定位时预选第一项。
- 再点物流 radio → **配送至恢复显示**、物流方式重新选中（radio 修复回归）。
- 支付方式默认选中第一项。

- [ ] **Step 3: 线上部署（nshop 允许本地构建 → deploy.mjs SCP 上传 → pm2 restart）**

Run: `node scripts/deploy.mjs`
Expected: `.output/` 上传至 `qing`、`pm2 restart nshop` 成功、`curl localhost:3000` 返回 200。

- [ ] **Step 4: 线上验证 `https://www.youshop.cn/checkout`**

Expected: 京东新版版式渲染（配送方式/配送至/支付）；加购后进入 checkout；配送↔自提联动与 radio 修复在线上生效。

---

## 自检

- **Spec 覆盖**：配送方式上移 → Task 4（`CheckoutLayoutJd` 顺序）√；默认加载默认地址+新增/更改 → Task 5 √；配送↔自提联动 → Task 2/4/8 √；自提最近预选（有/无定位）→ Task 6 √；支付默认选中 → Task 7 √；legacy 回退 → Task 8 v-else 分支 √；多语言 → Task 9 √；门闩式提交 → Task 8 `submitJd` √。
- **无占位**：所有步骤含具体代码/命令；`noPickup` 已为纯文本词条。
- **类型一致**：`CheckoutDeliveryMode` 统一来自 `checkout-config.ts`；`flow.submitFns` 三函数签名一致；`DELIVERY_MODE_TO_PICKUP_TYPE` 映射一致。
- **已发生的修复记录**：① `DeliveryModeBlock` 的 `:update:model-value` prop 绑定 → `@update:model-value` 事件监听（radio 反选点击无效）；② `noPickup` 嵌套占位符 → 纯文本 + 移除多余传参；③ `DetailFloor` 购买栏 `sticky` → `fixed bottom-0`（滚动消失）；④ `useCityService` `ServiceableProduct.customFields` 加索引签名（弱类型 TS 修复）。
