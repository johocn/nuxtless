import type {
  CityInfo,
  GeoCoords,
  LocationSource,
  ReverseGeocodeInfo,
} from "~~/types/location";

/**
 * 定位 store：保存当前城市、经纬度、完整逆地理结果与定位来源。
 * city/coords/source/geo 持久化，避免每次刷新重复定位（弹授权/等待）。
 */
export const useLocationStore = defineStore(
  "location",
  () => {
    const city = ref<CityInfo | null>(null);
    const coords = ref<GeoCoords | null>(null);
    const source = ref<LocationSource | null>(null);
    /** 完整逆地理结果（省/市/区/街道），供结账地址表单四级联动默认选中 */
    const geo = ref<ReverseGeocodeInfo | null>(null);

    // 以下为瞬态状态，不持久化
    const locating = ref(false);
    const error = ref<string | null>(null);
    const initialized = ref(false);

    const hasCoords = computed(() => coords.value != null);
    const cityName = computed(() => city.value?.name ?? "");

    // 应用启动时调用一次：已有持久化结果则跳过自动定位
    async function init() {
      if (initialized.value) return;
      initialized.value = true;
      if (city.value && coords.value) return;
      await autoLocate();
    }

    // 自动定位（降级链：高德高精度 → 高德 IP → 浏览器原生）
    async function autoLocate() {
      locating.value = true;
      error.value = null;
      try {
        const result = await useGeoLocation().locate();
        if (result) {
          city.value = result.city;
          coords.value = result.coords;
          source.value = result.source;
          geo.value = result.geo ?? null;
        } else {
          error.value = "定位失败，请手动选择城市";
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : "定位失败，请手动选择城市";
      } finally {
        locating.value = false;
      }
    }

    // 手动选择城市；coords 通常取所选城市中心坐标（用于就近门店距离计算）
    function setCity(info: CityInfo, c?: GeoCoords) {
      city.value = info;
      coords.value = c ?? null;
      source.value = "manual";
      geo.value = null;
      error.value = null;
    }

    return {
      city,
      coords,
      source,
      geo,
      locating,
      error,
      initialized,
      hasCoords,
      cityName,
      init,
      autoLocate,
      setCity,
    };
  },
  {
    persist: {
      pick: ["city", "coords", "source", "geo"],
    },
  },
);
