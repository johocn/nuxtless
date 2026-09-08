<script setup lang="ts">
import {
  ORDER_PROGRESS_STEPS,
  PROGRESS_PAID_INDEX,
  isCodCollectPending,
  progressIndex,
} from "../../utils/order-state";

const props = defineProps<{ state: string; order?: any }>();
const { t } = useI18n();
const current = computed(() => progressIndex(props.state, props.order));
const isCancelled = computed(() => props.state === "Cancelled");
const isCodPending = computed(() => isCodCollectPending(props.order));
</script>

<template>
  <ol class="flex items-center gap-1 text-xs">
    <template v-for="(step, i) in ORDER_PROGRESS_STEPS" :key="step">
      <li class="flex items-center gap-1">
        <div
          class="rounded-full px-2 py-0.5"
          :class="
            !isCancelled && i <= current
              ? 'bg-brand-600 text-white'
              : 'bg-neutral-100 text-neutral-500'
          "
        >
          {{ isCodPending && i === PROGRESS_PAID_INDEX ? t("messages.order.collectPending") : t(step) }}
        </div>
      </li>
      <li
        v-if="i < ORDER_PROGRESS_STEPS.length - 1"
        class="h-px w-4 bg-neutral-300"
      ></li>
    </template>
  </ol>
</template>