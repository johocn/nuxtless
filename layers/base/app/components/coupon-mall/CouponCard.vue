<script setup lang="ts">
import { saleProgress, hasDetail } from "../../utils/coupon-mall";
import { couponYuan } from "../../utils/coupon";

/**
 * 券商城：单券抢购卡（进度/售罄置灰/详情入口）。购买与详情动作 emit 给页面执行。
 */
const props = defineProps<{
  tpl: Record<string, any>;
  buying?: boolean;
}>();
const emit = defineEmits<{ (e: "buy"): void; (e: "detail"): void }>();
const { t, locale } = useI18n();
const progress = computed(() =>
  saleProgress({
    claimedCount: props.tpl.claimedCount,
    totalCount: props.tpl.totalCount,
    claimable: props.tpl.claimable ?? null,
  }),
);
const detailable = computed(() => hasDetail(props.tpl.description, locale.value));
</script>

<template>
  <div class="mall-card" :class="{ soldout: progress.soldOut }" @click="detailable && emit('detail')">
    <div class="left">
      <span class="amount">{{ couponYuan(tpl.discountValue) }}</span>
      <span class="cond">{{ tpl.minSpend > 0 ? t("messages.coupon.minSpend", { n: couponYuan(tpl.minSpend) }) : t("messages.coupon.noThreshold") }}</span>
    </div>
    <div class="right">
      <div class="row1">
        <span class="name">{{ localizeText(tpl.name, locale) }}</span>
        <span class="scene">{{ tpl.usageScene === "IN_STORE" ? t("messages.coupon.sceneStore") : t("messages.coupon.sceneOnline") }}</span>
      </div>
      <div v-if="progress.percent !== null" class="track">
        <div class="fill" :style="{ width: progress.percent + '%' }" />
      </div>
      <div class="row2">
        <span class="meta">
          {{ progress.soldOut
            ? t("messages.couponMall.soldOut")
            : progress.percent !== null
              ? t("messages.couponMall.claimedProgress", { p: progress.percent })
              : "" }}
        </span>
        <div class="actions">
          <span v-if="detailable" class="detail" @click.stop="emit('detail')">{{ t("messages.couponMall.viewDetail") }}</span>
          <UButton
            size="sm"
            :disabled="progress.soldOut || buying"
            :loading="buying"
            @click.stop="emit('buy')"
          >
            {{ t("messages.couponMall.buyNow") }} ¥{{ couponYuan(tpl.salePrice) }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mall-card { display: flex; gap: 12px; background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 12px; }
.mall-card.soldout { opacity: 0.55; }
.left { min-width: 72px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-right: 1px dashed var(--ui-border); padding-right: 12px; }
.amount { font-size: 20px; font-weight: 700; color: var(--ui-primary); }
.cond { font-size: 11px; color: var(--ui-text-muted); }
.right { flex: 1; display: flex; flex-direction: column; gap: 6px; justify-content: center; }
.row1, .row2 { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.name { font-size: 14px; font-weight: 600; }
.scene { font-size: 10px; color: var(--ui-primary); background: var(--ui-bg-elevated); border-radius: 999px; padding: 1px 8px; }
.track { height: 6px; border-radius: 999px; background: var(--ui-bg-elevated); overflow: hidden; }
.fill { height: 100%; background: var(--ui-primary); border-radius: 999px; }
.meta { font-size: 11px; color: var(--ui-text-muted); }
.actions { display: flex; align-items: center; gap: 8px; }
.detail { font-size: 12px; color: var(--ui-text-muted); }
</style>
