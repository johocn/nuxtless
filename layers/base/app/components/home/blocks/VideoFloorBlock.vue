<script setup lang="ts">
// 视频楼层：零数据依赖，配置即渲染（与 vshop VideoSection、后台 schema 对齐）。
// title 双语经 localizeText 逐级回退；无 videoUrl 不渲染（后台校验必填，此处仅防御脏数据）。
import { localizeText } from "../../../utils/detail-config";
import type { VideoSection } from "../../../utils/shop-content";

const props = defineProps<{ section: VideoSection }>();
const { t, locale } = useI18n();
const toast = useToast();

const title = computed(() => localizeText(props.section?.title, locale.value) || t("messages.home.videoFloor"));
const videoUrl = computed(() => (props.section?.videoUrl || "").trim());

function onError() {
  toast.add({ title: t("messages.home.videoLoadFail"), color: "error" });
}
</script>

<template>
  <section v-if="videoUrl" class="mt-2 rounded-lg bg-white p-3">
    <h2 class="mb-3 text-base font-bold text-gray-800">{{ title }}</h2>
    <video
      class="aspect-video w-full rounded-lg bg-black"
      :src="videoUrl"
      :poster="section.poster || undefined"
      controls
      playsinline
      preload="metadata"
      @error="onError"
    />
  </section>
</template>
