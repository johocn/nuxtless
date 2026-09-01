<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; block?: OrderBlockCfg }>();
</script>
<template>
  <OrderRedemptionCard :order-code="props.order.code" class="mb-4" />
</template>