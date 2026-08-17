import { SortOrder } from "~~/types/default";

export type SortKey = "RELEVANCE" | "NAME_ASC" | "PRICE_ASC" | "PRICE_DESC";

export const SORT_KEYS: SortKey[] = ["RELEVANCE", "NAME_ASC", "PRICE_ASC", "PRICE_DESC"];

// 把 SortKey 映射为 search 的 sort 参数（SearchResultSortParameter 输入对象）
export function toSortParam(key: SortKey): { price?: SortOrder } | { name?: SortOrder } | null {
  switch (key) {
    case "PRICE_ASC":
      return { price: SortOrder.ASC };
    case "PRICE_DESC":
      return { price: SortOrder.DESC };
    case "NAME_ASC":
      return { name: SortOrder.ASC };
    default:
      return null; // 综合 → null（默认相关度）
  }
}

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && SORT_KEYS.includes(value as SortKey);
}