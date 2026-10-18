<script setup lang="ts">
import { hasDetail, formatCouponDiscount, couponPromoPrice } from "../../utils/coupon-mall";
import { couponYuan, couponTemplateMap, couponBundleItems } from "../../utils/coupon";

/**
 * 券商城：券包卡。items 仅含 templateId，模板详情由 templates 映射；购买/详情 emit 给页面执行。
 */
const props = defineProps<{
  bundle: Record<string, any>;
  /** 目录模板列表（用于解析 bundle.items 的 templateId） */
  templates: Record<string, any>[];
  buying?: boolean;
  /** 首购立减/学生价展示上下文（券包仅首购路径生效） */
  promo?: { firstBuyDiscount?: number | null; firstBuyEligible?: boolean | null; studentApproved?: boolean | null };
}>();
const emit = defineEmits<{ (e: "buy"): void; (e: "detail"): void }>();
const { t, locale } = useI18n();
const detailable = computed(() => hasDetail(props.bundle.description, locale.value));
const items = computed(() => couponBundleItems(props.bundle as never, couponTemplateMap(props.templates as never)));
/** 券包真实已售数（PAID 出售单聚合）；>0 才展示 */
const soldCount = computed(() => Math.max(0, Number(props.bundle.soldCount ?? 0)));
/** 券包首购立减价（学生价不适用于券包；null=原价） */
const promo = computed(() =>
  props.promo ? couponPromoPrice({ salePrice: props.bundle.salePrice }, props.promo) : null,
);
/** 展示价：优惠价 > 包价 */
const displayPrice = computed(() => promo.value?.yuan ?? couponYuan(props.bundle.salePrice));
/** 条目面额文案：PERCENT 券显示折扣（8折/Save 20%），FIXED/FULL 显示面额 ¥X */
function itemFace(tpl: Record<string, any> | null | undefined): string {
  if (!tpl) return "—";
  const d = formatCouponDiscount(tpl);
  return d.kind === "percent"
    ? t("messages.couponStore.percentOff", { v: d.percent, s: Math.max(0, 100 - Number(tpl.discountValue ?? 0)) })
    : `¥${d.amount}`;
}
</script>

<template>
  <div class="bundle-card" @click="detailable && emit('detail')">
    <div class="head">
      <span class="name">{{ localizeText(bundle.name, locale) }}</span>
      <span class="head-right">
        <span v-if="soldCount > 0" class="sold">{{ t("messages.couponStore.soldCount", { n: soldCount }) }}</span>
        <span v-if="detailable" class="detail" @click.stop="emit('detail')">{{ t("messages.couponMall.viewDetail") }}</span>
      </span>
    </div>
    <div class="chips">
      <span v-for="it in items" :key="it.id" class="chip">
        {{ it.template ? `${localizeText(it.template.name, locale)} ${itemFace(it.template)}` : "—" }} ×{{ it.quantity }}
      </span>
    </div>
    <div class="foot">
      <span class="price-wrap">
        <span v-if="promo" class="promo-tag">{{ t("messages.couponStore.firstBuyTag") }}</span>
        <s v-if="promo" class="anchor">¥{{ couponYuan(bundle.salePrice) }}</s>
        <span class="price">¥{{ displayPrice }}</span>
      </span>
      <UButton size="sm" :disabled="buying" :loading="buying" @click.stop="emit('buy')">
        {{ t("messages.couponMall.buyNow") }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.bundle-card { background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.head { display: flex; justify-content: space-between; align-items: center; }
.name { font-size: 15px; font-weight: 700; }
.head-right { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sold { flex: none; font-size: 11px; color: var(--ui-text-muted); white-space: nowrap; }
.detail { font-size: 12px; color: var(--ui-text-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: 11px; color: var(--ui-text-muted); background: var(--ui-bg-elevated); border-radius: 999px; padding: 2px 8px; }
.foot { display: flex; justify-content: space-between; align-items: center; }
.price-wrap { display: flex; align-items: baseline; gap: 5px; min-width: 0; flex-wrap: wrap; }
.anchor { font-size: 11px; color: var(--ui-text-dimmed); }
.promo-tag { border-radius: 2px 999px 999px 2px; background: #dc2626; color: #fff; font-size: 10px; font-weight: 500; padding: 0 5px; white-space: nowrap; }
.price { font-size: 18px; font-weight: 700; color: var(--ui-primary); }
</style>
