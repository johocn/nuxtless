/**
 * 券展示格式化（依赖 i18n 文案）。
 * - useCouponFormat()：券商城页各拆分子组件复用（内部 useI18n）；
 *   纯函数部分（场景/临期/券包统计/微信支付）见 app/utils/coupon.ts。
 * - walletFormatAmount / walletCondition：券展示金额/条件文案，
 *   供结账 cn 优惠抽屉与 OrderSummary 复用（t 显式传入）。
 */
import type { CouponTemplate, CouponType, CustomerCoupon } from "./useCoupon";

export function useCouponFormat() {
  const { t } = useI18n();

  function typeTip(type?: CouponType | null): string {
    if (type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
    if (type === "FULL") return t("messages.coupon.typeFull");
    if (type === "PERCENT") return t("messages.coupon.typePercent");
    return t("messages.coupon.typeFixed");
  }

  function formatAmount(type?: CouponType | null, discountValue = 0): string {
    if (type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
    if (type === "PERCENT") {
      const zhe = discountValue / 10;
      return zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
    }
    return (discountValue / 100).toString();
  }

  function formatUnit(type?: CouponType | null): string {
    if (type === "FREE_SHIPPING") return "";
    if (type === "PERCENT") return t("messages.coupon.unitDiscount");
    return t("messages.coupon.unitYuan");
  }

  function formatCondition(c?: CouponTemplate | null): string {
    const minSpend = c?.minSpend ? c.minSpend / 100 : 0;
    if (c?.type === "FREE_SHIPPING") return c.description || t("messages.coupon.typeFreeShipping");
    if (c?.type === "FULL") return t("messages.coupon.noThresholdFull");
    if (!minSpend) return t("messages.coupon.noThreshold");
    return t("messages.coupon.minSpend", { n: minSpend });
  }

  function formatDateRange(c?: CouponTemplate | null): string {
    const start = c?.startsAt ? String(c.startsAt).slice(0, 10) : "";
    const end = c?.endsAt ? String(c.endsAt).slice(0, 10) : "";
    if (start && end) return t("messages.coupon.dateRange", { start, end });
    if (end) return t("messages.coupon.dateUntil", { end });
    return "";
  }

  return { typeTip, formatAmount, formatUnit, formatCondition, formatDateRange };
}

// 券展示金额/条件文案，供结账 cn 优惠抽屉与 OrderSummary 复用（t 显式传入）
type TI18n = (k: string, opts?: Record<string, unknown>) => string;

export function walletFormatAmount(t: TI18n, c: CustomerCoupon): string {
  const tpl = c.template;
  if (!tpl) return "";
  if (tpl.type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  if (tpl.type === "PERCENT") {
    const zhe = tpl.discountValue / 10;
    return zhe % 1 === 0
      ? `${zhe}${t("messages.coupon.unitDiscount")}`
      : `${zhe.toFixed(1)}${t("messages.coupon.unitDiscount")}`;
  }
  return `¥${(tpl.discountValue / 100).toString()}`;
}

export function walletCondition(t: TI18n, c: CustomerCoupon): string {
  const tpl = c.template ?? ({} as CouponTemplate);
  const minSpend = tpl.minSpend ? tpl.minSpend / 100 : 0;
  if (tpl.type === "FREE_SHIPPING") return c.template?.description || t("messages.coupon.typeFreeShipping");
  if (tpl.type === "FULL") return t("messages.coupon.noThresholdFull");
  if (!minSpend) return t("messages.coupon.noThreshold");
  return t("messages.coupon.minSpend", { n: minSpend });
}
