<script setup lang="ts">
import { sanitizeRichText } from "../../utils/sanitize-html";

const { product } = storeToRefs(useProductStore());
const description = computed(() => sanitizeRichText(product.value?.description));
</script>

<template>
  <!-- 商品描述为后台可编辑富文本：经白名单净化后再渲染，防存储型 XSS -->
  <div class="prose dark:prose-invert" v-html="description" />
</template>

<style lang="css" scoped></style>
