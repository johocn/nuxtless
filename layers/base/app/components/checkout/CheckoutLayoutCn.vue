<script setup lang="ts">
// 中国本地化版式：积木式纵向装配（组件全名引用，规避 hydration mismatch）。
// 中间逐箱区由统一渲染器 CheckoutPerBoxList 承担（cn/jd 共用，按租户分区渲染逐箱卡片）；
// cn 特有外围保留：联系人卡（物流地址）+ 支付 + 分账汇总 + 底部吸底结算栏。
// 顺序：联系人卡(物流箱) → 逐箱卡片 → 支付 → 分账汇总 → 底部吸底结算栏。
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const flow = useCheckoutFlow();
const orderStore = useOrderStore();

await orderStore.fetchOrderBoxes();

// box.type 为唯一真源（后端下发）：'delivery' | 'pickup'
const hasDeliveryBox = computed(() =>
  (orderStore.orderBoxes ?? []).some((b) => b.type === "delivery"),
);

// 吸底结算栏提交（cn 走 submitJd 门闩式序列）；由页面注入 on-submit
const emit = defineEmits<{ (e: "submit"): void }>();
</script>

<template>
  <div class="space-y-4 pb-28 md:pb-0 md:space-y-6">
    <!-- 收货人一体卡：仅物流箱（地址只与物流模块绑定，不与自提相连） -->
    <CheckoutCnContactCard v-if="hasDeliveryBox" />

    <!-- 统一逐箱卡片渲染器（物流/自提箱卡，按租户分区；配送/自提逻辑复用 BoxDeliveryBlock/BoxPickupBlock） -->
    <CheckoutPerBoxList />

    <!-- 支付块（支付方式由全箱白名单聚合） -->
    <CheckoutPaymentBlock />

    <!-- 分账汇总（按商户分账 + 应付款总额） -->
    <CheckoutPerBoxSummary />

    <!-- 底部吸底结算栏（含金额明细 / 协议 / 去结算；移动端吸底，桌面端用全局 aside 提交） -->
    <CheckoutCnSummaryBar :disabled="false" :on-submit="() => emit('submit')" />
  </div>
</template>