<script setup lang="ts">
// JD 风格功能宫格（京东模板为十宫格圆形图标）。
// 系统里没有的功能(秒送/领券/会员/生活等)不强凑，全部换成 nshop 已有真实能力：
//   - 顶部分类入口（前 4 个动态取分类，跳对应分类页）
//   - 我的订单 / 我的 / 售后 / 去结算 → 真实账号/结算路由
//   - 购物车 → 全局 CartPanel 弹层
//   - 全部分类 → 分类抽屉(isAllCatOpen)
// 支持积木装修传入 shape/layout/items；缺省回退京东现状（圆形十宫格 + 自动 items）
import type { MenuCollections } from "~~/types/collection";
import { assetSrc } from "../../../utils/image";
import type { NavShape, NavLayout } from "../../../utils/shop-content";

interface GridItem {
  label: string;
  img?: string;
  emoji?: string;
  path?: string;
  cart?: boolean;
  drawer?: boolean;
}

const props = withDefaults(
  defineProps<{
    shape?: NavShape;
    layout?: NavLayout;
    items?: GridItem[];
  }>(),
  {
    shape: "round",      // 兜底（无装修）保持现状圆形；积木场景由 NavGrid 按京东默认传入 square
    layout: "grid5x2",
    items: () => [],
  },
);

const localePath = useLocalePath();
const isCartOpen = useState<boolean>("isCartOpen", () => false);
const isAllCatOpen = useState<boolean>("isAllCatOpen", () => false);
const { t } = useI18n();

const menuCollections = useState<MenuCollections>("menuCollections");
const cats = computed(() => menuCollections.value?.collections?.items ?? []);

function linkFor(slug: string) {
  return slug ? localePath(`/category/${slug}`) : localePath("/");
}

// 自动兜底宫格：前 4 个为分类入口，其余为固定功能入口
// 图标策略：分类有 featuredAsset 图用图；无图回退 emoji；固定项一律 emoji 文本（勿当图片 URL 加载）
const fixedItems = computed<GridItem[]>(() => [
  { label: t("messages.account.orders"), emoji: "📦", path: "/account/orders" },
  { label: t("messages.nav.cart"), emoji: "🛒", cart: true },
  { label: t("messages.nav.my"), emoji: "👤", path: "/account" },
  { label: t("messages.account.afterSales"), emoji: "🔁", path: "/account/after-sales" },
  { label: t("messages.nav.allCategories"), emoji: "📋", drawer: true },
  { label: t("messages.shop.checkout"), emoji: "💳", path: "/checkout" },
]);

const autoItems = computed<GridItem[]>(() => {
  const top = cats.value.slice(0, 4).map((c) => ({
    label: c.name,
    img: c.featuredAsset?.preview,
    emoji: "🏷️",
    path: linkFor(c.slug),
  }));
  return [...top, ...fixedItems.value];
});

// 配置优先，自动兜底
const gridItems = computed<GridItem[]>(() =>
  props.items.length ? props.items : autoItems.value,
);

function onClick(item: GridItem) {
  if (item.cart) isCartOpen.value = true;
  else if (item.drawer) isAllCatOpen.value = true;
}
</script>

<template>
  <section class="mx-2 mt-2 rounded-lg bg-white p-2">
    <!-- row：单行横向滚动 -->
    <div v-if="layout === 'row'" class="flex gap-3 overflow-x-auto px-1 py-1.5">
      <NuxtLink
        v-for="(item, i) in gridItems"
        :key="i"
        :to="item.path ? localePath(item.path) : undefined"
        class="flex shrink-0 flex-col items-center gap-1 py-1"
        @click="onClick(item)"
      >
        <span
          :class="[
            'flex h-11 w-11 items-center justify-center overflow-hidden bg-primary/10 text-lg',
            shape === 'square' ? 'rounded-lg' : 'rounded-full',
          ]"
        >
          <NuxtImg
            v-if="item.img"
            :src="assetSrc(item.img, 176)"
            width="176"
            loading="lazy"
            class="h-full w-full object-cover"
            alt=""
          />
          <template v-else>{{ item.emoji }}</template>
        </span>
        <span class="max-w-[4.5rem] truncate text-xs text-gray-700">{{ item.label }}</span>
      </NuxtLink>
    </div>

    <!-- 宫格：grid4x2 淘宝八宫格 / 默认 grid5x2 京东十宫格 -->
    <div
      v-else
      :class="layout === 'grid4x2' ? 'grid grid-cols-4 gap-y-2' : 'grid grid-cols-5 gap-y-2'"
    >
      <NuxtLink
        v-for="(item, i) in gridItems"
        :key="i"
        :to="item.path ? localePath(item.path) : undefined"
        class="flex flex-col items-center gap-1 py-1.5"
        @click="onClick(item)"
      >
        <span
          :class="[
            'flex h-11 w-11 items-center justify-center overflow-hidden bg-primary/10 text-lg',
            shape === 'square' ? 'rounded-lg' : 'rounded-full',
          ]"
        >
          <NuxtImg
            v-if="item.img"
            :src="assetSrc(item.img, 176)"
            width="176"
            loading="lazy"
            class="h-full w-full object-cover"
            alt=""
          />
          <template v-else>{{ item.emoji }}</template>
        </span>
        <span class="max-w-[4.5rem] truncate text-xs text-gray-700">{{ item.label }}</span>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped></style>