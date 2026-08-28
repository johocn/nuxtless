<script setup lang="ts">
// JD 风格「品牌闪购」横向楼层（品牌 logo 横向滚动墙）
// nshop 无独立品牌(channel)列表数据，不强造品牌，改为复用顶部分类(collection)的
// 封面图( featuredAsset )作为品牌 logo，点击进入对应分类页，符合"系统中没有的功能用已有方案替换"。
import type { MenuCollections } from "~~/types/collection";
import { assetSrc } from "../../../utils/image";

const localePath = useLocalePath();
const { t } = useI18n();
const menuCollections = useState<MenuCollections>("menuCollections");
const cats = computed(() => menuCollections.value?.collections?.items ?? []);

function linkFor(slug: string) {
  return slug ? localePath(`/category/${slug}`) : localePath("/");
}
</script>

<template>
  <section class="mx-2 mt-2 rounded-lg bg-white p-3">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-base font-bold text-gray-800">{{ t('messages.nav.brandFlash') }}</h2>
      <NuxtLink :to="cats[0] ? linkFor(cats[0].slug) : localePath('/')" class="text-xs text-primary">
        {{ t('messages.nav.viewMore') }} ›
      </NuxtLink>
    </div>

    <div class="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      <NuxtLink
        v-for="cat in cats"
        :key="cat.slug + cat.name"
        :to="linkFor(cat.slug)"
        class="flex w-[76px] shrink-0 flex-col items-center gap-1.5"
      >
        <span class="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-gray-100 bg-gray-50">
          <NuxtImg
            v-if="cat.featuredAsset?.preview"
            :src="assetSrc(cat.featuredAsset.preview, 112)"
            width="112"
            loading="lazy"
            class="h-full w-full object-cover"
            alt=""
          />
          <UIcon v-else name="i-lucide-store" class="h-6 w-6 text-gray-300" />
        </span>
        <span class="block max-w-full truncate text-center text-xs text-gray-600">
          {{ cat.name }}
        </span>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>