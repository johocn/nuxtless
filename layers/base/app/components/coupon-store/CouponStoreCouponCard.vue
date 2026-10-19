<script setup lang="ts">
import {
  saleCardProgress,
  formatCouponDiscount,
  couponSavingsExample,
  couponSceneArt,
  couponAnchorYuan,
  couponPromoPrice,
} from "../../utils/coupon-mall";
import { couponYuan } from "../../utils/coupon";

/**
 * 券店首页：单券大图沉浸卡（场景插画头图 + 折扣大字 + 算账 caption + 抢购 CTA）。
 * 售罄口径用 saleCardProgress（忽略 claimable，付费出售券 claimable=false 属正常）。
 * 购买动作 emit 给页面执行。promo = 首购立减/学生价展示上下文（有资格才显示优惠价）。
 */
const props = defineProps<{
  tpl: Record<string, any>;
  buying?: boolean;
  promo?: { firstBuyDiscount?: number | null; firstBuyEligible?: boolean | null; studentApproved?: boolean | null };
}>();
const emit = defineEmits<{ (e: "buy", tpl: Record<string, any>): void }>();
const { t, locale } = useI18n();

const progress = computed(() => saleCardProgress(props.tpl));
const discount = computed(() => formatCouponDiscount(props.tpl));
const savings = computed(() => couponSavingsExample(props.tpl));
const scene = computed(() => couponSceneArt(String(localizeText(props.tpl.name, locale.value) ?? "")));
const soldOut = computed(() => progress.value.soldOut);

/** PERCENT → i18n 折扣文案（zh「8折」/ en「Save 20%」）；FIXED/FULL → 面额 ¥ */
const dealText = computed(() => {
  const d = discount.value;
  if (d.kind === "percent") {
    return t("messages.couponStore.percentOff", {
      v: d.percent,
      s: Math.max(0, 100 - Number(props.tpl.discountValue ?? 0)),
    });
  }
  return `¥${d.amount}`;
});

/** 限量券剩余张数；不限量（totalCount<=0）为 null */
const remain = computed(() => {
  const total = Number(props.tpl.totalCount ?? 0);
  if (!(total > 0)) return null;
  return Math.max(0, total - Number(props.tpl.claimedCount ?? 0));
});

/** 营销标签（后台可配，如「热卖TOP」）；空不展示 */
const marketingLabel = computed(() => String(props.tpl.label ?? "").trim());
/** 真实已售数（coupon_sale_order PAID 聚合，后端下发）；>0 才展示 */
const soldCount = computed(() => Math.max(0, Number(props.tpl.soldCount ?? 0)));
/** 划线锚定价（仅当高于售价时返回元字符串） */
const anchor = computed(() => couponAnchorYuan(props.tpl));
/** 首购立减/学生价优惠（取低不叠加；null=展示原价） */
const promo = computed(() =>
  props.promo
    ? couponPromoPrice(props.tpl, props.promo)
    : null,
);
/** 展示价：优惠价 > 原价 */
const displayPrice = computed(() => promo.value?.yuan ?? couponYuan(props.tpl.salePrice));

/** 整卡点击 → 独立券详情页（/coupon/[id]，分享/物料二维码同源落地页）；抢购按钮 stopPropagation 保留弹层快捷购买 */
const localePath = useTenantLocalePath();
function goDetail() {
  navigateTo(localePath(`/coupon/${props.tpl.id}`));
}
</script>

