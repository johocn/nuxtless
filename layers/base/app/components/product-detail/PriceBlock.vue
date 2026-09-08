<script setup lang="ts">
// 当前 variant 价格徽章
const { selectedVariant } = storeToRefs(useProductStore());
const { locale } = useI18n();
const { taxEnabled } = useTaxEnabled();

const priceLabel = computed(() => {
  const v = selectedVariant.value;
  if (!v) return "";
  const amount = (taxEnabled.value ? v.priceWithTax : (v.price ?? v.priceWithTax)) ?? 0;
  return new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: v.currencyCode || "CNY",
  }).format(amount / 100);
});
</script>

<template>
  <div class="flex items-baseline gap-2">
    <span class="text-2xl font-bold text-primary">{{ priceLabel }}</span>
  </div>
</template>