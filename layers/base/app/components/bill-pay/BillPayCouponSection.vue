<script setup lang="ts">
import { getCouponSaleCatalogue } from "~~/layers/base/app/composables/useCoupon";
import { formatCouponDiscount, saleCardProgress, couponPromoPrice } from "~~/layers/base/app/utils/coupon-mall";
import { couponYuan } from "~~/layers/base/app/utils/coupon";
import { localizeText } from "~~/layers/base/app/utils/detail-config";

/**
 * 「自己到店」买单券推荐位（方案A · 券板块断点修复）：
 * 买单店首页此前无券店入口/推荐位，券能力配置（couponEnabled）与 C 端展示断链。
 * 有券 = 横滑券卡推荐位，点卡 → 详情弹层 → 下单支付（复用券店 useCouponSaleFlow 全链路）；
 * 空目录（选品未上架）= 价值主张 + 「即将上架」兜底；板块始终可见。
 * 目录取 scene=IN_STORE（渠道隔离），SSR 预取（useAsyncData），失败静默降级为空态。
 */
const { t, locale } = useI18n();

const { data: catalogue } = useAsyncData(
  "billpay-self-coupon",
  () => getCouponSaleCatalogue("IN_STORE"),
  { default: () => null },
);
const templates = computed<any[]>(() => catalogue.value?.templates ?? []);
/** 首购立减/学生价展示上下文（传给详情弹层） */
const promo = computed(() => ({
  firstBuyDiscount: catalogue.value?.firstBuyDiscount ?? 0,
  firstBuyEligible: catalogue.value?.firstBuyEligible ?? null,
  studentApproved: catalogue.value?.studentApproved ?? null,
}));
const shown = computed(() => templates.value.slice(0, 10));

const {
  sheetTarget, sheetBundle, openDetail, closeDetail, buyFromSheet,
  paying, paySheetOpen, payMode, buyName, buyAmount, confirmPay, closePaySheet,
} = useCouponSaleFlow();

function tplName(tpl: any): string {
  return localizeText(tpl.name, locale.value) || "";
}
/** 面额/折扣大字：PERCENT → i18n 折扣文案（zh「8折」/en「Save 20%」）；FIXED/FULL → 面额 ¥ */
function dealText(tpl: any): string {
  const d = formatCouponDiscount(tpl);
  if (d.kind === "percent") {
    return t("messages.couponStore.percentOff", {
      v: d.percent,
      s: Math.max(0, 100 - Number(tpl.discountValue ?? 0)),
    });
  }
  return `¥${d.amount}`;
}
function soldOut(tpl: any): boolean {
  return Boolean(saleCardProgress(tpl).soldOut);
}
function price(tpl: any): string {
  return couponYuan(Number(tpl.salePrice ?? 0));
}
/** 卡面优惠口径与 t1 券店一致（couponPromoPrice）：学生价仅认证后展示，首购资格非 false 即展示 */
function cardPromo(tpl: any): { yuan: string; kind: "firstBuy" | "student" } | null {
  return couponPromoPrice(tpl, {
    firstBuyDiscount: promo.value.firstBuyDiscount,
    firstBuyEligible: promo.value.firstBuyEligible,
    studentApproved: promo.value.studentApproved,
  });
}
</script>

