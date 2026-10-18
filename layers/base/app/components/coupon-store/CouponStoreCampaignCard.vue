<script setup lang="ts">
import { couponYuan } from "../../utils/coupon";
import { couponPromoPrice } from "../../utils/coupon-mall";
import type { CouponCampaignView } from "../../composables/useCoupon";

/**
 * 券店首页倒计时活动位（版式 B 大倒计时卡片）：
 * 活动标题/副标题 + hh:mm:ss 数字块（秒级刷新，到点 emit expired 由页面摘除）
 * + 关联券 mini 卡直达详情弹层。配置来自 Channel.customFields.couponCampaign（单场），
 * 后端按服务端时间窗下发，前端只负责展示与走秒。
 */
const props = defineProps<{
  campaign: CouponCampaignView;
  promo?: { firstBuyDiscount?: number | null; firstBuyEligible?: boolean | null; studentApproved?: boolean | null };
}>();
const emit = defineEmits<{ (e: "buy", tpl: Record<string, any>): void; (e: "expired"): void }>();
const { t, locale } = useI18n();

/** 倒计时文本：SSR 首渲染为占位（与客户端一致，避免 hydration mismatch），挂载后秒级刷新 */
const cdText = ref("--:--:--");
let timer: ReturnType<typeof setInterval> | null = null;

function fmt(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function tick() {
  const remaining = Math.floor((new Date(props.campaign.endsAt).getTime() - Date.now()) / 1000);
  if (remaining <= 0) {
    stop();
    emit("expired");
    return;
  }
  cdText.value = fmt(remaining);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

onMounted(() => {
  tick();
  timer = setInterval(tick, 1000);
});
onUnmounted(stop);

const parts = computed(() => cdText.value.split(":"));

/** mini 卡展示价：优惠价（首购/学生，取低不叠加）> 原价 */
function displayPrice(tpl: Record<string, any>): string {
  const p = props.promo ? couponPromoPrice(tpl, props.promo) : null;
  return p?.yuan ?? couponYuan(tpl.salePrice);
}
const hasPromo = (tpl: Record<string, any>) => !!(props.promo && couponPromoPrice(tpl, props.promo));
const nameOf = (tpl: Record<string, any>) => String(localizeText(tpl.name, locale.value) ?? "");
</script>

<template>
  <div class="camp">
    <div class="head">
      <div class="head-txt">
        <div class="title">{{ campaign.name }}</div>
        <div v-if="campaign.subtitle" class="subtitle">{{ campaign.subtitle }}</div>
      </div>
      <div class="cd">
        <span class="cd-label">{{ t("messages.couponStore.campaignEndsIn") }}</span>
        <div class="cd-blk">
          <span class="blk">{{ parts[0] }}</span><i>:</i><span class="blk">{{ parts[1] }}</span><i>:</i><span class="blk">{{ parts[2] }}</span>
        </div>
      </div>
    </div>

    <div class="minis">
      <div v-for="tpl in campaign.templates" :key="tpl.id" class="mini" @click="emit('buy', tpl)">
        <div class="mini-name">{{ nameOf(tpl) }}</div>
        <div class="mini-price">
          <span class="now">¥{{ displayPrice(tpl) }}</span>
          <s v-if="hasPromo(tpl)" class="was">¥{{ couponYuan(tpl.salePrice) }}</s>
        </div>
        <div class="mini-btn">{{ t("messages.couponStore.campaignGrab") }}</div>
      </div>
    </div>

    <div v-if="campaign.rules" class="rules">{{ campaign.rules }}</div>
  </div>
</template>

<style scoped>
.camp { border-radius: 12px; background: #dc2626; color: #fff; padding: 14px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.head-txt { min-width: 0; }
.title { font-size: 16px; font-weight: 700; line-height: 1.4; }
.subtitle { margin-top: 2px; font-size: 12px; opacity: .85; }
.cd { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex: none; }
.cd-label { font-size: 10px; opacity: .85; white-space: nowrap; }
.cd-blk { display: flex; align-items: center; gap: 2px; }
.cd-blk .blk { border-radius: 6px; background: rgb(0 0 0 / .3); padding: 2px 5px; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.4; }
.cd-blk i { font-style: normal; font-weight: 700; opacity: .85; }
.minis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.mini { border-radius: 8px; background: var(--ui-bg); color: var(--ui-text); padding: 10px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; }
.mini-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-price { display: flex; align-items: baseline; gap: 4px; min-width: 0; }
.mini-price .now { font-size: 16px; font-weight: 700; color: #dc2626; font-variant-numeric: tabular-nums; }
.mini-price .was { font-size: 11px; color: var(--ui-text-dimmed, var(--ui-text-muted)); }
.mini-btn { margin-top: 2px; border-radius: 999px; background: #dc2626; color: #fff; font-size: 12px; font-weight: 600; text-align: center; padding: 3px 0; }
.rules { margin-top: 12px; font-size: 11px; opacity: .85; }
</style>
