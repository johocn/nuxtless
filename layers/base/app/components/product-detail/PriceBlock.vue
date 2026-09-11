<script setup lang="ts">
// 当前 variant 价格徽章。版式由 detailConfig.blocks.price.style 决定：
//   jdA = 京东横幅促销价 / jdB = 京东深色价签条 / 缺省或 classic = 原版(仅现价)
import { blockStyle } from "../../utils/detail-config";
import { useDetailConfig } from "../../composables/useDetailConfig";
import { usePriceWithList } from "../../composables/usePriceWithList";
const { selectedVariant } = storeToRefs(useProductStore());
const { locale } = useI18n();
const { config } = useDetailConfig();

const priceStyle = computed(() => blockStyle(config.value, "price", "classic"));

// 现行价统一复用 usePriceWithList：basis=后台录入原值 price，按渠道 taxMode 换算（inclusive/zero→P，exclusive→P×1.13）
const { current } = usePriceWithList();

const priceLabel = computed(() => {
  const v = selectedVariant.value;
  if (!v || current.value == null) return "";
  return new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: v.currencyCode || "CNY",
  }).format(current.value / 100);
});
</script>

<template>
  <ProductDetailPriceBlockJdA v-if="priceStyle === 'jdA'" />
  <ProductDetailPriceBlockJdB v-else-if="priceStyle === 'jdB'" />
  <div v-else class="flex items-baseline gap-2">
    <span class="text-2xl font-bold text-primary">{{ priceLabel }}</span>
  </div>
</template>