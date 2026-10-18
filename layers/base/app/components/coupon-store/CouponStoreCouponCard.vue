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
</script>

<template>
  <div class="sale-card" :class="{ soldout }">
    <!-- 头图区：场景插画 + 到店可用 pill -->
    <div class="art">
      <svg v-if="scene === 'billiards'" class="art-svg" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="320" height="72" fill="#14532d" />
        <ellipse cx="160" cy="86" rx="210" ry="44" fill="#166534" />
        <circle cx="310" cy="6" r="14" fill="#0f3d22" />
        <circle cx="10" cy="66" r="14" fill="#0f3d22" />
        <circle cx="88" cy="30" r="14" fill="#facc15" />
        <circle cx="83" cy="25" r="4.5" fill="#fff" opacity=".8" />
        <circle cx="126" cy="44" r="14" fill="#ef4444" />
        <circle cx="121" cy="39" r="4.5" fill="#fff" opacity=".8" />
        <circle cx="166" cy="26" r="14" fill="#2563eb" />
        <circle cx="161" cy="21" r="4.5" fill="#fff" opacity=".8" />
        <circle cx="52" cy="50" r="7" fill="#f8fafc" />
        <rect x="196" y="30" width="120" height="4" rx="2" fill="#b45309" transform="rotate(-12 196 32)" />
        <rect x="196" y="30" width="16" height="4" rx="2" fill="#38bdf8" transform="rotate(-12 196 32)" />
      </svg>
      <svg v-else-if="scene === 'dining'" class="art-svg" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="320" height="72" fill="#ea580c" />
        <ellipse cx="160" cy="88" rx="210" ry="44" fill="#f97316" />
        <circle cx="96" cy="40" r="26" fill="#fff7ed" />
        <circle cx="96" cy="40" r="17" fill="#fed7aa" />
        <circle cx="96" cy="40" r="8" fill="#fff7ed" />
        <rect x="150" y="22" width="26" height="30" rx="5" fill="#fff7ed" />
        <path d="M176 28h6a8 8 0 0 1 0 16h-6" fill="none" stroke="#fff7ed" stroke-width="4" />
        <rect x="204" y="16" width="4" height="42" rx="2" fill="#fff7ed" />
        <rect x="216" y="16" width="4" height="42" rx="2" fill="#fff7ed" />
        <circle cx="266" cy="46" r="12" fill="#fff7ed" />
      </svg>
      <svg v-else-if="scene === 'drink'" class="art-svg" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="320" height="72" fill="#c8a27a" />
        <ellipse cx="160" cy="88" rx="210" ry="44" fill="#d9b990" />
        <rect x="122" y="16" width="64" height="7" rx="3.5" fill="#fff7ed" />
        <path d="M128 23h52l-6 35a8 8 0 0 1-8 7h-24a8 8 0 0 1-8-7z" fill="#fff7ed" />
        <path d="M133 34h42l-4 22a8 8 0 0 1-8 7h-18a8 8 0 0 1-8-7z" fill="#a16207" opacity=".55" />
        <rect x="148" y="2" width="5" height="20" rx="2.5" fill="#ef4444" transform="rotate(8 150 12)" />
        <circle cx="226" cy="40" r="10" fill="#fff7ed" opacity=".9" />
        <circle cx="250" cy="30" r="7" fill="#fff7ed" opacity=".7" />
      </svg>
      <svg v-else class="art-svg" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="320" height="72" fill="var(--ui-primary)" />
        <ellipse cx="160" cy="88" rx="210" ry="44" fill="#fff" opacity=".12" />
        <rect x="86" y="20" width="128" height="32" rx="8" fill="#fff" opacity=".95" />
        <circle cx="214" cy="36" r="7" fill="var(--ui-primary)" />
        <circle cx="86" cy="36" r="7" fill="var(--ui-primary)" />
        <line x1="160" y1="22" x2="160" y2="50" stroke="var(--ui-primary)" stroke-width="2" stroke-dasharray="4 4" />
        <rect x="102" y="30" width="32" height="4" rx="2" fill="var(--ui-primary)" opacity=".8" />
        <rect x="102" y="39" width="22" height="3" rx="1.5" fill="var(--ui-primary)" opacity=".5" />
        <rect x="172" y="30" width="26" height="3" rx="1.5" fill="var(--ui-primary)" opacity=".5" />
      </svg>
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
        @click="emit('buy', tpl)"
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
.sale-card { display: flex; flex-direction: column; gap: 8px; background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 10px; }
.sale-card.soldout { opacity: 0.55; }
.art { position: relative; height: 72px; border-radius: 10px; overflow: hidden; flex: none; }
.art-svg { width: 100%; height: 100%; display: block; }
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
