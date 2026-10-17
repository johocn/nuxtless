<script setup lang="ts">
import { couponYuan } from "../../utils/coupon";

/**
 * 券商城：积分兑换行卡。兑换动作 emit 给页面执行（需登录 + API）。
 */
defineProps<{ tpl: Record<string, any>; exchanging?: boolean }>();
const emit = defineEmits<{ (e: "exchange"): void }>();
const { t, locale } = useI18n();
</script>

<template>
  <div class="points-card">
    <div class="left">
      <span class="amount">{{ couponYuan(tpl.discountValue) }}</span>
      <span class="name">{{ localizeText(tpl.name, locale) }}</span>
    </div>
    <div class="right">
      <span class="price">{{ t("messages.couponMall.pointsPrice", { p: tpl.pointsPrice }) }}</span>
      <UButton size="sm" variant="soft" :disabled="exchanging" :loading="exchanging" @click="emit('exchange')">
        {{ t("messages.couponMall.exchange") }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.points-card { display: flex; justify-content: space-between; align-items: center; background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 10px 12px; }
.left { display: flex; align-items: baseline; gap: 8px; }
.amount { font-size: 18px; font-weight: 700; color: var(--ui-primary); }
.name { font-size: 13px; }
.right { display: flex; align-items: center; gap: 10px; }
.price { font-size: 13px; color: var(--ui-text-muted); }
</style>
