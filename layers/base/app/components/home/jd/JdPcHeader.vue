<script setup lang="ts">
// JD 风格 PC 顶栏：品牌 + 实时搜索 + 热词
// 搜索复用 nshop 的 useSimpleSearch（与 SearchModal 同数据源，商品点按进详情页），
// 无需独立的搜索结果页路由。
import type { TopLevelCollection } from "~~/types/collection";

defineProps<{ categories: TopLevelCollection[] }>();
const localePath = useLocalePath();
const { term, results, pending } = useSimpleSearch();

const focused = ref(false);
// 延迟关闭下拉，留出点击结果项的时间
function onBlur() {
  setTimeout(() => (focused.value = false), 200);
}
function submit() {
  if (results.value.length === 1) {
    navigateTo(localePath(`/product/${results.value[0].slug}`));
  }
}
</script>

<template>
  <div class="border-b border-gray-100 bg-white">
    <div class="mx-auto flex max-w-[1240px] items-center gap-6 px-4 py-4">
      <NuxtLink
        :to="localePath('/')"
        class="shrink-0 text-2xl font-bold italic text-[#e6162d]"
      >
        youShop<sup class="align-super text-[9px] text-black/70">JD</sup>
      </NuxtLink>

      <!-- 搜索区 -->
      <div class="relative w-full max-w-xl flex-1">
        <form class="flex" @submit.prevent="submit">
          <input
            v-model="term"
            type="text"
            placeholder="搜点什么…"
            class="w-full rounded-l-lg border-2 border-[#e6162d] px-4 py-2 text-sm outline-none"
            @focus="focused = true"
            @blur="onBlur"
          />
          <button
            type="submit"
            class="rounded-r-lg bg-[#e6162d] px-8 py-2 text-sm font-semibold text-white"
          >
            搜索
          </button>
        </form>

        <!-- 实时下拉结果 -->
        <div
          v-if="focused && (pending || term)"
          class="absolute top-full left-0 right-0 z-40 mt-1 overflow-hidden rounded-md border border-gray-100 bg-white shadow-lg"
        >
          <p v-if="pending" class="px-4 py-3 text-sm text-gray-400">加载中…</p>
          <template v-else>
            <NuxtLink
              v-for="item in results"
              :key="item.slug"
              :to="localePath(`/product/${item.slug}`)"
              class="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <NuxtImg
                v-if="item.productAsset?.preview"
                :src="item.productAsset.preview"
                format="webp"
                class="h-8 w-8 rounded object-cover"
              />
              <UIcon v-else name="i-lucide-package" class="h-4 w-4 text-gray-400" />
              <span class="truncate">{{ item.productName }}</span>
            </NuxtLink>
            <p v-if="!results.length" class="px-4 py-3 text-sm text-gray-400">
              无匹配商品
            </p>
          </template>
        </div>
      </div>

      <!-- 热词 -->
      <div class="hidden shrink-0 flex-col gap-1 text-xs text-gray-500 md:flex">
        <div class="flex gap-3">
          <template v-for="cat in categories" :key="cat.slug">
            <NuxtLink
              v-if="cat.name"
              :to="localePath(`/category/${cat.slug}`)"
              class="hover:text-[#e6162d]"
            >
              {{ cat.name }}
            </NuxtLink>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="css" scoped></style>