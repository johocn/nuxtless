<script setup lang="ts">
import type { CouponType } from "~~/layers/base/app/composables/useCoupon";
import { useCouponFormat } from "~~/layers/base/app/composables/useCouponFormat";

/**
 * 券面额色块（左侧价格/折扣展示区）。
 * widthClass：center/wallet 卡用 w-32，sale/points 卡用 w-28。
 */
withDefaults(
  defineProps<{
    type?: CouponType | null;
    value?: number;
    widthClass?: string;
  }>(),
  { type: null, value: 0, widthClass: "w-28" },
);

const { typeTip, formatAmount, formatUnit } = useCouponFormat();
</script>

<template>
  <div
    class="flex shrink-0 flex-col items-center justify-center rounded-lg bg-(--ui-primary) text-white"
    :class="widthClass"
  >
    <div class="flex items-baseline">
      <span v-if="type === 'FIXED' || type === 'FULL'">¥</span>
      <span class="text-2xl font-bold">{{ formatAmount(type, value) }}</span>
      <span>{{ formatUnit(type) }}</span>
    </div>
    <span class="mt-1 text-xs opacity-90">{{ typeTip(type) }}</span>
  </div>
</template>
