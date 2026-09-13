// 促销方案/服务保障解析：code 列表 ↔ 频道方案库（[{code,text:{zh_Hans,en}}]）纯函数（SSR 友好）
export interface Scheme {
  code: string;
  text?: string | Record<string, string>;
}

export const VENDURE_LOCALE_MAP: Record<string, string> = {
  "zh-CN": "zh_Hans",
  "en-US": "en",
};

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
  const lk = VENDURE_LOCALE_MAP[locale] ?? locale;
  return text[lk] ?? text[VENDURE_LOCALE_MAP[defaultLocale] ?? defaultLocale] ?? Object.values(text)[0] ?? "";
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
  codes: string[],
  locale: string,
): string[] {
  if (!codes.length) {
    return (schemes ?? []).map((s) => localizeSchemeText(s.text, locale)).filter(Boolean);
  }
  return codes.map((c) => resolveSchemeText(schemes, c, locale)).filter(Boolean);
}