<template>
  <section class="self-section">
    <div class="head">
      <span class="ico" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4z" />
          <path d="M13 7v10" stroke-dasharray="2 3" />
        </svg>
      </span>
      <div class="ht">
        <div class="tt">{{ t("messages.billpay.selfTitle") }}</div>
        <div class="ss">{{ t("messages.billpay.selfSub") }}</div>
      </div>
    </div>

    <!-- 有券：横滑推荐位（点卡 → 详情弹层直购） -->
    <div v-if="shown.length" class="crow" role="list">
      <button
        v-for="tpl in shown" :key="tpl.id" type="button" role="listitem"
        class="ccard" :class="{ soldout: soldOut(tpl) }"
        @click="openDetail(tpl)"
      >
        <div class="deal">{{ dealText(tpl) }}</div>
        <div class="nm">{{ tplName(tpl) }}</div>
        <div class="price">
          <template v-if="cardPromo(tpl)">
            <span class="tag" :class="cardPromo(tpl)!.kind">{{ cardPromo(tpl)!.kind === "student" ? t("messages.couponStore.studentTag") : t("messages.couponStore.firstBuyTag") }}</span>
            <span class="pval">¥{{ cardPromo(tpl)!.yuan }}<span class="unit">{{ t("messages.billpay.selfPerCard") }}</span></span>
            <span class="orig">¥{{ price(tpl) }}</span>
          </template>
          <template v-else>
            ¥{{ price(tpl) }}<span class="unit">{{ t("messages.billpay.selfPerCard") }}</span>
          </template>
        </div>
        <div class="grab">{{ soldOut(tpl) ? t("messages.couponMall.soldOut") : t("messages.couponStore.gridBuy") }}</div>
      </button>
    </div>

    <!-- 空目录（选品未上架）：兜底引导 -->
    <div v-else class="empty">
      <span class="chip">{{ t("messages.billpay.selfEmpty") }}</span>
    </div>

    <!-- 复用券店详情弹层 + 支付弹层（全链路一致） -->
    <CouponMallDetailSheet
      :open="!!sheetTarget"
      :tpl="sheetTarget"
      :bundle="sheetBundle"
      :templates="templates"
      :promo="promo"
      @close="closeDetail"
      @buy="buyFromSheet"
    />
    <CouponPaySheet
      v-if="paySheetOpen"
      v-model="payMode"
      :name="buyName"
      :amount="buyAmount"
      :paying="paying"
      @confirm="confirmPay"
      @close="closePaySheet"
    />
  </section>
</template>

<style scoped>
.self-section { border: 1px solid var(--ui-border); border-radius: 12px; background: var(--ui-bg); padding: 12px; }
.head { display: flex; align-items: center; gap: 8px; }
.ico { flex: none; width: 30px; height: 30px; border-radius: 8px; background: color-mix(in oklab, var(--ui-primary) 12%, transparent); color: var(--ui-primary); display: flex; align-items: center; justify-content: center; }
.tt { font-size: 14px; font-weight: 700; color: var(--ui-text); }
.ss { margin-top: 1px; font-size: 12px; color: var(--ui-text-muted); }
.crow { display: flex; gap: 8px; margin-top: 10px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.crow::-webkit-scrollbar { display: none; }
.ccard { flex: none; width: 104px; text-align: left; border: 1px solid var(--ui-border); border-radius: 10px; padding: 8px; background: var(--ui-bg); cursor: pointer; }
.ccard.soldout { opacity: .55; }
.deal { font-size: 15px; font-weight: 800; color: var(--ui-primary); white-space: nowrap; }
.nm { margin-top: 2px; font-size: 12px; color: var(--ui-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.price { margin-top: 3px; font-size: 12px; font-weight: 600; color: var(--ui-text); display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
.tag { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 0 4px; line-height: 1.6; }
.tag.student { background: var(--ui-bg-elevated, #f0fdfa); color: #0f766e; border: 1px solid #14b8a6; }
.tag.firstBuy { background: var(--ui-bg-elevated, #fffbeb); color: #b45309; border: 1px solid #f59e0b; }
.pval { color: var(--ui-primary); font-weight: 800; }
.orig { font-size: 10px; font-weight: 400; color: var(--ui-text-muted); text-decoration: line-through; }
.unit { font-size: 11px; font-weight: 400; color: var(--ui-text-muted); }
.grab { margin-top: 6px; border-radius: 999px; background: var(--ui-primary); color: var(--ui-bg); font-size: 11px; font-weight: 700; text-align: center; padding: 3px 0; }
.empty { margin-top: 10px; }
.chip { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 4px 12px; font-size: 12px; background: var(--ui-bg-muted); color: var(--ui-text-muted); }
</style>
