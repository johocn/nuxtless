<script setup lang="ts">
// 中国本地化版式：优惠展开抽屉——展示已绑定券 + 可选券列表，复用 useCoupon 券能力。
import type { Ref } from "vue";
import type { ActiveOrderDetail } from "~~/types/order";
import type { CouponStatus, CustomerCoupon } from "~~/layers/base/app/composables/useCoupon";
import {
  getMyCoupons,
  applyCouponToOrder,
  clearCouponFromOrder,
  couponErrorMessage,
} from "~~/layers/base/app/composables/useCoupon";
import { walletFormatAmount, walletCondition } from "~~/layers/base/app/composables/useCouponFormat";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

// 桥接：USlideover 走 v-model:open，关闭时反向 emit close 由父控制
const isOpen = computed<boolean>({
  get: () => props.open,
  set: (v) => {
    if (!v) emit("close");
  },
});

const { t } = useI18n();
const localePath = useLocalePath();
const toast = useToast();
const orderStore = useOrderStore();
const { order } = storeToRefs(orderStore);
const activeOrder = order as Ref<ActiveOrderDetail>;
const { isAuthenticated } = storeToRefs(useAuthStore());

const walletCoupons = ref<CustomerCoupon[]>([]);
const loadingCoupons = ref(false);
const applyingCode = ref<string | null>(null);

const activeAppliedCode = computed(() => (activeOrder.value?.customFields as any)?.couponCode ?? null);
const usableCoupons = computed(() =>
  walletCoupons.value.filter((c) => c.status.toUpperCase() === "UNUSED" || c.status.toUpperCase() === "RETURNED"),
);

async function loadWalletCoupons() {
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

async function refreshOrder() {
  await orderStore.fetchOrder("detail");
}

async function applyFromWallet(c: CustomerCoupon) {
  if (!isAuthenticated.value) {
    await navigateTo(localePath("/account/login"));
    return;
  }
  if (applyingCode.value) return;
  applyingCode.value = c.code;
  try {
    await applyCouponToOrder(c.code);
    await refreshOrder();
    toast.add({ title: t("messages.coupon.applied"), description: c.template?.name ?? c.code, color: "success" });
  } catch (e) {
    toast.add({ title: t("messages.coupon.appliedError"), description: couponErrorMessage(e), color: "error" });
  } finally {
    applyingCode.value = null;
  }
}

async function clearApplied() {
  if (applyingCode.value) return;
  applyingCode.value = "clear";
  try {
    await clearCouponFromOrder();
    await refreshOrder();
    toast.add({ title: t("messages.coupon.removed"), color: "success" });
  } catch (e) {
    toast.add({ title: t("messages.coupon.appliedError"), description: couponErrorMessage(e), color: "error" });
  } finally {
    applyingCode.value = null;
  }
}

onMounted(async () => {
  if (isAuthenticated.value) await loadWalletCoupons();
});
</script>

<template>
  <USlideover v-model:open="isOpen" :title="t('messages.coupon.coupon')">
    <template #header>
      <h3 class="text-base font-medium">{{ t("messages.coupon.coupon") }}</h3>
    </template>

    <!-- 已绑定券 -->
    <div
      v-if="activeAppliedCode"
      class="mb-4 flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 dark:border-primary-800 dark:bg-primary-950/40"
    >
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-primary-700 dark:text-primary-300">{{ activeAppliedCode }}</p>
        <p class="text-xs text-neutral-500">{{ t("messages.coupon.currentlyApplied") }}</p>
      </div>
      <UButton size="xs" variant="soft" color="error" :loading="applyingCode === 'clear'" @click="clearApplied">
        {{ t("messages.coupon.remove") }}
      </UButton>
    </div>

    <!-- 未登录 -->
    <div v-else-if="!isAuthenticated" class="text-sm text-neutral-500">
      {{ t("messages.coupon.loginPromptOrder") }}
      <UButton size="sm" variant="soft" class="mt-2" :to="localePath('/account/login')">
        {{ t("messages.coupon.goLogin") }}
      </UButton>
    </div>

    <!-- 加载中 -->
    <p v-else-if="loadingCoupons" class="text-sm text-neutral-500">{{ t("messages.general.loading") }}</p>

    <!-- 可选券列表 -->
    <div v-else-if="usableCoupons.length" class="space-y-2">
      <div
        v-for="c in usableCoupons"
        :key="c.id"
        class="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
      >
        <span class="w-24 shrink-0 font-bold text-primary-600 dark:text-primary-300">{{ walletFormatAmount(t, c) }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{{ c.template?.name || t("messages.coupon.voucher") }}</p>
          <p class="truncate text-xs text-neutral-500">{{ walletCondition(t, c) }}</p>
        </div>
        <UButton size="xs" variant="solid" :loading="applyingCode === c.code" :disabled="!!applyingCode" @click="applyFromWallet(c)">
          {{ t("messages.coupon.apply") }}
        </UButton>
      </div>
    </div>
    <p v-else class="text-sm text-neutral-500">{{ t("messages.coupon.noUsableCoupon") }}</p>
  </USlideover>
</template>