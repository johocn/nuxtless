import {
  buildNavigationUri,
  hasCoords,
} from "~~/layers/base/app/utils/pickup-navigation";

/**
 * 自提点/门店导航工具：
 * - 复用 useGeoLocation.loadAmapSdk() 动态加载高德 JS（sdkUrl 服务端下发，前端不写死 key）；
 * - buildNavigationUri() 拼装高德 URI 唤起 App 导航（无坐标时回退地址搜索，见 utils）；
 * - openNavigation() 统一打开方式：移动端（含微信内置浏览器）当前页跳转，
 *   桌面端新开标签页——避免 window.open 在部分 App 内置浏览器中被拦截成无响应。
 * 纯工具 + 单例加载，SSR 安全（isBrowser 守卫由 loadAmapSdk 内部处理）。
 */
export function usePickupNavigation() {
  const { loadAmapSdk } = useGeoLocation();

  /**
   * 打开导航链接：移动端当前页跳转（微信/App 内置浏览器对 window.open 拦截更严格，
   * 常见表现为点了没反应），桌面端新标签页打开以免打断当前浏览。
   */
  function openNavigation(uri: string): void {
    if (typeof window === "undefined" || !uri) return;
    const ua = window.navigator.userAgent || "";
    const isMobile = /Android|iPhone|iPad|iPod|Mobile|MicroMessenger/i.test(ua);
    if (isMobile) {
      window.location.href = uri;
    } else {
      window.open(uri, "_blank");
    }
  }

  async function getAmap() {
    return loadAmapSdk();
  }

  return { loadAmapSdk, getAmap, hasCoords, buildNavigationUri, openNavigation };
}
