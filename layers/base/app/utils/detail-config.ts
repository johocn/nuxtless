// detailConfig 解析工具：类型 + 逐级兜底 + 国际化文案（纯函数，SSR 友好）
// 兜底链：块级定制字段 → 块内建默认 → 全局默认（true / 'classic' / 占位文案）
// 文案兜底链：当前 locale → defaultLocale → 无语言对象首个值 → 块内建占位 → i18n 字典静态文案

export type DetailLayout = 'classic' | 'floor' | 'dualBuy' | 'hotel' | 'mall';

// 可翻译文案：string = 各语言共用；Record<language,string> = 逐语言
export type LocalizedText = string | Record<string, string>;

export interface DetailBlockCfg {
  visible?: boolean;
  /* L3 样式字段预留：price.style 用于价格块版式（classic/jdA/jdB），其余 fontScale/imageWidth/radius 等后续再扩展 */
  style?: string;
  title?: LocalizedText;
  text?: LocalizedText;
}

export interface DetailConfig {
  version: number;
  layout?: DetailLayout;
  blocks?: Record<string, DetailBlockCfg>;
}

// 块内建默认显隐（本阶段全部可见）
const BLOCK_DEFAULT_VISIBLE: Record<string, boolean> = {
  gallery: true,
  info: true,
  price: true,
  promo: true,
  coupon: true,
  service: true,
  variants: true,
  purchase: true,
  description: true,
  reviews: true,
  nearby: true,
  related: true,
  datebar: true,
  roomList: true,
  pricePreview: true,
  policy: true,
};

// layout 缺省/非法 → 'classic'（与现有 standard 渲染等价，不回归）
export function detailLayout(cfg: DetailConfig | null): DetailLayout {
  const l = cfg?.layout;
  return l === 'floor' || l === 'dualBuy' || l === 'hotel' || l === 'mall' ? l : 'classic';
}

// ── 酒店版式自动命中（纯函数，SSR 友好）────────────────────────────
// hotelRoomConfig 落 text 列（Vendure 3.6 无 json 字段类型），存 JSON 字符串；
// 坏 JSON / 非字符串 → null，视为「无房型配置」。
export function parseHotelRoomConfig(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// 该商品的**任一变体**配置了 hotelRoomConfig → 视为酒店房型商品。
// 用变体集合（而非「当前选中变体」）判定，保证 SSR 与 CSR 判定一致、避免 hydration mismatch。
export function productHasHotelRoom(variants: readonly unknown[] | null | undefined): boolean {
  if (!Array.isArray(variants)) return false;
  return variants.some(
    (v) =>
      parseHotelRoomConfig(
        (v as { customFields?: { hotelRoomConfig?: unknown } } | null)?.customFields?.hotelRoomConfig,
      ) != null,
  );
}

// 「后台显式覆盖为非 hotel 版式」：只有 floor / dualBuy / mall 算显式覆盖。
// classic 视为「未指定」——t2 的 detailConfig.layout 即为 classic，按设计 classic + 含房型 → 自动命中 hotel。
export function isExplicitNonHotelLayout(cfg: DetailConfig | null): boolean {
  const l = cfg?.layout;
  return l === 'floor' || l === 'dualBuy' || l === 'mall';
}

// 最终生效版式：后台显式非 hotel 覆盖优先；否则商品含房型 → hotel；再否则按配置（默认 classic）。
export function resolveDetailLayout(
  cfg: DetailConfig | null,
  variants: readonly unknown[] | null | undefined,
): DetailLayout {
  if (isExplicitNonHotelLayout(cfg)) return detailLayout(cfg);
  if (productHasHotelRoom(variants)) return 'hotel';
  return detailLayout(cfg);
}

// 逐级兜底：层1 块定制 visible → 层2 内建默认 → true
export function blockVisible(cfg: DetailConfig | null, key: string): boolean {
  return cfg?.blocks?.[key]?.visible ?? BLOCK_DEFAULT_VISIBLE[key] ?? true;
}

// 块定制 style 兜底：块级 style → 内建默认（传入）
export function blockStyle(cfg: DetailConfig | null, key: string, def = ''): string {
  return cfg?.blocks?.[key]?.style ?? def;
}

// 解析；坏 JSON / 非对象 → null。对象入参直接透传（省去调用方 JSON 序列化往返），
// 结构校验交给逐级兜底的消费方（blockVisible/detailLayout 等对缺字段均有内建默认）。
export function parseDetailConfig(
  raw: string | DetailConfig | null | undefined,
): DetailConfig | null {
  if (!raw) return null;
  if (typeof raw !== "string") {
    return typeof raw === "object" ? (raw as DetailConfig) : null;
  }
  try {
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data as DetailConfig;
  } catch {
    return null;
  }
}

// 本地化文案：当前 locale → defaultLocale → 首个值 → ''（由块内建占位兜底）
export function localizeText(
  text: LocalizedText | undefined | null,
  locale: string,
  defaultLocale = 'zh-CN',
): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  return text[locale] ?? text[defaultLocale] ?? Object.values(text)[0] ?? '';
}