<script setup lang="ts">
import { UButton } from "#components";
import BillPayStatusTimeline from "~~/layers/base/app/components/bill-pay/BillPayStatusTimeline.vue";
import { invokeWechatPay, isWechatBrowser } from "~~/layers/base/app/utils/coupon";
import CouponPaySheet from "~~/layers/base/app/components/coupon/PaySheet.vue";
import {
  billpayYuan,
  billpayErrorMessage,
  getBillPayOrder,
  cancelBillPayOrder,
  createWechatBillPayment,
  payBillPayOrderWithBalance,
  isQuoteExpired,
  type BillPayOrder,
} from "~~/layers/base/app/composables/useBillPay";

/**
 * 委托单详情：状态时间线 + 报价/凭证 + 动作（支付/取消/继续支付）。
 * 取消仅 PENDING_QUOTE/QUOTED 自助；IN_SERVICE 后人工客服。
 */
definePageMeta({ title: "messages.billpay.orderDetail" });

const route = useRoute();
const { t } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());

const loading = ref(true);
const order = ref<BillPayOrder | null>(null);

const paying = ref(false);
const paySheetOpen = ref(false);
const payMode = ref<"WECHAT" | "BALANCE">("WECHAT");
const cancelling = ref(false);

async function load() {
  loading.value = true;
  try {
    if (!isAuthenticated.value) {
      navigateTo(localePath("/account/login"));
      return;
    }
    order.value = await getBillPayOrder(String(route.params.id));
  } catch (e) {
    toast.add({ title: t("messages.billpay.loadFailed"), description: billpayErrorMessage(e), color: "error" });
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const quoteExpired = computed(() => (order.value ? isQuoteExpired(order.value) : false));
const canPay = computed(() => order.value?.status === "QUOTED" && order.value.quoteAmount != null && !quoteExpired.value);
const canCancel = computed(() =>
  ["PENDING_QUOTE", "QUOTED"].includes(order.value?.status ?? "") && !quoteExpired.value,
);

/** 微信支付后短轮询确认（对齐券单链路） */
async function waitForPaid(orderId: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      const o = await getBillPayOrder(orderId);
      if (o.status === "PAID") {
        order.value = o;
        return;
      }
    } catch {
      // 继续重试
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

function openPaySheet() {
  payMode.value = isWechatBrowser() ? "WECHAT" : "BALANCE";
  paySheetOpen.value = true;
}

async function confirmPay() {
  const o = order.value;
  if (!o || paying.value) return;
  paying.value = true;
  try {
    if (payMode.value === "BALANCE") {
      order.value = await payBillPayOrderWithBalance(o.id);
      paySheetOpen.value = false;
      toast.add({ title: t("messages.billpay.paySuccess"), color: "success" });
    } else {
      if (!isWechatBrowser()) {
        toast.add({ title: t("messages.coupon.notInWechat"), color: "warning" });
        return;
      }
      const res = await createWechatBillPayment(o.id);
      if (!res?.pay?.paySign) {
        toast.add({ title: t("messages.coupon.noOpenid"), color: "warning" });
        return;
      }
      try {
        await invokeWechatPay(res.pay);
      } catch (e) {
        toast.add({ title: t("messages.coupon.payCancelled"), description: billpayErrorMessage(e), color: "error" });
        return;
      }
      await waitForPaid(o.id);
      paySheetOpen.value = false;
      toast.add({ title: t("messages.billpay.paySuccess"), color: "success" });
    }
  } catch (e) {
    toast.add({ title: t("messages.coupon.payFailed"), description: billpayErrorMessage(e), color: "error" });
  } finally {
    paying.value = false;
  }
}

async function cancelOrder() {
  const o = order.value;
  if (!o || cancelling.value) return;
  cancelling.value = true;
  try {
    order.value = await cancelBillPayOrder(o.id);
    toast.add({ title: t("messages.billpay.cancelSuccess"), color: "success" });
  } catch (e) {
    toast.add({ title: t("messages.billpay.cancelFailed"), description: billpayErrorMessage(e), color: "error" });
  } finally {
    cancelling.value = false;
  }
}
</script>

<template>
  <main class="mx-auto my-4 w-full max-w-3xl px-3 pb-24">
    <div class="mb-3 flex items-center gap-2">
      <UButton variant="ghost" size="xs" icon="i-lucide-arrow-left" :to="localePath('/billpay/orders')" />
      <h1 class="text-lg font-semibold">{{ t("messages.billpay.orderDetail") }}</h1>
    </div>

    <BaseLoader v-if="loading" width="sm:w-xs" />
    <UCard v-else-if="!order" class="text-center text-(--ui-text-muted)">
      {{ t("messages.billpay.loadFailed") }}
    </UCard>

    <template v-else>
      <!-- 状态头 -->
      <div class="head">
        <div class="head-status">{{ quoteExpired && order.status === 'QUOTED' ? t('messages.billpay.statusQuoteExpired') : t(`messages.billpay.status${order.status}`) }}</div>
        <div class="head-amount">
          <template v-if="order.quoteAmount != null && !quoteExpired">¥{{ billpayYuan(order.quoteAmount) }}</template>
          <template v-else>¥{{ billpayYuan(order.expectedAmount) }}</template>
        </div>
        <div class="head-code">{{ order.code }}</div>
      </div>

      <!-- 时间线 -->
      <section class="panel">
        <h2 class="panel-title">{{ t("messages.billpay.timelineTitle") }}</h2>
        <BillPayStatusTimeline :order="order" />
      </section>

      <!-- 信息 -->
      <section class="panel">
        <div class="info-row">
          <span>{{ t("messages.billpay.merchantName") }}</span>
          <span class="info-strong">{{ order.merchantName }}</span>
        </div>
        <div class="info-row">
          <span>{{ t("messages.billpay.expectedAmount") }}</span>
          <span>¥{{ billpayYuan(order.expectedAmount) }}</span>
        </div>
        <div v-if="order.discountDetail?.length" class="info-col">
          <span>{{ t("messages.billpay.discountTitle") }}</span>
          <span v-for="(d, i) in (order.discountDetail as any[])" :key="i" class="discount-line">
            -¥{{ billpayYuan(d.amount) }}
          </span>
        </div>
        <div v-if="order.quoteNote" class="info-col">
          <span>{{ t("messages.billpay.quoteNoteTitle") }}</span>
          <span>{{ order.quoteNote }}</span>
        </div>
        <div v-if="order.remark" class="info-col">
          <span>{{ t("messages.billpay.remarkTitle") }}</span>
          <span>{{ order.remark }}</span>
        </div>
        <div v-if="order.proofUrl" class="info-col">
          <span>{{ t("messages.billpay.proofTitle") }}</span>
          <img :src="order.proofUrl" class="proof-img" :alt="t('messages.billpay.proofTitle')" loading="lazy" />
        </div>
        <div v-if="order.paymentMethod" class="info-row">
          <span>{{ t("messages.billpay.payMethodTitle") }}</span>
          <span>{{ order.paymentMethod === 'balance' ? t('messages.billpay.payBalance') : t('messages.billpay.payWechat') }}</span>
        </div>
      </section>

      <!-- 动作 -->
      <div class="actions">
        <UButton v-if="canPay" block size="lg" @click="openPaySheet">
          {{ t("messages.billpay.payNow", { amount: billpayYuan(order.quoteAmount) }) }}
        </UButton>
        <UButton
          v-if="canCancel"
          block
          size="lg"
          variant="soft"
          color="error"
          :loading="cancelling"
          @click="cancelOrder"
        >
          {{ t("messages.billpay.cancelOrder") }}
        </UButton>
        <p v-if="order.status === 'IN_SERVICE'" class="service-hint">{{ t("messages.billpay.inServiceHint") }}</p>
        <p v-if="order.status === 'PENDING_QUOTE'" class="service-hint">{{ t("messages.billpay.waitQuoteHint") }}</p>
      </div>
    </template>

    <CouponPaySheet
      v-if="paySheetOpen && order"
      v-model="payMode"
      :name="t('messages.billpay.paySheetName', { merchant: order.merchantName })"
      :amount="order.quoteAmount ?? 0"
      :paying="paying"
      @confirm="confirmPay"
      @close="paySheetOpen = false"
    />
  </main>
</template>

<style scoped>
.head { border-radius: 14px; background: var(--ui-primary); color: #fff; padding: 18px 16px; display: flex; flex-direction: column; gap: 4px; }
.head-status { font-size: 14px; opacity: .9; }
.head-amount { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.head-code { font-size: 11px; opacity: .7; letter-spacing: .04em; }
.panel { margin-top: 12px; border-radius: 14px; border: 1px solid var(--ui-border); background: var(--ui-bg); padding: 14px 16px; }
.panel-title { margin-bottom: 10px; font-size: 13px; font-weight: 600; color: var(--ui-text-highlighted); }
.info-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 32px; font-size: 14px; color: var(--ui-text-muted); }
.info-row > span:last-child { color: var(--ui-text); text-align: right; }
.info-strong { font-weight: 600; }
.info-col { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; font-size: 14px; color: var(--ui-text-muted); }
.info-col > span:last-child { color: var(--ui-text); }
.discount-line { color: var(--ui-primary); }
.proof-img { margin-top: 4px; max-height: 260px; width: auto; border-radius: 10px; border: 1px solid var(--ui-border); }
.actions { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.service-hint { text-align: center; font-size: 12px; color: var(--ui-text-muted); }
</style>
