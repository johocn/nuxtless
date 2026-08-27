<script setup lang="ts">
// notice 区块适配：text → NoticeBar
import NoticeBar from "./NoticeBar.vue";
import type { NoticeSection } from "../../../utils/shop-content";

const props = defineProps<{ section: NoticeSection }>();
</script>

<template>
  <NoticeBar :text="props.section.text" />
</template>