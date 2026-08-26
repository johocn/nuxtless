<script setup lang="ts">
// JD 风格横向分类导航条（京东红底、横向滚动）
// 数据来源：顶部分类(collection)，复用 GetMenuCollections 已加载的 menuCollections 状态
const props = defineProps<{
  categories: Array<{ name: string; slug: string }>;
}>();
const localePath = useLocalePath();

function linkFor(cat: { slug?: string }) {
  return cat.slug ? localePath(`/category/${cat.slug}`) : localePath("/");
}
</script>

<template>
  <nav
    class="no-scrollbar sticky top-[52px] z-30 flex items-center gap-2 overflow-x-auto bg-primary px-3 py-2"
    aria-label="分类导航"
  >
    <span class="shrink-0 text-sm font-bold text-white">全部</span>
    <template v-for="cat in categories" :key="cat.slug + cat.name">
      <NuxtLink
        :to="linkFor(cat)"
        class="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs text-white/90 transition hover:bg-white/15 hover:text-white"
      >
        {{ cat.name }}
      </NuxtLink>
    </template>
  </nav>
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