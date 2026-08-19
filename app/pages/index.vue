<script setup lang="ts">
import type { HeroBlockData, FloorBlockData } from "../../layers/base/app/utils/home-content";
import { isHero, isFloor } from "../../layers/base/app/utils/home-content";

const { t } = useI18n();
const { content } = await useHomeContent();

const blocks = computed(() => content.value ?? []);
const hasOperational = computed(() => blocks.value.length > 0);

const banners = computed<Array<HeroBlockData & { id: string; sort: number }>>(() =>
  blocks.value
    .filter((b) => isHero(b.data))
    .map((b) => ({ ...(b.data as HeroBlockData), id: b.id, sort: b.sort })),
);

const floors = computed<Array<FloorBlockData & { id: string; sort: number }>>(() =>
  blocks.value
    .filter((b) => isFloor(b.data))
    .map((b) => ({ ...(b.data as FloorBlockData), id: b.id, sort: b.sort })),
);
</script>

<template>
  <main>
    <h1 class="sr-only">{{ t("messages.site.tagline") }}</h1>

    <template v-if="hasOperational">
      <HomeOperationalHero v-for="b in banners" :key="b.id" :block="b" />
      <HomeOperationalFloor v-for="f in floors" :key="f.id" :block="f" />
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