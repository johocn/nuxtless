# nshop 购买流程完善（配送即时生效 / 空态引导 / 自提免配 / 加购优化）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 nshop 加购与选配送方式两处的卡点：配送方式切换即时生效、空态友好提示、门店自提单免配、加购数量动态上限与部分库存提示。

**Architecture:**
- 改动全部落在 `d:\zhao\nshop\layers\base`（Nuxt 分层 + valibot 校验 + Nuxt UI）。配送方式即时生效复用的是既有 `useOrderStore.setShippingMethod` + `useOrderMutation`（`__typename==="Order"` 时整体替换 `order`，`OrderSummary` 为 `order` 的 computed → 合计自动刷新）。
- 自提免配新增共享 `useIsPickup`（读 `order.customFields.deliveryType==="pickup"`），在 `ShippingForm` 内放行提交并隐藏配送方式块；不加改 valibot schema。
- 加购优化基于 `useOrderMutation` 已返回的 `{status:"partial", quantityAvailable}`（当前被 `addItemToOrder` 丢弃，本次透出）。

**Tech Stack:** Nuxt 3 分层（`layers/base`），Vue3 + TS，valibot，Nuxt UI（`UForm`/`UFormField`/`URadioGroup`/`UInputNumber`/`UAlert`），Pinia，GQL CodeGen（`Gql*`）。

> **验证方式适配说明：** 本项目为 Nuxt 3 页面组件，无 JUnit/组件单测设施；每任务内联验证 = `npx nuxi typecheck`（类型）+ 必要的 dev 运行确认，最终在「线上验收」任务用 `pnpm dev` + agent-browser 走 4 条购买流。改动均在一处以避免跨层冲突。

---

## 文件结构

**新增**
- `layers/base/app/composables/useIsPickup.ts` — 自提判定共享 composable（Task D）

**修改**
- `layers/base/app/composables/useCheckout.ts:48-53` — 移除配送方式 watch（Task B）
- `layers/base/stores/useOrderStore.ts:38-62` — `addItemToOrder` 返回 `OrderStatus`（Task C）
- `layers/base/app/components/cart/CartAddButton.vue` — 动态上限 + partial 提示（Task C/D）
- `layers/base/app/components/checkout/ShippingForm.vue` — 即时生效 + 空态 + 自提免配（Task B/D/E）

---

### Task A: 确认 schema 依据（探针式核查，不改代码）

**Files:**
- 核查：`layers/base/gql/queries/product.gql:89-90`、`layers/base/app/composables/useOrderMutation.ts`、`layers/base/types/order.ts`

- [ ] **Step 1: 核查三个既有事实**
  - `product.gql` 是否已含 `stockOnHand`/`stockAllocated`（用于 Task C 的 `selectedVariant.stockOnHand`）。已确认：查询 product 详情片段含两者。
  - `useOrderMutation` 是否已把 `setOrderShippingMethod` 的 `IneligibleShippingMethodError` 归为 error 分支。已确认：`case "IneligibleShippingMethodError"` 存在。
  - `Order.customFields.deliveryType` 可读。已确认：`useCheckout.syncOrderLocation` 与 `PickupLocationSelect.isPickup` 均已读该字段。
- 若上三项均成立，本任务即为「已确认，无需额外探针」，直接进入 Task B。可顺手跑一次类型检查确认基线：

Run: `npx nuxi typecheck`
Expected: 无新增错误（基线通过）。

- [ ] **Step 2: Commit 基线（可选，无改动时跳过）**

---

### Task B: useCheckout 移除「配送方式」watch

**Files:**
- Modify: `layers/base/app/composables/useCheckout.ts:48-53`

- [ ] **Step 1: 删除配送方式 watch（保留 postalCode watch）**

将：
```ts
  watch(
    () => checkoutState.value.shippingForm.shippingMethodId,
    async (n, o) => {
      if (n !== o) await recalcShipping();
    },
  );

  return { syncOrderLocation };
```
改为：
```ts
  return { syncOrderLocation };
```

