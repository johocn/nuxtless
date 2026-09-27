// shopContent 解析工具：类型 + 京东默认样式 + 解析（纯函数，SSR 友好）
// 范围：京东风格模板，单套 sections；区域样式可选（含淘宝圆形/瀑布流等）
// 后台可编辑文案（title / text / label）一律用 LocalizedText：string = 各语言共用；
// Record<locale,string> = 逐语言，经 localizeText() 逐级回退（当前 locale → zh-CN → 首个值）。

import type { LocalizedText } from "./detail-config";

export type NavShape = 'square' | 'round';   // 默认 'square'（京东）；'round' = 淘宝圆形
export type NavLayout = 'grid5x2' | 'grid4x2' | 'row'; // 默认 'grid5x2'（京东十宫格）；'grid4x2' 淘宝八宫格 / 'row' 单行
export type GoodsLayout = 'compact' | 'masonry' | 'single'; // 默认 'compact'（京东）；'masonry' 淘宝瀑布流 / 'single' 单列

export interface BannerSection { type: 'banner'; images: { image: string; link?: string }[]; }
export interface NoticeSection { type: 'notice'; text: LocalizedText; }
export interface NavSection {
  type: 'nav';
  items: { label: LocalizedText; image?: string; link?: string }[];
  shape?: NavShape;
  layout?: NavLayout;
}
export interface GoodsSection {
  type: 'goods';
  collectionId?: string;   // 为空则自动推荐（fallback 现有 SearchProducts）
  layout?: GoodsLayout;
  title?: LocalizedText;
  limit?: number;          // 显式条数（1-30）；缺省按版式默认（compact/single 10、masonry 8）
}
export interface RichTextSection { type: 'richText'; html: string; }

// 热门 / 推荐商品区块（装修积木）：版式 A/B/C，取数口径见 composables/useCuratedGoods
export type GoodsCardLayout = 'compact' | 'sliding' | 'hero'; // A 紧凑 / B 横滑 / C 一大二小，默认 compact
export const GOODS_CARD_LAYOUTS: readonly GoodsCardLayout[] = ['compact', 'sliding', 'hero'];

/** 热门商品区块：与京东兜底楼层同源（SearchProducts）或指定集合 */
export interface HotGoodsSection {
  type: 'hot';
  title?: LocalizedText;
  source?: 'auto' | 'collection'; // 默认 auto
  collectionId?: string;
  limit?: number;                 // 默认 10，上限 30
  layout?: GoodsCardLayout;       // 默认 compact
}

/** 推荐商品区块：默认排除同页热门区块已展示的 productId */
export interface RecommendGoodsSection {
  type: 'recommend';
  title?: LocalizedText;
  source?: 'auto' | 'collection' | 'slugs'; // 默认 auto
  collectionId?: string;
  slugs?: string[];
  limit?: number;                 // 默认 10，上限 30
  layout?: GoodsCardLayout;       // 默认 compact
  dedupe?: boolean;               // 默认 true：排除同页 hot 区块已展示的 productId
}

/** 品牌闪购楼层：数据自 menuCollections（与京东兜底楼层同源），无重数据配置 */
export interface BrandFloorSection { type: 'brandFloor'; title?: LocalizedText; }
/** 品质专区楼层：数据自 menuCollections，无重数据配置 */
export interface PlazaSection { type: 'plaza'; title?: LocalizedText; }
/** 领券楼层：数据自 shop 侧券接口（useCoupon.ts），无兜底 */
export interface CouponSection { type: 'coupon'; title?: LocalizedText; limit?: number; }
/** 最新商品楼层：用「新品集合」（collectionSlug）出楼，非 createdAt 排序 */
export interface LatestSection {
  type: 'latest';
  title?: LocalizedText;
  collectionId?: string;
  limit?: number;
  layout?: GoodsLayout;
}

export type CuratedGoodsSection = HotGoodsSection | RecommendGoodsSection;

export type ShopSection =
  | BannerSection
  | NoticeSection
  | NavSection
  | GoodsSection
  | RichTextSection
  | HotGoodsSection
  | RecommendGoodsSection
  | BrandFloorSection
  | PlazaSection
  | CouponSection
  | LatestSection;

export interface ShopContent {
  version: 1;
  sections: ShopSection[];
  /** 显式移除的骨架槽位 key（见 home-skeleton.ts 的 SkeletonSlotKey） */
  hiddenSlots?: string[];
}

