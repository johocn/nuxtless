export interface StockInfoDetail {
  locationId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  onHand: number;
  distanceKm: number | null;
}

export interface StockInfo {
  variantId: string;
  saleableStock: number;
  physicalStockEnabled: boolean;
  stockDetail: StockInfoDetail[];
}

export type StockDeliveryMethod = 'MAIL' | 'SELF_PICKUP';

/** 虚拟×物理库存：saleableStock（虚拟可售）+ physicalStockEnabled（租户开关）+ 物理仓明细 */
export function useProductStockInfo() {
  const loading = ref(false);
  const info = ref<StockInfo | null>(null);
  /** 最近一次查询是否失败：失败时不得渲染「无货」，由 UI 展示可重试状态 */
  const error = ref<string | null>(null);

  async function refresh(
    variantId: string,
    lat?: number | null,
    lng?: number | null,
    city?: string | null,
    deliveryMethod?: StockDeliveryMethod | null,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const data = await GqlVariantStockInfo({
        variantId,
        lat: lat ?? null,
        lng: lng ?? null,
        city: city ?? null,
        deliveryMethod: deliveryMethod ?? null,
      });
      info.value = (data.variantStockInfo ?? null) as StockInfo | null;
    } catch (e) {
      info.value = null;
      error.value = e instanceof Error ? e.message : "stock query failed";
      console.warn("[stock] variant stock query failed", e);
    } finally {
      loading.value = false;
    }
  }

  return { loading: readonly(loading), info: readonly(info), error: readonly(error), refresh };
}
