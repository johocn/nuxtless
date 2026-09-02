<script setup lang="ts">
// 京东新版版式：由功能块积木式拼装（组件全名引用，规避 hydration mismatch）
// 中间逐箱区由统一渲染器 CheckoutPerBoxList 承担（cn/jd 共用，按租户分区渲染逐箱卡片）；
// jd 特有外围保留：收货地址块（物流地址，仅物流箱）+ 支付块 + 分账汇总（无吸底栏）。
// 顺序：收货地址块(物流箱) → 逐箱卡片 → 支付块 → 分账汇总。
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const flow = useCheckoutFlow();
const orderStore = useOrderStore();

await orderStore.fetchOrderBoxes();

// 派生命名：以 box.type 为唯一真源（后端 OrderBox.type: 'delivery' | 'pickup'）
const hasDeliveryBox = computed(() =>
  (orderStore.orderBoxes ?? []).some((b) => b.type === "delivery"),
);
</script>

<template>
  <div class="space-y-6">
    <!-- 收货地址块（仅当存在物流箱；地址绝不与自提相连） -->
    <CheckoutAddressBlock v-if="hasDeliveryBox" />

    <!-- 统一逐箱卡片渲染器（物流/自提箱卡，按租户分区；配送/自提逻辑复用 BoxDeliveryBlock/BoxPickupBlock） -->
    <CheckoutPerBoxList />

    <CheckoutPaymentBlock />

    <!-- 分账汇总（按商户分账 + 应付款总额） -->
    <CheckoutPerBoxSummary />
  </div>
</template>
