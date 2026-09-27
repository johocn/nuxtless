<script setup lang="ts">
// 领券楼层：数据自 shop 侧券接口（useCoupon.ts），无兜底——不配置即不渲染，无券即整层隐藏。
import {
  getCouponCentre,
  claimCoupon,
  couponErrorMessage,
  type CouponTemplate,
  type CouponType,
} from "../../../composables/useCoupon";
import { localizeText } from "../../../utils/detail-config";
import type { CouponSection } from "../../../utils/shop-content";

const props = defineProps<{ section: CouponSection }>();
const { t, locale } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());

const coupons = ref<CouponTemplate[]>([]);
const claimingId = ref<string | null>(null);

const MAX = computed(() => {
  const l = props.section?.limit;
  if (typeof l === "number" && Number.isInteger(l) && l > 0) return Math.min(l, 30);
  return 6;
});
const title = computed(() => localizeText(props.section?.title, locale.value) || t("messages.home.couponFloor"));

/** 仅展示：可领取 + 未过期 + 未抢完 */
const visible = computed(() =>
  coupons.value
    .filter((c) => c.claimable !== false)
    .filter((c) => !c.endsAt || new Date(c.endsAt).getTime() > Date.now())
    .filter((c) => !c.totalCount || c.claimedCount == null || c.claimedCount < c.totalCount)
    .slice(0, MAX.value),
);

function typeTip(type?: CouponType): string {
  if (type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  if (type === "FULL") return t("messages.coupon.typeFull");
  if (type === "PERCENT") return t("messages.coupon.typePercent");
  return t("messages.coupon.typeFixed");
}

function amount(type?: CouponType, discountValue = 0): string {
  if (type === "FREE_SHIPPING") return "";
  if (type === "PERCENT") {
    const zhe = discountValue / 10;
    return zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
  }
  return (discountValue / 100).toString();
}

function unit(type?: CouponType): string {
  if (type === "FREE_SHIPPING" || type === "PERCENT") return type === "PERCENT" ? t("messages.coupon.unitDiscount") : "";
  return t("messages.coupon.unitYuan");
}

function condition(c: CouponTemplate): string {
  const minSpend = c.minSpend ? c.minSpend / 100 : 0;
  if (c.type === "FREE_SHIPPING") return c.description || t("messages.coupon.typeFreeShipping");
  if (c.type === "FULL") return t("messages.coupon.noThresholdFull");
  if (!minSpend) return t("messages.coupon.noThreshold");
  return t("messages.coupon.minSpend", { n: minSpend });
}

async function load() {
  try {
    coupons.value = await getCouponCentre();
  } catch {
    coupons.value = []; // 取数失败整层隐藏，不阻断首页其它区块
  }
}

async function claim(c: CouponTemplate) {
  if (!isAuthenticated.value) {
    await navigateTo(localePath("/account/login"));
    return;
  }
  if (claimingId.value) return;
  claimingId.value = c.id;
  try {
    await claimCoupon(c.id);
    toast.add({ title: t("messages.coupon.claimSuccess"), color: "success" });
    c.claimedCount += 1;
  } catch (e) {
    toast.add({ title: t("messages.coupon.claimFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    claimingId.value = null;
  }
}

await load();
</script>

<template>
  <section v-if="visible.length" class="mt-2 rounded-lg bg-white p-3">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-base font-bold text-gray-800">{{ title }}</h2>
      <NuxtLink :to="localePath('/coupon')" class="text-xs text-primary">{{ t('messages.nav.viewMore') }} ›</NuxtLink>
    </div>
    <div class="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      <div
        v-for="c in visible"
        :key="c.id"
        class="flex w-[220px] shrink-0 items-stretch gap-2 rounded-lg border border-gray-100 p-2"
      >
        <div class="flex w-16 shrink-0 flex-col items-center justify-center rounded bg-primary text-white">
          <span class="text-lg font-bold">
            <span v-if="c.type === 'FIXED' || c.type === 'FULL'">¥</span>{{ amount(c.type, c.discountValue) }}
          </span>
          <span class="text-[10px] opacity-90">{{ typeTip(c.type) }}</span>
        </div>
        <div class="flex min-w-0 flex-1 flex-col">
          <p class="truncate text-xs font-semibold text-gray-800">{{ c.name }}</p>
          <p class="mt-0.5 truncate text-[11px] text-gray-400">{{ condition(c) }}</p>
          <button
            class="mt-auto rounded bg-primary py-1 text-[11px] text-white disabled:opacity-60"
            :disabled="claimingId === c.id"
            @click="claim(c)"
          >
            {{ t('messages.coupon.claim') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>