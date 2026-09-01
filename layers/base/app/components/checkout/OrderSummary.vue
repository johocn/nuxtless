<script setup lang="ts">
import type { ActiveOrderDetail } from "~~/types/order";
import type {
  CouponStatus,
  CustomerCoupon,
  CouponTemplate,
} from "~~/layers/base/app/composables/useCoupon";
import {
  getMyCoupons,
  applyCouponToOrder,
  clearCouponFromOrder,
  couponErrorMessage,
} from "~~/layers/base/app/composables/useCoupon";

const { disabled, onSubmit } = defineProps<{
  disabled?: boolean;
  onSubmit: () => Promise<void> | void;
}>();

const { t } = useI18n();
const localePath = useLocalePath();
const toast = useToast();
const orderStore = useOrderStore();
const { order, loading } = storeToRefs(orderStore);
const { isAuthenticated } = storeToRefs(useAuthStore());
const activeOrder = order as Ref<ActiveOrderDetail>;

const subTotal = computed(() => (activeOrder.value?.subTotal / 100).toFixed(2));

const orderTotal = computed(() =>
  (activeOrder.value?.totalWithTax / 100).toFixed(2),
);

const orderTaxTotal = computed(() => {
  const taxTotal = activeOrder.value?.taxSummary?.[0]?.taxTotal;
  return taxTotal != null ? (taxTotal / 100).toFixed(2) : null;
});

const shippingWithTax = computed(() =>
  (activeOrder.value?.shippingWithTax / 100).toFixed(2),
);

// ─────────────────────────────────────────────────────────────
// 券包选券（coupon-plugin）
// ─────────────────────────────────────────────────────────────
const walletCoupons = ref<CustomerCoupon[]>([]);
const loadingCoupons = ref(false);
const applyingCode = ref<string | null>(null);

// 一单一券：当前绑定在后端订单 customFields.couponCode 上的券码
const activeAppliedCode = computed(() =>
  (activeOrder.value?.customFields as any)?.couponCode ?? null,
);

const usableCoupons = computed(() =>
  walletCoupons.value.filter(
    (c) =>
      c.status.toUpperCase() === "UNUSED" ||
      c.status.toUpperCase() === "RETURNED",
  ),
);

async function loadWalletCoupons() {
  if (!isAuthenticated.value) return;
  loadingCoupons.value = true;
  try {
    walletCoupons.value = await getMyCoupons(
      "UNUSED" as CouponStatus,
    );
  } catch (e) {
    toast.add({
      title: t("messages.coupon.coupon"),
      description: couponErrorMessage(e),
      color: "error",
    });
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
    toast.add({
      title: t("messages.coupon.applied"),
      description: c.template?.name ?? c.code,
      color: "success",
    });
  } catch (e) {
    toast.add({
      title: t("messages.coupon.appliedError"),
      description: couponErrorMessage(e),
      color: "error",
    });
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
    toast.add({
      title: t("messages.coupon.appliedError"),
      description: couponErrorMessage(e),
      color: "error",
    });
  } finally {
    applyingCode.value = null;
  }
}

