import type { CouponTemplate, CustomerCoupon } from "./useCoupon";

// 券展示金额/条件文案，供结账 cn 优惠抽屉与 OrderSummary 复用
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