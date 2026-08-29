import type {
  CityInfo,
  GeoCoords,
  GeoLocation,
  LocationSource,
  ReverseGeocodeInfo,
} from "~~/types/location";

/**
 * 定位组合函数：高德高精度定位 → 高德 IP 定位 → 浏览器原生定位（降级链）。
 * 高德 SDK 配置由服务端下发（mapSdkConfig），前端不硬编码 API Key。
 */

interface AmapPosition {
  lat: number;
  lng: number;
  accuracy?: number;
}

type AMapAny = any;

let amapSdkPromise: Promise<AMapAny | null> | null = null;

export function useGeoLocation() {
  const isBrowser = typeof window !== "undefined";

  // 服务端下发的高德 SDK 加载 URL（含 key），provider 目前仅支持 amap
  async function getAmapSdkUrl(): Promise<string | null> {
    const { mapSdkConfig } = await GqlGetMapSdkConfig();
    if (!mapSdkConfig?.hasConfigured || mapSdkConfig.provider !== "amap") {
      return null;
    }
    return mapSdkConfig.sdkUrl;
  }

  // 动态加载高德 JS API，返回 window.AMap；失败返回 null
  async function loadAmapSdk(): Promise<AMapAny | null> {
    if (!isBrowser) return null;
    const win = window as Window & { AMap?: AMapAny };

    if (win.AMap) return win.AMap;
    if (amapSdkPromise) return amapSdkPromise;

    const sdkUrl = await getAmapSdkUrl().catch(() => null);
    if (!sdkUrl) return null;

    amapSdkPromise = new Promise<AMapAny | null>((resolve) => {
      try {
        const script = document.createElement("script");
        script.src = sdkUrl;
        script.async = true;
        script.onload = () => resolve(win.AMap ?? null);
        script.onerror = () => {
          amapSdkPromise = null;
          resolve(null);
        };
        document.head.appendChild(script);
      } catch {
        amapSdkPromise = null;
        resolve(null);
      }
    });
    return amapSdkPromise;
  }

  // 高德高精度定位（GPS/基站/Wi-Fi 多源）
  function amapLocate(AMap: AMapAny): Promise<AmapPosition | null> {
    return new Promise((resolve) => {
      try {
        const geolocation = new AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 8000,
          zoomToAccuracy: false,
        });
        geolocation.getCurrentPosition(
          (status: string, result: any) => {
            const position = result?.position;
            if (status === "complete" && position) {
              resolve({
                lat: position.getLat(),
                lng: position.getLng(),
                accuracy: result.accuracy ?? Number.POSITIVE_INFINITY,
              });
            } else {
              resolve(null);
            }
          },
        );
      } catch {
        resolve(null);
      }
    });
  }

  // 高德 IP 定位（无需权限，精度为城市级）
  function amapIpLocate(AMap: AMapAny): Promise<AmapPosition | null> {
    return new Promise((resolve) => {
      try {
        const geolocation = new AMap.Geolocation({});
        geolocation.getIPLocation((status: string, result: any) => {
          const position = result?.position;
          if (status === "complete" && position) {
            resolve({
              lat: position.getLat(),
              lng: position.getLng(),
              accuracy: Number.POSITIVE_INFINITY,
            });
          } else {
            resolve(null);
          }
        });
      } catch {
        resolve(null);
      }
    });
  }

  // 浏览器原生定位（仅 HTTPS 可用）
  function nativeLocate(): Promise<AmapPosition | null> {
    return new Promise((resolve) => {
      if (!isBrowser || !navigator.geolocation || !window.isSecureContext) {
        resolve(null);
        return;
      }
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
        );
      } catch {
        resolve(null);
      }
    });
  }

  // 逆地理编码：经纬度 → 城市信息（高德坐标系）
  async function reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<ReverseGeocodeInfo | null> {
    try {
      const { reverseGeocode } = await GqlGetReverseGeocode({ lat, lng });
      if (!reverseGeocode) return null;
      // GQL 查询字段为可选（含 undefined），统一收敛为 string | null
      return {
        province: reverseGeocode.province ?? null,
        city: reverseGeocode.city ?? null,
        district: reverseGeocode.district ?? null,
        street: reverseGeocode.street ?? null,
        formattedAddress: reverseGeocode.formattedAddress,
      };
    } catch {
      return null;
    }
  }

  // 直辖市高德返回的 city 为空，用 province 兜底（如「北京市」）
  function toCityInfo(
    geo: ReverseGeocodeInfo | null,
  ): CityInfo | null {
    const name = geo?.city ?? geo?.province;
    if (!name) return null;
    return { name };
  }

  // 完整定位降级链：高德高精度 → 高德 IP → 浏览器原生
  async function locate(): Promise<GeoLocation | null> {
    const AMap = await loadAmapSdk();

    // 根据候选坐标反查城市 + 完整省市区街道，封装为 GeoLocation
    async function toLocation(
      candidate: AmapPosition,
      source: LocationSource,
    ): Promise<GeoLocation | null> {
      const geo = await reverseGeocode(candidate.lat, candidate.lng);
      const city = toCityInfo(geo);
      if (!city) return null;
      return {
        city,
        coords: { lat: candidate.lat, lng: candidate.lng },
        source,
        geo: geo ?? undefined,
      };
    }

    if (AMap) {
      const high = await amapLocate(AMap);
      if (high) {
        const loc = await toLocation(high, "amap");
        if (loc) return loc;
      }

      const ip = await amapIpLocate(AMap);
      if (ip) {
        const loc = await toLocation(ip, "ip");
        if (loc) return loc;
      }
    }

    const native = await nativeLocate();
    if (native) {
      const loc = await toLocation(native, "native");
      if (loc) return loc;
    }

    return null;
  }

  return {
    loadAmapSdk,
    amapLocate,
    amapIpLocate,
    nativeLocate,
    reverseGeocode,
    locate,
  };
}