- [ ] **Step 2: 类型检查**

Run: `npx nuxi typecheck`
Expected: 通过（无引用显示未使用错误；`checkoutState` 仍被 postalCode watch 与其内函数使用）。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/composables/useCheckout.ts
git commit -m "refactor(nshop): 移除配送方式变更时误触发的 setOrderShippingAddress"
```

---

### Task C: useOrderStore.addItemToOrder 透出 OrderStatus（partial 前置）

**Files:**
- Modify: `layers/base/stores/useOrderStore.ts:38-62`
- Reference: `layers/base/app/composables/useOrderMutation.ts`（返回 `OrderStatus`）

- [ ] **Step 1: 让 addItemToOrder 返回 useOrderMutation 的结果**

将 `addItemToOrder` 的函数体改为（其余分支不变，仅返回类型与 return 逻辑）：
```ts
  async function addItemToOrder(
    variantId: string,
    quantity: number,
  ): Promise<OrderStatus> {
    loading.value = true;
    error.value = null;

    try {
      const { addItemToOrder: result } = await GqlAddItemToOrder({
        variantId,
        quantity,
      });

      if (!result) return { status: "error", message: "No result" };
      const res = useOrderMutation(order, result);
      if (res.status === "error") error.value = res.message;
      return res;
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to add item to order";
        return { status: "error", message: error.value };
      }
      return { status: "error", message: "Failed to add item to order" };
    } finally {
      loading.value = false;
    }
  }
```
并在文件顶部确认已引 `OrderStatus`：
```ts
import type {
  ActiveOrder,
  OrderStatus,
  ShippingMethods,
  PaymentMethods,
} from "~~/types/order";
```
> 说明：`useOrderMutation` 已含 `quantityAvailable`（partial 分支），这里只需透出返回，无需重复解析。

- [ ] **Step 2: 类型检查**

Run: `npx nuxi typecheck`
Expected: 通过。若报 `OrderStatus` 未找到，检查 `types/order.ts` 导出名（应为 `OrderStatus`，见 `useOrderMutation.ts` 顶部 import）。

- [ ] **Step 3: Commit**

```bash
git add layers/base/stores/useOrderStore.ts
git commit -m "feat(nshop): addItemToOrder 透出 OrderStatus（含 partial quantityAvailable）"
```

---

### Task D: 新增 useIsPickup 共享判定

**Files:**
- Create: `layers/base/app/composables/useIsPickup.ts`

- [ ] **Step 1: 创建 composable**

```ts
import type { ComputedRef } from "vue";

/** 订单是否处于门店自提模式（customer.deliveryType === "pickup"） */
export function useIsPickup(): ComputedRef<boolean> {
  const orderStore = useOrderStore();
  return computed(() => (orderStore.order?.customFields?.deliveryType ?? "") === "pickup");
}
```

- [ ] **Step 2: 类型检查**

Run: `npx nuxi typecheck`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/composables/useIsPickup.ts
git commit -m "feat(nshop): 新增 useIsPickup 共享自提判定"
```

---

### Task E: ShippingForm — 即时生效 + 空态引导 + 自提免配

**Files:**
- Modify: `layers/base/app/components/checkout/ShippingForm.vue`
- Reference: `layers/base/validators/shippingForm.ts`（不改）

- [ ] **Step 1: 重写 script 部分**

