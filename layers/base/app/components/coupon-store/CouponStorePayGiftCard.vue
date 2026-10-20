<script setup lang="ts">
/**
 * 支付有礼提示卡（FR-F3，方案 A 共用卡）：
 * 订单支付成功（PaymentSettled）后在本店订单详情页展示一次——
 * 「支付成功 · 奖励券已自动放入券包」（发放由后端事件自动完成，不满足活动条件时后端静默跳过）。
 * 仅在本店配置了 couponPayGift 时渲染；每订单会话内只展示一次（sessionStorage 防重）。
 */
const props = defineProps<{ orderId: string | number; orderState?: string | null }>();

const { t } = useI18n();
const localePath = useTenantLocalePath();
const { customFields } = useChannelTheme();

/** 本店已配置支付有礼（enabled 或缺省视为启用，templateId 有值才算配置） */
const configured = computed(() => {
  const raw = customFields.value?.couponPayGift;
  if (!raw) return false;
  try {
    const cfg = typeof raw === "string" ? JSON.parse(raw) : raw;
    return !!cfg?.templateId && cfg.enabled !== false;
  } catch {
    return false;
  }
});

/** 支付成功态（PaymentSettled 及之后的所有状态都算已支付完成） */
const settled = computed(() => {
  const s = String(props.orderState ?? "");
  return ["PaymentSettled", "Delivered", "PartiallyDelivered", "Shipped", "Completed"].includes(s);
});

/** 每订单会话一次（支付回跳与重复进订单页不重复打扰） */
const show = computed(() => {
  if (import.meta.server) return false;
  return configured.value && settled.value && !sessionStorage.getItem(`payGiftShown:${props.orderId}`);
});

function dismiss() {
  if (import.meta.client) sessionStorage.setItem(`payGiftShown:${String(props.orderId)}`, "1");
}
</script>

<template>
  <div v-if="show" class="pg-card" data-testid="pay-gift-card">
    <div class="ic">✓</div>
    <div class="tx">
      <div class="t1">{{ t("messages.couponStore.payGiftTitle") }}</div>
      <div class="t2">{{ t("messages.couponStore.payGiftDesc") }}</div>
    </div>
    <NuxtLink :to="localePath('/coupon')" class="go" data-testid="pay-gift-go" @click="dismiss">
      {{ t("messages.couponStore.payGiftGo") }}
    </NuxtLink>
  </div>
</template>

<style scoped>
.pg-card { display: flex; align-items: center; gap: 10px; border-radius: 12px; background: color-mix(in srgb, var(--ui-primary) 8%, var(--ui-bg)); padding: 12px 14px; margin: 12px 0; }
.ic { flex: none; width: 28px; height: 28px; border-radius: 999px; background: var(--ui-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; }
.tx { flex: 1; min-width: 0; }
.t1 { font-size: 14px; font-weight: 600; }
.t2 { margin-top: 2px; font-size: 12px; color: var(--ui-text-muted); }
.go { flex: none; border-radius: 999px; background: var(--ui-primary); color: #fff; font-size: 12px; font-weight: 600; padding: 6px 14px; text-decoration: none; }
</style>
