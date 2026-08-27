// detailConfig 解析工具：类型 + 逐级兜底 + 国际化文案（纯函数，SSR 友好）
// 兜底链：块级定制字段 → 块内建默认 → 全局默认（true / 'classic' / 占位文案）
// 文案兜底链：当前 locale → defaultLocale → 无语言对象首个值 → 块内建占位 → i18n 字典静态文案

export type DetailLayout = 'classic' | 'floor' | 'dualBuy';

// 可翻译文案：string = 各语言共用；Record<language,string> = 逐语言
export type LocalizedText = string | Record<string, string>;

export interface DetailBlockCfg {
  visible?: boolean;
  /* L3 样式字段预留：fontScale / imageWidth / radius 等，后续迭代再扩展 */
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
  service: true,
  variants: true,
  purchase: true,
  description: true,
  reviews: true,
  nearby: true,
  related: true,
};

// layout 缺省/非法 → 'classic'（与现有 standard 渲染等价，不回归）
export function detailLayout(cfg: DetailConfig | null): DetailLayout {
  const l = cfg?.layout;
  return l === 'floor' || l === 'dualBuy' ? l : 'classic';
}

// 逐级兜底：层1 块定制 visible → 层2 内建默认 → true
export function blockVisible(cfg: DetailConfig | null, key: string): boolean {
  return cfg?.blocks?.[key]?.visible ?? BLOCK_DEFAULT_VISIBLE[key] ?? true;
}

// 解析；坏 JSON / 缺 sections 等价字段 → null
export function parseDetailConfig(raw: string | null | undefined): DetailConfig | null {
  if (!raw) return null;
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