将 `ShippingForm.vue` 的 `<script setup>` 整体替换为：
```ts
<script setup lang="ts">
import type { ShippingForm } from "~~/layers/base/validators/shippingForm";

import type { CheckoutState } from "~~/types/general";

const isSubmitted = defineModel<boolean>({ default: false });

const { t } = useI18n();
const toast = useToast();
const shippingForm = useTemplateRef("shippingForm");
const isPickup = useIsPickup();
const submitShipping = () => shippingForm.value?.submit();
defineExpose({ submitShipping });

const orderStore = useOrderStore();
await orderStore.getShippingMethods();
const { shippingMethods: shippingMethodsData } = storeToRefs(useOrderStore());

const shippingMethods = computed(
  () =>
    shippingMethodsData.value?.map((m) => ({
      label: m.name,
      value: m.id,
    })) ?? [],
);

const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.shippingForm as ShippingForm;
const lastAppliedId = ref(shippingMethods.value[0]?.value ?? "");
state.shippingMethodId = lastAppliedId.value;
await orderStore.setShippingMethod(lastAppliedId.value);

// 切换配送方式 → 立即 setShippingMethod；失败回退 UI 并提示
async function onMethodChange(id: string) {
  if (!id || id === lastAppliedId.value) return;
  orderStore.error = null;
  await orderStore.setShippingMethod(id);
  if (orderStore.error) {
    state.shippingMethodId = lastAppliedId.value;
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
    return;
  }
  lastAppliedId.value = id;
}

async function onSubmit() {
  if (isPickup.value) {
    isSubmitted.value = true;
    return;
  }
  if (!state.shippingMethodId) {
    orderStore.error = "请选择配送方式，或切换为门店自提";
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
    return;
  }
  orderStore.error = null;
  await orderStore.setShippingMethod(state.shippingMethodId);
  if (orderStore.error) return;
  isSubmitted.value = true;
}

async function onError() {
  isSubmitted.value = false;
}
</script>
```

> 说明：自提放行走 Task F（结算主流程直接置 `isSubmitted.shipping=true`，不调用 `submitShipping`）；组件内 `onSubmit`/`onMethodChange` 自提时同样放行，双保险。

- [ ] **Step 2: 重写 template 部分（隐藏自提时的配送方式块 + 空态提示 + 绑定 change）**

将 `<template>` 整体替换为：
```html
<template>
  <UForm
    ref="shippingForm"
    :schema="ShippingForm"
    :state="state"
    class="mt-4 space-y-4"
    @submit="onSubmit"
    @error="onError"
  >
    <div v-if="isPickup" class="text-sm text-primary">
      你已选择门店自提，本单无需配送方式。
    </div>

    <template v-else-if="shippingMethods.length === 0">
      <UAlert
        icon="i-lucide-truck"
        color="warning"
        variant="soft"
        title="暂无可配送方式"
        description="当前收货地址暂无可配送方式，可尝试上方「门店自提 / 自提点」，或填写其他收货地址。"
      />
    </template>

    <UFormField
      v-else
      :label="t('messages.general.shippingSelect')"
      class="text-md"
      name="shippingMethodId"
    >
      <URadioGroup
        v-model="state.shippingMethodId"
        indicator="hidden"
        variant="table"
        orientation="vertical"
        size="xl"
        :items="shippingMethods"
        :ui="{ item: 'w-full' }"
        :disabled="orderStore.loading"
        :update:model-value="onMethodChange"
        class="block lg:hidden"
      />
      <URadioGroup
        v-model="state.shippingMethodId"
        indicator="hidden"
        variant="table"
        orientation="horizontal"
        :items="shippingMethods"
        :ui="{ item: 'w-full' }"
        :disabled="orderStore.loading"
        :update:model-value="onMethodChange"
        class="hidden lg:block"
      />
    </UFormField>
  </UForm>
</template>
```
> Nuxt UI 的 `URadioGroup` 同时可展开 `:update:model-value` 处理器（`v-model` 等效于 `:model-value` + `@update:model-value`），此处显式传 `:update:model-value="onMethodChange"` 触发即时设置。

- [ ] **Step 3: 类型检查**

Run: `npx nuxi typecheck`
Expected: 通过。若 `import type { ShippingForm } from "~~/layers/base/validators/shippingForm";` 与 schema 重名冲突，按现有写法保留别名即可（现状即如此，未报错）。

