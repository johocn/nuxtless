import { localizeText } from "./detail-config";
import { couponYuan } from "./coupon";

/** 券商城目录卡片的库存进度与售罄判定（纯函数，SSR 友好） */
export interface SaleProgress {
  /** 0-100 整数；totalCount<=0（不限量）为 null */
  percent: number | null;
  soldOut: boolean;
}

export function saleProgress(input: {
  claimedCount?: number | null;
  totalCount?: number | null;
  claimable?: boolean | null;
}): SaleProgress {
  const { claimedCount, totalCount, claimable } = input;
  if (claimable === false) {
    return { percent: totalCount && totalCount > 0 ? 100 : null, soldOut: true };
  }
  if (totalCount && totalCount > 0) {
    const percent = Math.min(100, Math.round(((claimedCount ?? 0) / totalCount) * 100));
    return { percent, soldOut: percent >= 100 };
  }
  return { percent: null, soldOut: false };
}

/**
 * 券店售卖卡（付费出售场景）的进度与售罄判定：
 * 忽略 claimable——claimable=false 仅表示「不开放免费领取」，对付费出售券完全正常；
 * 售罄口径 = totalCount>0 && claimedCount>=totalCount（免费领券场景仍用 saleProgress）。
 */
export function saleCardProgress(tpl: {
  claimedCount?: number | null;
  totalCount?: number | null;
}): SaleProgress {
  return saleProgress({
    claimedCount: tpl.claimedCount,
    totalCount: tpl.totalCount,
    claimable: true,
  });
}

/** 券折扣展示的结构化结果（组件层按 kind + i18n 渲染，避免裸数字 0.80） */
export type CouponDiscountInfo =
  | { kind: "percent"; percent: number }
  | { kind: "fixed"; amount: string }
  | { kind: "full"; amount: string };

/** 券模板折扣格式化：PERCENT discountValue=80 → 8 折（percent=8）、85 → 8.5；FIXED/FULL → 分→元金额 */
export function formatCouponDiscount(tpl: {
  type?: string | null;
  discountValue?: number | null;
}): CouponDiscountInfo {
  const v = Number(tpl?.discountValue ?? 0);
  if (tpl?.type === "PERCENT") {
    return { kind: "percent", percent: v / 10 };
  }
  const amount = couponYuan(v);
  return tpl?.type === "FULL" ? { kind: "full", amount } : { kind: "fixed", amount };
}

/** 算账示例（供算账条/优惠行 caption）：spend 元按折扣可省多少；仅 PERCENT 有意义，其余返回 null */
export function couponSavingsExample(
  tpl: { type?: string | null; discountValue?: number | null },
  spend = 100,
): { spend: number; save: number; after: number } | null {
  if (tpl?.type !== "PERCENT" || !(tpl.discountValue > 0) || !(spend > 0)) return null;
  const save = Math.round(spend * (1 - tpl.discountValue / 100));
  return { spend, save, after: spend - save };
}

/**
 * 划线锚定价（元字符串）：后台可配 anchorPrice（分），仅当为正数且高于售价时返回展示值，
 * 防止误配低于售价的划线价造成误导；未配置 / 误配返回 null 不展示。
 */
export function couponAnchorYuan(tpl: {
  anchorPrice?: number | null;
  salePrice?: number | null;
}): string | null {
  const ap = Number(tpl?.anchorPrice ?? 0);
  const sp = Number(tpl?.salePrice ?? 0);
  if (!(ap > 0) || ap <= sp) return null;
  return couponYuan(ap);
}

/**
 * 首购立减/学生价展示价（镜像后端 resolvePromoPrice：两路径各自从原价取低不叠加，最低 1 分）。
 * 返回 null = 无可用优惠（展示原价）；
 * 有优惠返回终价（元字符串）与标签类型（同价时优先学生价，与后端一致）。
 * 展示口径：首购资格 eligible !== false 即展示（匿名按新客引导转化，后端下单重算兜底）；
 * 学生价仅 approved === true 展示价格。
 */
export function couponPromoPrice(
  base: { salePrice?: number | null; studentPrice?: number | null },
  opts: {
    firstBuyDiscount?: number | null;
    firstBuyEligible?: boolean | null;
    studentApproved?: boolean | null;
  },
): { yuan: string; kind: "firstBuy" | "student" } | null {
  const baseFen = Math.floor(Number(base?.salePrice ?? 0));
  if (!(baseFen > 0)) return null;
  const candidates: Array<{ fen: number; kind: "firstBuy" | "student" }> = [];
  const studentPrice = Math.floor(Number(base?.studentPrice ?? 0));
  if (studentPrice > 0 && opts.studentApproved === true && studentPrice < baseFen) {
    candidates.push({ fen: studentPrice, kind: "student" });
  }
  const fbd = Math.floor(Number(opts?.firstBuyDiscount ?? 0));
  if (fbd > 0 && opts.firstBuyEligible !== false) {
    const v = Math.max(1, baseFen - fbd);
    if (v < baseFen) candidates.push({ fen: v, kind: "firstBuy" });
  }
  if (!candidates.length) return null;
  // reduce 保序：同价时先入者胜（学生价先入 → 优先学生价，与后端一致）
  const best = candidates.reduce((a, b) => (b.fen < a.fen ? b : a));
  return { yuan: couponYuan(best.fen), kind: best.kind };
}

/** 券名 → 场景插画类型（纯函数，按关键词映射） */
export type CouponSceneArt = "billiards" | "dining" | "drink" | "generic";

export function couponSceneArt(name: string): CouponSceneArt {
  const n = (name ?? "").toLowerCase();
  if (/台球|桌球|斯诺克|黑八|billiard|snooker/.test(n)) return "billiards";
  if (/餐|饭|食|菜|烤|火锅|dining|food|restaurant|grill|hotpot/.test(n)) return "dining";
  if (/咖啡|奶茶|茶|饮|咖|coffee|milk.?tea|tea|drink|juice|bubble/.test(n)) return "drink";
  return "generic";
}

/** 券详情可选增强：description 本地化后非空白才有详情入口 */
export function hasDetail(description: unknown, locale: string): boolean {
  if (!description) return false;
  const text = localizeText(description as never, locale);
  return typeof text === "string" && text.trim().length > 0;
}

export interface DetailParagraph {
  type: "text" | "image";
  content: string;
}

const IMG_LINE_RE = /^!\[[^\]]*\]\(([^)]+)\)$/;

/** description 按行分段：整行 `![图](url)` 为图片段，其余为文本段；非法标记回退文本 */
export function parseDetailParagraphs(text: string): DetailParagraph[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map<DetailParagraph>((line) => {
      const m = IMG_LINE_RE.exec(line);
      return m && m[1] ? { type: "image", content: m[1] } : { type: "text", content: line };
    });
}

/** 图库图片 URL 归一：相对路径拼当前访问 origin，禁止硬编码域名 */
export function detailAssetUrl(url: string, origin: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}
