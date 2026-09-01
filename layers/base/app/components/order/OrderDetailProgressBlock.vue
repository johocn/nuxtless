<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; block?: OrderBlockCfg }>();
</script>
<template>
  <OrderProgress :state="props.order.state" class="mb-8" />
</template>