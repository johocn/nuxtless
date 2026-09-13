// 营销标签 code → 文案映射：优先 i18n 字典（messages.detail.marketingTags），未知 code 按原文兜底。
// Vendure customFields text 字段在 shop-api 返回 JSON 字符串（如 '["price-drop"]'），需与数组兼容。
export function normalizeCodes(codes: string | string[] | null | undefined): string[] {
  if (Array.isArray(codes)) return codes;
  if (typeof codes !== "string" || !codes.trim()) return [];
  try {
    const parsed = JSON.parse(codes);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [codes.trim()];
  }
}

export function resolveMarketingTagTexts(
  codes: string | string[] | null | undefined,
  dict: Record<string, string>,
): string[] {
  return normalizeCodes(codes).map((c) => dict[c] ?? c).filter(Boolean);
}
