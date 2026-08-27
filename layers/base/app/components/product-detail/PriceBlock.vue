<script setup lang="ts">
// 当前 variant 价格徽章
const { selectedVariant } = storeToRefs(useProductStore());
const { locale } = useI18n();

const priceLabel = computed(() => {
  const v = selectedVariant.value;
  if (!v) return "";
  return new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: v.currencyCode || "CNY",
  }).format((v.priceWithTax ?? 0) / 100);
});
</script>

<template>
  <div class="flex items-baseline gap-2">
    <span class="text-2xl font-bold text-primary">{{ priceLabel }}</span>
  </div>
</template>