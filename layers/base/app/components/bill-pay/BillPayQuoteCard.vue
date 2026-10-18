<script setup lang="ts">
import { billpayYuan, billpayLabel, type BillPayConfig, type QuotePreview } from "~~/layers/base/app/composables/useBillPay";

/**
 * 报价卡（算账式透明展示，mockup A 版式）：
 * 预计账单 → 优惠明细（会员折扣/满减，含标签与金额）→ 应付。
 * preview 为 null 或不可报价时渲染占位/提示文案。
 */
const props = defineProps<{
  config: BillPayConfig | null;
  preview: QuotePreview | null;
  /** 预计账单金额（分） */
  baseAmount: number;
  /** 预估失效提示（如低于起价），有值时整卡置灰并显示提示 */
  hint?: string;
}>();

const { t, locale } = useI18n();

const ruleText = (label: unknown, fallback: string): string => {
  const s = billpayLabel(label as any, locale.value);
  return s || fallback;
};
</script>

<template>
  <div class="quote-card" :class="{ muted: !!hint }">
    <div v-if="!preview || preview.payable == null" class="q-row q-empty">
      <span>{{ hint || t("messages.billpay.quotePending") }}</span>
    </div>
    <template v-else>
      <div class="q-row">
        <span class="q-label">{{ t("messages.billpay.expectedAmount") }}</span>
        <span class="q-value">¥{{ billpayYuan(baseAmount) }}</span>
      </div>
      <div v-for="(d, i) in preview.discountDetail" :key="i" class="q-row">
        <span class="q-label">
          <span class="q-tag">{{ d.rule === "memberDiscount" ? t("messages.billpay.tagMember") : t("messages.billpay.tagThreshold") }}</span>
          {{ ruleText(d.label, d.rule === "memberDiscount" ? t("messages.billpay.tagMember") : t("messages.billpay.tagThreshold")) }}
        </span>
        <span class="q-value q-minus">-¥{{ billpayYuan(d.amount) }}</span>
      </div>
      <div class="q-row q-total">
        <span class="q-label">{{ t("messages.billpay.payable") }}</span>
        <span class="q-amount"><i>¥</i>{{ billpayYuan(preview.payable) }}</span>
      </div>
      <div v-if="config?.quoteExpireMinutes" class="q-note">
        {{ t("messages.billpay.quoteExpireNote", { minutes: config.quoteExpireMinutes }) }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.quote-card { border-radius: 14px; background: var(--ui-bg); border: 1px solid var(--ui-border); padding: 14px 16px; }
.quote-card.muted { opacity: .6; }
.q-row { display: flex; align-items: center; justify-content: space-between; min-height: 30px; font-size: 14px; }
.q-empty { color: var(--ui-text-muted); justify-content: center; min-height: 44px; }
.q-label { color: var(--ui-text-muted); display: flex; align-items: center; gap: 6px; }
.q-value { font-variant-numeric: tabular-nums; }
.q-minus { color: var(--ui-primary); }
.q-tag { display: inline-block; border-radius: 999px; background: color-mix(in oklab, var(--ui-primary) 12%, transparent); color: var(--ui-primary); font-size: 11px; padding: 1px 8px; line-height: 1.6; }
.q-total { border-top: 1px dashed var(--ui-border); margin-top: 6px; padding-top: 10px; }
.q-amount { color: var(--ui-primary); font-weight: 700; font-size: 22px; font-variant-numeric: tabular-nums; }
.q-amount i { font-style: normal; font-size: 14px; margin-right: 2px; }
.q-note { margin-top: 8px; font-size: 12px; color: var(--ui-text-muted); }
</style>
