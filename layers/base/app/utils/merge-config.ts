// 五级合并纯函数（SSR 友好，nshop/vshop 双端共用同一套语义）：
// L0 全局默认（代码内建） ← L1 全局配置(ShopGlobalConfig) ← L2 风格模板(ShopTemplate)
//   ← L3 店铺覆盖(channel customFields) ← L4 页面/模块内建默认（各页消费方）
// 合并规则：逐级深合并，未配置项回退上一级；数组/标量直接覆盖。

export interface ThemeTokens {
  primaryColor?: string;
  accentColor?: string;
  radius?: number | string;
  [key: string]: unknown;
}

export interface ShopGlobalConfigData {
  id?: string;
  app?: string;
  themeTokens?: Record<string, any> | null;
  defaults?: Record<string, any> | null;
}

export interface ShopTemplateData {
  id?: string;
  name?: string;
  app?: string;
  theme?: Record<string, any> | null;
  pages?: Record<string, any> | null;
  version?: number;
  enabled?: boolean;
}

/** 页面 key → L3 店铺覆盖 channel.customFields 字段名 */
export const PAGE_CF_FIELD: Record<string, string> = {
  product: 'detailConfig',
  home: 'shopContent',
  category: 'pageCategoryConfig',
  cart: 'pageCartConfig',
  profile: 'pageProfileConfig',
};

function isPlainObject(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 深合并：仅普通对象递归合并；数组/标量直接覆盖；null/undefined 跳过 */
export function deepMerge<T extends Record<string, any>>(
  ...sources: (T | null | undefined)[]
): T {
  const out: Record<string, any> = {};
  for (const src of sources) {
    if (!isPlainObject(src)) continue;
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined || v === null) continue;
      if (isPlainObject(v) && isPlainObject(out[k])) {
        out[k] = deepMerge(out[k], v);
      } else {
        out[k] = v;
      }
    }
  }
  return out as T;
}

/** 主题令牌合并：L1 全局 themeTokens ← L2 模板 theme（叠加后作为 CSS 变量源） */
export function mergeThemeTokens(
  globalConfig: ShopGlobalConfigData | null,
  template: ShopTemplateData | null,
): ThemeTokens {
  return deepMerge<ThemeTokens>(
    {},
    globalConfig?.themeTokens ?? null,
    template?.theme ?? null,
  );
}

/** 解析店铺覆盖 JSON 字符串（Vendure text customField）；坏 JSON/非对象 → null */
export function parseJsonText(raw: string | null | undefined): Record<string, any> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return isPlainObject(v) ? v : null;
  } catch {
    return null;
  }
}

/** 单页五级合并：L0 {} ← L1 defaults[page] ← L2 template.pages[page] ← L3 店铺覆盖 JSON */
export function mergePageConfig(
  globalConfig: ShopGlobalConfigData | null,
  template: ShopTemplateData | null,
  channelCfs: Record<string, any> | null,
  page: string,
): Record<string, any> | null {
  const field = PAGE_CF_FIELD[page];
  const shopRaw = field ? channelCfs?.[field] ?? null : null;
  const shop =
    typeof shopRaw === 'string'
      ? parseJsonText(shopRaw)
      : isPlainObject(shopRaw)
        ? shopRaw
        : null;
  const merged = deepMerge(
    {},
    globalConfig?.defaults?.[page] ?? null,
    template?.pages?.[page] ?? null,
    shop,
  );
  return Object.keys(merged).length ? merged : null;
}
