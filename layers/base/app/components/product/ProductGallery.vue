<script setup lang="ts">
import { computed } from "vue";
import { assetSrc } from "../../utils/image";

const { product, selectedVariant, galleryAssets, mediaAssets } =
  storeToRefs(useProductStore());
// firstIsVideo: 首项为视频（视频优先）
const firstIsVideo = computed(() => mediaAssets.value[0]?.type === "video");
// 首帧视频 src（仅在 firstIsVideo 时使用）
const videoSrc = computed(() => mediaAssets.value[0]?.src ?? "");

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
  <div class="w-full flex-1">
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
    <UCarousel
      v-else
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

    <div class="mx-auto flex max-w-xs items-center justify-center gap-4 pt-4">
      <div v-if="firstIsVideo" class="relative shrink-0">
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
        class="opacity-25 transition-opacity hover:opacity-100"
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
  </div>
</template>

<style lang="css" scoped></style>
