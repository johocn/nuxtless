<script setup lang="ts">
// 分账汇总块：合并单支付后按各商户（租户）展示应计入金额（含税实收口径，spec §8）。
// 展示每商户分账 + 应付款总额 + 合并提示。数据源 orderStore.merchantSplit（GetOrderMerchantSplit）。
import type { MerchantSplitInfo } from "~~/types/order";

const { t } = useI18n();
const orderStore = useOrderStore();

await orderStore.fetchOrderMerchantSplit();

const { merchantSplit } = storeToRefs(orderStore);

const split = computed<MerchantSplitInfo[]>(() => merchantSplit.value ?? []);

const payableTotal = computed(() =>
  split.value.reduce((acc, s) => acc + (s.amount ?? 0), 0),
);

const fmt = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
</script>

<template>
  <section
    v-if="split.length"
    aria-labelledby="per-box-summary-heading"
    class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
  >
    <h3 id="per-box-summary-heading" class="mb-3 font-medium text-neutral-900 dark:text-neutral-100">
      {{ t("messages.checkout.settlementTitle") }}
    </h3>

    <p class="mb-2 text-xs text-primary-600 dark:text-primary-400">
      {{ t("messages.checkout.mergeToOneOrder") }}
    </p>

    <dl class="space-y-1 text-sm">
      <div
        v-for="s in split"
        :key="s.tenantChannelId || s.tenantName"
        class="flex items-center justify-between text-neutral-600 dark:text-neutral-300"
      >
        <dt class="min-w-0 truncate">{{ s.tenantName }}</dt>
        <dd class="shrink-0 font-medium">{{ fmt(s.amount ?? 0) }}</dd>
      </div>
    </dl>

    <div class="mt-3 flex items-center justify-between border-t border-neutral-200 pt-2 text-sm font-semibold dark:border-neutral-800">
      <span>{{ t("messages.checkout.payableTotal") }}</span>
      <span class="text-primary-600 dark:text-primary-400">{{ fmt(payableTotal) }}</span>
    </div>
  </section>
</template>

<style lang="css" scoped></style>