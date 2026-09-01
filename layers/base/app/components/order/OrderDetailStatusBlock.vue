<script setup lang="ts">
import { localizeOrderText, type OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; block?: OrderBlockCfg }>();
const { locale } = useI18n();
const blockTitle = computed(() =>
  props.block?.title ? localizeOrderText(props.block.title, locale.value) : "",
);
</script>
<template>
  <section v-if="blockTitle" class="mb-4">
    <h2 class="mb-2 font-semibold">{{ blockTitle }}</h2>
  </section>
  <OrderStatusBanner :order="props.order" class="mb-4" />
</template>