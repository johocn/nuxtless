<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; block?: OrderBlockCfg }>();
const emit = defineEmits<{ (e: "updated"): void }>();
</script>
<template>
  <OrderActions :order="props.order" @updated="emit('updated')" class="mb-10" />
</template>