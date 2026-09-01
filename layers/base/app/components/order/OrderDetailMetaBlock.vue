<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; block?: OrderBlockCfg }>();
</script>
<template>
  <section class="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <OrderMetaCard :order="props.order" />
  </section>
</template>