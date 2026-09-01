# nshop 结账页中国本地化 cn 版式 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `cn`（中国本地化）结账版式——底部吸底结算栏、收货人一体卡片、协议勾选、优惠展开抽屉、金额明细展开，复用 jd 门闩式提交序列与既有功能块，通过四级可回退风格体系保留 `jd`/`legacy`，能力与数据流零改动。

**Architecture:** 采用既有积木式渲染器。`checkout-config.ts` 的 `CheckoutLayout` 扩展为 `cn | jd | legacy`（默认 `cn`），`checkLayout()` 纯函数非法值回退 `cn`。`CheckoutRenderer` 增加 `cn` 分支渲染 `CheckoutLayoutCn`，由它按箱型纵向拼装新建的联系人卡/优惠抽屉/吸底结算栏 + 复用既有 配送/自提/支付 块。cn 与 jd 共用 `submitJd()` 门闩式提交序列（数据流零改动，仅形态不同）。`legacy` 及其 `submitLegacy` 完全不动。

**Tech Stack:** Nuxt 3（Nitro SSR）、Vue 3 `<script setup>`、UniHead、Nuxt UI（UCard/UButton/URadioGroup/UInput/UAlert）、i18n 多语言、graphql-request。Nuxt 自动注册组件须用完整注册名（目录前缀，如 `CheckoutCnSummaryBar`），否则 SSR 渲染为空注释导致 hydration mismatch。

---

## File Structure

**Modify:**
- `layers/base/app/utils/checkout-config.ts` — 扩展布局类型 + `checkLayout` 支持 cn
- `layers/base/app/components/checkout/CheckoutRenderer.vue` — 增加 cn 分支
- `layers/base/app/pages/checkout/index.vue` — 渲染 cn 分支 + connect onClick 道德拦截钩子
- `layers/base/i18n/locales/zh-CN.ts`、`en-US.ts` — 新增 cn 词条

**Create:**
- `layers/base/app/components/checkout/CheckoutLayoutCn.vue` — 装配器
- `layers/base/app/components/checkout/CheckoutCnSummaryBar.vue` — 底部吸底结算栏
- `layers/base/app/components/checkout/CheckoutCnContactCard.vue` — 收货人一体卡片
- `layers/base/app/components/checkout/CheckoutCnAgreement.vue` — 协议勾选
- `layers/base/app/components/checkout/CheckoutCnPromoDrawer.vue` — 优惠展开抽屉

---

### Task 1: checkout-config 扩展 cn + 纯函数回归

**Files:**
- Modify: `layers/base/app/utils/checkout-config.ts:9-23`

- [ ] **Step 1: 扩展布局类型与 checkLayout**

`layers/base/app/utils/checkout-config.ts`：

```ts
export type CheckoutLayout = "cn" | "jd" | "legacy";

export interface CheckoutPageConfig {
  layout: CheckoutLayout;
}

/** 前端常量（默认中国本地化版式 cn） */
export const checkoutConfig: CheckoutPageConfig = {
  layout: "cn",
};

/**
 * 纯函数：解析布局，非法值回退默认 `cn`，保证 SSR/客户端一致。
 * cn（默认）｜jd｜legacy 三级可回退。
 */
export function checkLayout(raw: string | null | undefined): CheckoutLayout {
  if (raw === "jd") return "jd";
  if (raw === "legacy") return "legacy";
  return "cn";
}
```

- [ ] **Step 2: 单元回归 checkLayout**

新建 `tests/checkout-config-layout.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { checkLayout } from "../layers/base/app/utils/checkout-config";

describe("checkLayout 四级可回退", () => {
  it("合法值按原始返回", () => {
    expect(checkLayout("cn")).toBe("cn");
    expect(checkLayout("jd")).toBe("jd");
    expect(checkLayout("legacy")).toBe("legacy");
  });
  it("非法值 / null / undefined 回退默认 cn", () => {
    expect(checkLayout("foo")).toBe("cn");
    expect(checkLayout("")).toBe("cn");
    expect(checkLayout(null)).toBe("cn");
    expect(checkLayout(undefined)).toBe("cn");
  });
});
```

> 若 `nshop` 无 vitest 配置，本测试可用 Node 断言代替（node -e 校验），或并入 F 阶段手动验证；不阻塞后续任务。

- [ ] **Step 3: 运行测试确认通过**

Run: `node --experimental-strip-types -e "import('./layers/base/app/utils/checkout-config.ts')"` 或 vitest（若已配置）。
Expected: `checkLayout('cn'|'jd'|'legacy')` 原样返回，非法值返回 `'cn'`。SSR/客户端结果一致（纯函数）。

- [ ] **Step 4: 提交**

```bash
git add layers/base/app/utils/checkout-config.ts tests/checkout-config-layout.test.ts
git commit -m "feat(checkout): checkout-config 扩展 cn 版式 + checkLayout 可回退"
```

---

