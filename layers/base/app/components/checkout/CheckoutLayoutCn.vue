<script setup lang="ts">
// 中国本地化版式：积木式纵向装配（组件全名引用，规避 hydration mismatch）。
// 复用既有功能块（配送/自提/支付）+ 新增 cn 块（联系人卡/优惠抽屉/吸底结算栏/协议）。
// 顺序：联系人卡(物流箱) → 配送方式(物流箱) → 自提模块 → 支付 → 底部吸底结算栏。
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const flow = useCheckoutFlow();
const orderStore = useOrderStore();

await orderStore.fetchOrderBoxes();

// box.type 为唯一真源（后端下发）：'delivery' | 'pickup'
const hasDeliveryBox = computed(() =>
  (orderStore.orderBoxes ?? []).some((b) => b.type === "delivery"),
);
const hasPickupBox = computed(() =>
  (orderStore.orderBoxes ?? []).some((b) => b.type === "pickup"),
);

// 吸底结算栏提交（cn 走 submitJd 门闩式序列）；由页面注入 on-submit
const emit = defineEmits<{ (e: "submit"): void }>();
</script>

<template>
  <div class="space-y-4 pb-28 md:pb-0 md:space-y-6">
    <!-- 收货人一体卡：仅物流箱（地址只与物流模块绑定，不与自提相连） -->
    <CheckoutCnContactCard v-if="hasDeliveryBox" />

    <!-- 配送方式（物流箱） -->
    <CheckoutBoxDeliveryBlock v-if="hasDeliveryBox" />

    <!-- 自提单模块（自提点 + 需联系方式时联系人子块） -->
    <CheckoutBoxPickupBlock v-if="hasPickupBox" />

    <!-- 支付块（支付方式由全箱白名单聚合） -->
    <CheckoutPaymentBlock />

    <!-- 底部吸底结算栏（含金额明细 / 协议 / 去结算；移动端吸底，桌面端用全局 aside 提交） -->
    <CheckoutCnSummaryBar :disabled="false" :on-submit="() => emit('submit')" />
  </div>
</template>