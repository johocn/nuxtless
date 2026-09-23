<script setup lang="ts">
// usemall 版式：移动优先单列卡片流，复用 cn 同一套逐箱/支付/分账/吸底结算块，不新增业务逻辑。
// （数据与提交流程与 cn 完全一致：物流箱→地址+配送；自提单→自提点+联系人；支付由全箱白名单聚合。）
// 与 cn 的差异在容器：顶部「确认订单」标题卡 + 白卡片分区 + 主色强调标题（usemall 风格），order 摘要 aside 由页面隐藏。
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

const emit = defineEmits<{ (e: "submit"): void }>();
</script>

<template>
  <div class="pb-36 md:pb-0">
    <!-- usemall 顶部标题卡 -->
    <div class="sticky top-0 z-10 mb-4 rounded-b-2xl bg-white px-4 pb-3 pt-4 shadow-sm">
      <h1 class="flex items-center gap-2 text-lg font-bold">
        <span class="h-5 w-1.5 rounded-full bg-primary" />
        确认订单
      </h1>
      <p class="mt-1 pl-3.5 text-xs text-neutral-500">请核对商品与收货信息后提交</p>
    </div>

    <div class="space-y-4">
      <!-- 收货人一体卡：仅物流箱（地址只与物流模块绑定，不与自提相连） -->
      <CheckoutCnContactCard v-if="hasDeliveryBox" />

      <!-- 统一逐箱卡片渲染器（物流/自提箱卡，按租户分区；配送/自提逻辑复用 BoxDeliveryBlock/BoxPickupBlock） -->
      <CheckoutPerBoxList />

      <!-- 支付块（支付方式由全箱白名单聚合） -->
      <CheckoutPaymentBlock />

      <!-- 分账汇总（按商户分账 + 应付款总额） -->
      <CheckoutPerBoxSummary />
    </div>

    <!-- 底部吸底结算栏（含金额明细 / 协议 / 去结算；移动端吸底，桌面端用全局 aside 提交） -->
    <CheckoutCnSummaryBar :disabled="false" :on-submit="() => emit('submit')" />
  </div>
</template>