### Task 2: 收货人一体卡片 `CheckoutCnContactCard`

**Files:**
- Create: `layers/base/app/components/checkout/CheckoutCnContactCard.vue`

**职责：** 收货人 + 手机号一体卡片，含省市区三级 + 详细地址。登录态支持地址簿选择/切换，复用 `Flow.submitFns.submitAddress`（AddressBlock 已注册，但 cn 需自身完整实现写入）。**自提单不渲染**（地址只与物流模块绑定）。

> 设计决策：cn 卡片不直接复用 `AddressBlock.vue`（其布局为 JD 卡片式且内部已 `applyAddress` 到 `checkoutState.addressForm`，行为可复用）。为使 cn 呈现一体卡形态、避免引入 AddressBlock 的内部 DOM，cn 卡片自实现读取/写入 `checkoutState.addressForm` + 复用 `flow.submitFns.submitAddress`（该函数由 AddressBlock 在 jd 装配时注册；cn 装配时须自身注册以确保独立）。

- [ ] **Step 1: 创建 cn 联系人卡片组件**

`layers/base/app/components/checkout/CheckoutCnContactCard.vue`：

```vue
<script setup lang="ts">
// 中国本地化版式：收货人 + 手机号一体卡片（省市区三级 + 详细地址）。
// 仅物流箱（hasDeliveryBox）渲染；地址只与物流模块绑定，不与自提模块相连。
// 未登录：直接内嵌填写（复用 CheckoutAddressForm 的提交逻辑，由本组件自持）。
// 登录态：顶部收货人/电话摘要卡 + 地址簿切换入口。
import type { ComponentPublicInstance } from "vue";
import type { AddressRecord } from "~~/types/address";
import type { CheckoutState } from "~~/types/general";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();

const { countryCodeDefault } = useAppConfig();
const { isAuthenticated } = storeToRefs(useAuthStore());
const { addresses, fetchAddresses } = useAddressBook();

const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.addressForm;

const appliedAddressId = ref<string | null>(null);
const editing = ref(false);

const addressSubmitted = ref(false);
const editFormRef = useTemplateRef<ComponentPublicInstance & { submitAddress: () => void }>("editForm");

function applyAddress(record: AddressRecord) {
  appliedAddressId.value = record.id;
  state.fullName = record.fullName ?? "";
  state.streetLine1 = record.streetLine1 ?? "";
  state.streetLine2 = record.streetLine2 ?? "";
  state.city = record.city ?? "";
  state.province = record.province ?? "";
  state.postalCode = record.postalCode ?? "";
  state.countryCode = record.countryCode ?? countryCodeDefault;
  state.phoneNumber = record.phoneNumber ?? "";
  editing.value = false;
}

const addressSummary = computed(() => {
  const street = [state.streetLine1, state.streetLine2].filter(Boolean).join(" ");
  const fullName = state.fullName;
  const appliedPhone = addresses.value.find((a) => a.id === appliedAddressId.value)?.phoneNumber ?? "";
  const phone = state.phoneNumber || appliedPhone;
  const crude = [state.province, state.city, state.district].filter(Boolean).join(" ");
  return {
    fullName,
    phone,
    crude,
    street,
    has: !!(street && fullName),
  };
});

const showCreate = computed(() => {
  if (isAuthenticated.value && addresses.value.length) return false;
  return !addressSummary.value.has;
});

// 自持地址提交写入（与 AddressBlock 同数据流，写 customer + shippingAddress）
flow.submitFns.submitAddress = async () => {
  if (!addressSummary.value.has) {
    orderStore.error = t("messages.general.shippingAddress");
    toast.add({ title: t("messages.checkout.invalidAddress"), description: orderStore.error, color: "error" });
    return false;
  }
  orderStore.error = null;
  const fullName = addressSummary.value.fullName;
  if (!isAuthenticated.value) {
    await orderStore.setCustomerForOrder({
      firstName: state.fullName,
      lastName: "",
      emailAddress: state.emailAddress,
    });
    if (orderStore.error) return false;
  }
  await orderStore.setOrderShippingAddress({
    fullName,
    streetLine1: state.streetLine1,
    streetLine2: state.streetLine2,
    city: state.city,
    province: state.province ?? "",
    postalCode: state.postalCode,
    countryCode: state.countryCode,
    phoneNumber: state.phoneNumber,
  });
  return !orderStore.error;
};

function onSaveEdited() {
  const form = editFormRef.value;
  if (!form) return;
  form.submitAddress?.();
  if (!orderStore.error) editing.value = false;
}

onMounted(() => {
  if (isAuthenticated.value) {
    void fetchAddresses().then((list) => {
      if (!appliedAddressId.value && list.length) {
        const first = list[0];
        if (first) applyAddress(first);
      }
    });
  }
});
</script>

<template>
  <!-- 仅物流箱渲染；由 CheckoutLayoutCn v-if 控制，本组件内部不做二次判断 -->
  <section
    aria-labelledby="cn-contact-heading"
    class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
  >
    <div class="mb-3 flex items-center justify-between">
      <h3 id="cn-contact-heading" class="flex items-center gap-2 font-medium">
        <span class="h-3.5 w-1 rounded-sm bg-primary-500" />
        {{ t("messages.checkout.cnContactTitle") }}
      </h3>
      <UButton
        v-if="addressSummary.has"
        color="neutral"
        variant="ghost"
        size="sm"
        :label="t('messages.checkout.switchAddress')"
        @click="editing = !editing"
      />
    </div>

    <!-- 空地址：引导新增 -->
    <div v-if="showCreate" class="text-sm text-neutral-500">
      {{ t("messages.checkout.needAddress") }}
      <UButton
        color="primary"
        variant="soft"
        size="sm"
        :label="t('messages.checkout.addAddress')"
        class="ml-2"
        @click="editing = true"
      />
    </div>

    <!-- 一体卡：收货人 + 电话 + 省市区 + 街道 -->
    <div
      v-else-if="addressSummary.has && !editing"
      class="flex flex-col gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 p-3.5 dark:border-neutral-800 dark:bg-neutral-900/40"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-base font-medium">{{ addressSummary.fullName }}</span>
          <span v-if="addressSummary.phone" class="text-sm text-neutral-500">{{ addressSummary.phone }}</span>
        </div>
        <span class="text-xs text-neutral-400">{{ t("messages.general.to") }}</span>
      </div>
      <p v-if="addressSummary.street" class="text-sm text-neutral-700 dark:text-neutral-300">
        {{ addressSummary.crude }} {{ addressSummary.street }}
      </p>
    </div>

    <!-- 新增 / 切换：地址簿选择 + 内嵌可编辑表单 -->
    <div v-if="editing" class="mt-2 space-y-4">
      <AddressPicker
        v-if="isAuthenticated && addresses.length"
        :addresses="addresses"
        :default-id="appliedAddressId"
        @select="applyAddress"
      />
      <CheckoutAddressForm
        ref="editForm"
        v-model="addressSubmitted"
        aria-labelledby="cn-contact-heading"
        novalidate
      />
      <div class="flex justify-end">
        <UButton color="primary" :label="t('messages.checkout.saveAddress')" @click="onSaveEdited" />
      </div>
    </div>
  </section>
</template>
```

