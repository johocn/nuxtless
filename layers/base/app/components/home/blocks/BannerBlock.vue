<script setup lang="ts">
// banner 区块适配：shopContent 的 images → JdBannerCarousel slides
import JdBannerCarousel from "../jd/JdBannerCarousel.vue";
import type { BannerSection } from "../../../utils/shop-content";

const props = defineProps<{ section: BannerSection }>();

const slides = computed(() =>
  props.section.images.map((im, i) => ({
    imageUrl: im.image,
    link: im.link,
    title: `slide-${i}`,
  })),
);
</script>

<template>
  <JdBannerCarousel :slides="slides" />
</template>