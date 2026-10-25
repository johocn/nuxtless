import { haversineKm, parseCoordinates } from "../utils/checkout-config";

/**
 * 商户/门店展示数据（到店消费门店卡 + 商户详情）。
 *
 * 数据源：pickupLocations(type='store') 门店档案（name/address/phoneNumber/businessHours/
 * coordinates/partner/photos/remark）。券侧门店接口（couponTemplateStores / couponStoresForCoupon）
 * 待后端门店主数据上线后接入，届时换数据源即可，展示层无需改动。
 */

export interface MerchantStoreView {
  id: string;
  name: string;
  /** 所属商户/品牌（pickupLocations.partner；为空则不展示） */
  partner: string | null;
  address: string;
  city: string | null;
  district: string | null;
  phoneNumber: string | null;
  businessHours: string | null;
  /** null = 数据源未提供营业状态（pickupLocations 无该字段） */
  isOpenNow: boolean | null;
  coords: { lat: number; lng: number } | null;
  photos: string[];
  remark: string | null;
  distanceKm: number | null;
}

/** 距离文案：米/公里；无坐标或无定位返回空串（调用方隐藏） */
export function formatStoreDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km) || km < 0) return "";
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

export function useMerchantStores() {
  // 反模式提醒（见 useAvailableCities）：async 流程内不能再调 Nuxt composable，
  // 故 store / gql client 一律在 setup 顶层捕获。
  const locationStore = useLocationStore();
  const rawGql = useGql();

  const loading = ref(false);
  const error = ref<string | null>(null);
  const stores = ref<MerchantStoreView[]>([]);

  /** 有定位时按直线距离升序（列表首屏即最近门店） */
  function sortByDistance(list: MerchantStoreView[]): MerchantStoreView[] {
    const c = locationStore.coords;
    if (!c) return list;
    return list
      .map((s) => ({ ...s, distanceKm: s.coords ? haversineKm(c, s.coords) : null }))
      .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
  }

  async function load(): Promise<MerchantStoreView[]> {
    loading.value = true;
    error.value = null;
    const lat = locationStore.coords?.lat ?? null;
    const lng = locationStore.coords?.lng ?? null;
    try {
      const res = await rawGql("GetPickupLocations", { type: "store", lat, lng });
      const list: MerchantStoreView[] = ((res?.pickupLocations ?? []) as any[]).map((l) => ({
        id: String(l.id),
        name: String(l.name ?? ""),
        partner: l.partner ?? null,
        address: String(l.address ?? ""),
        city: l.city ?? null,
        district: l.district ?? null,
        phoneNumber: l.phoneNumber ?? null,
        businessHours: l.businessHours ?? null,
        isOpenNow: null,
        coords: parseCoordinates(l.coordinates),
        photos: Array.isArray(l.photos) ? (l.photos as string[]) : [],
        remark: l.remark ?? null,
        distanceKm: null,
      }));
      stores.value = sortByDistance(list);
      return stores.value;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "load stores failed";
      stores.value = [];
      return [];
    } finally {
      loading.value = false;
    }
  }

  /** 距离文案：米/公里；无坐标或无定位返回空串（调用方隐藏） */
  function distanceText(store: MerchantStoreView): string {
    return formatStoreDistance(store.distanceKm);
  }

  return { stores, loading, error, load, distanceText };
}