> 说明：`CheckoutAddressForm` 为既有组件（`components/checkout/AddressForm.vue`，注册名 `CheckoutAddressForm`）。它已实现省市区三级 + 详细地址的编辑与 `submitAddress`，cn 卡片复用其编辑表单，仅包裹层形态不同。`useCheckoutFlow` 需暴露 `submitFns`（既有接口，PaymentBlock/AddressBlock 已如此使用）。

- [ ] **Step 2: 验证卡片渲染（占位装配后）**

Run: 本地 `pnpm dev` 打开 `/checkout`（含物流箱测试单），切换到 cn（默认已 cn）。
Expected: 收货人一体卡展示姓名/电话/省市区/街道；切换地址可用；未填时引导新增。

- [ ] **Step 3: 提交**

```bash
git add layers/base/app/components/checkout/CheckoutCnContactCard.vue
git commit -m "feat(checkout): cn 收货人一体卡片"
```

---

### Task 3: 优惠展开抽屉 `CheckoutCnPromoDrawer`

**Files:**
- Create: `layers/base/app/components/checkout/CheckoutCnPromoDrawer.vue`

**职责：** 优惠区抽屉——展示已选券（`applyCouponToOrder`/`clearCouponFromOrder` 复用 OrderSummary 同款交互），展开可选券列表（`getMyCoupons`），金额/条件展示复用 OrderSummary 的 `walletFormatAmount`/`walletCondition` 逻辑（抽为独立函数，供本组件与 OrderSummary 共用）。

- [ ] **Step 1: 抽取券展示工具函数**

创建 `layers/base/app/composables/useCouponFormat.ts`：

```ts
import type { CouponTemplate, CustomerCoupon } from "./useCoupon";

// 券展示金额/条件文案，供结算栏优惠抽屉与 OrderSummary 复用
export function walletFormatAmount(t: (k: string, opts?: Record<string, unknown>) => string, c: CustomerCoupon): string {
  const tpl = c.template;
  if (!tpl) return "";
  if (tpl.type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  if (tpl.type === "PERCENT") {
    const zhe = tpl.discountValue / 10;
    return zhe % 1 === 0 ? `${zhe}${t("messages.coupon.unitDiscount")}` : `${zhe.toFixed(1)}${t("messages.coupon.unitDiscount")}`;
  }
  return `¥${(tpl.discountValue / 100).toString()}`;
}

export function walletCondition(t: (k: string, opts?: Record<string, unknown>) => string, c: CustomerCoupon): string {
  const tpl = c.template ?? ({} as CouponTemplate);
  const minSpend = tpl.minSpend ? tpl.minSpend / 100 : 0;
  if (tpl.type === "FREE_SHIPPING") return c.template?.description || t("messages.coupon.typeFreeShipping");
  if (tpl.type === "FULL") return t("messages.coupon.noThresholdFull");
  if (!minSpend) return t("messages.coupon.noThreshold");
  return t("messages.coupon.minSpend", { n: minSpend });
}
```