<template>
  <div class="sale-card" :class="{ soldout }" @click="goDetail">
    <!-- 头图区：场景插画 + 到店可用 pill（插画抽取为 CouponStoreSceneArt，与详情页共用） -->
    <div class="art">
      <CouponStoreSceneArt :scene="scene" />
      <span v-if="marketingLabel" class="art-tag">{{ marketingLabel }}</span>
      <span class="art-pill">{{ t("messages.coupon.storeUsable") }}</span>
    </div>

    <!-- 名称行：券名 + 已售数（有真实成交才展示） -->
    <div class="name-row">
      <span class="name">{{ localizeText(tpl.name, locale) }}</span>
      <span v-if="soldCount > 0" class="sold">{{ t("messages.couponStore.soldCount", { n: soldCount }) }}</span>
    </div>

    <!-- 优惠行：大字折扣 + 算账 caption（仅 PERCENT） -->
    <div class="deal-row">
      <span class="deal">{{ dealText }}</span>
      <span v-if="savings" class="deal-note">
        {{ t("messages.couponStore.savingsLine", { spend: savings.spend, save: savings.save }) }}
      </span>
    </div>

    <div class="divider" />

    <!-- 价格 + CTA：优惠价（首购/学生）+ 划线锚定价 + 原价 -->
    <div class="price-row">
      <span class="price-wrap">
        <span v-if="promo" class="promo-tag" :class="promo.kind">
          {{ promo.kind === "student" ? t("messages.couponStore.studentTag") : t("messages.couponStore.firstBuyTag") }}
        </span>
        <s v-if="anchor || promo" class="anchor">¥{{ promo ? couponYuan(tpl.salePrice) : anchor }}</s>
        <span class="price">¥{{ displayPrice }}</span>
      </span>
      <UButton
        size="xs"
        :disabled="soldOut || buying"
        :loading="buying"
        @click.stop="emit('buy', tpl)"
      >
        {{ soldOut ? t("messages.couponMall.soldOut") : t("messages.couponMall.buyNow") }}
      </UButton>
    </div>

    <!-- 元信息：有效期 + 限量进度 -->
    <div class="meta-row">
      <span v-if="tpl.validDays" class="meta">{{ t("messages.couponStore.validAfterDays", { n: tpl.validDays }) }}</span>
      <template v-if="remain !== null">
        <div class="track"><div class="fill" :style="{ width: (progress.percent ?? 0) + '%' }" /></div>
        <span class="meta">{{ remain === 0 ? t("messages.couponMall.soldOut") : t("messages.couponStore.remaining", { n: remain }) }}</span>
      </template>
    </div>

    <!-- 信任行 -->
    <div class="trust">{{ t("messages.couponStore.trustLine") }}</div>
  </div>
</template>

<style scoped>
.sale-card { display: flex; flex-direction: column; gap: 8px; background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 10px; cursor: pointer; }
.sale-card.soldout { opacity: 0.55; }
.art { position: relative; height: 72px; border-radius: 10px; overflow: hidden; flex: none; }
.art-pill { position: absolute; top: 6px; right: 6px; border-radius: 999px; background: rgb(255 255 255 / .92); color: #9a3412; font-size: 10px; font-weight: 500; padding: 1px 8px; white-space: nowrap; }
.name-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
.name { display: block; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sold { flex: none; font-size: 11px; color: var(--ui-text-muted); white-space: nowrap; }
.art-tag { position: absolute; top: 6px; left: 6px; border-radius: 999px 999px 999px 2px; background: #dc2626; color: #fff; font-size: 10px; font-weight: 600; padding: 2px 8px; white-space: nowrap; }
.deal-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.deal { font-size: 22px; font-weight: 800; line-height: 1.1; color: var(--ui-primary); }
.deal-note { font-size: 11px; color: var(--ui-text-muted); white-space: nowrap; }
.divider { border-top: 1px dashed var(--ui-border); }
.price-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.price-wrap { display: flex; align-items: baseline; gap: 6px; min-width: 0; flex-wrap: wrap; }
.anchor { font-size: 12px; color: var(--ui-text-dimmed); }
.promo-tag { border-radius: 2px 999px 999px 2px; font-size: 11px; font-weight: 500; padding: 0 6px; white-space: nowrap; }
.promo-tag.firstBuy { background: #dc2626; color: #fff; }
.promo-tag.student { background: var(--ui-bg-elevated); color: #0f766e; border: 1px solid #14b8a6; }
.price { font-size: 20px; font-weight: 700; color: var(--ui-text); }
.meta-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.meta { font-size: 11px; color: var(--ui-text-muted); white-space: nowrap; }
.track { flex: 1; min-width: 0; height: 4px; border-radius: 999px; background: var(--ui-bg-elevated); overflow: hidden; }
.fill { height: 100%; background: var(--ui-primary); border-radius: 999px; }
.trust { font-size: 10px; color: var(--ui-text-dimmed, var(--ui-text-muted)); }
</style>
