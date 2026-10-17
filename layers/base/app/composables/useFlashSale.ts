// 秒杀楼层取数：activeFlashSaleActivities（flash-sale plugin，共享 shop-api）+ 按 productId
// 批量补商品名/图/slug/原价。价格单位均为分。失败由调用方兜底（整层隐藏）。
import { resolveClient } from "./useMessages";
import { normalizeFlashActivities, type FlashActivityRaw, type FlashItem } from "../utils/flash-sale";

export interface FlashProductInfo {
  name: string;
  slug: string;
  image: string | null;
  /** 该活动变体的现行展示价（priceWithTax，分）；取不到为 null */
  originPrice: number | null;
}

interface FlashSaleQuery {
  activeFlashSaleActivities: FlashActivityRaw[];
}

interface FlashProductsQuery {
  products: {
    items: Array<{
      id: string;
      name: string;
      slug: string;
      featuredAsset?: { preview: string } | null;
      variants?: Array<{ id: string; priceWithTax?: number | null }> | null;
    }>;
  };
}

/** 拉取进行中的秒杀活动并补齐商品信息；limit 为最终条数（调用方先 clamp） */
export async function getFlashSaleItems(
  limit: number,
): Promise<{ items: FlashItem[]; products: Record<string, FlashProductInfo> }> {
  const client = resolveClient();
  const data = await client.request<FlashSaleQuery>(
    `query FlashSaleActivities {
      activeFlashSaleActivities { id name startAt endAt flashPrice totalStock soldCount limitPerUser productId variantId status }
    }`,
  );
  const items = normalizeFlashActivities(data.activeFlashSaleActivities, Date.now()).slice(0, limit);
  const products: Record<string, FlashProductInfo> = {};
  if (!items.length) return { items, products };

  const ids = Array.from(new Set(items.map((i) => i.productId)));
  const pdata = await client.request<FlashProductsQuery>(
    `query FlashProducts($ids: [String!]!) {
      products(options: { filter: { id: { in: $ids } }, take: 50 }) {
        items { id name slug featuredAsset { preview } variants { id priceWithTax } }
      }
    }`,
    { ids },
  );
  for (const p of pdata.products.items) {
    const variant = (p.variants ?? []).find((v) => items.some((i) => i.productId === p.id && i.variantId === v.id));
    products[p.id] = {
      name: p.name,
      slug: p.slug,
      image: p.featuredAsset?.preview ?? null,
      originPrice: typeof variant?.priceWithTax === "number" ? variant.priceWithTax : null,
    };
  }
  // 补不到商品信息的活动剔除（无图/无详情可跳）
  return { items: items.filter((i) => !!products[i.productId]), products };
}