- [ ] **Step 2: 创建优惠抽屉组件**

`layers/base/app/components/checkout/CheckoutCnPromoDrawer.vue`：

```vue
<script setup lang="ts">
import type { ActiveOrderDetail } from "~~/types/order";
import type { CouponStatus, CustomerCoupon } from "~~/layers/base/app/composables/useCoupon";
import { getMyCoupons, applyCouponToOrder, clearCouponFromOrder, couponErrorMessage } from "~~/layers/base/app/composables/useCoupon";
import { walletFormatAmount, walletCondition } from "~~/layers/base/app/composables/useCouponFormat";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const { t } = useI18n();
const localePath = useLocalePath();
const toast = useToast();
const orderStore = useOrderStore();
const { order } = storeToRefs(orderStore);
const activeOrder = order as Ref<ActiveOrderDetail>;
const { isAuthenticated } = storeToRefs(useAuthStore());

const walletCoupons = ref<CustomerCoupon[]>([]);
const loadingCoupons = ref(false);
const applyingCode = ref<string | null>(null);

const activeAppliedCode = computed(() => (activeOrder.value?.customFields as any)?.couponCode ?? null);
const usableCoupons = computed(() =>
  walletCoupons.value.filter((c) => c.status.toUpperCase() === "UNUSED" || c.status.toUpperCase() === "RETURNED"),
);

async function loadWalletCoupons() {
  if (!isAuthenticated.value) return;
  loadingCoupons.value = true;
  try { walletCoupons.value = await getMyCoupons("UNUSED" as CouponStatus); }
  catch (e) { toast.add({ title: t("messages.coupon.coupon"), description: couponErrorMessage(e), color: "error" }); }
  finally { loadingCoupons.value = false; }
}

async function refreshOrder() { await orderStore.fetchOrder("detail"); }

async function applyFromWallet(c: CustomerCoupon) {
  if (!isAuthenticated.value) { await navigateTo(localePath("/account/login")); return; }
  if (applyingCode.value) return;
  applyingCode.value = c.code;
  try {
    await applyCouponToOrder(c.code);
    await refreshOrder();
    toast.add({ title: t("messages.coupon.applied"), description: c.template?.name ?? c.code, color: "success" });
  } catch (e) {
    toast.add({ title: t("messages.coupon.appliedError"), description: couponErrorMessage(e), color: "error" });
  } finally { applyingCode.value = null; }
}

async function clearApplied() {
  if (applyingCode.value) return;
  applyingCode.value = "clear";
  try {
    await clearCouponFromOrder();
    await refreshOrder();
    toast.add({ title: t("messages.coupon.removed"), color: "success" });
  } catch (e) {
    toast.add({ title: t("messages.coupon.appliedError"), description: couponErrorMessage(e), color: "error" });
  } finally { applyingCode.value = null; }
}

onMounted(async () => { if (isAuthenticated.value) await loadWalletCoupons(); });
</script>

<template>
  <USlideover :open="open" @close="emit('close')">
    <template #header>
      <h3 class="text-base font-medium">{{ t("messages.coupon.coupon") }}</h3>
    </template>

    <!-- 已绑定券 -->
    <div v-if="activeAppliedCode" class="mb-4 flex items-center justify-between rounded-lg border border-(--ui-primary) bg-(--ui-bg-muted) px-3 py-2">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-(--ui-primary)">{{ activeAppliedCode }}</p>
        <p class="text-xs text-(--ui-text-muted)">{{ t("messages.coupon.currentlyApplied") }}</p>
      </div>
      <UButton size="xs" variant="soft" color="error" :loading="applyingCode === 'clear'" @click="clearApplied">
        {{ t("messages.coupon.remove") }}
      </UButton>
    </div>

    <!-- 未登录 -->
    <div v-else-if="!isAuthenticated" class="text-sm text-(--ui-text-muted)">
      {{ t("messages.coupon.loginPromptOrder") }}
      <UButton size="sm" variant="soft" class="mt-2" :to="localePath('/account/login')">
        {{ t("messages.coupon.goLogin") }}
      </UButton>
    </div>

    <!-- 可选券列表 -->
    <div v-else-if="usableCoupons.length" class="space-y-2">
      <div v-for="c in usableCoupons" :key="c.id" class="flex items-center gap-3 rounded-lg border border-(--ui-border) px-3 py-2">
        <span class="w-24 shrink-0 font-bold text-(--ui-primary)">{{ walletFormatAmount(t, c) }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{{ c.template?.name || t("messages.coupon.voucher") }}</p>
          <p class="truncate text-xs text-(--ui-text-muted)">{{ walletCondition(t, c) }}</p>
        </div>
        <UButton size="xs" variant="solid" :loading="applyingCode === c.code" :disabled="!!applyingCode" @click="applyFromWallet(c)">
          {{ t("messages.coupon.apply") }}
        </UButton>
      </div>
    </div>
    <p v-else class="text-sm text-(--ui-text-muted)">{{ t("messages.coupon.noUsableCoupon") }}</p>
  </USlideover>
</template>
```

