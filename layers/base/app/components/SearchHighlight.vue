<script setup lang="ts">
import { computed } from "vue";
import { sanitizeSearchHighlight } from "../utils/sanitize-html";

const props = defineProps<{
  /** Meili 高亮副本（可能含原文 HTML，必须净化后才能渲染） */
  formatted?: string | null;
  /** 原文；仅在有 formatted 时作为回退，走纯文本插值 */
  text?: string | null;
}>();

const safeHtml = computed(() =>
  props.formatted ? sanitizeSearchHighlight(props.formatted) : "",
);
</script>

<template>
  <!-- 有高亮副本：只保留 <em>/<mark> 后渲染 -->
  <span v-if="formatted" v-html="safeHtml" />
  <!-- 无高亮副本：纯文本插值，绝不 v-html 原始字段 -->
  <span v-else>{{ text }}</span>
</template>
