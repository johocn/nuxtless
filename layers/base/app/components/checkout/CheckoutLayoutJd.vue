<script setup lang="ts">
// 京东新版版式：由功能块积木式拼装（组件全名引用，规避 hydration mismatch）
// 按箱型装配：
//   - 存在物流箱(delivery) → 配送方式块(物流单选) + 收货地址块（地址只与物流模块绑定）
//   - 存在自提箱(pickup)   → 自提单模块（自提点 + 联系方式子块）
//   - 不存在接收货人/电话 → 自提单模块内嵌子块随 hasPickupContactBox 显隐
// 顺序：物流模块(配送方式 → 收货地址) → 自提单模块 → 支付块（支付方式由全箱白名单聚合）
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const flow = useCheckoutFlow();
const orderStore = useOrderStore();

await orderStore.fetchOrderBoxes();

// 派生命名：以 box.type 为唯一真源（后端 OrderBox.type: 'delivery' | 'pickup'）
const hasDeliveryBox = computed(() =>
  (orderStore.orderBoxes ?? []).some((b) => b.type === "delivery"),
);
const hasPickupBox = computed(() =>
  (orderStore.orderBoxes ?? []).some((b) => b.type === "pickup"),
);
const hasPickupContactBox = computed(() =>
  (orderStore.orderBoxes ?? []).some(
    (b) => b.type === "pickup" && b.requiresContact,
  ),
);
</script>

<template>
  <div class="space-y-6">
    <!-- 物流模块：配送方式（物流单选）+ 收货地址（仅当存在物流箱；地址绝不与自提相连） -->
    <template v-if="hasDeliveryBox">
      <CheckoutBoxDeliveryBlock />
      <CheckoutAddressBlock />
    </template>

    <!-- 自提单模块：自提点 + （若需联系方式）收货人/电话子块；纯自提时绝无地址块 -->
    <CheckoutBoxPickupBlock v-if="hasPickupBox" />

    <CheckoutPaymentBlock />
  </div>
</template>