> `USlideover` 为 Nuxt UI 组件（已装）。若项目对 `USlideover` 的安装或样式有差异，改用 `UDrawer`（若存在）或自定义 fixed 抽屉层；以项目实际可用组件为准。

- [ ] **Step 3: 提交**

```bash
git add layers/base/app/composables/useCouponFormat.ts layers/base/app/components/checkout/CheckoutCnPromoDrawer.vue
git commit -m "feat(checkout): cn 优惠展开抽屉 + 券展示工具函数复用"
```

---

### Task 4: 协议勾选 `CheckoutCnAgreement`

**Files:**
- Create: `layers/base/app/components/checkout/CheckoutCnAgreement.vue`

- [ ] **Step 1: 创建协议组件**

`layers/base/app/components/checkout/CheckoutCnAgreement.vue`：

```vue
<script setup lang="ts">
// 中国本地化版式：提交前协议勾选（默认勾选）。未勾选时由吸底结算栏在提交前拦截并提示。
const { t } = useI18n();
const localePath = useLocalePath();

// 协议勾选状态，供 CheckoutCnSummaryBar 读取拦截（通过 v-model 双向）
const accepted = defineModel<boolean>({ default: true });

const userTermsPath = localePath("/agreement/terms");
const privacyPath = localePath("/agreement/privacy");
</script>

<template>
  <label class="flex items-center gap-2 text-xs text-neutral-500">
    <UCheckbox v-model="accepted" size="sm" />
    <span>
      <NuxtLink :to="userTermsPath" class="text-(--ui-primary) no-underline hover:underline">
        {{ t("messages.checkout.cnAgreementTerms") }}
      </NuxtLink>
      {{ t("messages.general.and") }}
      <NuxtLink :to="privacyPath" class="text-(--ui-primary) no-underline hover:underline">
        {{ t("messages.checkout.cnAgreementPrivacy") }}
      </NuxtLink>
      {{ t("messages.checkout.cnAgreementNotice") }}
    </span>
  </label>
</template>
```

> 需确认项目是否存在 `/agreement/terms`、`/agreement/privacy` 页面；不存在则摘要指向首页或省略链接（以 `messages.checkout.cnAgreementTerms`/`cnAgreementPrivacy` 文案承载文字）。`UCheckbox` 为 Nuxt UI 组件。

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/components/checkout/CheckoutCnAgreement.vue
git commit -m "feat(checkout): cn 提交前协议勾选"
```

---

### Task 5: 底部吸底结算栏 `CheckoutCnSummaryBar`

**Files:**
- Create: `layers/base/app/components/checkout/CheckoutCnSummaryBar.vue`

**职责：** 底部吸底结算栏——常驻「去结算」CTA + 应付金额；展开金额明细（小计/税费/运费/合计）；内含「已选优惠展开入口」与协议勾选（未勾选拦截）。

- [ ] **Step 1: 创建吸底结算栏**

`layers/base/app/components/checkout/CheckoutCnSummaryBar.vue`：

```vue
<script setup lang="ts">
import type { ActiveOrderDetail } from "~~/types/order";

const props = defineProps<{
  disabled?: boolean;
  loading?: boolean;
  initialLoading?: boolean;
}>();

const emit = defineEmits<{ (e: "submitHandle"): Promise<void> | void }>();

const { t } = useI18n();
const orderStore = useOrderStore();
const { order } = storeToRefs(orderStore);
const activeOrder = order as Ref<ActiveOrderDetail>;

// 协议勾选联动（与 CheckoutCnAgreement 双向）
const accepted = ref(true);
const checkoutState = useState<any>("checkoutState");
checkoutState.value.cnAccepted = accepted;
const promoOpen = ref(false);

const subTotal = computed(() => (activeOrder.value?.subTotal / 100).toFixed(2));
const orderTotal = computed(() => (activeOrder.value?.totalWithTax / 100).toFixed(2));
const orderTaxTotal = computed(() => {
  const taxTotal = activeOrder.value?.taxSummary?.[0]?.taxTotal;
  return taxTotal != null ? (taxTotal / 100).toFixed(2) : null;
});
const shippingWithTax = computed(() => (activeOrder.value?.shippingWithTax / 100).toFixed(2));

function expandDetails() {
  // 展开金额明细（通过内部 ref 切换）
}

