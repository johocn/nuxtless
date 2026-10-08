<script setup lang="ts">
import type { CustomerCoupon } from "~~/layers/base/app/composables/useCoupon";
import { useCouponFormat } from "~~/layers/base/app/composables/useCouponFormat";
import {
  couponIsExpiring,
  couponIsStoreScene,
  couponRemainingDays,
  type CouponSceneKey,
  type CouponWalletKey,
} from "~~/layers/base/app/utils/coupon";

/**
 * ⑤ 我的券：状态 tab + 场景子筛 + 券卡列表（临期排序由页面完成后传入）。
 * 出示券码 emit 给页面执行（跳券码页）。
 */
const props = defineProps<{
  /** 已按状态/场景筛选并按临期排序的券列表 */
  coupons: CustomerCoupon[];
  loading: boolean;
  walletTab: CouponWalletKey;
  scene: CouponSceneKey;
}>();
const emit = defineEmits<{
  (e: "update:walletTab", v: CouponWalletKey): void;
  (e: "update:scene", v: CouponSceneKey): void;
  (e: "showCode", mc: CustomerCoupon): void;
}>();

const { t } = useI18n();
const { typeTip, formatAmount, formatUnit, formatCondition, formatDateRange } = useCouponFormat();

const WALLET_TABS: CouponWalletKey[] = ["unused", "used", "expired", "returned"];
const SCENES: CouponSceneKey[] = ["ALL", "ONLINE", "IN_STORE"];

const emptyText = computed(() => {
  const map: Record<CouponWalletKey, string> = {
    unused: t("messages.coupon.emptyUnused"),
    used: t("messages.coupon.emptyUsed"),
    expired: t("messages.coupon.emptyExpired"),
    returned: t("messages.coupon.emptyReturned"),
  };
  return map[props.walletTab];
});

function statusStamp(status: CustomerCoupon["status"]): string {
  if (status === "USED") return t("messages.coupon.usedStamp");
  if (status === "EXPIRED") return t("messages.coupon.expiredStamp");
  if (status === "RETURNED") return t("messages.coupon.returnedStamp");
  return status;
}

function sceneLabel(s: CouponSceneKey): string {
  return t(`messages.coupon.${s === "ALL" ? "sceneAll" : s === "ONLINE" ? "sceneOnline" : "sceneStore"}`);
}
</script>

<template>
  <div class="mb-3 flex flex-wrap gap-2">
    <UButton
      v-for="w in WALLET_TABS"
      :key="w"
      size="sm"
      :variant="walletTab === w ? 'solid' : 'soft'"
      @click="emit('update:walletTab', w)"
    >{{ t(`messages.coupon.${w}`) }}</UButton>
  </div>
  <!-- 场景子筛（到店券分组） -->
  <div class="mb-6 flex flex-wrap gap-2">
    <UButton
      v-for="s in SCENES"
      :key="s"
      size="xs"
      :variant="scene === s ? 'solid' : 'ghost'"
      @click="emit('update:scene', s)"
    >{{ sceneLabel(s) }}</UButton>
  </div>

  <BaseLoader v-if="loading" width="sm:w-xs md:w-sm" />
  <div v-else-if="coupons.length" class="grid gap-4 md:grid-cols-2">
    <div
      v-for="mc in coupons"
      :key="mc.id"
      class="relative rounded-xl border border-(--ui-border) p-4"
      :class="[mc.status !== 'UNUSED' && 'opacity-60', couponIsExpiring(mc) && 'border-primary-400 ring-2 ring-primary-200 dark:ring-primary-900/50']"
    >
      <div class="flex items-stretch gap-4">
        <CouponFace :type="mc.template?.type" :value="mc.template?.discountValue ?? 0" width-class="w-32" />
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex flex-wrap items-center gap-1">
            <p class="font-semibold">{{ mc.template?.name || t("messages.coupon.voucher") }}</p>
            <span
              v-if="couponIsStoreScene(mc.template?.usageScene)"
              class="rounded bg-primary/10 px-1 py-px text-[10px] font-semibold text-primary"
            >{{ t("messages.coupon.storeUsable") }}</span>
          </div>
          <p class="mt-1 text-sm text-(--ui-text-muted)">
            {{ formatCondition(mc.template) }}
          </p>
          <p class="mt-1 text-xs text-(--ui-text-muted)">
            {{ t("messages.coupon.code") }}：{{ mc.code }}
          </p>
          <p class="mt-1 text-xs text-(--ui-text-muted)">
            {{ t("messages.coupon.validity") }}：{{ formatDateRange(mc.template) }}
          </p>
        </div>
      </div>
      <!-- 到店买单券：出示券码入口（未使用且场景为到店/通用） -->
      <UButton
        v-if="mc.status === 'UNUSED' && couponIsStoreScene(mc.template?.usageScene)"
        class="mt-4 w-full justify-center"
        size="sm"
        variant="soft"
        @click="emit('showCode', mc)"
      >
        {{ t("messages.coupon.showCode") }}
      </UButton>
      <!-- 临期 badge（仅未使用 tab） -->
      <div
        v-if="walletTab === 'unused' && couponIsExpiring(mc)"
        class="absolute top-2 left-2 rounded bg-primary-600 px-1.5 py-0.5 text-xs font-semibold text-white"
      >
        {{ t("messages.coupon.expiringDays", { n: couponRemainingDays(mc) }) }}
      </div>
      <div
        v-if="mc.status !== 'UNUSED'"
        class="absolute top-1/2 right-8 -rotate-12 rounded border border-(--ui-error) px-2 py-1 text-sm font-bold text-(--ui-error)"
      >
        {{ statusStamp(mc.status) }}
      </div>
    </div>
  </div>
  <p v-else>{{ emptyText }}</p>
</template>
