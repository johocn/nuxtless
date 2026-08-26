<script setup lang="ts">
// JD 风格功能宫格（京东模板为十宫格圆形图标）。
// 系统里没有的功能(秒送/领券/会员/生活等)不强凑，全部换成 nshop 已有真实能力：
//   - 顶部分类入口（前 4 个动态取分类，跳对应分类页）
//   - 我的订单 / 我的 / 售后 / 去结算 → 真实账号/结算路由
//   - 购物车 → 全局 CartPanel 弹层
//   - 全部分类 → 分类抽屉(isAllCatOpen)
import type { MenuCollections } from "~~/types/collection";

const localePath = useLocalePath();
const isCartOpen = useState<boolean>("isCartOpen", () => false);
const isAllCatOpen = useState<boolean>("isAllCatOpen", () => false);

const menuCollections = useState<MenuCollections>("menuCollections");
const cats = computed(() => menuCollections.value?.collections?.items ?? []);

function linkFor(slug: string) {
  return slug ? localePath(`/category/${slug}`) : localePath("/");
}

// 动态宫格：前 4 个为分类入口，其余为固定功能入口
const fixedItems = [
  { label: "我的订单", icon: "📦", path: "/account/orders" },
  { label: "购物车", icon: "🛒", cart: true },
  { label: "我的", icon: "👤", path: "/account" },
  { label: "售后", icon: "🔁", path: "/account/after-sales" },
  { label: "全部分类", icon: "📋", drawer: true },
  { label: "去结算", icon: "💳", path: "/checkout" },
];

const gridItems = computed(() => {
  const top = cats.value.slice(0, 4).map((c) => ({
    label: c.name,
    icon: c.featuredAsset?.preview,
    path: linkFor(c.slug),
  }));
  return [...top, ...fixedItems];
});

function onClick(item: (typeof gridItems.value)[number]) {
  if (item.cart) isCartOpen.value = true;
  else if (item.drawer) isAllCatOpen.value = true;
}
</script>

<template>
  <section class="mx-2 mt-2 rounded-lg bg-white p-2">
    <div class="grid grid-cols-5 gap-y-2">
      <NuxtLink
        v-for="(item, i) in gridItems"
        :key="i"
        :to="item.path ? localePath(item.path) : undefined"
        class="flex flex-col items-center gap-1 py-1.5"
        @click="onClick(item)"
      >
        <span
          class="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg"
        >
          <NuxtImg
            v-if="typeof item.icon === 'string' && item.path"
            :src="item.icon"
            format="webp"
            class="h-full w-full object-cover"
            alt=""
          />
          <template v-else>{{ item.icon }}</template>
        </span>
        <span class="max-w-[4.5rem] truncate text-xs text-gray-700">{{ item.label }}</span>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped></style>