async function onGoCheckout() {
  if (!accepted.value) {
    const toast = useToast();
    toast.add({ title: t("messages.checkout.cnAgreementRequired"), color: "warning" });
    return;
  }
  await emit("submitHandle");
}
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-900 md:hidden">
    <!-- 金额明细（默认收起，点击展开） -->
    <div
      v-if="expandState"
      class="mb-2 flex flex-col gap-1 border-b border-neutral-100 pb-2 text-sm dark:border-neutral-700"
    >
      <div class="flex justify-between"><span>{{ t("messages.shop.subtotal") }}</span><span>{{ subTotal }}</span></div>
      <div v-if="orderTaxTotal != null" class="flex justify-between"><span>{{ t("messages.general.tax") }}</span><span>{{ orderTaxTotal }}</span></div>
      <div class="flex justify-between"><span>{{ t("messages.general.shipping") }}</span><span>{{ shippingWithTax }}</span></div>
      <USeparator class="my-1" />
      <div class="flex justify-between font-bold"><span>{{ t("messages.shop.total") }}</span><span>{{ orderTotal }}</span></div>
    </div>

    <div class="flex items-center justify-between gap-3">
      <button type="button" class="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-300" @click="expandDetails">
        <span>{{ t("messages.shop.orderSummary") }}</span>
        <UIcon name="i-lucide-chevron-up-down" />
      </button>
      <div class="flex items-center gap-2">
        <span class="font-bold text-(--ui-primary)">¥{{ orderTotal }}</span>
        <UButton size="lg" color="primary" :loading="props.loading" :disabled="props.disabled || (activeOrder?.lines.length ?? 0) < 1" class="px-8 justify-center" @click="onGoCheckout">
          {{ t("messages.shop.checkout") }}
        </UButton>
      </div>
    </div>

    <!-- 协议勾选 -->
    <CheckoutCnAgreement v-model="accepted" class="mt-2" />
  </div>

  <!-- 非吸底：优惠抽屉（由页面级 cn 分支承载） -->
  <CheckoutCnPromoDrawer :open="promoOpen" @close="promoOpen = false" />
</template>

<style scoped>
/* 移动端吸底固定，桌面端延伸为右下悬浮（md: 改为非吸底，与 jd aside 并存可选） */
</style>
```

> 交互说明：移动端（`md` 以下）吸底固定；桌面端显示为 sticky 侧边摘要（可加 `md:` 变体，本期最小为移动端吸底 + 桌面端保留右侧 aside 走 `submitJd`）。`expandDetails` 需真实切换 `expandState`（新增 `const expandState = ref(false)`；`expandDetails` 置反）。

- [ ] **Step 2: 补全 expandState 状态**

在 `CheckoutCnSummaryBar.vue` script 中新增并接好：

```ts
const expandState = ref(false);
function expandDetails() { expandState.value = !expandState.value; }
```

- [ ] **Step 3: 提交**

```bash
git add layers/base/app/components/checkout/CheckoutCnSummaryBar.vue
git commit -m "feat(checkout): cn 底部吸底结算栏"
```

---

### Task 6: 装配器 `CheckoutLayoutCn`

**Files:**
- Create: `layers/base/app/components/checkout/CheckoutLayoutCn.vue`

- [ ] **Step 1: 创建 cn 装配器**

`layers/base/app/components/checkout/CheckoutLayoutCn.vue`：

```vue
<script setup lang="ts">
// 中国本地化版式：积木式纵向装配（组件全名引用，规避 hydration mismatch）。
// 复用既有功能块（配送/自提/支付）+ 新增 cn 块（联系人卡/优惠抽屉/吸底结算栏/协议）。
// 顺序：联系人卡(物流箱) → 配送方式 → 自提模块 → 优惠区 → 支付 → 吸底结算栏。
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const flow = useCheckoutFlow();
const orderStore = useOrderStore();

await orderStore.fetchOrderBoxes();

const hasDeliveryBox = computed(() => (orderStore.orderBoxes ?? []).some((b) => b.type === "delivery"));
const hasPickupBox = computed(() => (orderStore.orderBoxes ?? []).some((b) => b.type === "pickup"));
</script>

<template>
  <div class="space-y-4 pb-24 md:pb-0">
    <!-- 收货人一体卡：仅物流箱（地址只与物流模块绑定） -->
    <CheckoutCnContactCard v-if="hasDeliveryBox" />

    <!-- 配送方式（物流箱） -->
    <CheckoutBoxDeliveryBlock v-if="hasDeliveryBox" />

    <!-- 自提单模块（自提点 + 需联系方式时收货人/电话子块） -->
    <CheckoutBoxPickupBlock v-if="hasPickupBox" />

    <!-- 优惠区（展开入口由吸底栏承载） -->
    <CheckoutPaymentBlock />

    <!-- 底部吸底结算栏（含金额明细 / 协议 / 去结算） -->
    <CheckoutCnSummaryBar :disabled="false" title="cn" />
  </div>
