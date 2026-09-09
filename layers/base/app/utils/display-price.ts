// 选取对外展示价格：以「净价 price」为基准，按渠道税档 taxMode（inclusive/zero/exclusive）
// 用 displayCentsFromNet 换算展示价。price 缺失时回退 priceWithTax，兼容无净价的旧数据。
import { displayCentsFromNet, type TaxMode } from "../utils/tax-price";
import type { SearchResult } from "~~/types/product";

export type SearchItem = SearchResult[number];
export type SearchPriceUnion = SearchItem["priceWithTax"];

export function pickDisplayPrice(
  item: Pick<SearchItem, "price" | "priceWithTax"> | null | undefined,
  taxMode: TaxMode,
): SearchPriceUnion {
  if (!item) return undefined as unknown as SearchPriceUnion;
  const price = item.price ?? item.priceWithTax;
  if (!price) return undefined as unknown as SearchPriceUnion;
  if ("min" in price && "max" in price) {
    return {
      min: displayCentsFromNet(price.min ?? 0, taxMode),
      max: displayCentsFromNet(price.max ?? 0, taxMode),
    } as SearchPriceUnion;
  }
  return { value: displayCentsFromNet(price.value ?? 0, taxMode) } as SearchPriceUnion;
}