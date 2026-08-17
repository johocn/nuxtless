<script setup lang="ts">
import { toSearchResultCard } from "../../utils/home-content";
import type { FloorBlockData } from "../../utils/home-content";
import type { SearchResult } from "~~/types/product";

const props = defineProps<{ block: FloorBlockData }>();

const { data: productsData } = await useAsyncData(
  `home-floor-${props.block.title}`,
  async () => {
    const ids = props.block.items.map(String);
    if (!ids.length) return { items: [] };
    const { data } = await useAsyncGql("GetProductsByIds", { ids });
    return data.value?.products ?? { items: [] };
  },
);

const cards = computed<SearchResult>(() =>
  (productsData.value?.items ?? []).map(
    (item) => toSearchResultCard(item) as SearchResult[number],
  ),
);
</script>

<template>
  <section class="mb-12" aria-label="楼层">
    <h2 class="mb-4 text-2xl font-semibold">{{ block.title }}</h2>
    <p v-if="!cards.length" class="text-sm text-neutral-500">敬请期待</p>
    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <ProductCard
        v-for="(product, index) in cards"
        :key="product.slug"
        :product="product"
        :eager="index < 4"
      />
    </div>
  </section>
</template>