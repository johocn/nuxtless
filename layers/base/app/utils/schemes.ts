import { normalizeCodes } from "./marketing-tags";

// 促销方案/服务保障解析：code 列表 ↔ 频道方案库（[{code,text:{zh_Hans,en}}]）纯函数（SSR 友好）
export interface Scheme {
  code: string;
  text?: string | Record<string, string>;
}

// 前端 locale → Vendure LanguageCode（12 种，与 vendure LanguageCode 枚举一一对应）
export const VENDURE_LOCALE_MAP: Record<string, string> = {
  "zh-CN": "zh_Hans",
  "en-US": "en",
  "bg-BG": "bg",
  "ru-RU": "ru",
  "fa-IR": "fa",
  "de-DE": "de",
  "es-ES": "es",
  "fr-FR": "fr",
  "it-IT": "it",
  "pt-BR": "pt",
  "ja-JP": "ja",
  "ko-KR": "ko",
};

/** Vendure 默认语言码（映射缺失时的回退终点） */
export const DEFAULT_VENDURE_LANGUAGE_CODE = "zh_Hans";

/**
 * locale → Vendure LanguageCode。
 * 未命中时回退 fallback（默认 zh_Hans），**不透传**——Vendure 对 ?languageCode
 * 只做格式校验、不做枚举校验，透传无效码会落到渠道 defaultLanguageCode 之外的死路。
 */
export function toVendureLanguageCode(
  locale: string | null | undefined,
  fallback: string = DEFAULT_VENDURE_LANGUAGE_CODE,
): string {
  if (!locale) return fallback;
  return VENDURE_LOCALE_MAP[locale] ?? fallback;
}

export function parseSchemeList(raw: string | null | undefined): Scheme[] | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data
      .filter((s) => s && typeof s.code === "string")
      .map((s) => ({ code: s.code, text: s.text }));
  } catch {
    return null;
  }
}

export function localizeSchemeText(
  text: Scheme["text"] | undefined,
  locale: string,
  defaultLocale = "zh-CN",
): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  const dk = VENDURE_LOCALE_MAP[defaultLocale] ?? defaultLocale;
  const lk = toVendureLanguageCode(locale, dk);
  return text[lk] ?? text[dk] ?? Object.values(text)[0] ?? "";
}

export function resolveSchemeText(
  schemes: Scheme[] | null,
  code: string,
  locale: string,
): string {
  const hit = schemes?.find((s) => s.code === code);
  return hit ? localizeSchemeText(hit.text, locale) : "";
}

// 商品覆盖：codes 非空时按 codes 过滤显示；codes 为空 → 频道默认（方案库全部启用项）
export function resolveSchemeTexts(
  schemes: Scheme[] | null,
  codes: string | string[] | null | undefined,
  locale: string,
): string[] {
  const list = normalizeCodes(codes);
  if (!list.length) {
    return (schemes ?? []).map((s) => localizeSchemeText(s.text, locale)).filter(Boolean);
  }
  return list.map((c) => resolveSchemeText(schemes, c, locale)).filter(Boolean);
}
