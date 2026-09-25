// 订单版式解析：类型 + 逐级兜底 + 国际化文案（纯函数，SSR 友好）
// 兜底链：块级定制字段 → 块内建默认 → 全局默认(true / 'jd' / 占位)
// 文案兜底链：当前 locale → defaultLocale → 首值 → ''（块内建占位 / i18n 兜底）

/** 订单版式视觉变体（共享积木据此选择圆角/配色） */
export type OrderVisualVariant = "cn" | "jd" | "mall";
export type OrderDetailLayout = "jd" | "classic" | "confirmation" | "cn" | "mall";
export type OrderListLayout = "card" | "cn" | "jd" | "mall";
export type LocalizedText = string | Record<string, string>;

const ORDER_DETAIL_LAYOUTS: readonly OrderDetailLayout[] = [
  "jd", "classic", "confirmation", "cn", "mall",
];
const ORDER_LIST_LAYOUTS: readonly OrderListLayout[] = ["card", "cn", "jd", "mall"];

export interface OrderBlockCfg {
  visible?: boolean;
  title?: LocalizedText;
  text?: LocalizedText;
  /** 核销码块：高光卡开关（默认 true） */
  highlight?: boolean;
  /** 核销码块：字体缩放 */
  fontScale?: number;
  /** 核销码块：卡片圆角 */
  cardRadius?: number;
}
export interface OrderDetailConfig {
  version: number;
  layout?: OrderDetailLayout;
  blocks?: Record<string, OrderBlockCfg>;
}
export interface OrderListConfig {
  version: number;
  layout?: OrderListLayout;
}

export const ORDER_DETAIL_BLOCK_KEYS = [
  "status", "progress", "redemption", "address", "items",
  "pickup", "totals", "shippingBreakdown", "meta", "actions",
] as const;

const ORDER_DETAIL_DEFAULT_VISIBLE: Record<string, boolean> = {
  status: true, progress: true, redemption: true, address: true, items: true,
  pickup: true, totals: true, shippingBreakdown: true, meta: true, actions: true,
};

export function orderDetailLayout(cfg: OrderDetailConfig | null): OrderDetailLayout {
  // 白名单校验：非法/缺省 → jd（沿用现状默认）；confirmation 为结算确认场景专用版式
  const v = cfg?.layout as OrderDetailLayout | undefined;
  return v && ORDER_DETAIL_LAYOUTS.includes(v) ? v : "jd";
}

/** 订单是否门店自提（核销码/自提信息块仅在自提单展示） */
export function isPickupOrder(order: any): boolean {
  return (order?.customFields?.deliveryType ?? "") === "pickup";
}
export function orderListLayout(cfg: OrderListConfig | null): OrderListLayout {
  // 白名单校验：非法/缺省 → card（沿用现状默认，视觉零回归）
  const v = cfg?.layout as OrderListLayout | undefined;
  return v && ORDER_LIST_LAYOUTS.includes(v) ? v : "card";
}
export function orderDetailBlockVisible(cfg: OrderDetailConfig | null, key: string): boolean {
  return cfg?.blocks?.[key]?.visible ?? ORDER_DETAIL_DEFAULT_VISIBLE[key] ?? true;
}
export function parseOrderDetailConfig(raw: string | null | undefined): OrderDetailConfig | null {
  if (!raw) return null;
  try {
    const d: unknown = JSON.parse(raw);
    if (typeof d !== "object" || d === null) return null;
    return d as OrderDetailConfig;
  } catch { return null; }
}
export function parseOrderListConfig(raw: string | null | undefined): OrderListConfig | null {
  if (!raw) return null;
  try {
    const d: unknown = JSON.parse(raw);
    if (typeof d !== "object" || d === null) return null;
    return d as OrderListConfig;
  } catch { return null; }
}
export function localizeOrderText(
  text: LocalizedText | undefined | null, locale: string, defaultLocale = "zh-CN",
): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[locale] ?? text[defaultLocale] ?? Object.values(text)[0] ?? "";
}

// 核销码块定制取值（L4 兜底：块定制 → 内建默认）
export function orderBlockHighlight(cfg: OrderDetailConfig | null, key: string, dft = true): boolean {
  const v = cfg?.blocks?.[key]?.highlight;
  return v === undefined ? dft : v;
}
export function orderBlockNumber(cfg: OrderDetailConfig | null, key: string, name: 'fontScale' | 'cardRadius', dft: number): number {
  const v = cfg?.blocks?.[key]?.[name];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : dft;
}