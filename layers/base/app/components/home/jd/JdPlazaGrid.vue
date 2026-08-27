<script setup lang="ts">
// JD 风格「品质专区」卡片区（2 列网格）
// 说明：nshop 前端无多租户商户(channel)列表数据，此处复用真实顶部分类(collection)作为专区入口，
// 卡片展示分类封面图 + 名称 + 子分类描述，跳转到对应分类商品页
import { assetSrc } from "../../../utils/image";
defineProps<{
  categories: Array<{
    name: string;
    slug: string;
    featuredAsset?: { preview?: string } | null;
    children?: Array<{ name: string }>;
  }>;
}>();
const localePath = useLocalePath();
</script>

<template>
  <section class="bg-white">
    <div class="flex items-center justify-between px-3 pb-2 pt-3">
      <h2 class="flex items-center gap-1 text-base font-bold">
        <span class="inline-block h-3.5 w-1 rounded bg-primary" />
        品质专区
      </h2>
    </div>
    <div class="grid grid-cols-2 gap-2 px-3 pb-3 md:grid-cols-4 xl:pt-1">
      <NuxtLink
        v-for="cat in categories"
        :key="cat.slug + cat.name"
        :to="localePath(`/category/${cat.slug}`)"
        class="flex items-center gap-2 overflow-hidden rounded-lg border border-gray-100 p-2 transition active:scale-[0.98]"
      >
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-400"
        >
          <NuxtImg
            v-if="cat.featuredAsset?.preview"
            :src="assetSrc(cat.featuredAsset.preview, 176)"
            width="176"
            loading="lazy"
            class="h-11 w-11 object-cover"
          />
          <UIcon v-else name="i-lucide-box" class="h-5 w-5" />
        </span>
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-gray-800">{{ cat.name }}</span>
          <span v-if="cat.children?.length" class="block truncate text-[11px] text-gray-400">
            {{ cat.children.map((c) => c.name).join(" · ") }}
          </span>
        </span>
      </NuxtLink>
    </div>
  </section>
</template>