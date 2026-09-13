// 营销标签 code → 文案映射：优先 i18n 字典（messages.detail.marketingTags），未知 code 按原文兜底
export function resolveMarketingTagTexts(
  codes: string[],
  dict: Record<string, string>,
): string[] {
  return codes.map((c) => dict[c] ?? c).filter(Boolean);
}
