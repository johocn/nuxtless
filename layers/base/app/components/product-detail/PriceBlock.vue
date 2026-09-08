<script setup lang="ts">
// 当前 variant 价格徽章。版式由 detailConfig.blocks.price.style 决定：
//   jdA = 京东横幅促销价 / jdB = 京东深色价签条 / 缺省或 classic = 原版(仅现价)
import { blockStyle } from "../../utils/detail-config";
import { useDetailConfig } from "../../composables/useDetailConfig";
const { selectedVariant } = storeToRefs(useProductStore());
const { locale } = useI18n();
const { taxEnabled } = useTaxEnabled();
const { config } = useDetailConfig();

const priceStyle = computed(() => blockStyle(config.value, "price", "classic"));

const priceLabel = computed(() => {
  const v = selectedVariant.value;
  if (!v) return "";
  const might = (taxEnabled.value ? v.priceWithTax : (v.price ?? v.priceWithTax)) ?? 0;
  return new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: v.currencyCode || "CNY",
  }).format(might / 100);
});
</script>

<template>
  <ProductDetailPriceBlockJdA v-if="priceStyle === 'jdA'" />
  <ProductDetailPriceBlockJdB v-else-if="priceStyle === 'jdB'" />
  <div v-else class="flex items-baseline gap-2">
    <span class="text-2xl font-bold text-primary">{{ priceLabel }}</span>
  </div>
</template>