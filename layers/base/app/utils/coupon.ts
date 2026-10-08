/**
 * 券商城页（pages/coupon/index.vue）拆分出的纯逻辑工具。
 * 仅收无 i18n、无组件状态依赖的纯函数与类型；
 * 带文案的展示格式化见 composables/useCouponFormat.ts。
 */
import type {
  CouponBundle,
  CouponBundleItem,
  CouponTemplate,
  CouponWechatPayParams,
  CustomerCoupon,
} from "../composables/useCoupon";

// ── 页面 Tab / 筛选键 ──
export type CouponPageTab = "center" | "sale" | "points" | "code" | "wallet";
export type CouponWalletKey = "unused" | "used" | "expired" | "returned";
export type CouponSceneKey = "ONLINE" | "IN_STORE" | "ALL";

/** 券商城购买目标（券包或单券） */
export interface CouponBuyTarget {
  kind: "bundle" | "template";
  id: string;
  name: string;
  amount: number;
}

/** 临期高亮阈值（天，仅「未使用」tab） */
export const COUPON_EXPIRING_DAYS = 7;

/** 场景子筛：ONLINE→(ONLINE|ALL)；IN_STORE→(IN_STORE|ALL)；ALL→全部 */
export function couponMatchesScene(
  scene: string | null | undefined,
  key: CouponSceneKey,
): boolean {
  const s = (scene ?? "ONLINE").toUpperCase();
  if (key === "ALL") return true;
  if (key === "ONLINE") return s === "ONLINE" || s === "ALL";
  return s === "IN_STORE" || s === "ALL";
}

/** 是否到店可用券（IN_STORE / ALL） */
export function couponIsStoreScene(scene?: string | null): boolean {
  const s = (scene ?? "").toUpperCase();
  return s === "IN_STORE" || s === "ALL";
}

// ── 临期计算 ──
export function couponExpiry(c: CustomerCoupon): string | null {
  return c.expiredAt || c.template?.endsAt || null;
}

export function couponRemainingDays(c: CustomerCoupon): number | null {
  const end = couponExpiry(c);
  if (!end) return null;
  const diff = new Date(end).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export function couponIsExpiring(c: CustomerCoupon): boolean {
  const days = couponRemainingDays(c);
  return days !== null && days <= COUPON_EXPIRING_DAYS;
}

// ── 券包统计（券包 items 仅含 templateId，模板详情需用 catalogue.templates 映射）──
export function couponTemplateMap(
  templates: CouponTemplate[],
): Record<string, CouponTemplate> {
  const map: Record<string, CouponTemplate> = {};
  for (const tpl of templates) map[tpl.id] = tpl;
  return map;
}

export function couponBundleItems(
  b: CouponBundle,
  tplMap: Record<string, CouponTemplate>,
): (CouponBundleItem & { template: CouponTemplate | null })[] {
  return (b.items ?? []).map((it) => ({
    ...it,
    template: tplMap[it.templateId] ?? null,
  }));
}

export function couponBundleTypeCount(b: CouponBundle): number {
  return new Set((b.items ?? []).map((i) => i.templateId)).size;
}

export function couponBundleTotalQty(b: CouponBundle): number {
  return (b.items ?? []).reduce((sum, i) => sum + (i.quantity ?? 0), 0);
}

/** 券包「合计可省」：包内可识别模板的面额×张数 之和 − 售价（>0 才展示） */
export function couponBundleSave(
  b: CouponBundle,
  tplMap: Record<string, CouponTemplate>,
): number {
  let save = 0;
  for (const it of b.items ?? []) {
    const tpl = tplMap[it.templateId];
    if (!tpl) continue;
    if (tpl.type === "FIXED" || tpl.type === "FULL") save += tpl.discountValue * (it.quantity ?? 0);
  }
  const net = save - b.salePrice;
  return net > 0 ? net : 0;
}

// ── 展示 ──
/** 分 → 元字符串（整元免小数） */
export function couponYuan(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

// ── 微信支付环境 ──
export function isWechatBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

/** 微信 JSAPI 拉起（WeixinJSBridge） */
export function invokeWechatPay(pay: CouponWechatPayParams): Promise<void> {
  return new Promise((resolve, reject) => {
    const invoke = () => {
      const bridge = (window as any).WeixinJSBridge;
      if (!bridge?.invoke) {
        reject(new Error("WeixinJSBridge unavailable"));
        return;
      }
      bridge.invoke(
        "getBrandWCPayRequest",
        {
          appId: pay.appId,
          timeStamp: pay.timeStamp,
          nonceStr: pay.nonceStr,
          package: pay.package,
          signType: pay.signType,
          paySign: pay.paySign,
        },
        (res: { err_msg?: string }) => {
          const msg = res?.err_msg || "";
          if (msg.includes("ok")) resolve();
          else reject(new Error(msg || "cancelled"));
        },
      );
    };
    if ((window as any).WeixinJSBridge) invoke();
    else document.addEventListener("WeixinJSBridgeReady", invoke, { once: true });
  });
}
