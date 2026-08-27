<script setup lang="ts">
// richText 区块：渲染运营粘贴的 HTML 片段
import type { RichTextSection } from "../../../utils/shop-content";

const props = defineProps<{ section: RichTextSection }>();
</script>

<template>
  <!-- 运营上传内容，v-html 为既有能力；样式由贴入片段自带 -->
  <section class="mx-2 mt-2 overflow-hidden rounded-lg bg-white" v-html="props.section.html" />
</template>