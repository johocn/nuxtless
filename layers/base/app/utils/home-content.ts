import type { GetProductsByIdsQuery } from "~~/.nuxt/gql/default";

export type HomeBlockLayout = "hero_full" | "double_grid" | "triple_grid" | "single_scroll";

export interface HeroBlockData {
  imageUrl: string;
  link?: string;
  title?: string;
  subTitle?: string;
}

export interface FloorBlockData {
  title: string;
  layout: HomeBlockLayout;
  items: number[]; // 商品 id 数组
}

export function isHero(data: unknown): data is HeroBlockData {
  return !!data && typeof data === "object" && !!((data as HeroBlockData).imageUrl);
}

export function isFloor(data: unknown): data is FloorBlockData {
  return (
    !!data &&
    typeof data === "object" &&
    !!((data as FloorBlockData).title) &&
    Array.isArray((data as FloorBlockData).items)
  );
}

// ProductCard 需要 SearchResult（productName/slug/productAsset{id,preview}/priceWithTax(union)/currencyCode），
// 而 GetProductsByIds 返回 Product（name/slug/featuredAsset{id,preview}/variants{currencyCode,price}）。映射：
export type ProductCardCompatible = {
  productName: string;
  slug: string;
  productAsset: { id: string; preview: string } | null;
  priceWithTax: { value: number } | { min: number; max: number };
  currencyCode?: string;
};

export function toSearchResultCard(
  p: NonNullable<GetProductsByIdsQuery["products"]>["items"][number],
): ProductCardCompatible {
  const price = (p.variants?.[0]?.price ?? 0) / 100;
  return {
    productName: p.name,
    slug: p.slug,
    productAsset: p.featuredAsset ? { id: p.featuredAsset.id, preview: p.featuredAsset.preview } : null,
    priceWithTax: { value: price },
    currencyCode: p.variants?.[0]?.currencyCode ?? "CNY",
  };
}

// 兼容性导出：统一 type→组件 解析（见 home-content-block.ts），旧 import 不破坏
export type { ContentBlock, ContentBlockType } from "./home-content-block";