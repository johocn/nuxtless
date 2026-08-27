import type { GeoCoords } from "~~/types/location";

/**
 * 多库库存展示：调用后端 `variantNearbyStock`，返回商品在「各仓库/门店」的逐仓库存与距离。
 *
 * 入参：productId（必填）、variantId（可选，单 SKU 过滤）、定位坐标 + 城市（就近排序）。
 * 返回：按距离升序的仓库列表，每个仓库含该商品（或指定 SKU）的库存三口径。
 */
/** 就近库存查询四态：ok 有结果 / no-stock 无结果 / no-coords 无定位（由调用方判定）/ error 查询异常 */
export type NearbyState = "ok" | "no-coords" | "no-stock" | "error";

/** 就近库存查询结构化结果：items 结果列表，message 错误文本（仅 error 态非 null） */
export interface NearbyResult {
  state: NearbyState;
  items: NearStockLocation[];
  message: string | null;
}

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
  }): Promise<NearbyResult> {
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
      const items = (variantNearbyStock ?? []) as NearStockLocation[];
      return { state: items.length ? "ok" : "no-stock", items, message: null };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "获取库存失败";
      return { state: "error", items: [], message: error.value };
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, fetchNearbyStock };
}
