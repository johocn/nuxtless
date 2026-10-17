/**
 * 积分商品 C 端读取（points-mall-plugin shop API，仅查询）。
 *
 * 客户端构建复用 useMessages.ts 的 resolveClient()（鉴权/渠道/语言头约定一致：
 * Bearer 会话 token + vendure-token 渠道头 + Accept-Language）。
 * 积分商品为跨端共享实体（与 vshop 积分商城同源），兑换闭环在积分商城端完成，
 * nshop 本层只做展示。
 */
import { resolveClient } from "./useMessages";

export interface PointsProduct {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
  pointsPrice: number;
  cashPrice: number;
  stock: number;
  inStock: boolean;
}

interface PointsProductsQuery {
  pointsProducts: { items: PointsProduct[]; totalItems: number };
}

/** 积分商品列表（仅上架且有库存的可展示项由调用方过滤；limit 已由调用方按 1-20 截断） */
export async function getPointsProducts(limit: number): Promise<PointsProduct[]> {
  const client = resolveClient();
  const data = await client.request<PointsProductsQuery>(
    `query PointsProducts($take: Int) {
      pointsProducts(options: { take: $take }) {
        items { id name slug image pointsPrice cashPrice stock inStock }
        totalItems
      }
    }`,
    { take: limit },
  );
  return data.pointsProducts.items;
}