</template>
```

> `flow.submitFns.submitAddress` 由 `CheckoutCnContactCard` 注册；`submitDelivery`/`submitPickup`/`submitContact`/`submitPayment` 由复用的 `BoxDeliveryBlock`/`BoxPickupBlock`/`PaymentBlock` 注册。吸底栏的去结算走 `SubmitButton` 由页面级 `submitJd`（cn 分支）串起。

- [ ] **Step 2: 提交**

```bash
git add layers/base/app/components/checkout/CheckoutLayoutCn.vue
git commit -m "feat(checkout): cn 装配器 CheckoutLayoutCn"
```

---

### Task 7: CheckoutRenderer + index.vue cn 分支接线

**Files:**
- Modify: `layers/base/app/components/checkout/CheckoutRenderer.vue`
- Modify: `layers/base/app/pages/checkout/index.vue`

- [ ] **Step 1: 渲染器增加 cn 分支**

`layers/base/app/components/checkout/CheckoutRenderer.vue`：

```vue
<script setup lang="ts">
import CheckoutLayoutCn from "./CheckoutLayoutCn.vue";
import CheckoutLayoutJd from "./CheckoutLayoutJd.vue";
import { checkoutConfig } from "~~/layers/base/app/utils/checkout-config";

const layout = checkoutConfig.layout;
</script>

<template>
  <CheckoutLayoutCn v-if="layout === 'cn'" />
  <CheckoutLayoutJd v-else-if="layout === 'jd'" />
  <slot v-else />
