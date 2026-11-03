<script setup lang="ts">
import type { CouponTemplate } from "~~/layers/base/app/composables/useCoupon";
import { useCouponFormat } from "~~/layers/base/app/composables/useCouponFormat";

/**
 * ③ 积分商城列表。兑换动作 emit 给页面执行（需登录 + API + 刷新）。
 */
defineProps<{
  coupons: CouponTemplate[];
  exchangingId: string | null;
}>();
const emit = defineEmits<{ (e: "exchange", c: CouponTemplate): void }>();

const { t } = useI18n();
const { formatCondition } = useCouponFormat();
</script>

<template>
  <div v-if="coupons.length" class="grid gap-4 md:grid-cols-2">
    <div
      v-for="c in coupons"
      :key="c.id"
      class="flex flex-col rounded-xl border border-(--ui-border) p-4"
    >
      <!-- 活动照片：有图则顶部通栏，缺图不占位（积分券以面额块为主视觉） -->
      <CouponActivityImage
        v-if="c.activityImage"
        :name="c.name"
        :src="c.activityImage"
        ratio="banner"
        class="mb-3"
      />
      <div class="flex items-stretch gap-4">
        <CouponFace :type="c.type" :value="c.discountValue" />
        <div class="flex min-w-0 flex-1 flex-col">
          <p class="font-semibold">{{ c.name }}</p>
          <p class="mt-1 text-sm text-(--ui-text-muted)">{{ formatCondition(c) }}</p>
          <p class="mt-1 text-xs font-semibold text-primary">
            {{ t("messages.coupon.pointsPrice", { n: c.pointsPrice }) }}
          </p>
        </div>
      </div>
      <UButton
        class="mt-4 w-full justify-center"
        :loading="exchangingId === c.id"
        :disabled="!!exchangingId"
        @click="emit('exchange', c)"
      >
        {{ t("messages.coupon.exchange") }}
      </UButton>
    </div>
  </div>
  <p v-else>{{ t("messages.coupon.pointsEmpty") }}</p>
</template>