- [ ] **Step 4: dev 起服务确认 无报错渲染**

Run（新终端，后台）: `pnpm dev`
Expected: 编译无 error；`/checkout` 页面能拉起，配送方式单选仍显示。

- [ ] **Step 5: Commit**

```bash
git add layers/base/app/components/checkout/ShippingForm.vue
git commit -m "feat(nshop): 配送方式切换即时生效 + 空态引导 + 自提免配"
```

---

### Task F: checkout 主流程接入自提放行

**Files:**
- Modify: `layers/base/app/pages/checkout/index.vue:86-90`

- [ ] **Step 1: onSubmit 中自提时跳过配送方式提交**

将：
```ts
async function onSubmit() {
  await addressForm.value?.submitAddress();
  await shippingForm.value?.submitShipping();
  if (!(isSubmitted.address && isSubmitted.shipping)) return;
```
改为：
```ts
async function onSubmit() {
  await addressForm.value?.submitAddress();
  const isPickup = (order.value?.customFields?.deliveryType ?? "") === "pickup";
  if (isPickup) {
    isSubmitted.shipping = true;
  } else {
    await shippingForm.value?.submitShipping();
  }
  if (!(isSubmitted.address && isSubmitted.shipping)) return;
```
> 与 Task E：配送方式组件里 `submitShipping` 本身也判断了 isPickup，双保险；此处确保主流程顺序正确。

- [ ] **Step 2: 类型检查 + dev 复跑**

Run: `npx nuxi typecheck`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/pages/checkout/index.vue
git commit -m "feat(nshop): 结算主流程自提时跳过配送方式提交"
```

---

### Task G: CartAddButton — 动态上限 + partial 提示

**Files:**
- Modify: `layers/base/app/components/cart/CartAddButton.vue`

- [ ] **Step 1: 动态上限 + partial 提示**

将 `<script setup>` 中相关段替换：
```ts
const { t } = useI18n();
const toast = useToast();
const { loading, error } = storeToRefs(useOrderStore());
const { addItemToOrder } = useOrderStore();
const { selectedVariant, stockLevel } = storeToRefs(useProductStore());
const variantId = computed(() => selectedVariant.value?.id);
const quantity = ref(1);

// 数量上限跟随可用库存；无该字段时放宽到 99，由后端 InsufficientStockError 兜底
const maxStock = computed(() => selectedVariant.value?.stockOnHand ?? 99);

const hasStock = computed(
  () => stockLevel.value === "IN_STOCK" || stockLevel.value === "LOW_STOCK",
);

const mobileClasses =
  "fixed start-0 bottom-0 z-10 bg-gray-50/80 p-4 backdrop-blur dark:bg-gray-800/80";

watch(error, (val) => {
  if (val) {
    toast.add({
      title: "Failed to Add Product",
      description: "Failed adding product to cart. Please try again later.",
      color: "error",
    });
  }
});

async function addToCart() {
  if (!variantId.value || disabled || !hasStock.value) return;

  const res = await addItemToOrder(variantId.value, quantity.value);
  if (res?.status === "partial") {
    toast.add({
      title: t("messages.shop.addToCart"),
      description: `库存不足，已加入 ${res.quantityAvailable ?? 0} 件`,
      color: "warning",
    });
  }
}
```

- [ ] **Step 2: 模板绑定动态上限**

将：
```html
    <UInputNumber v-model="quantity" size="xl" :min="1" :max="10" />
```
改为：
```html
    <UInputNumber v-model="quantity" size="xl" :min="1" :max="maxStock" />
```

- [ ] **Step 3: 类型检查**

Run: `npx nuxi typecheck`
Expected: 通过。若 `selectedVariant` 类型上无 `stockOnHand`，确认 `types/order.ts` 中 ProductVariant 含 `stockOnHand?: number`（`product.gql` 已查询该字段，类型应为可选数字；缺失则补类型，并在本任务提交）。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/components/cart/CartAddButton.vue
git commit -m "feat(nshop): 加购数量上限动态化 + 部分库存 toast 提示"
```

