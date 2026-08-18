import type { GeoCoords } from "~~/types/location";

/**
 * 多库库存展示：调用后端 `variantNearbyStock`，返回商品在「各仓库/门店」的逐仓库存与距离。
 *
 * 入参：productId（必填）、variantId（可选，单 SKU 过滤）、定位坐标 + 城市（就近排序）。
 * 返回：按距离升序的仓库列表，每个仓库含该商品（或指定 SKU）的库存三口径。
 */
export interface NearStockLocation {
  distanceKm: number | null;
  location: {
    id: string;
    name: string;
    description?: string | null;
    lat?: number | null;
    lng?: number | null;
    serviceCities?: string[] | null;
  };
  variants: Array<{
    variantId: string;
    variantName: string;
    sku: string;
    stockOnHand: number;
    stockAllocated: number;
    stockAvailable: number;
  }>;
}

export function useNearbyStock() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchNearbyStock(options: {
    productId: string;
    variantId?: string | null;
    coords?: GeoCoords | null;
    city?: string | null;
  }): Promise<NearStockLocation[]> {
    loading.value = true;
    error.value = null;
    try {
      const { variantNearbyStock } = await GqlVariantNearbyStock({
        productId: options.productId,
        variantId: options.variantId ?? null,
        lat: options.coords?.lat ?? null,
        lng: options.coords?.lng ?? null,
        city: options.city ?? null,
      });
      return (variantNearbyStock ?? []) as NearStockLocation[];
    } catch (e) {
      error.value = e instanceof Error ? e.message : "获取库存失败";
      return [];
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, fetchNearbyStock };
}
