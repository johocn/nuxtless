<script setup lang="ts">
// 支付块（京东新版）：按分箱聚合白名单展示可用支付方式，提交走一次性拆单结算 checkoutSplitted。
import type { CheckoutState } from "~~/types/general";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();

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

const paymentMethodList = computed(() =>
  (paymentMethods.value ?? []).filter((m) => allowedCodes.value.has(m.code)),
);

const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.paymentForm;

// 默认选中：优先余额（可跨租户/跨档案合单），否则第一个可用
onMounted(() => {
  if (!state.code && paymentMethodList.value.length) {
    const balance = paymentMethodList.value.find((m) => /balance|wallet|余额/i.test(m.code)) ;
    const first = balance ?? paymentMethodList.value[0];
    if (first) state.code = first.code;
  }
});

// 注册提交：一次性拆单结算（内部聚合拆合 + 逐单过渡 ArrangingPayment + addPayment）
flow.submitFns.submitPayment = async () => {
  if (!state.code) return false;
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

    <p v-if="!paymentMethodList.length" class="text-sm text-neutral-500">
      {{ t("messages.general.loading") }}
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