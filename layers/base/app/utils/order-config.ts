// 订单版式解析：类型 + 逐级兜底 + 国际化文案（纯函数，SSR 友好）
// 兜底链：块级定制字段 → 块内建默认 → 全局默认(true / 'jd' / 占位)
// 文案兜底链：当前 locale → defaultLocale → 首值 → ''（块内建占位 / i18n 兜底）

export type OrderDetailLayout = "jd" | "classic";
export type OrderListLayout = "card";
export type LocalizedText = string | Record<string, string>;

export interface OrderBlockCfg {
  visible?: boolean;
  title?: LocalizedText;
  text?: LocalizedText;
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
  return cfg?.layout === "classic" ? "classic" : "jd"; // 缺省/非法 → jd（默认京东版式）
}
export function orderListLayout(_cfg: OrderListConfig | null): OrderListLayout {
  return "card"; // 本期仅卡片
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