import type { PickupLocation } from "~~/.nuxt/gql/default";
import type { GeoCoords } from "~~/types/location";

export interface NearbyStore extends PickupLocation {
  /** 到定位点的直线距离（公里），无坐标时为空 */
  distanceKm: number | null;
}

// Haversine 距离（公里）
export function haversineKm(a: GeoCoords, b: GeoCoords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function useNearbyStores() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  function parseCoords(location: PickupLocation): GeoCoords | null {
    const c = location.coordinates as { lat?: unknown; lng?: unknown } | null;
    if (
      c &&
      typeof c.lat === "number" &&
      typeof c.lng === "number"
    ) {
      return { lat: c.lat, lng: c.lng };
    }
    return null;
  }

  // 获取就近门店；后端已按距离排序，前端再兜底计算/排序
  async function fetchStores(
    coords?: GeoCoords | null,
    type?: string,
  ): Promise<NearbyStore[]> {
    loading.value = true;
    error.value = null;
    try {
      const { pickupLocations } = await GqlGetPickupLocations({
        type: type ?? null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      const list = (pickupLocations ?? []) as PickupLocation[];
      const stores: NearbyStore[] = list.map((loc) => {
        const c = coords ? parseCoords(loc) : null;
        return {
          ...loc,
          distanceKm: c && coords ? haversineKm(coords, c) : null,
        };
      });
      if (coords) {
        stores.sort(
          (a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
        );
      }
      return stores;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "获取门店失败";
      return [];
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, fetchStores, haversineKm };
}
