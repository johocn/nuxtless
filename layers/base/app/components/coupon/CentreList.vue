<script setup lang="ts">
import type { CouponTemplate, CustomerCoupon } from "~~/layers/base/app/composables/useCoupon";
import { useCouponFormat } from "~~/layers/base/app/composables/useCouponFormat";

/**
 * ① 领券中心列表。领取动作 emit 给页面执行（需登录 + API + 刷新）。
 */
const props = defineProps<{
  coupons: CouponTemplate[];
  /** 已持有的我的券，用于 perUserLimit 判断 */
  myCoupons: CustomerCoupon[];
  claimingId: string | null;
}>();
const emit = defineEmits<{ (e: "claim", c: CouponTemplate): void }>();

const { t } = useI18n();
const { typeTip, formatAmount, formatUnit, formatCondition, formatDateRange } = useCouponFormat();

function heldCount(templateId: string): number {
  return props.myCoupons.filter(
    (mc) =>
      mc.templateId === templateId &&
      !["RETURNED", "INVALID", "EXPIRED"].includes(mc.status.toUpperCase()),
  ).length;
}

function canClaim(c: CouponTemplate): boolean {
  if (c.totalCount && c.claimedCount != null && c.claimedCount >= c.totalCount) return false;
  if (c.perUserLimit > 0 && heldCount(c.id) >= c.perUserLimit) return false;
  return true;
}

function claimBtnText(c: CouponTemplate): string {
  if (c.totalCount && c.claimedCount != null && c.claimedCount >= c.totalCount) return t("messages.coupon.soldOut");
  if (c.perUserLimit > 0 && heldCount(c.id) >= c.perUserLimit) return t("messages.coupon.perUserReached");
  return t("messages.coupon.claim");
}
</script>

<template>
  <div v-if="coupons.length" class="grid gap-4 md:grid-cols-2">
    <UCard
      v-for="c in coupons"
      :key="c.id"
      variant="soft"
      class="flex flex-col"
    >
      <div class="flex items-stretch gap-4">
        <CouponFace :type="c.type" :value="c.discountValue" width-class="w-32" />
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex flex-wrap items-center gap-1">
            <p class="font-semibold">{{ c.name }}</p>
            <span
              v-if="couponIsStoreScene(c.usageScene)"
              class="rounded bg-primary/10 px-1 py-px text-[10px] font-semibold text-primary"
            >{{ t("messages.coupon.storeUsable") }}</span>
          </div>
          <p class="mt-1 text-sm text-(--ui-text-muted)">{{ formatCondition(c) }}</p>
          <p class="mt-1 text-xs text-(--ui-text-muted)">
            {{ t("messages.coupon.validity") }}：{{ formatDateRange(c) }}
          </p>
        </div>
      </div>
      <UButton
        class="mt-4 w-full justify-center"
        :disabled="!canClaim(c) || !!claimingId"
        :loading="claimingId === c.id"
        @click="emit('claim', c)"
      >
        {{ claimBtnText(c) }}
      </UButton>
    </UCard>
  </div>
  <p v-else>{{ t("messages.coupon.noAvailable") }}</p>
</template>
