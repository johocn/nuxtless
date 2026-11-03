// 界面 locale → 内容语言键映射（SSR 友好纯函数）。
// 后端协议/FAQ 等文案对象的内容语言全集为 zh-CN / zh-TW / en / ja / ko；
// nshop 界面 locale 无 zh-TW，故映射表不含 zh-TW，未识别 locale 统一回退 en。
export const CONTENT_LANG_MAP: Record<string, string> = {
  "zh-CN": "zh-CN",
  "ja-JP": "ja",
  "ko-KR": "ko",
  "en-US": "en",
};

/** 映射未命中时的回退内容语言 */
export const DEFAULT_CONTENT_LANG = "en";

/**
 * 界面 locale → 内容语言键。
 * 仅映射不透传：内容语言键必须落在后端文案对象的既有键集内，
 * 未识别的 locale（含空值）统一回退 en，避免取到无效键。
 */
export function toContentLang(locale: string | null | undefined): string {
  if (!locale) return DEFAULT_CONTENT_LANG;
  return CONTENT_LANG_MAP[locale] ?? DEFAULT_CONTENT_LANG;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * 后台 LocalizedText 逐级回退解析：当前 locale → defaultLocale → 首个值 → 空串。
 * 后台文案键存在两种写法（BCP47 如 en-US / 主语言如 en、zh-CN），而界面 locale 是
 * i18n code（en、de…），直接精确取键会让非默认语言全部回退默认语言。故先精确、
 * 再同全码大小写归一、最后按主语言子标签兜底匹配。
 */
export function resolveLocalizedText(
  text: Record<string, string> | undefined | null,
  locale: string | null | undefined,
  defaultLocale = "zh-CN",
): string {
  if (!text) return "";
  const keys = Object.keys(text);
  if (!keys.length) return "";
  const pick = (tag: string | null | undefined): string | undefined => {
    if (!tag) return undefined;
    const exact = text[tag];
    if (exact) return exact;
    const want = normalizeTag(tag);
    const sameTag = keys.find((k) => normalizeTag(k) === want);
    if (sameTag) return text[sameTag];
    const primary = want.split("-")[0];
    const samePrimary = keys.find((k) => normalizeTag(k).split("-")[0] === primary);
    return samePrimary ? text[samePrimary] : undefined;
  };
  return pick(locale) ?? pick(defaultLocale) ?? Object.values(text)[0] ?? "";
}
