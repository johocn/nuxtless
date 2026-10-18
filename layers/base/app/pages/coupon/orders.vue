<script setup lang="ts">
import type { CouponSaleOrder } from "~~/layers/base/app/composables/useCoupon";
import { getMyCouponSaleOrders, createWechatCouponPayment, payCouponSaleWithBalance, couponErrorMessage } from "~~/layers/base/app/composables/useCoupon";
import { invokeWechatPay, isWechatBrowser } from "~~/layers/base/app/utils/coupon";

/**
 * 券单（我的券购买订单）：单券/券包出售单列表 + 未支付单继续支付（复用 PaySheet 链路）。
 * 未支付单在 PaySheet 关闭时不自动取消（区别于购买页——券单页允许保留 PENDING 稍后支付）。
 */
definePageMeta({ title: "messages.couponSaleOrders.title" });

const { t } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());
const loading = ref(true);
const orders = ref<CouponSaleOrder[]>([]);

const paySheetOpen = ref(false);
const paying = ref(false);
const payMode = ref<"WECHAT" | "BALANCE">("WECHAT");
const pendingOrder = ref<CouponSaleOrder | null>(null);

async function load() {
  loading.value = true;
  try {
    // 未登录：API 必然 FORBIDDEN，直接引导登录而不是报错 toast
    if (!isAuthenticated.value) {
      orders.value = [];
      navigateTo(localePath("/account/login"));
      return;
    }
    orders.value = (await getMyCouponSaleOrders()) ?? [];
  } catch (e) {
    toast.add({ title: t("messages.couponSaleOrders.loadFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function statusText(s: string) {
  const key = `messages.couponSaleOrders.status${s}` as const;
  const text = t(key);
  return text === key ? s : text;
}

function kindText(o: CouponSaleOrder) {
  return o.bundleId ? t("messages.couponSaleOrders.bundleItem") : t("messages.couponSaleOrders.templateItem");
}

function payAgain(o: CouponSaleOrder) {
  pendingOrder.value = o;
  payMode.value = isWechatBrowser() ? "WECHAT" : "BALANCE";
  paySheetOpen.value = true;
}

async function confirmPay() {
  const order = pendingOrder.value;
  if (!order || paying.value) return;
  paying.value = true;
  try {
    if (payMode.value === "BALANCE") {
      await payCouponSaleWithBalance(order.id);
      paySheetOpen.value = false;
      toast.add({ title: t("messages.coupon.paySuccess"), color: "success" });
      await load();
    } else {
      if (!isWechatBrowser()) {
        toast.add({ title: t("messages.coupon.notInWechat"), color: "warning" });
        return;
      }
      const res = await createWechatCouponPayment(order.id, "JSAPI");
      if (!res?.pay?.paySign) {
        toast.add({ title: t("messages.coupon.noOpenid"), color: "warning" });
        return;
      }
      await invokeWechatPay(res.pay);
      paySheetOpen.value = false;
      toast.add({ title: t("messages.coupon.paySuccess"), color: "success" });
      await load();
    }
  } catch (e) {
    toast.add({ title: t("messages.coupon.payFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    paying.value = false;
  }
}

function closePaySheet() {
  paySheetOpen.value = false;
  pendingOrder.value = null;
}
</script>

<template>
  <main class="mx-auto my-6 w-full max-w-3xl px-3 pb-24">
    <h1 class="mb-3 text-lg font-semibold">{{ t("messages.couponSaleOrders.title") }}</h1>

    <BaseLoader v-if="loading" width="sm:w-xs" />
    <UCard v-else-if="!orders.length" class="text-center text-(--ui-text-muted)">
      {{ t("messages.couponSaleOrders.empty") }}
    </UCard>

    <ul v-else class="flex flex-col gap-2">
      <li v-for="o in orders" :key="o.id" class="flex items-center justify-between rounded-xl border border-default bg-(--ui-bg) px-3 py-2.5">
        <div>
          <div class="text-sm font-medium">{{ kindText(o) }} · ¥{{ (o.amount / 100).toFixed(2) }}</div>
          <div class="mt-0.5 text-xs text-(--ui-text-muted)">{{ new Date(o.createdAt).toLocaleString() }}</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs" :class="o.status === 'PENDING' ? 'text-(--ui-warning)' : 'text-(--ui-text-muted)'">
            {{ statusText(o.status) }}
          </span>
          <UButton v-if="o.status === 'PENDING'" size="xs" @click="payAgain(o)">
            {{ t("messages.couponSaleOrders.payAgain") }}
          </UButton>
        </div>
      </li>
    </ul>

    <CouponPaySheet
      v-if="paySheetOpen"
      v-model="payMode"
      :name="t('messages.couponSaleOrders.title')"
      :amount="pendingOrder?.amount ?? 0"
      :paying="paying"
      @confirm="confirmPay"
      @close="closePaySheet"
    />
  </main>
</template>
