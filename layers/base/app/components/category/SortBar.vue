<script setup lang="ts">
import type { SortKey } from "../../utils/collection-sort";

const props = defineProps<{ modelValue: SortKey }>();
const emit = defineEmits<{ (e: "update:modelValue", v: SortKey): void }>();

const { t } = useI18n();

const options = computed<{ label: string; value: SortKey }[]>(() => [
  { label: t("messages.category.sort.relevance"), value: "RELEVANCE" },
  { label: t("messages.category.sort.newest"), value: "NAME_ASC" },
  { label: t("messages.category.sort.priceAsc"), value: "PRICE_ASC" },
  { label: t("messages.category.sort.priceDesc"), value: "PRICE_DESC" },
]);
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center gap-2">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="rounded-full px-3 py-1 text-sm"
      :class="modelValue === opt.value ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-700'"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>