---

### Task H: 线上验收（agent-browser，4 条购买流）

**Files:**
- 仅验收，不改业务代码；必要时新增 temp 探针/截图（验收后删除）。

- [ ] **Step 1: 起 dev 并 lock 登录态**

启动 `pnpm dev`，用 agent-browser：
```bash
agent-browser --session-name nshop-review open http://localhost:3000/product/<slug>
agent-browser --session-name nshop-review wait --load networkidle
```
确认商品页可加购。若需登录下单，先用商店账号走登录（会话保存在 `--session-name`）。

- [ ] **Step 2: 流① 配送方式即时生效**
  打开任一商品 → `addToCart` → 进入 `/checkout` → 填地址 → 在「配送方式」单选**切换**选项。
  预期：Network 中出现 `setOrderShippingMethod` 调用（而非多余的 `setOrderShippingAddress`）；右侧 `OrderSummary` 的「Shipping」与「Total」**实时刷新**。
  验证：`agent-browser snapshot -i` 截取切换前后汇总金额文本变化；截图存档 `_review_shipping_live.png`。

- [ ] **Step 3: 流② 空态引导**
  切换到无可用配送方式的地址/渠道（或临时用探针令 `eligibleShippingMethods` 为空）。
  预期：结算页配送区显示「暂无可配送方式」警示条，不静默卡住。
  验证：`agent-browser screenshot _review_shipping_empty.png`。

- [ ] **Step 4: 流③ 自提免配**
  在结算页选择「门店自提 / 自提点」任一选项 → 配送方式块隐藏、显示「已选择门店自提」→ 直接进入支付并下单成功。
  预期：不因 `shippingMethodId` 为空被校验拦截；无配送方式必填报错。
  验证：走通到 `/checkout/confirmation/<code>`，截图 `_review_pickup_flow.png`。

- [ ] **Step 5: 流④ 加购上限与 partial**
  商品 A：`stockOnHand` 有限时，`UInputNumber` 上限=库存数。
  商品 B（或直接调高 `quantity` 超库存）：加入超出库存 → 出现「库存不足，已加入 N 件」toast。
  验证：截图 `_review_cart_partial.png`，购物车图标数量与 toast 文案。

- [ ] **Step 6: 清理临时产物**
  删除 `_review_*.png`、临时探针，`git status` 确认工作区干净（临时文件不入 git，避免污染提交）。

- [ ] **Step 7: 收尾提交（如有验收期发现的小修复，单独小 commit；无则跳过）**

---

## 自检

- **Spec 覆盖**：
  - ②a 配送方式切换即时生效 → Task E（`onMethodChange`→`setShippingMethod`）+ Task B（移除误触发 watch）✓
  - ②b 空态引导 → Task E（`shippingMethods.length===0` 的 `UAlert` + onSubmit 不再静默）✓
  - 自提免配 → Task D（`useIsPickup`）+ Task E/F（放行与隐藏）✓
  - ①a 加购数量动态化 → Task G（`maxStock`）✓
  - ①b partial 提示 → Task C（透出）+ Task G（toast）✓
  - 探针/introspection → Task A + H✓
- **占位扫描**：所有改动步骤均含具体代码；唯一动态值（库存字段）以 Task A 核查与 Task G Step3 兜底。✓
- **类型一致**：`OrderStatus`/`quantityAvailable`/`lastAppliedId`/`maxStock`/`useIsPickup` 命名在各 Task 间一致；`submitShipping` 在 Task E 保持导出签名不变供 Task F 使用。✓
- **DRY/YAGNI**：未引入新依赖；`useIsPickup` 只被新逻辑消费，未改动 `PickupLocationSelect` 既有实现。✓