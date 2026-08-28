<script setup lang="ts">
// JD 风格商品楼层：标题 + 2 列紧凑商品卡（图 / 标题 / 京东价 / 销量标签）
// 数据来源：复用 SearchProducts 商品搜索结果（与 ProductCard 同源 Vendure 数据）
import type { SearchResult } from "~~/types/product";
import { assetSrc } from "../../../utils/image";

type SearchItem = SearchResult[number];

const { t } = useI18n();
defineProps<{
  title: string;
  products: SearchItem[];
}>();
const localePath = useLocalePath();

function format(currencyCode?: string | null, price?: SearchItem["priceWithTax"] | null) {
  if (!price) return "";
  const cur = currencyCode ?? "CNY";
  if ("min" in price && "max" in price) {
    const min = (price.min / 100).toFixed(2);
    const max = (price.max / 100).toFixed(2);
    return min === max ? `¥${min}` : `${min}~${max}`;
  }
  return `¥${(price.value / 100).toFixed(2)}`;
}
</script>

<template>
  <section class="bg-white">
    <div class="flex items-center justify-between px-3 pb-2 pt-3">
      <h2 class="flex items-center gap-1 text-base font-bold">
        <span class="inline-block h-3.5 w-1 rounded bg-primary" />
        {{ title }}
      </h2>
      <NuxtLink :to="localePath('/')" class="text-xs text-gray-400">{{ t('messages.nav.more') }}</NuxtLink>
    </div>
    <div class="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 xl:gap-3">
      <NuxtLink
        v-for="p in products"
        :key="p.slug"
        :to="localePath(`/product/${p.slug}`)"
        class="group overflow-hidden rounded-lg border border-gray-100 transition active:scale-[0.98]"
      >
        <div class="relative">
          <NuxtImg
            :src="assetSrc(p.productAsset?.preview || '/images/placeholder.webp', 300)"
            width="300"
            loading="lazy"
            class="aspect-square w-full bg-gray-100 object-cover"
          />
          <span class="absolute bottom-1 left-1 rounded bg-primary px-1 py-0.5 text-[9px] text-white">
            {{ t("messages.shop.popularProducts") }}
          </span>
        </div>
        <div class="p-2">
          <p class="line-clamp-2 min-h-8 text-xs leading-4 text-gray-700">{{ p.productName }}</p>
          <p class="mt-1 text-base font-bold text-primary">{{ format(p.currencyCode, p.priceWithTax) }}</p>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>