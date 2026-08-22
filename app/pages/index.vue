<script setup lang="ts">
import { resolveBlockKind } from "../../layers/base/app/utils/home-content-block";
import type { Component } from "vue";
// 显式 import 组件并以对象作动态 :is，确保客户端 Vite 能静态分析并正确打包，
// 避免字符串组件名被当作 custom element 渲染成空标签。
import HomeOperationalHero from "../../layers/base/app/components/home/OperationalHero.vue";
import HomeOperationalFloor from "../../layers/base/app/components/home/OperationalFloor.vue";
import HomeBlocksIconGrid from "../../layers/base/app/components/home/blocks/IconGrid.vue";
import HomeBlocksCategoryNav from "../../layers/base/app/components/home/blocks/CategoryNav.vue";
import HomeBlocksNoticeBar from "../../layers/base/app/components/home/blocks/NoticeBar.vue";
import HomeBlocksRecommendationRow from "../../layers/base/app/components/home/blocks/RecommendationRow.vue";
import HomeFlashSalePlaceholder from "../../layers/base/app/components/home/FlashSalePlaceholder.vue";

const { t } = useI18n();
const { content } = await useHomeContent();

const blocks = computed(() => content.value ?? []);
const hasOperational = computed(() => blocks.value.length > 0);

// 按 sort 有序渲染，并累加所有 ContentItem 类型（Banner/Recommendation/Notice/Floor/IconGrid/CategoryNav…）
const orderedBlocks = computed(() => [...blocks.value].sort((a, b) => a.sort - b.sort));

const blockRegistry: Record<string, Component> = {
  Banner: HomeOperationalHero,
  Recommendation: HomeBlocksRecommendationRow,
  Notice: HomeBlocksNoticeBar,
  Floor: HomeOperationalFloor,
  IconGrid: HomeBlocksIconGrid,
  CategoryNav: HomeBlocksCategoryNav,
};

function blockComponent(t: string) {
  return blockRegistry[resolveBlockKind({ type: t, data: {} })] ?? HomeOperationalFloor;
}

// 把 data 摊平进 block：既让 Banner/Floor 组件能读到 imageUrl/title/layout/items 这些顶层字段，
// 也保留原 data 引用供 IconGrid 等新组件经 block.data.items 使用（Vue 允许为组件传多余属性）。
function normalizeBlock(b: { type: string; data?: any; id: string; sort: number; name?: string }) {
  return { ...b, ...(b.data ?? {}) };
}
</script>

<template>
  <main>
    <h1 class="sr-only">{{ t("messages.site.tagline") }}</h1>

    <template v-if="hasOperational">
      <component
        :is="blockComponent(b.type)"
        v-for="b in orderedBlocks"
        :key="b.id"
        :block="normalizeBlock(b)"
      />
      <HomeFlashSalePlaceholder />
    </template>

    <!-- 兜底：无运营位时展示默认 hero + 固定三区块 -->
    <template v-else>
      <section class="mb-14" aria-labelledby="home-hero-heading">
        <h2 id="home-hero-heading" class="sr-only">
          {{ t("messages.pages.index.welcome") }} {{ t("messages.site.title") }}
        </h2>
        <div class="">
          <NuxtImg
            format="webp"
            class="h-105 w-full object-cover lg:h-140 xl:h-135"
            src="/hero.avif"
            alt="Hero image"
            loading="eager"
            sizes="sm:100vw md:1600px"
            fetchpriority="high"
            preload
          />
        </div>
      </section>

      <div class="container">
        <section class="mb-14" aria-labelledby="home-categories-heading">
          <h2 id="home-categories-heading" class="mb-4 text-2xl font-semibold">
            {{ t("messages.shop.shopByCategory") }}
          </h2>
          <HomeCategoryCarousel />
        </section>

        <section class="mt-20 mb-14" aria-labelledby="home-features-heading">
          <h2 id="home-features-heading" class="sr-only">Why Shop With Us</h2>
          <HomeShopFeatures />
        </section>

        <section class="mb-14" aria-labelledby="home-products-heading">
          <h2 id="home-products-heading" class="mb-4 text-2xl font-semibold">
            {{ t("messages.shop.popularProducts") }}
          </h2>
          <HomeFeaturedProducts />
        </section>
      </div>
    </template>
  </main>
</template>

<style lang="css" scoped></style>