// 京东默认样式（前端常量，不落库）：新建区块预填 + 渲染字段缺省兜底
export const JD_STYLE_DEFAULTS = {
  nav: { shape: 'square' as NavShape, layout: 'grid5x2' as NavLayout },
  goods: 'compact' as GoodsLayout,
};

export function parseShopContent(raw: string | null | undefined): ShopContent | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    if (!Array.isArray(data.sections)) return null;
    return data as ShopContent;
  } catch {
    return null;
  }
}

/**
 * hiddenSlots 容错：仅保留非空字符串（trim + 去重，保持原序）。
 * 非数组 / 混入数字或 null / 空白项一律丢弃，不影响 sections 解析。
 */
export function sanitizeHiddenSlots(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function getSections(content: ShopContent | null): ShopSection[] {
  return content?.sections ?? [];
}

// 区块字段缺省 → 京东默认
export function navDefaults(shape?: NavShape, layout?: NavLayout) {
  return {
    shape: shape ?? JD_STYLE_DEFAULTS.nav.shape,
    layout: layout ?? JD_STYLE_DEFAULTS.nav.layout,
  };
}
export function goodsLayout(layout?: GoodsLayout): GoodsLayout {
  return layout ?? JD_STYLE_DEFAULTS.goods;
}

// ── 热门 / 推荐商品区块：字段缺省与越界兜底（纯函数，SSR 友好）─────────────
// 后台已按同一 schema 校验（正整数 ≤30 / 枚举 / slugs 字符串数组）；前台仍逐字段兜底，
// 防止历史脏数据或后台绕过校验导致区块渲染异常。
export const CURATED_GOODS_DEFAULTS = {
  source: 'auto' as const,
  limit: 10,
  /** limit 上限（与后台校验一致） */
  maxLimit: 30,
  layout: 'compact' as GoodsCardLayout,
  dedupe: true,
};

export interface CuratedGoodsConfig {
  source: 'auto' | 'collection' | 'slugs';
  collectionId: string | null;
  slugs: string[];
  limit: number;
  layout: GoodsCardLayout;
  dedupe: boolean;
}

/** 版式：合法枚举直接采用，非法 / 缺省 → compact（A） */
export function goodsCardLayout(layout?: string | null): GoodsCardLayout {
  return GOODS_CARD_LAYOUTS.includes(layout as GoodsCardLayout)
    ? (layout as GoodsCardLayout)
    : CURATED_GOODS_DEFAULTS.layout;
}

/** 数量：正整数取用并按 30 截断；非数字 / 非正整数 / 越界 → 10 */
export function curatedLimit(limit?: number | null): number {
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) return CURATED_GOODS_DEFAULTS.limit;
  return Math.min(limit, CURATED_GOODS_DEFAULTS.maxLimit);
}

/** slugs：仅保留非空字符串（去重，保持原序）；类型不符一律丢弃 */
export function curatedSlugs(slugs?: unknown): string[] {
  if (!Array.isArray(slugs)) return [];
  const out: string[] = [];
  for (const s of slugs) {
    if (typeof s !== 'string') continue;
    const v = s.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * 区块配置缺省兜底：source → auto；limit → 10（≤30）；layout → compact；dedupe → true。
 * `source` 为 collection 但缺 collectionId、或为 slugs 但 slugs 非法/为空 → 退回 auto，
 * 避免渲染出「必然为空」的区块。
 */
export function curatedGoodsConfig(section: CuratedGoodsSection): CuratedGoodsConfig {
  const collectionId = typeof section.collectionId === 'string' && section.collectionId.trim()
    ? section.collectionId.trim()
    : null;
  const slugs = curatedSlugs((section as RecommendGoodsSection).slugs);
  const raw = section.source;
  let source: CuratedGoodsConfig['source'];
  if (raw === 'collection' && collectionId) source = 'collection';
  else if (raw === 'slugs' && slugs.length) source = 'slugs';
  else source = CURATED_GOODS_DEFAULTS.source;
  return {
    source,
    collectionId,
    slugs,
    limit: curatedLimit(section.limit),
    layout: goodsCardLayout(section.layout),
    dedupe: section.type === 'recommend' ? (section.dedupe ?? CURATED_GOODS_DEFAULTS.dedupe) : CURATED_GOODS_DEFAULTS.dedupe,
  };
}
