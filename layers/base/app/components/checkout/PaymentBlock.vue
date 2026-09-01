<script setup lang="ts">
// 支付块（京东新版）：按分箱聚合白名单展示可用支付方式，提交走一次性拆单结算 checkoutSplitted。
import type { CheckoutState } from "~~/types/general";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();
const { isAuthenticated } = storeToRefs(useAuthStore());

await orderStore.fetchOrderBoxes();
await orderStore.getPaymentMethods();
const { paymentMethods, orderBoxes } = storeToRefs(orderStore);

// 全箱支付方式白名单并集（来自各箱配送档案绑定的支付档案）
const allowedCodes = computed(() => {
  const set = new Set<string>();
  for (const box of orderBoxes.value ?? []) {
    for (const code of box.availablePaymentMethodCodes ?? []) set.add(code);
  }
  return set;
});
// 需登录才能使用的支付方式并集（游客结算时过滤，如余额钱包）
const loginRequiredCodes = computed(() => {
  const set = new Set<string>();
  for (const box of orderBoxes.value ?? []) {
    for (const code of box.loginRequiredPaymentCodes ?? []) set.add(code);
  }
  return set;
});

const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.paymentForm;

// 游客：过滤掉需登录的方法（余额钱包）；登录用户：全部白名单方法
const paymentMethodList = computed(() =>
  (paymentMethods.value ?? []).filter(
    (m) => allowedCodes.value.has(m.code) && (isAuthenticated.value || !loginRequiredCodes.value.has(m.code)),
  ),
);

// 选中兜底：优先余额（可跨租户/跨档案合单）——仅登录用户，否则第一个可用；
// 若当前选中已被过滤掉（如游客此前选了余额），重置为可用项。
function applyDefaultSelection() {
  const list = paymentMethodList.value;
  if (!list.length) {
    state.code = "";
    return;
  }
  const stillOk = list.some((m) => m.code === state.code);
  if (state.code && stillOk) return;
  const balance =
    isAuthenticated.value && list.find((m) => /balance|wallet|余额/i.test(m.code));
  state.code = (balance ?? list[0]).code;
}
onMounted(applyDefaultSelection);
watch(paymentMethodList, applyDefaultSelection);

// 注册提交：一次性拆单结算（内部聚合拆合 + 逐单过渡 ArrangingPayment + addPayment）
flow.submitFns.submitPayment = async () => {
  if (!state.code) {
    orderStore.error = t("messages.checkout.pickPaymentMethod");
    toast.add({
      title: t("messages.checkout.completeSections"),
      description: orderStore.error,
      color: "warning",
    });
    return false;
  }
  orderStore.error = null;
  orderStore.loading = true;
  const settled = await orderStore.checkoutSplitted(state.code);
  if (orderStore.error) {
    orderStore.loading = false;
    return false;
  }
  orderStore.loading = false;
  if (settled.length) {
    checkoutState.value.placedOrderCode = String(settled[0]?.code ?? "");
  }
  return settled.length > 0;
};
</script>

<template>
  <section
    aria-labelledby="payment-block-heading"
    class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
  >
    <h3 id="payment-block-heading" class="mb-3 font-medium">
      {{ t("messages.general.paymentMethod") }}
    </h3>

    <p v-if="!paymentMethodList.length && isAuthenticated" class="text-sm text-neutral-500">
      {{ t("messages.general.loading") }}
    </p>
    <p v-else-if="!paymentMethodList.length" class="text-sm text-neutral-500">
      {{ t("messages.general.loginRequiredForPayment") }}
    </p>
    <URadioGroup
      v-else
      v-model="state.code"
      indicator="hidden"
      variant="table"
      orientation="vertical"
      :items="paymentMethodList.map((m) => ({ label: m.name, value: m.code }))"
      :ui="{ item: 'w-full' }"
      :disabled="orderStore.loading"
    />
  </section>
</template>

<style lang="css" scoped></style>