// 券展示文案
function walletFormatAmount(c: CustomerCoupon): string {
  const tpl = c.template;
  if (!tpl) return "";
  if (tpl.type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  if (tpl.type === "PERCENT") {
    const zhe = tpl.discountValue / 10;
    return zhe % 1 === 0 ? `${zhe}${t("messages.coupon.unitDiscount")}` : `${zhe.toFixed(1)}${t("messages.coupon.unitDiscount")}`;
  }
  return `¥${(tpl.discountValue / 100).toString()}`;
}

function walletCondition(c: CustomerCoupon): string {
  const tpl = c.template ?? ({} as CouponTemplate);
  const minSpend = tpl.minSpend ? tpl.minSpend / 100 : 0;
  if (tpl.type === "FREE_SHIPPING")
    return c.template?.description || t("messages.coupon.typeFreeShipping");
  if (tpl.type === "FULL") return t("messages.coupon.noThresholdFull");
  if (!minSpend) return t("messages.coupon.noThreshold");
  return t("messages.coupon.minSpend", { n: minSpend });
}

onMounted(async () => {
  if (isAuthenticated.value) await loadWalletCoupons();
});
</script>

<template>
  <UCard variant="soft" class="h-min">
    <CartItem v-for="line in activeOrder?.lines" :key="line.id" :line="line" />

    <div class="mt-6 flex gap-4">
      <UInput
        icon="i-lucide-ticket-percent"
        :placeholder="t('messages.shop.couponCode')"
        class="w-full"
      />
      <UButton class="px-7">{{ t("messages.general.apply") }}</UButton>
    </div>

    <!-- 券包选券（coupon-plugin） -->
    <div class="mt-5 border-t border-(--ui-border) pt-5">
      <div class="flex items-center justify-between">
        <p class="font-semibold">{{ t("messages.coupon.coupon") }}</p>
        <UButton
          v-if="isAuthenticated"
          size="xs"
          variant="soft"
          :to="localePath('/coupon')"
        >
          {{ t("messages.coupon.viewWallet") }}
        </UButton>
      </div>

      <!-- 已绑定券 -->
      <div
        v-if="activeAppliedCode"
        class="mt-3 flex items-center justify-between rounded-lg border border-(--ui-primary) bg-(--ui-bg-muted) px-3 py-2"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-(--ui-primary)">
            {{ activeAppliedCode }}
          </p>
          <p class="text-xs text-(--ui-text-muted)">
            {{ t("messages.coupon.currentlyApplied") }}
          </p>
        </div>
        <UButton
          size="xs"
          variant="soft"
          color="error"
          :loading="applyingCode === 'clear'"
          @click="clearApplied"
        >
          {{ t("messages.coupon.remove") }}
        </UButton>
      </div>

      <!-- 未登录提示 -->
      <div v-else-if="!isAuthenticated" class="mt-3">
        <p class="text-sm text-(--ui-text-muted)">
          {{ t("messages.coupon.loginPromptOrder") }}
        </p>
        <UButton
          size="sm"
          variant="soft"
          class="mt-2"
          :to="localePath('/account/login')"
        >
          {{ t("messages.coupon.goLogin") }}
        </UButton>
      </div>

      <!-- 可选券列表 -->
      <div v-else-if="usableCoupons.length" class="mt-3 space-y-2">
        <div
          v-for="c in usableCoupons"
          :key="c.id"
          class="flex items-center gap-3 rounded-lg border border-(--ui-border) px-3 py-2"
        >
          <span class="w-24 shrink-0 font-bold text-(--ui-primary)">
            {{ walletFormatAmount(c) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold">
              {{ c.template?.name || t("messages.coupon.voucher") }}
            </p>
            <p class="truncate text-xs text-(--ui-text-muted)">
              {{ walletCondition(c) }}
            </p>
          </div>
          <UButton
            size="xs"
            variant="solid"
            :loading="applyingCode === c.code"
            :disabled="!!applyingCode"
            @click="applyFromWallet(c)"
          >
            {{ t("messages.coupon.apply") }}
          </UButton>
        </div>
      </div>
      <p v-else class="mt-3 text-sm text-(--ui-text-muted)">
        {{ t("messages.coupon.noUsableCoupon") }}
      </p>
    </div>

    <template #footer>
      <div class="mb-2 flex flex-col font-medium">
        <div class="flex justify-between">
          <span>{{ t("messages.shop.subtotal") }}</span>
          <span>
            {{ subTotal }}
          </span>
        </div>
        <div class="flex justify-between">
          <span>{{ t("messages.general.tax") }}</span>
          <span>
            {{ orderTaxTotal }}
          </span>
        </div>
        <div class="flex justify-between">
          <span>{{ t("messages.general.shipping") }}</span>
          <span>
            {{ shippingWithTax }}
          </span>
        </div>

        <USeparator class="my-1" />

        <div class="flex justify-between font-bold">
          <span>{{ t("messages.shop.total") }}</span>
          <span>
            {{ orderTotal }}
          </span>
        </div>
      </div>
      <UButton
        size="xl"
        color="primary"
        :loading="loading"
        :disabled="(activeOrder?.lines.length ?? 0) < 1 || disabled"
        class="w-full justify-center"
        @click="onSubmit"
      >
        <span>{{ t("messages.shop.checkout") }}</span>
        <span v-if="(activeOrder?.lines.length ?? 0) > 0">
          {{ orderTotal }} {{ activeOrder?.currencyCode }}
        </span>
      </UButton>
    </template>
  </UCard>
</template>

<style lang="css" scoped></style>