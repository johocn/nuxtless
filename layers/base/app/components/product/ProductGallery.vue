<script setup lang="ts">
import { computed } from "vue";
import { assetSrc } from "../../utils/image";
import { resolveMarketingTagTexts } from "../../utils/marketing-tags";

const { product, selectedVariant, galleryAssets, mediaAssets } =
  storeToRefs(useProductStore());
// firstIsVideo: 首项为视频（视频优先）
const firstIsVideo = computed(() => mediaAssets.value[0]?.type === "video");
// 首帧视频 src（仅在 firstIsVideo 时使用）
const videoSrc = computed(() => mediaAssets.value[0]?.src ?? "");

// 营销标签：customFields.marketingTags（code 数组）→ i18n 字典映射，未知 code 按原文兜底
const { tm } = useI18n();
const marketingTagTexts = computed(() =>
  resolveMarketingTagTexts(
    product.value?.customFields?.marketingTags ?? [],
    (tm("messages.detail.marketingTags") ?? {}) as Record<string, string>,
  ),
);

function scrollVideoTop() {
  document.getElementById("gallery-video")?.scrollIntoView({ behavior: "smooth" });
}

const carousel = useTemplateRef("carousel");
const activeIndex = ref(0);

function onClickPrev() {
  activeIndex.value--;
}
function onClickNext() {
  activeIndex.value++;
}
function onSelect(index: number) {
  activeIndex.value = index;
}

function select(index: number) {
  activeIndex.value = index;

  carousel.value?.emblaApi?.scrollTo(index);
}

const { openPhotoSwipe } = useProductLightbox({ select });
</script>

<template>
  <div class="relative w-full flex-1">
    <video
      v-if="firstIsVideo"
      id="gallery-video"
      :src="videoSrc"
      class="mx-auto h-62.5 w-full rounded-lg object-contain sm:h-87.5"
      autoplay
      muted
      loop
      playsinline
      preload="metadata"
      controls
    />
    <div class="relative w-full">
      <UCarousel
        v-if="!firstIsVideo"
        ref="carousel"
        v-slot="{ item }"
        :items="galleryAssets"
        :prev="{ onClick: onClickPrev }"
        :next="{ onClick: onClickNext }"
        class="mx-auto w-full"
        @select="onSelect"
      >
        <NuxtImg
          class="mx-auto h-62.5 cursor-pointer rounded-lg object-contain transition-transform hover:opacity-90 sm:h-87.5 sm:object-cover"
          :src="assetSrc(item.preview, 700)"
          :alt="`${selectedVariant?.name || product?.name || 'Product image'} – Slide ${activeIndex + 1}`"
          :loading="activeIndex === 0 ? 'eager' : 'lazy'"
          :preload="activeIndex === 0"
          sizes="350px sm:40vw"
          placeholder
          placeholder-class="blur-xl"
          role="button"
          tabindex="0"
          @click="() => openPhotoSwipe(activeIndex)"
        />
      </UCarousel>
      <span
        v-if="!firstIsVideo && galleryAssets.length > 1"
        class="absolute left-2 top-2 z-10 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white"
        >{{ activeIndex + 1 }}/{{ galleryAssets.length }}</span
      >
    </div>

    <!-- 缩略图条：可横滑，图多时完整滑动查看（去掉 max-w-xs 固定宽与居中） -->
    <div class="no-scrollbar mx-auto flex w-full items-center gap-3 overflow-x-auto px-4 pt-4 snap-x">
      <div v-if="firstIsVideo" class="relative shrink-0 snap-start">
        <video
          :src="videoSrc"
          class="h-11.25 w-11.25 rounded-lg object-cover"
          muted
          preload="metadata"
        />
        <span
          class="absolute bottom-0 right-0 cursor-pointer rounded bg-black/60 px-0.5 text-[9px] text-white"
          title="回到视频"
          @click="scrollVideoTop"
          >▶</span
        >
      </div>
      <div
        v-for="(item, index) in galleryAssets"
        :key="item.id"
        class="shrink-0 snap-start opacity-25 transition-opacity hover:opacity-100"
        :class="{ 'opacity-100': activeIndex === index }"
        @click="select(index)"
      >
        <NuxtImg
          class="h-11.25 w-11.25 rounded-lg object-cover"
          :src="assetSrc(item.preview, 90)"
          :alt="`${selectedVariant?.name || product?.name || 'Product image'} – Thumb ${index + 1}`"
          loading="eager"
          preload
          sizes="45px"
          placeholder
          placeholder-class="blur-xl"
        />
      </div>
    </div>
    <!-- 营销标签角标：商品图片/视频右上角叠层 -->
    <div
      v-if="marketingTagTexts.length"
      class="absolute right-2 top-2 z-10 flex flex-col items-end gap-1"
    >
      <span
        v-for="tag in marketingTagTexts"
        :key="tag"
        class="rounded bg-red-500/90 px-1.5 py-0.5 text-xs font-medium text-white"
      >{{ tag }}</span>
    </div>
  </div>
</template>

<style lang="css" scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
