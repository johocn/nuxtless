import type { PickupLocation } from "~~/.nuxt/gql/default";
import { parseCoordinates } from "~~/layers/base/app/utils/checkout-config";

/**
 * 自提点导航工具：
 * - 复用 useGeoLocation.loadAmapSdk() 动态加载高德 JS（sdkUrl 服务端下发，前端不写死 key）；
 * - buildNavigationUri() 拼装高德 URI 唤起 App 导航（Web 端回退网页）。
 * 纯工具 + 单例加载，SSR 安全（isBrowser 守卫由 loadAmapSdk 内部处理）。
 */
export function usePickupNavigation() {
  const { loadAmapSdk } = useGeoLocation();

  /** 自提点是否有可用坐标（可导航） */
  function hasCoords(loc: PickupLocation | null | undefined): boolean {
    return !!loc && parseCoordinates(loc.coordinates) !== null;
  }

  /**
   * 拼装高德 URI 导航链接（终点=自提点坐标）。
   * callnative=1 优先唤起已安装的高德 App，未安装时在浏览器打开路线规划页。
   * 返回 null 表示坐标缺失/非法，调用方应禁用导航入口。
   */
  function buildNavigationUri(loc: PickupLocation | null | undefined): string | null {
    if (!loc) return null;
    const c = parseCoordinates(loc.coordinates);
    if (!c) return null;
    const name = encodeURIComponent(loc.name || "自提点");
    return (
      `https://uri.amap.com/navigation` +
      `?to=${c.lng},${c.lat},${name}` +
      `&mode=car&src=nshop&coordinate=gaode&callnative=1`
    );
  }

  async function getAmap() {
    return loadAmapSdk();
  }

  return { loadAmapSdk, getAmap, hasCoords, buildNavigationUri };
}