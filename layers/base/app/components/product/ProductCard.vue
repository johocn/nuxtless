<script setup lang="ts">
import type { SearchResult } from "~~/types/product";
import { assetSrc } from "../../utils/image";

const { product, serviceInfo, eager } = defineProps<{
  product: SearchResult[number];
  serviceInfo?: {
    belongCity?: string | null;
    serviceCities?: Array<string | null> | null;
  };
  eager?: boolean;
}>();

if (!product) {
  throw new Error("ProductCard: 'product' prop is required");
}

const { t } = useI18n();
const localePath = useLocalePath();
const locationStore = useLocationStore();
const { isServiceable } = useCityService();

const productStartPrice = computed(() => {
  const price = product.priceWithTax;
  if (!price) return "";

  const currency = product.currencyCode ?? "EUR";

  if ("min" in price && "max" in price) {
    const min = (price.min / 100).toFixed(2);
    const max = (price.max / 100).toFixed(2);
    return min === max
      ? `${min} ${currency}`
      : `${t("messages.shop.priceFrom")} ${min} ${currency}`;
  }

  const value = (price.value / 100).toFixed(2);
  return `${value} ${currency}`;
});

const imageSrc = computed(
  () => assetSrc(product?.productAsset?.preview, 700) || "/images/placeholder.webp",
);

// 超区判断（依赖 serviceInfo 提供的 belongCity/serviceCities；未定位或未配置则视为可售）
const serviceable = computed(() =>
  isServiceable({
    customFields: serviceInfo as {
      belongCity?: string | null;
      serviceCities?: Array<string | null> | null;
    } | null,
  }),
);
</script>

<template>
  <article>
    <UCard
      variant="outline"
      class="relative isolate mb-4 shadow"
      :ui="{ body: 'sm:p-0 p-0' }"
    >
      <NuxtImg
        format="webp"
        class="h-[250px] w-full rounded object-cover sm:h-[300px] lg:h-[325px] xl:h-[350px]"
        :src="imageSrc"
        :alt="product.productName"
        :loading="eager ? 'eager' : 'lazy'"
        placeholder
        placeholder-class="blur-xl"
        sizes="100vw sm:50vw lg:33vw xl:25vw"
      />

      <!-- 超区提示（仅已定位且该商品在列表页被识别为超区时显示） -->
      <div
        v-if="!serviceable"
        class="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-warning-600/90 px-2.5 py-1 text-xs font-medium text-white shadow"
      >
        <UIcon name="i-lucide-map-pin-off" class="h-3.5 w-3.5" />
        {{ t("messages.shop.outOfArea") }}
      </div>

      <template #footer>
        <h3>
          <ULink :to="localePath(`/product/${product.slug}`)">
            <span class="absolute inset-0 z-10"></span>
            {{ product.productName }}
          </ULink>
        </h3>
        <span>{{ productStartPrice }}</span>
      </template>
    </UCard>
  </article>
</template>

<style lang="css" scoped></style>
