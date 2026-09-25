<script setup lang="ts">
import {
  ORDER_PROGRESS_STEPS,
  PROGRESS_PAID_INDEX,
  isCodCollectPending,
  progressIndex,
} from "../../utils/order-state";
import type { OrderVisualVariant } from "../../utils/order-config";

const props = withDefaults(
  defineProps<{
    state: string;
    order?: any;
    /** 版式变体（缺省 cn = 现状观感，classic 调用方零回归） */
    variant?: OrderVisualVariant;
  }>(),
  { variant: "cn" },
);
const { t } = useI18n();
const current = computed(() => progressIndex(props.state, props.order));
const isCancelled = computed(() => props.state === "Cancelled");
const isCodPending = computed(() => isCodCollectPending(props.order));
const isActive = (i: number) => !isCancelled.value && i <= current.value;

const stepClass = computed(() => {
  if (props.variant === "jd") return "rounded-[3px] px-2 py-0.5";
  if (props.variant === "mall") return "rounded-full px-2.5 py-0.5";
  return "rounded-full px-2 py-0.5";
});
const activeClass = computed(() => {
  if (props.variant === "jd") return "bg-[#e1251b] font-semibold text-white";
  if (props.variant === "mall")
    return "bg-gradient-to-r from-[#e0433f] to-[#ff6a6c] font-semibold text-white shadow-sm";
  return "bg-brand-600 text-white";
});
const inactiveClass = computed(() =>
  props.variant === "mall" ? "bg-white text-neutral-500 shadow-sm" : "bg-neutral-100 text-neutral-500",
);
</script>

<template>
  <ol class="flex items-center gap-1 text-xs">
    <template v-for="(step, i) in ORDER_PROGRESS_STEPS" :key="step">
      <li class="flex items-center gap-1">
        <div :class="[stepClass, isActive(i) ? activeClass : inactiveClass]">
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