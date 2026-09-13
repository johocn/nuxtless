export const DISTANCE_UNKNOWN_THRESHOLD = 1e9;

export function formatNearbyDistance(km: number | null): string {
  // 负数 = 无定位未计算距离（后端无定位返回 -1），与超阈值同样视为未知
  if (km == null || km < 0 || km >= DISTANCE_UNKNOWN_THRESHOLD) return "距离未知";
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

export function serviceCityLabel(
  cities: string[] | null | undefined,
): string {
  return cities?.length ? cities.join("、") : "全城";
}
