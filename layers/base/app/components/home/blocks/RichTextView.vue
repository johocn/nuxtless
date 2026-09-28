<script setup lang="ts">
// richText 区块：渲染运营粘贴的 HTML 片段（渲染前经白名单净化，防存储型 XSS）
import type { RichTextSection } from "../../../utils/shop-content";
import { sanitizeRichText } from "../../../utils/sanitize-html";

const props = defineProps<{ section: RichTextSection }>();
const safeHtml = computed(() => sanitizeRichText(props.section.html));
</script>

<template>
  <section class="mx-2 mt-2 overflow-hidden rounded-lg bg-white" v-html="safeHtml" />
</template>
