<script setup lang="ts">
// 评价区占位：标题/占位文案走 i18n messages.detail;可传 LocalizedText 覆盖，数据接入后续迭代
import { localizeText, type LocalizedText } from "../../utils/detail-config";

const props = defineProps<{ title?: LocalizedText; empty?: LocalizedText }>();
const { t, locale } = useI18n();

const heading = computed(() =>
  props.title ? localizeText(props.title, locale.value) : t("messages.detail.reviews"),
);
const emptyText = computed(() =>
  props.empty ? localizeText(props.empty, locale.value) : t("messages.detail.reviewsEmpty"),
);
const placeholder = true;
</script>

<template>
  <section class="rounded-lg border border-gray-100 bg-white p-4">
    <h2 class="mb-2 text-base font-bold">{{ heading }}</h2>
    <p v-if="placeholder" class="text-sm text-gray-400">
      {{ emptyText }}
    </p>
  </section>
</template>