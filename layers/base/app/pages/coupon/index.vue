<script setup lang="ts">
import type {
  CouponStatus,
  CouponTemplate,
  CouponType,
  CustomerCoupon,
} from "~~/layers/base/app/composables/useCoupon";
import {
  getCouponCentre,
  getMyCoupons,
  claimCoupon,
  redeemCouponByCode,
  couponErrorMessage,
} from "~~/layers/base/app/composables/useCoupon";

definePageMeta({
  // 券包需登录，但领券中心可匿名浏览，故不做强制 middleware，交由页面内提示处理
  title: "优惠券",
});

const { t } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());

type TabKey = "center" | "wallet";
type WalletKey = "unused" | "used" | "expired" | "returned";

const tab = ref<TabKey>("center");
const walletTab = ref<WalletKey>("unused");

const centreCoupons = ref<CouponTemplate[]>([]);
const myCoupons = ref<CustomerCoupon[]>([]);
const loadingCenter = ref(false);
const loadingWallet = ref(false);
const claimingId = ref<string | null>(null);
const redeemCode = ref("");
const redeeming = ref(false);

const STATUS_MAP: Record<WalletKey, CouponStatus> = {
  unused: "UNUSED",
  used: "USED",
  expired: "EXPIRED",
  returned: "RETURNED",
};

const filteredMyCoupons = computed(() =>
  myCoupons.value.filter(
    (c) => c.status.toUpperCase() === STATUS_MAP[walletTab.value],
  ),
);

// ── 临期排序/高亮（仅「未使用」tab）──
// 计算有效截止前剩余天数：优先 customerCoupon.expiredAt，回退 template.endsAt；无有效截止返回 null
function couponExpiry(c: CustomerCoupon): string | null {
  return c.expiredAt || c.template?.endsAt || null;
}

