<script setup lang="ts">
// 简单实现路径：读取 data.items（[{name, slug, imageUrl, price}]）横向渲染卡片，
// 避免额外 GraphQL 取数（productIds -> GetProductsByIds）的复杂度。
import { assetSrc } from "../../../utils/image";

const props = defineProps<{
  block: {
    id: string;
    data: { items?: Array<{ name?: string; slug?: string; imageUrl?: string; price?: number }> };
  };
}>();

const localePath = useTenantLocalePath();
const { t } = useI18n();

// 无 slug 的商品不可路由（路由为 /product/[slug]）：过滤掉、不渲染可点卡片；
// 仅告警一次，便于运营发现数据问题（不静默、也不阻塞其余商品展示）。
let warnedMissingSlug = false;
const items = computed(() =>
  (props.block.data?.items ?? []).filter((it) => {
    if (it.slug) return true;
    if (!warnedMissingSlug) {
      warnedMissingSlug = true;
      console.warn("[RecommendationRow] 存在无 slug 的商品，已跳过其可点卡片", it);
    }
    return false;
  }),
);
</script>
<template>
  <section v-if="items.length" class="mx-auto max-w-5xl px-4 py-8" aria-label="推荐">
    <h2 class="mb-4 text-2xl font-semibold">{{ t('messages.general.recommendations') }}</h2>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <NuxtLink
        v-for="(it, index) in items"
        :key="(it.slug ?? '') + String(index)"
        :to="localePath(`/product/${it.slug}`)"
        class="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 transition hover:border-primary"
      >
        <NuxtImg
          v-if="it.imageUrl"
          class="h-28 w-full object-cover"
          :src="assetSrc(it.imageUrl, 300)"
          :alt="it.name"
          loading="lazy"
        />
        <span class="line-clamp-1 text-sm text-gray-700">{{ it.name }}</span>
        <span v-if="it.price" class="text-sm font-semibold text-primary">¥{{ it.price }}</span>
      </NuxtLink>
    </div>
  </section>
</template>