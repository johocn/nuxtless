<script setup lang="ts">
import { saleCardProgress, couponAnchorYuan } from "../../utils/coupon-mall";
import { couponYuan } from "../../utils/coupon";

/** 券店首页版式 B：面额大字宫格卡（对齐 mockup 版式 B）。购买动作 emit。售卖场景用 saleCardProgress（忽略 claimable）。 */
const props = defineProps<{
  tpl: Record<string, any>;
  buying?: boolean;
}>();
const emit = defineEmits<{ (e: "buy"): void }>();
const { t } = useI18n();
const progress = computed(() => saleCardProgress(props.tpl));
/** PERCENT 类型 discountValue=85 表示 8.5 折：discountValue/10 展示 */
const percentOff = computed(() => {
  if (!props.tpl.discountValue || props.tpl.type !== "PERCENT") return null;
  return (props.tpl.discountValue / 10).toString().replace(/\.0$/, "");
});
/** 真实已售数（PAID 聚合）；>0 才展示 */
const soldCount = computed(() => Math.max(0, Number(props.tpl.soldCount ?? 0)));
/** 划线锚定价（仅当高于售价时返回元字符串） */
const anchor = computed(() => couponAnchorYuan(props.tpl));
</script>

<template>
  <div class="grid-card" :class="{ soldout: progress.soldOut }">
    <span class="face">¥{{ couponYuan(tpl.discountValue) }}</span>
    <span class="cond">
      {{ tpl.minSpend > 0 ? t("messages.coupon.minSpend", { n: couponYuan(tpl.minSpend) }) : t("messages.coupon.noThreshold") }}
      · {{ percentOff ? t("messages.couponStore.percentOff", { v: percentOff, s: Math.max(0, 100 - (tpl.discountValue ?? 0)) }) : t("messages.couponStore.floorIntro") }}
    </span>
    <div class="foot">
      <span class="price-wrap">
        <s v-if="anchor" class="anchor">¥{{ anchor }}</s>
        <span class="price">¥{{ couponYuan(tpl.salePrice) }}</span>
      </span>
      <UButton size="xs" :disabled="progress.soldOut || buying" :loading="buying" @click="emit('buy')">
        {{ progress.soldOut ? t("messages.couponMall.soldOut") : t("messages.couponStore.gridBuy") }}
      </UButton>
    </div>
    <span v-if="soldCount > 0" class="sold">{{ t("messages.couponStore.soldCount", { n: soldCount }) }}</span>
  </div>
</template>

<style scoped>
.grid-card { display: flex; flex-direction: column; gap: 4px; background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 12px; }
.grid-card.soldout { opacity: .55; }
.face { font-size: 20px; font-weight: 700; color: var(--ui-primary); }
.cond { font-size: 12px; color: var(--ui-text-muted); }
.foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.price-wrap { display: flex; align-items: baseline; gap: 4px; min-width: 0; }
.anchor { font-size: 11px; color: var(--ui-text-dimmed); }
.price { font-size: 15px; font-weight: 600; }
.sold { font-size: 11px; color: var(--ui-text-dimmed); }
</style>
