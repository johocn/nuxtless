// 选取对外展示价格：taxEnabled=true（默认，含税）→ 显示含税价 priceWithTax；false（不含税）→ 显示净价 price。
// price 缺失时回退 priceWithTax，兼容无净价的旧数据。
import type { SearchResult } from "~~/types/product";

export type SearchItem = SearchResult[number];
export type SearchPriceUnion = SearchItem["priceWithTax"];

export function pickDisplayPrice(
  item: Pick<SearchItem, "price" | "priceWithTax"> | null | undefined,
  taxEnabled: boolean,
): SearchPriceUnion {
  if (!item) return undefined as unknown as SearchPriceUnion;
  return (taxEnabled ? item.priceWithTax : (item.price ?? item.priceWithTax)) as unknown as SearchPriceUnion;
}