<script setup lang="ts">
// 促销/优惠条：固定文案走 i18n messages.detail;后台可传 LocalizedText text 逐级本地化
import { localizeText, type LocalizedText } from "../../utils/detail-config";

const props = defineProps<{ text?: LocalizedText }>();
const { t, locale } = useI18n();
const iterator = (v: string) => [v]; // 数组转 single（本阶段只展示一条自定义或默认）

const items = computed(() =>
  props.text
    ? iterator(localizeText(props.text, locale.value))
    : t("messages.detail.promoItems"), // i18n 数组，缺失回退 default locale
);
</script>

<template>
  <div class="mt-2 flex flex-wrap gap-1.5 text-xs">
    <span
      v-for="tx in items"
      :key="tx"
      class="rounded bg-primary/10 px-1.5 py-0.5 text-primary"
    >
      {{ tx }}
    </span>
  </div>
</template>