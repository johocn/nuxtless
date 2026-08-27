<script setup lang="ts">
// JD 风格 PC 左侧「全部分类」侧边栏：顶部一级分类，悬浮展开二级子分类子菜单
// 数据来源：顶部分类(collection)（GetMenuCollections 已加载到 menuCollections 状态）
import type { TopLevelCollection } from "~~/types/collection";
import { assetSrc } from "../../../utils/image";

defineProps<{ categories: TopLevelCollection[] }>();
const localePath = useLocalePath();

function linkFor(slug: string) {
  return slug ? localePath(`/category/${slug}`) : localePath("/");
}
</script>

<template>
  <aside class="bg-white shadow-sm">
    <div class="flex items-center justify-between bg-[#e6162d] px-4 py-2.5">
      <span class="text-sm font-semibold text-white">全部分类</span>
      <span class="text-xs text-white/80">全部商品</span>
    </div>
    <nav aria-label="全部分类">
      <template v-for="cat in categories" :key="cat.slug">
        <div class="group relative">
          <NuxtLink
            :to="linkFor(cat.slug)"
            class="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors group-hover:bg-[#fdeaea] group-hover:text-[#e6162d]"
          >
            <span class="flex min-w-0 items-center gap-2">
              <NuxtImg
                v-if="cat.featuredAsset?.preview"
                :src="assetSrc(cat.featuredAsset.preview, 40)"
                class="h-5 w-5 shrink-0 rounded object-cover"
              />
              <UIcon v-else name="i-lucide-folder" class="h-4 w-4 shrink-0 text-gray-400" />
              <span class="truncate">{{ cat.name }}</span>
            </span>
            <UIcon v-if="cat.children?.length" name="i-lucide-chevron-right" class="h-3.5 w-3.5 shrink-0" />
          </NuxtLink>

          <!-- 悬浮展开二级分类 -->
          <div
            v-if="cat.children?.length"
            class="invisible absolute top-0 left-full z-30 w-60 rounded border border-gray-100 bg-white p-3 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100"
          >
            <p class="mb-2 text-sm font-semibold text-[#e6162d]">{{ cat.name }}</p>
            <ul class="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <li v-for="child in cat.children" :key="child.slug">
                <NuxtLink
                  :to="linkFor(child.slug)"
                  class="block truncate text-xs text-gray-600 hover:text-[#e6162d]"
                >
                  {{ child.name }}
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </template>
    </nav>
  </aside>
</template>

<style lang="css" scoped></style>