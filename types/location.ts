export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface CityInfo {
  /** 行政区划编码（高德 adcode，手动选择时存在） */
  adcode?: string;
  /** 城市名，如「北京市」「杭州市」 */
  name: string;
}

export type LocationSource = "amap" | "ip" | "native" | "manual";

export interface GeoLocation {
  city: CityInfo;
  coords: GeoCoords;
  source: LocationSource;
}

export interface ReverseGeocodeInfo {
  province: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  formattedAddress: string;
}
