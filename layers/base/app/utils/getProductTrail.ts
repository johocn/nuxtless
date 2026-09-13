import type { ProductDetail } from "~~/types/product";
import type { BreadcrumbItem } from "@nuxt/ui";
import type { MenuCollections } from "~~/types/collection";

export const ROOT_SLUG = "__root_collection__";

export interface TrailCollection {
  slug: string;
  name: string;
  parent?: { slug: string; name: string } | null;
}

/** 从商品关联集合中筛出唯一顶级分类：优先菜单树顺序，其次按商品返回顺序 */
export function pickTopCollection(
  collections: TrailCollection[],
  menuTops: Array<{ slug: string }> = [],
): TrailCollection | null {
  const items = collections.filter((c) => c.slug !== ROOT_SLUG);
  if (!items.length) return null;

  const topOf = (c: TrailCollection): TrailCollection | null => {
    if (!c.parent || c.parent.slug === ROOT_SLUG) return c;
    return c.parent as TrailCollection;
  };

  for (const top of menuTops) {
    const hit = items.find((c) => c.slug === top.slug || c.parent?.slug === top.slug);
    if (hit) return topOf(hit);
  }
  const rootChild = items.find((c) => !c.parent || c.parent.slug === ROOT_SLUG);
  if (rootChild) return rootChild;
  const withParent = items.find((c) => c.parent);
  if (withParent?.parent) return withParent.parent as TrailCollection;
  return items[0] ?? null;
}

export function getProductTrail(
  product: ProductDetail,
  menuTops?: Array<{ slug: string }>,
): BreadcrumbItem[] {
  const tops =
    menuTops ??
    useState<MenuCollections>("menuCollections").value?.collections?.items ??
    [];
  const top = pickTopCollection(product?.collections ?? [], tops);
  if (!top) return [];
  return [{ label: top.name, to: `/category/${top.slug}` }];
}
