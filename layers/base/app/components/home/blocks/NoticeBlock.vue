<script setup lang="ts">
// notice 区块适配：text → NoticeBar
import NoticeBar from "./NoticeBar.vue";
import type { NoticeSection } from "../../../utils/shop-content";
import { localizeText } from "../../../utils/detail-config";

const props = defineProps<{ section: NoticeSection }>();
const { locale } = useI18n();

// 后台公告文案 LocalizedText 逐级回退
const text = computed(() => localizeText(props.section.text, locale.value) || '');
</script>

<template>
  <NoticeBar :text="text" />
</template>