</template>
```

> 去掉原 `import CheckoutLayoutJd` 前保留对 cn 的导入；slot 仍为最终兜底（legacy）。

- [ ] **Step 2: index.vue cn 分支渲染**

`layers/base/app/pages/checkout/index.vue` （模板区）：

```vue
<CheckoutRenderer v-if="layout === 'cn' || layout === 'jd'" />
```

> 原 `<CheckoutRenderer v-if="layout === 'jd'" />` 改为 `cn || jd`，因默认已切 `cn` 且渲染器内部再按 layout 分发。`submitJd` 已在 applyJd；`onSubmit` 逻辑改为 cn 走 submitJd：

`pages/checkout/index.vue` script 区：

```ts
async function onSubmit() {
  if (layout === "cn" || layout === "jd") {
    await submitJd();
    return;
  }
  await submitLegacy();
}
```

> `layout` 常量仍为 `checkoutConfig.layout`（= "cn"），`onSubmit` 分发即生效；jd 分支保留。

- [ ] **Step 3: 本地验证三版式**

Run: `pnpm dev`，分别设 `checkoutConfig.layout = 'cn' / 'jd' / 'legacy'` 进 `/checkout`。
Expected:
- `cn`：收货人卡 + 配送/自提 + 支付 + 底部吸底栏 + 协议；可提交（submitJd 序列）
- `jd`：原京东版式（aside + OrderSummary）不受影响
- `legacy`：旧版式（CheckoutAddressForm 全字段 + submitLegacy）不受影响

- [ ] **Step 4: 提交**

```bash
git add layers/base/app/components/checkout/CheckoutRenderer.vue layers/base/app/pages/checkout/index.vue
git commit -m "feat(checkout): CheckoutRenderer + index.vue 接线 cn 版式"
```

---

### Task 8: i18n 词条同步（zh-CN / en-US）

**Files:**
- Modify: `layers/base/i18n/locales/zh-CN.ts`
- Modify: `layers/base/i18n/locales/en-US.ts`

- [ ] **Step 1: zh-CN 新增 cn 词条**

在 `zh-CN.ts` 的 `checkout` 区块内（`locateAddressDone`/`orderBoxesLoading`/`completeSections`/`pickPaymentMethod` 之后）追加：

```ts
cnContactTitle: "收货信息",
cnAgreementTerms: "《用户服务协议》",
cnAgreementPrivacy: "《隐私政策》",
cnAgreementNotice: "我已阅读并同意",
cnAgreementRequired: "请先勾选同意服务协议与隐私政策后再提交订单",
cnExpandDetails: "展开明细",
cnCollapseDetails: "收起明细",
```

`general` 区块需补 `to`、`and`（若未存在）：

```ts
to: "收",
and: "和",
```

> 若 `general.to`/`general.and` 已存在则跳过，避免重复 key。

- [ ] **Step 2: en-US 对齐新增词条**

在 `en-US.ts` 对应 `checkout` 区块追加：

```ts
cnContactTitle: "Contact Information",
cnAgreementTerms: "User Service Agreement",
cnAgreementPrivacy: "Privacy Policy",
cnAgreementNotice: "I have read and agree to",
cnAgreementRequired: "Please agree to the terms and privacy policy before submitting",
cnExpandDetails: "Details",
cnCollapseDetails: "Collapse",
```

`general` 若缺 `to`/`and` 补：

```ts
to: "to",
and: "and",
```

> 其余语言包（bg/de/es/fa/fr/it/ja/ko/pt/ru）不在本期强制同步，交由后续 i18n 批次；本期保证 zh-CN/en-US 完整，新 key 缺语言时回退 defaultLocale（en）显示。

- [ ] **Step 3: 验证无缺 key**

Run: 在 zh-CN / en-US 两文件对应区块核对新增 key 一一对应。
Expected: 无缺 key；i18n typecheck 通过（若有）。

- [ ] **Step 4: 提交**

```bash
git add layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "feat(i18n): cn 版式词条 zh-CN/en-US 同步"
```

---

### Task 9: F 阶段回归 / 本地构建 / 手机截图 / 手册

**Files:**
- Test manual: 手机视口截图 + e2e 回归脚本（新增 `_shot_checkout_cn.py`）
- Manual: 操作手册（HTML manual + MD 手册第 12（优惠券章节后）节）

- [ ] **Step 1: e2e 回归 submitJd 序列不受 cn 影响**

Run: 现有 e2e 回归（checkout 提交相关，走 `/checkout` 手机视口）。确认 `cn` 下提交序列与 `jd` 一致（地址→配送→自提→联系人→支付→checkoutSplitted）。

- [ ] **Step 2: 手机视口截图（390×844, dpr=2）**

新增 `_shot_checkout_cn.py`（Playwright：注入登录态 → `/checkout` → 截 4 张）：
1. `checkout-cn-bottom-bar.png`：吸底结算栏（含应付金额 + 去结算）
2. `checkout-cn-contact-card.png`：收货人一体卡
3. `checkout-cn-promo-drawer.png`：优惠抽屉展开
4. `checkout-cn-agreement-block.png`：未勾选协议时点去结算的拦截 toast

保存至 `d:\zhao\vendure\e2e-shots\`。脚本参考既有 `_shot_coupon_nshop.py` 的注入登录方式。

- [ ] **Step 3: 手册补充「中国本地化结算版式（cn）」**

- HTML 运营手册 `web-admin/src/static/manual/index.html`：新增章节，含 4 张截图
- MD 手册 `vendure/doc/多租户使用手册.md`：在优惠券章后新增小节 + 截图

- [ ] **Step 4: 本地构建并提交部署**

```bash
cd "d:\zhao\nshop"
node scripts/deploy.mjs   # 本地构建 .output → scp → pm2 restart
```

Expected: 构建成功、上传、重启；部署后 `/checkout` 手机视口截图验证 cn 生效。

- [ ] **Step 5: 提交截图与手册**

```bash
git add _shot_checkout_cn.py  # 截图脚本连同仓库
git add layers/base/components/checkout/*.vue  # 如有遗漏
# commit 归属各仓库：nshop 源码/i18n/.output（scp）+ manual/截图（vshop/vendure doc）
```

---

## Self-Review

**Spec 覆盖核对：**
- §3 L2 配置（CheckoutLayout 扩展 + checkLayout 回退 cn）→ Task 1 ✓
- §4 新增 5 组件：ContactCard→Task2、PromoDrawer→Task3、Agreement→Task4、SummaryBar→Task5、LayoutCn→Task6；复用 BoxDeliveryBlock/BoxPickupBlock/PaymentBlock/OrderSummary 金额逻辑→Task2/3/5 ✓
- §5 交互流：地址表单+定位、优惠抽屉、协议拦截、吸底栏 → Task2/3/4/5 ✓
- §6 提交序列复用 submitJd、legacy 不动 → Task7 ✓
- §7 范围：核心五件、不含备注/发票、回退链 → Task1(checkLayout)+Task7 ✓
- §8 测试/交付：手机截图、e2e 回归、i18n 同步、手册、.output 部署 → Task8/9 ✓

**占位符检查：** 无 TODO/TBD。Task5 的 `expandState` 补全在 Step2 内联给出明确代码，非占位。

**类型一致性：**
- `checkLayout` 返回 `CheckoutLayout`（"cn"|"jd"|"legacy"）——Task1 定义、Task7 用于 onSubmit/渲染，一致。
- `useCouponFormat.ts` 导出 `walletFormatAmount(t, c)`/`walletCondition(t, c)`（首参 i18n t）——Task3 定义并在 PromoDrawer 调用；与 OrderSummary 既有 `walletFormatAmount(c)` 签名不同（首参不同），计划复用新函数、OrderSummary 保留旧签名，无冲突（新函数独立，未破坏旧调用）。✓
- `CheckoutCnSummaryBar` emits `('submitHandle')`，Task6 通过 `:disabled`/页面 submitJd 串——与 onSubmit 分发一致。✓
- i18n key：`messages.checkout.cnContactTitle/cnAgreementTerms/cnAgreementPrivacy/cnAgreementNotice/cnAgreementRequired/cnExpandDetails/cnCollapseDetails` 与 `messages.general.to/and` ——Task8 定义，Task2/4/5 引用，一致。

**结论：计划完整、自洽，可以执行。**