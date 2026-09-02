<script setup lang="ts">
// 逐箱卡片「优惠券」行 + 券切换抽屉。
// 机制沿用整单 coupon API（applyCouponToOrder / clearCouponFromOrder，一单一券），
// 不实现逐箱多券：本组件只是「在某一箱内打开同一选择器」的入口，
// 抽屉名单按当前箱的 availableCoupons 过滤（门店隔离）。
import type { Ref } from "vue";
import type { ActiveOrderDetail } from "~~/types/order";
import type { CouponStatus, CustomerCoupon } from "~~/layers/base/app/composables/useCoupon";
import type { OrderBoxInfo } from "~~/types/order";
import {
  getMyCoupons,
  applyCouponToOrder,
  clearCouponFromOrder,
  couponErrorMessage,
} from "~~/layers/base/app/composables/useCoupon";
import { walletFormatAmount, walletCondition } from "~~/layers/base/app/composables/useCouponFormat";

const props = defineProps<{ box: OrderBoxInfo }>();

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const { order } = storeToRefs(orderStore);
const activeOrder = order as Ref<ActiveOrderDetail>;
const { isAuthenticated } = storeToRefs(useAuthStore());

// 抽屉开关
const open = ref(false);

// 当前整单已绑定的券码（一单一券，存储在订单 customFields.couponCode）
const activeAppliedCode = computed(() => (activeOrder.value?.customFields as any)?.couponCode ?? null);

// 当前箱可用券码集合（门店隔离）
const availableByCode = computed(() => {
  const map: Record<string, { name?: string | null; condition?: string | null; amount?: number | null }> = {};
  for (const c of props.box.availableCoupons ?? []) map[c.code] = c;
  return map;
});

const walletCoupons = ref<CustomerCoupon[]>([]);
const loadingCoupons = ref(false);
const applyingCode = ref<string | null>(null);

// 抽屉列表：我的券包(UNUSED) ∩ 当前箱 availableCoupons.code
const shopCoupons = computed(() =>
  walletCoupons.value.filter((c) => c.code && c.code in (availableByCode.value as any)),
);

// 已用券名：优先券包 template.name，回退箱级 availableCoupon.name
const activeName = computed(() => {
  if (!activeAppliedCode.value) return null;
  const wallet = walletCoupons.value.find((c) => c.code === activeAppliedCode.value);
  return wallet?.template?.name || availableByCode.value[activeAppliedCode.value]?.name || activeAppliedCode.value;
});

async function loadShopCoupons() {
  if (!isAuthenticated.value) return;
  loadingCoupons.value = true;
  try {
    walletCoupons.value = await getMyCoupons("UNUSED" as CouponStatus);
  } catch (e) {
    toast.add({ title: t("messages.coupon.coupon"), description: couponErrorMessage(e), color: "error" });
  } finally {
    loadingCoupons.value = false;
  }
}

function refreshOrder() {
  return orderStore.fetchOrder("detail");
}

function applyInFlight(code: string | null) {
  return applyingCode.value !== null && (code === null || applyingCode.value === code);
}

async function apply(c: CustomerCoupon) {
  if (!isAuthenticated.value) return;
  if (applyInFlight(c.code)) return;
  const switching = activeAppliedCode.value && activeAppliedCode.value !== c.code;
  applyingCode.value = c.code;
  try {
    // 换券：先清旧再上新；首次/同券直接应用（后端整单一券会替换旧券，先后都安全）
    if (switching) await clearCouponFromOrder();
    await applyCouponToOrder(c.code);
    await refreshOrder();
    toast.add({ title: t("messages.coupon.couponUsed"), description: c.template?.name ?? c.code, color: "success" });
    open.value = false;
  } catch (e) {
    toast.add({ title: t("messages.coupon.appliedError"), description: couponErrorMessage(e), color: "error" });
  } finally {
    applyingCode.value = null;
  }
}

async function clear() {
  if (applyInFlight(null)) return;
  applyingCode.value = "clear";
  try {
    await clearCouponFromOrder();
    await refreshOrder();
    toast.add({ title: t("messages.coupon.couponCleared"), color: "success" });
    open.value = false;
  } catch (e) {
    toast.add({ title: t("messages.coupon.appliedError"), description: couponErrorMessage(e), color: "error" });
  } finally {
    applyingCode.value = null;
  }
}

onMounted(async () => {
  if (isAuthenticated.value) await loadShopCoupons();
});
</script>

<template>
  <!-- 该箱卡片内的「优惠券」行：点击打开抽屉 -->
  <button
    type="button"
    class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
    :disabled="!isAuthenticated"
    @click="open = true"
  >
    <span class="shrink-0 text-neutral-600 dark:text-neutral-400">{{ t("messages.coupon.coupon") }}</span>
    <span class="flex min-w-0 flex-1 items-center justify-end gap-1.5">
      <template v-if="activeName">
        <span class="truncate font-medium text-primary-600 dark:text-primary-300">{{ activeName }}</span>
      </template>
      <span v-else class="truncate text-neutral-400">{{ t("messages.coupon.unused") }}</span>
      <UIcon name="i-heroicons-chevron-right" class="shrink-0 text-neutral-400" />
    </span>
  </button>

  <USlideover v-model:open="open" :title="t('messages.coupon.chooseCoupon')">
    <template #header>
      <h3 class="text-base font-medium">{{ t("messages.coupon.coupon") }}</h3>
    </template>

    <!-- 已用券 + 清除 -->
    <div
      v-if="activeName"
      class="mb-4 flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 dark:border-primary-800 dark:bg-primary-950/40"
    >
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-primary-700 dark:text-primary-300">{{ activeName }}</p>
        <p class="text-xs text-neutral-500">{{ t("messages.coupon.currentlyApplied") }}</p>
      </div>
      <UButton size="xs" variant="soft" color="error" :loading="applyingCode === 'clear'" @click="clear">
        {{ t("messages.coupon.remove") }}
      </UButton>
    </div>

    <!-- 未登录 -->
    <div v-if="!isAuthenticated" class="text-sm text-neutral-500">
      {{ t("messages.coupon.loginPromptOrder") }}
    </div>

    <!-- 加载中 -->
    <p v-else-if="loadingCoupons" class="text-sm text-neutral-500">{{ t("messages.general.loading") }}</p>

    <!-- 本店可选券列表 -->
    <div v-else-if="shopCoupons.length" class="space-y-2">
      <div
        v-for="c in shopCoupons"
        :key="c.id"
        class="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
      >
        <span class="w-24 shrink-0 font-bold text-primary-600 dark:text-primary-300">{{ walletFormatAmount(t, c) }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{{ c.template?.name || c.code }}</p>
          <p class="truncate text-xs text-neutral-500">{{ walletCondition(t, c) }}</p>
        </div>
        <UButton
          size="xs"
          variant="solid"
          :loading="applyingCode === c.code"
          :disabled="!!applyingCode || c.code === activeAppliedCode"
          @click="apply(c)"
        >
          {{ c.code === activeAppliedCode ? t("messages.coupon.used") : t("messages.coupon.apply") }}
        </UButton>
      </div>
    </div>
    <p v-else class="text-sm text-neutral-500">{{ t("messages.coupon.noUsableCoupon") }}</p>
  </USlideover>
</template>