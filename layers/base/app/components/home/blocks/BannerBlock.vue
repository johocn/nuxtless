<script setup lang="ts">
// banner 区块适配：配置优先、自动兜底（与 JdFunctionGrid「items 为空回退自动数据」同模式）。
// images 为空 → 回退首页运营内容（GetHomeContent）的 Banner 块；都为空时由 JdBannerCarousel 渲染占位。
import JdBannerCarousel from "../jd/JdBannerCarousel.vue";
import { isHero } from "../../../utils/home-content";
import type { BannerSection } from "../../../utils/shop-content";

const props = defineProps<{ section: BannerSection }>();

// useHomeContent 与首页页面级调用共用同一 useAsyncData key（payload 去重，不额外发请求）
const { content } = await useHomeContent();

const slides = computed(() => {
  const configured = (props.section?.images ?? []).filter((im) => !!im?.image);
  if (configured.length) {
    return configured.map((im, i) => ({ imageUrl: im.image, link: im.link, title: `slide-${i}` }));
  }
  return (content.value ?? [])
    .map((b) => b.data ?? {})
    .filter((d: any) => isHero(d))
    .map((d: any) => ({
      imageUrl: (d as any).imageUrl,
      link: (d as any).link,
      title: (d as any).title || (d as any).subTitle,
    }));
});
</script>

<template>
  <JdBannerCarousel :slides="slides" />
</template>