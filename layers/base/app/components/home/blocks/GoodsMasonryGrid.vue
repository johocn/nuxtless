<script setup lang="ts">
// 淘宝风商品瀑布流：双列大图卡（大图 + 价格 + 标题 + 底行）
import type { SearchResult } from "~~/types/product";
import { assetSrc } from "../../../utils/image";
import { pickDisplayPrice, pickCurrentCents } from "../../../utils/display-price";

type SearchItem = SearchResult[number];

const props = defineProps<{
  title: string;
  products: SearchItem[];
}>();
const localePath = useTenantLocalePath();
const { taxMode, pricesIncludeTax } = useTaxMode();

function price(p?: SearchItem, cur?: string | null) {
  const sel = pickDisplayPrice(p, taxMode.value, pricesIncludeTax.value);
  if (!sel) return "";
  const c = cur ?? "CNY";
  if ("min" in sel && "max" in sel) {
    const min = (sel.min / 100).toFixed(2);
    const max = (sel.max / 100).toFixed(2);
    return min === max ? `¥${min}` : `${min}~${max}`;
  }
  return `¥${(sel.value / 100).toFixed(2)}`;
}

// 划线原价（分→文本）：仅当带 listPriceCents 且大于现行价时输出删除线原价，避免倒挂
function listText(p?: SearchItem, cur?: string | null) {
  const list = (p as any)?.listPriceCents;
  if (typeof list !== "number" || list <= 0) return "";
  const current = pickCurrentCents(p, taxMode.value, pricesIncludeTax.value);
  if (current != null && list <= current) return "";
  return `¥${(list / 100).toFixed(2)}`;
}
</script>

<template>
  <section class="mx-2 mt-2 bg-white">
    <div class="flex items-center justify-between px-3 pb-2 pt-3">
      <h2 class="flex items-center gap-1 text-base font-bold">
        <span class="inline-block h-3.5 w-1 rounded bg-primary" />
        {{ title }}
      </h2>
      <NuxtLink :to="localePath('/')" class="text-xs text-gray-400">更多 ›</NuxtLink>
    </div>
    <div class="grid grid-cols-2 gap-2 px-2 pb-3">
      <NuxtLink
        v-for="p in products"
        :key="p.slug"
        :to="localePath(`/product/${p.slug}`)"
        class="overflow-hidden rounded-lg border border-gray-100 bg-white transition active:scale-[0.98]"
      >
        <NuxtImg
          :src="assetSrc(p.productAsset?.preview || '/images/placeholder.webp', 600)"
          width="600"
          loading="lazy"
          class="aspect-square w-full bg-gray-100 object-cover"
          alt=""
        />
        <div class="p-2">
          <p class="flex items-baseline gap-1">
            <span class="text-base font-bold text-primary">{{ price(p, p.currencyCode) }}</span>
            <span
              v-if="listText(p, p.currencyCode)"
              class="text-xs text-gray-400 line-through"
            >{{ listText(p, p.currencyCode) }}</span>
          </p>
          <p class="line-clamp-2 mt-1 min-h-8 text-xs leading-4 text-gray-700">{{ p.productName }}</p>
          <div class="mt-1.5 flex items-center justify-between text-[10px] text-gray-400">
            <span class="rounded bg-primary/10 px-1 py-0.5 text-primary">自营</span>
            <span>nshop</span>
          </div>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>