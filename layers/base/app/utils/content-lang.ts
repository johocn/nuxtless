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
