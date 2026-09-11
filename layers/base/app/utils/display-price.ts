// 选取对外展示的现行价（价签/列表统一口径）。同一件商品在列表页与详情页应显示一致。
// 关键：Vendure `price` 恒为净价、`priceWithTax` 恒为含税总价，二者随渠道 `pricesIncludeTax`
// 的「如何解释价格」而取值不同：pricesIncludeTax=false 渠道直接存净价（price=录入值，
// priceWithTax=录入值×1.13）；true 渠道存含税总价（priceWithTax=录入值，price=录入值/1.13）。
// 因此「运营端录入的对客基准价」在 false 渠道=price、true 渠道=priceWithTax === 「录入值本身」。
//   - inclusive / zero（含税价 / 零税价）：展示录入基准价（false→price、true→priceWithTax）
//   - exclusive（不含税价）：价税分离，价签展示价税分离后的含税总价 priceWithTax
import type { SearchResult } from "~~/types/product";
import { displayCentsFromNet, type TaxMode } from "./tax-price";

export type SearchItem = SearchResult[number];
export type SearchPriceUnion = SearchItem["price"];

export function pickDisplayPrice(
  item: Pick<SearchItem, "price" | "priceWithTax"> | null | undefined,
  mode: TaxMode,
  pricesIncludeTax: boolean,
): SearchPriceUnion {
  if (!item) return undefined as unknown as SearchPriceUnion;
  // inclusive/zero + pricesIncludeTax=false（净价直存）→ 用 price；其余 → 用 priceWithTax
  const useWithTax = mode === "exclusive" || !!pricesIncludeTax;
  const src = useWithTax ? item.priceWithTax : item.price;
  if (!src) return undefined as unknown as SearchPriceUnion;
  return src as SearchPriceUnion;
}

/** 从 SearchItem 取「现行展示价」的分值（单值为 value；区间取 min），供划线价比较/展示用。 */
export function pickCurrentCents(
  item: Pick<SearchItem, "price" | "priceWithTax"> | null | undefined,
  mode: TaxMode,
  pricesIncludeTax: boolean,
): number | null {
  const s = pickDisplayPrice(item, mode, pricesIncludeTax);
  if (!s) return null;
  if ("value" in s) return s.value ?? 0;
  return s.min ?? s.max ?? 0;
}

/**
 * 从「商品主数据（含变体）」取划线价（分）：取各变体 listPrice 中「非空最大值」，
 * 再按渠道 taxMode 换算成对客展示分（inclusive/zero 原样、exclusive×1.13），与详情页 usePriceWithList.list 同口径。
 * 列表 SearchResult 不带 listPrice，须由商品卡数据源（Product/customFields）补齐后调用。
 */
export function pickListCents(
  variants: Array<{ customFields?: { listPrice?: number | null } | null }> | null | undefined,
  mode: TaxMode,
): number | null {
  if (!Array.isArray(variants)) return null;
  let max = 0;
  for (const v of variants) {
    const p = (v?.customFields as any)?.listPrice;
    if (typeof p === "number" && p > 0 && p > max) max = p;
  }
  return max > 0 ? Math.round(displayCentsFromNet(max, mode)) : null;
}

/* ── 首页/列表商品卡划线价补齐 ───────────────────────────────
 * SearchProducts 的 SearchItem 不返回变体 listPrice，须由 GetProductsByIds
 * （ProductBaseFragment 含 variants.customFields.listPrice）二次补齐。
 * 产出「slug → 划线展示价(分)」映射；仅当划线价 > 现行价时才用于渲染（避免倒挂）。 */
type ListableVariant = { customFields?: { listPrice?: number | null } | null } | null;
type ListableProduct = {
  slug: string;
  variants?: Array<ListableVariant> | null;
};

export function listCentsMap(
  products: Array<ListableProduct | null | undefined> | null | undefined,
  mode: TaxMode,
): Map<string, number | null> {
  const map = new Map<string, number | null>();
  if (!Array.isArray(products)) return map;
  for (const p of products) {
    if (p?.slug) map.set(p.slug, pickListCents((p.variants ?? null) as Array<{ customFields?: { listPrice?: number | null } | null }> | null, mode));
  }
  return map;
}

/** SearchItem + 可选的划线展示价（分）；网格组件据此渲染删除线原价。 */
export type GoodsCardItem = SearchItem & { listPriceCents?: number | null };

export function enrichWithListPrice(
  items: SearchItem[],
  listCents: Map<string, number | null>,
): GoodsCardItem[] {
  return items.map((i) => {
    const list = listCents.get(i.slug);
    if (list == null) return i as GoodsCardItem;
    return { ...i, listPriceCents: list };
  });
}