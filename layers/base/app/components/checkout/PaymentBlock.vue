<script setup lang="ts">
// 支付块（京东新版）：默认选中第一个可用支付方式，提交走 transition + addPayment
import type { CheckoutState } from "~~/types/general";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();

await orderStore.getPaymentMethods();
const { paymentMethods } = storeToRefs(orderStore);
const paymentMethodList = computed(() => paymentMethods.value ?? []);

const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.paymentForm;

// 默认选中第一个可用支付方式
onMounted(() => {
  if (!state.code && paymentMethodList.value.length) {
    const first = paymentMethodList.value[0];
    if (first) state.code = first.code;
  }
});

// 注册提交：transition → addPayment
flow.submitFns.submitPayment = async () => {
  if (!state.code) return false;
  orderStore.error = null;
  orderStore.loading = true;
  await orderStore.transitionToState("ArrangingPayment");
  if (orderStore.error) {
    orderStore.loading = false;
    return false;
  }
  await orderStore.addPaymentToOrder({ method: state.code, metadata: {} });
  if (orderStore.error) {
    orderStore.loading = false;
    return false;
  }
  orderStore.loading = false;
  return true;
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