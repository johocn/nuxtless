<script setup lang="ts">
import { localizeOrderText, type OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; block?: OrderBlockCfg }>();
const { locale, t } = useI18n();
const blockTitle = computed(() =>
  props.block?.title ? localizeOrderText(props.block.title, locale.value) : t("messages.shop.orderSummary"),
);
</script>
<template>
  <section class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <h2 class="mb-3 font-semibold">{{ blockTitle }}</h2>
    <OrderItems :order="props.order">
      <template #line-actions="scope">
        <slot name="line-actions" v-bind="scope" />
      </template>
    </OrderItems>
  </section>
</template>