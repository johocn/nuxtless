<script setup lang="ts">
import { billpayYuan, billpayLabel, type BillPayConfig } from "~~/layers/base/app/composables/useBillPay";

/**
 * 权益边界条（店招与委托表单之间的前置公示）：
 * 会员折扣 / 满减（优先后端双语 label）+ 起付金额 / 单笔限额 / 单日限额（i18n 模板）。
 * 数值全部取 billPayConfig 动态渲染，禁止硬编码；config 为空或无可公示项时不渲染。
 */
const props = defineProps<{ config: BillPayConfig | null }>();

const { t, locale } = useI18n();

const pills = computed<{ key: string; text: string; hot: boolean }[]>(() => {
  const c = props.config;
  if (!c) return [];
  const out: { key: string; text: string; hot: boolean }[] = [];
  const md = c.memberDiscount;
  const percent = Number(md?.percent);
  if (md && percent > 0 && percent < 100) {
    out.push({
      key: "member",
      text: billpayLabel(md.label, locale.value) || t("messages.billpay.limitMember", { percent }),
      hot: true,
    });
  }
  (c.thresholds ?? []).forEach((th, i) => {
    const minSpend = Number(th?.minSpend);
    const reduce = Number(th?.reduce);
    if (!Number.isFinite(minSpend) || !Number.isFinite(reduce) || reduce <= 0) return;
    out.push({
      key: `th-${i}`,
      text:
        billpayLabel(th.label, locale.value) ||
        t("messages.billpay.limitThreshold", { spend: billpayYuan(minSpend), reduce: billpayYuan(reduce) }),
      hot: true,
    });
  });
  if (c.minAmount > 0) {
    out.push({ key: "min", text: t("messages.billpay.limitMin", { amount: billpayYuan(c.minAmount) }), hot: false });
  }
  if (c.maxAmount > 0) {
    out.push({ key: "max", text: t("messages.billpay.limitMax", { amount: billpayYuan(c.maxAmount) }), hot: false });
  }
  // 单日限额与单笔限额相同时不重复公示
  if (c.dailyLimitAmount > 0 && c.dailyLimitAmount !== c.maxAmount) {
    out.push({ key: "daily", text: t("messages.billpay.limitDaily", { amount: billpayYuan(c.dailyLimitAmount) }), hot: false });
  }
  return out;
});
</script>

<template>
  <div v-if="pills.length" class="limits-strip" role="list">
    <span v-for="p in pills" :key="p.key" role="listitem" class="pill" :class="{ hot: p.hot }">{{ p.text }}</span>
  </div>
</template>

<style scoped>
.limits-strip { display: flex; gap: 8px; overflow-x: auto; margin-bottom: 12px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.limits-strip::-webkit-scrollbar { display: none; }
.pill { flex: none; border-radius: 999px; border: 1px solid var(--ui-border); background: var(--ui-bg-muted); padding: 5px 12px; font-size: 12px; line-height: 1.4; color: var(--ui-text-muted); white-space: nowrap; }
.pill.hot { border-color: transparent; background: color-mix(in oklab, var(--ui-primary) 12%, transparent); color: var(--ui-primary); font-weight: 600; }
</style>
