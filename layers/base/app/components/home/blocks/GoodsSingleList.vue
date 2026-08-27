<script setup lang="ts">
// 极简风商品单列：大图横卡（图左 + 价格/标题/按钮右）
import type { SearchResult } from "~~/types/product";
import { assetSrc } from "../../../utils/image";

type SearchItem = SearchResult[number];

const props = defineProps<{
  title: string;
  products: SearchItem[];
}>();
const localePath = useLocalePath();

function price(p?: SearchItem["priceWithTax"], cur?: string | null) {
  if (!p) return "";
  const c = cur ?? "CNY";
  if ("min" in p && "max" in p) {
    const min = (p.min / 100).toFixed(2);
    const max = (p.max / 100).toFixed(2);
    return min === max ? `¥${min}` : `${min}~${max}`;
  }
  return `¥${(p.value / 100).toFixed(2)}`;
}
</script>

<template>
  <section class="mx-2 mt-2 bg-white">
    <div class="flex items-center justify-between px-3 pb-2 pt-3">
      <h2 class="flex items-center gap-1 text-base font-bold">
        <span class="inline-block h-3.5 w-1 rounded bg-primary" />
        {{ title }}
      </h2>
    </div>
    <div class="space-y-2 px-3 pb-3">
      <NuxtLink
        v-for="p in products"
        :key="p.slug"
        :to="localePath(`/product/${p.slug}`)"
        class="flex items-center gap-3 rounded-lg border border-gray-100 p-2 transition active:scale-[0.99]"
      >
        <NuxtImg
          :src="assetSrc(p.productAsset?.preview || '/images/placeholder.webp', 300)"
          width="300"
          loading="lazy"
          class="h-20 w-20 shrink-0 rounded bg-gray-100 object-cover"
          alt=""
        />
        <div class="min-w-0 flex-1">
          <p class="line-clamp-2 text-sm leading-5 text-gray-700">{{ p.productName }}</p>
          <div class="mt-1 flex items-center gap-2">
            <span class="text-lg font-bold text-primary">{{ price(p.priceWithTax, p.currencyCode) }}</span>
            <span class="rounded bg-primary/10 px-1 text-[10px] text-primary">自营</span>
          </div>
        </div>
        <span class="shrink-0 rounded bg-primary px-3 py-1.5 text-xs text-white">去购买</span>
      </NuxtLink>
    </div>
  </section>
</template>