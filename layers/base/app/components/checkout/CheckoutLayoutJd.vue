<script setup lang="ts">
// 京东新版版式：由功能块积木式拼装（组件全名引用，规避 hydration mismatch）
// 顺序：按箱配送方式区 → 收货地址块(存在物流箱时) → 支付块（支付方式由全箱白名单聚合）
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const flow = useCheckoutFlow();
const orderStore = useOrderStore();

await orderStore.fetchOrderBoxes();
// 只要存在物流配送箱即展示收货地址
const hasLogistics = computed(() =>
  (orderStore.orderBoxes ?? []).some((b) => (b.availableShippingMethodIds ?? []).length > 0),
);
</script>

<template>
  <div class="space-y-6">
    <CheckoutBoxDeliveryBlock />

    <CheckoutAddressBlock v-if="hasLogistics" />

    <CheckoutPaymentBlock />
  </div>
</template>