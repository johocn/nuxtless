<script setup lang="ts">
import { saleProgress } from "../../utils/coupon-mall";
import { couponYuan } from "../../utils/coupon";

/** 券店首页版式 B：面额大字宫格卡（对齐 mockup 版式 B）。购买动作 emit。 */
const props = defineProps<{
  tpl: Record<string, any>;
  buying?: boolean;
}>();
const emit = defineEmits<{ (e: "buy"): void }>();
const { t } = useI18n();
const progress = computed(() =>
  saleProgress({
    claimedCount: props.tpl.claimedCount,
    totalCount: props.tpl.totalCount,
    claimable: props.tpl.claimable ?? null,
  }),
);
/** PERCENT 类型 discountValue=85 表示 8.5 折：discountValue/10 展示 */
const percentOff = computed(() => {
  if (!props.tpl.discountValue || props.tpl.type !== "PERCENT") return null;
  return (props.tpl.discountValue / 10).toString().replace(/\.0$/, "");
});
</script>

<template>
  <div class="grid-card" :class="{ soldout: progress.soldOut }">
    <span class="face">¥{{ couponYuan(tpl.discountValue) }}</span>
    <span class="cond">
      {{ tpl.minSpend > 0 ? t("messages.coupon.minSpend", { n: couponYuan(tpl.minSpend) }) : t("messages.coupon.noThreshold") }}
      · {{ percentOff ? t("messages.couponStore.percentOff", { v: percentOff }) : t("messages.couponStore.floorIntro") }}
    </span>
    <div class="foot">
      <span class="price">¥{{ couponYuan(tpl.salePrice) }}</span>
      <UButton size="xs" :disabled="progress.soldOut || buying" :loading="buying" @click="emit('buy')">
        {{ progress.soldOut ? t("messages.couponMall.soldOut") : t("messages.couponStore.gridBuy") }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.grid-card { display: flex; flex-direction: column; gap: 4px; background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 12px; }
.grid-card.soldout { opacity: .55; }
.face { font-size: 20px; font-weight: 700; color: var(--ui-primary); }
.cond { font-size: 12px; color: var(--ui-text-muted); }
.foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.price { font-size: 15px; font-weight: 600; }
</style>
