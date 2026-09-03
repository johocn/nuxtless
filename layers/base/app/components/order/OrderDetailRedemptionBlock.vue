<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
import { orderBlockHighlight } from "../../utils/order-config";
import type { OrderDetailConfig } from "../../utils/order-config";

const props = defineProps<{ order: any; block?: OrderBlockCfg; config?: OrderDetailConfig | null }>();
const highlight = computed(() => orderBlockHighlight(props.config ?? null, "redemption", true));
// 门店名尽力提取（自提点/配送自定义字段，null-safe），拿不到则隐藏
const pickupName = computed(() => {
  const o: any = props.order ?? {};
  return o?.customFields?.pickupStoreName ?? o?.delivery?.method?.name ?? o?.shippingMethod?.name ?? null;
});
</script>
<template>
  <OrderRedemptionCard
    :order-code="props.order.code"
    class="mb-4"
    :highlight="highlight"
    :pickup-name="pickupName"
  />
</template>