function remainingDays(c: CustomerCoupon): number | null {
  const end = couponExpiry(c);
  if (!end) return null;
  const diff = new Date(end).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

const EXPIRING_DAYS = 7;

// 展示列表：仅 UNUSED tab 按剩余天数升序（有截止在前、无截止在后、同值稳定）
const visibleCoupons = computed<CustomerCoupon[]>(() => {
  const list = filteredMyCoupons.value;
  if (walletTab.value !== "unused") return list;
  return [...list].sort((a, b) => {
    const da = remainingDays(a);
    const db = remainingDays(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
});

function isExpiring(c: CustomerCoupon): boolean {
  const days = remainingDays(c);
  return days !== null && days <= EXPIRING_DAYS;
}

// ── 领券中心加载 ──
async function loadCentre() {
  loadingCenter.value = true;
  try {
    centreCoupons.value = await getCouponCentre();
  } catch (e) {
    toast.add({ title: t("messages.coupon.couponCentre"), description: couponErrorMessage(e), color: "error" });
  } finally {
    loadingCenter.value = false;
  }
}

// ── 券包加载 ──
async function loadMy() {
  if (!isAuthenticated.value) return;
  loadingWallet.value = true;
  try {
    myCoupons.value = (await getMyCoupons()).map((c) => ({
      ...c,
      status: c.status.toUpperCase() as CouponStatus,
    }));
  } catch (e) {
    toast.add({ title: t("messages.coupon.myWallet"), description: couponErrorMessage(e), color: "error" });
  } finally {
    loadingWallet.value = false;
  }
}

function switchTab(t: TabKey) {
  tab.value = t;
  if (t === "center" && centreCoupons.value.length === 0) loadCentre();
  if (t === "wallet" && myCoupons.value.length === 0) loadMy();
}

// 鉴权就绪后兜底加载券包：规避登录态/持久化水合未完成时切到「我的券包」
// 导致 loadMy 在 isAuthenticated 为 false 时被提前 return、券包静默为空的问题。
watch(isAuthenticated, (ok) => {
  if (ok && myCoupons.value.length === 0) loadMy();
}, { immediate: true });

function switchWallet(t: WalletKey) {
  walletTab.value = t;
}

// ── 领取 ──
function heldCount(templateId: string): number {
  return myCoupons.value.filter(
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

async function claim(c: CouponTemplate) {
  if (!isAuthenticated.value) {
    await navigateTo(localePath("/account/login"));
    return;
  }
  if (claimingId.value || !canClaim(c)) return;
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

// ── 凭兑换码领券 ──
async function redeem() {
  const code = redeemCode.value.trim();
  if (!code) return;
  if (!isAuthenticated.value) {
    await navigateTo(localePath("/account/login"));
    return;
  }
  if (redeeming.value) return;
  redeeming.value = true;
  try {
    await redeemCouponByCode(code);
    toast.add({ title: t("messages.coupon.redeemSuccess"), color: "success" });
    redeemCode.value = "";
    // 刷新券包并切到「我的券包 - 未使用」，方便立即看到新领的券
    await loadMy();
    walletTab.value = "unused";
    tab.value = "wallet";
  } catch (e) {
    toast.add({ title: t("messages.coupon.redeemFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    redeeming.value = false;
  }
}

// ── 展示格式化（移植自 vshop coupons.vue）──
function typeTip(type?: CouponType): string {
  if (type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  if (type === "FULL") return t("messages.coupon.typeFull");
  if (type === "PERCENT") return t("messages.coupon.typePercent");
  return t("messages.coupon.typeFixed");
}

function formatAmount(type?: CouponType, discountValue = 0): string {
  if (type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  if (type === "PERCENT") {
    const zhe = discountValue / 10;
    return zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
  }
  return (discountValue / 100).toString();
}

function formatUnit(type?: CouponType): string {
  if (type === "FREE_SHIPPING") return "";
  if (type === "PERCENT") return t("messages.coupon.unitDiscount");
  return t("messages.coupon.unitYuan");
}

function formatCondition(c: CouponTemplate): string {
  const minSpend = c.minSpend ? c.minSpend / 100 : 0;
  if (c.type === "FREE_SHIPPING") return c.description || t("messages.coupon.typeFreeShipping");
  if (c.type === "FULL") return t("messages.coupon.noThresholdFull");
  if (!minSpend) return t("messages.coupon.noThreshold");
  return t("messages.coupon.minSpend", { n: minSpend });
}

function formatDateRange(c?: CouponTemplate | null): string {
  const start = c?.startsAt ? String(c.startsAt).slice(0, 10) : "";
  const end = c?.endsAt ? String(c.endsAt).slice(0, 10) : "";
  if (start && end) return t("messages.coupon.dateRange", { start, end });
  if (end) return t("messages.coupon.dateUntil", { end });
  return "";
}

function walletEmptyText(): string {
  const map: Record<WalletKey, string> = {
    unused: t("messages.coupon.emptyUnused"),
    used: t("messages.coupon.emptyUsed"),
    expired: t("messages.coupon.emptyExpired"),
    returned: t("messages.coupon.emptyReturned"),
  };
  return map[walletTab.value];
}

onMounted(loadCentre);
</script>

<template>
  <main class="container my-14">
    <header class="mb-8">
      <h1 class="text-3xl font-semibold">{{ t("messages.coupon.title") }}</h1>
    </header>

    <!-- 凭兑换码领券 -->
    <div class="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-(--ui-border) p-4">
      <p class="font-semibold">{{ t("messages.coupon.redeemTitle") }}</p>
      <UInput
        v-model="redeemCode"
        class="w-52"
        :placeholder="t('messages.coupon.redeemPlaceholder')"
        :disabled="redeeming"
        @keyup.enter="redeem()"
      />
      <UButton
        color="primary"
        :loading="redeeming"
        :disabled="!redeemCode.trim() || redeeming"
        @click="redeem()"
      >
        {{ t("messages.coupon.redeemBtn") }}
      </UButton>
    </div>

    <div class="mb-6 flex gap-3">
      <UButton
        :variant="tab === 'center' ? 'solid' : 'soft'"
        @click="switchTab('center')"
      >
        {{ t("messages.coupon.couponCentre") }}
      </UButton>
      <UButton
        :variant="tab === 'wallet' ? 'solid' : 'soft'"
        @click="switchTab('wallet')"
      >
        {{ t("messages.coupon.myWallet") }}
      </UButton>
    </div>

    <!-- 领券中心 -->
    <section v-if="tab === 'center'">
      <BaseLoader v-if="loadingCenter" width="sm:w-xs md:w-sm" />
      <template v-else>
        <div v-if="centreCoupons.length" class="grid gap-4 md:grid-cols-2">
          <UCard
            v-for="c in centreCoupons"
            :key="c.id"
            variant="soft"
            class="flex flex-col"
          >
            <div class="flex items-stretch gap-4">
              <div
                class="flex w-32 shrink-0 flex-col items-center justify-center rounded-lg bg-(--ui-primary) text-white"
                :class="{ 'opacity-60': !canClaim(c) }"
              >
                <div class="flex items-baseline">
                  <span v-if="c.type === 'FIXED' || c.type === 'FULL'">¥</span>
                  <span class="text-2xl font-bold">{{ formatAmount(c.type, c.discountValue) }}</span>
                  <span>{{ formatUnit(c.type) }}</span>
                </div>
                <span class="mt-1 text-xs opacity-90">{{ typeTip(c.type) }}</span>
              </div>
              <div class="flex min-w-0 flex-1 flex-col">
                <p class="font-semibold">{{ c.name }}</p>
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
              @click="claim(c)"
            >
              {{ claimBtnText(c) }}
            </UButton>
          </UCard>
        </div>
        <p v-else>{{ t("messages.coupon.noAvailable") }}</p>
      </template>
    </section>

    <!-- 我的券包 -->
    <section v-else>
      <div v-if="!isAuthenticated">
        <div class="flex flex-col items-center gap-4 py-16">
          <p class="text-(--ui-text-muted)">{{ t("messages.coupon.loginPrompt") }}</p>
          <UButton :to="localePath('/account/login')">
            {{ t("messages.coupon.goLogin") }}
          </UButton>
        </div>
      </div>
      <template v-else>
        <div class="mb-6 flex flex-wrap gap-2">
          <UButton
            size="sm"
            :variant="walletTab === 'unused' ? 'solid' : 'soft'"
            @click="switchWallet('unused')"
          >
            {{ t("messages.coupon.unused") }}
          </UButton>
          <UButton
            size="sm"
            :variant="walletTab === 'used' ? 'solid' : 'soft'"
            @click="switchWallet('used')"
          >
            {{ t("messages.coupon.used") }}
          </UButton>
          <UButton
            size="sm"
            :variant="walletTab === 'expired' ? 'solid' : 'soft'"
            @click="switchWallet('expired')"
          >
            {{ t("messages.coupon.expired") }}
          </UButton>
          <UButton
            size="sm"
            :variant="walletTab === 'returned' ? 'solid' : 'soft'"
            @click="switchWallet('returned')"
          >
            {{ t("messages.coupon.returned") }}
          </UButton>
        </div>

        <BaseLoader v-if="loadingWallet" width="sm:w-xs md:w-sm" />
        <div v-else-if="filteredMyCoupons.length" class="grid gap-4 md:grid-cols-2">
          <div
            v-for="mc in visibleCoupons"
            :key="mc.id"
            class="relative rounded-xl border border-(--ui-border) p-4"
            :class="[mc.status !== 'UNUSED' && 'opacity-60', isExpiring(mc) && 'border-primary-400 ring-2 ring-primary-200 dark:ring-primary-900/50']"
          >
            <div class="flex items-stretch gap-4">
              <div
                class="flex w-32 shrink-0 flex-col items-center justify-center rounded-lg bg-(--ui-primary) text-white"
              >
                <div class="flex items-baseline">
                  <span v-if="mc.template?.type === 'FIXED' || mc.template?.type === 'FULL'">¥</span>
                  <span class="text-2xl font-bold">
                    {{ formatAmount(mc.template?.type, mc.template?.discountValue ?? 0) }}
                  </span>
                  <span>{{ formatUnit(mc.template?.type) }}</span>
                </div>
                <span class="mt-1 text-xs opacity-90">{{ typeTip(mc.template?.type) }}</span>
              </div>
              <div class="flex min-w-0 flex-1 flex-col">
                <p class="font-semibold">{{ mc.template?.name || t("messages.coupon.voucher") }}</p>
                <p class="mt-1 text-sm text-(--ui-text-muted)">
                  {{ formatCondition(mc.template ?? ({} as CouponTemplate)) }}
                </p>
                <p class="mt-1 text-xs text-(--ui-text-muted)">
                  {{ t("messages.coupon.code") }}：{{ mc.code }}
                </p>
                <p class="mt-1 text-xs text-(--ui-text-muted)">
                  {{ t("messages.coupon.validity") }}：{{ formatDateRange(mc.template) }}
                </p>
              </div>
            </div>
            <!-- 临期 badge（仅未使用 tab） -->
            <div
              v-if="walletTab === 'unused' && isExpiring(mc)"
              class="absolute top-2 left-2 rounded bg-primary-600 px-1.5 py-0.5 text-xs font-semibold text-white"
            >
              {{ t("messages.coupon.expiringDays", { n: remainingDays(mc) }) }}
            </div>
            <div
              v-if="mc.status !== 'UNUSED'"
              class="absolute top-1/2 right-8 -rotate-12 rounded border border-(--ui-error) px-2 py-1 text-sm font-bold text-(--ui-error)"
            >
              {{
                mc.status === "USED"
                  ? t("messages.coupon.usedStamp")
                  : mc.status === "EXPIRED"
                    ? t("messages.coupon.expiredStamp")
                    : mc.status === "RETURNED"
                      ? t("messages.coupon.returnedStamp")
                      : mc.status
              }}
            </div>
          </div>
        </div>
        <p v-else>{{ walletEmptyText() }}</p>
      </template>
    </section>
  </main>
</template>

<style lang="css" scoped></style>