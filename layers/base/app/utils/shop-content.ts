// shopContent 解析工具：类型 + 京东默认样式 + 解析（纯函数，SSR 友好）
// 范围：京东风格模板，单套 sections；区域样式可选（含淘宝圆形/瀑布流等）

export type NavShape = 'square' | 'round';   // 默认 'square'（京东）；'round' = 淘宝圆形
export type NavLayout = 'grid5x2' | 'grid4x2' | 'row'; // 默认 'grid5x2'（京东十宫格）；'grid4x2' 淘宝八宫格 / 'row' 单行
export type GoodsLayout = 'compact' | 'masonry' | 'single'; // 默认 'compact'（京东）；'masonry' 淘宝瀑布流 / 'single' 单列

export interface BannerSection { type: 'banner'; images: { image: string; link?: string }[]; }
export interface NoticeSection { type: 'notice'; text: string; }
export interface NavSection {
  type: 'nav';
  items: { label: string; image?: string; link?: string }[];
  shape?: NavShape;
  layout?: NavLayout;
}
export interface GoodsSection {
  type: 'goods';
  collectionId?: string;   // 为空则自动推荐（fallback 现有 SearchProducts）
  layout?: GoodsLayout;
  title?: string;
}
export interface RichTextSection { type: 'richText'; html: string; }

export type ShopSection = BannerSection | NoticeSection | NavSection | GoodsSection | RichTextSection;
export interface ShopContent { version: 1; sections: ShopSection[]; }

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