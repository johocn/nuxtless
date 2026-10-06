<script setup lang="ts">
import { afterSalesNextStep } from "../../utils/after-sales-state";

const props = defineProps<{ state: string }>();
const { t } = useI18n();
const step = computed(() => afterSalesNextStep(props.state));

const toneClass = computed(() => {
  switch (step.value.tone) {
    case "warning":
      return "border-warning/40 bg-warning/5";
    case "success":
      return "border-success/40 bg-success/5";
    case "error":
      return "border-error/40 bg-error/5";
    case "info":
      return "border-primary/40 bg-primary/5";
    default:
      return "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900";
  }
});
</script>

<template>
  <section class="mb-6 rounded-lg border p-4" :class="toneClass">
    <p class="text-sm font-medium">{{ t(step.titleKey) }}</p>
    <p class="mt-1 text-xs text-neutral-500">{{ t(step.descKey) }}</p>
    <slot />
  </section>
</template>
