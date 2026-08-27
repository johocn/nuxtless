<script setup lang="ts">
// 京东新版版式：由功能块积木式拼装（组件全名引用，规避 hydration mismatch）
// 顺序：配送方式区(上移置顶) → 地址块 | 自提块(随 deliveryMode 联动) → 支付块
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