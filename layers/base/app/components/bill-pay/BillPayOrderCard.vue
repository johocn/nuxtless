<script setup lang="ts">
import { billpayYuan, isQuoteExpired, type BillPayOrder } from "~~/layers/base/app/composables/useBillPay";

/**
 * 委托单列表卡：商家 + 应付/预计金额 + 状态 + 下一步动作提示。
 */
const props = defineProps<{ order: BillPayOrder }>();

const { t } = useI18n();
const localePath = useTenantLocalePath();

const statusKey = computed(() => `messages.billpay.status${props.order.status}`);
const expired = computed(() => isQuoteExpired(props.order));

const mainAmount = computed(() => {
  const o = props.order;
  if (o.quoteAmount != null && !expired.value) return o.quoteAmount;
  return o.expectedAmount;
});
const amountLabel = computed(() =>
  props.order.quoteAmount != null && !expired.value ? t("messages.billpay.payable") : t("messages.billpay.expectedAmount"),
);
const nextHint = computed(() => {
  const o = props.order;
  if (expired.value) return t("messages.billpay.hintQuoteExpired");
  switch (o.status) {
    case "PENDING_QUOTE":
      return t("messages.billpay.hintPendingQuote");
    case "QUOTED":
      return t("messages.billpay.hintQuoted");
    case "PAID":
      return t("messages.billpay.hintPaid");
    case "IN_SERVICE":
      return t("messages.billpay.hintInService");
    case "COMPLETED":
      return t("messages.billpay.hintCompleted");
    case "SETTLED":
      return t("messages.billpay.hintSettled");
    default:
      return "";
  }
});
</script>

<template>
  <NuxtLink :to="localePath(`/billpay/orders/${order.id}`)" class="card">
    <div class="row1">
      <span class="merchant">{{ order.merchantName }}</span>
      <span class="status" :class="{ warn: ['PENDING_QUOTE', 'QUOTED'].includes(order.status) && !expired }">
        {{ expired ? t("messages.billpay.statusQuoteExpired") : t(statusKey) }}
      </span>
    </div>
    <div class="row2">
      <span class="amount-label">{{ amountLabel }}</span>
      <span class="amount">¥{{ billpayYuan(mainAmount) }}</span>
    </div>
    <div class="row3">
      <span>{{ new Date(order.createdAt).toLocaleString() }}</span>
      <span class="hint">{{ nextHint }}</span>
    </div>
  </NuxtLink>
</template>

<style scoped>
.card { display: flex; flex-direction: column; gap: 8px; border-radius: 14px; border: 1px solid var(--ui-border); background: var(--ui-bg); padding: 14px 16px; }
.row1 { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.merchant { font-size: 15px; font-weight: 600; color: var(--ui-text-highlighted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { flex: none; font-size: 12px; color: var(--ui-text-muted); }
.status.warn { color: var(--ui-warning); font-weight: 600; }
.row2 { display: flex; align-items: baseline; justify-content: space-between; }
.amount-label { font-size: 12px; color: var(--ui-text-muted); }
.amount { font-size: 20px; font-weight: 700; color: var(--ui-primary); font-variant-numeric: tabular-nums; }
.row3 { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--ui-text-muted); }
.hint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
