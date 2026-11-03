/**
 * 自提点/门店导航 URI 纯函数（SSR 安全，无 Nuxt / window 依赖，便于单测）。
 *
 * - 有坐标：走高德 URI 导航，终点=坐标 + 名称；
 * - 无坐标但有地址：回退按地址搜索，避免门店档案缺坐标时导航入口直接不可用；
 * - 坐标与地址都缺失：返回 null，调用方禁用导航入口。
 */
import { parseCoordinates } from "./checkout-config";

/** 导航目标：坐标优先；无坐标时回退地址关键字（门店档案允许只填地址） */
export interface NavigationTarget {
  name: string;
  coordinates?: { lat: number; lng: number } | string | null;
  address?: string | null;
}

// 高德官方 URI 端点（固定外部服务端点，非可配置业务域名，故以具名常量标注）。
export const AMAP_NAV_ENDPOINT = "https://uri.amap.com/navigation";
export const AMAP_SEARCH_ENDPOINT = "https://uri.amap.com/search";

/** 是否有可用坐标（可精确导航） */
export function hasCoords(loc: NavigationTarget | null | undefined): boolean {
  return !!loc && parseCoordinates(loc.coordinates) !== null;
}

/**
 * 拼装高德 URI 导航链接（终点=坐标；缺坐标则按地址搜索）。
 * callnative=1 优先唤起已安装的高德 App，未安装时在浏览器打开路线规划页。
 * 返回 null 表示坐标与地址都缺失，调用方应禁用导航入口。
 */
export function buildNavigationUri(loc: NavigationTarget | null | undefined): string | null {
  if (!loc) return null;
  const c = parseCoordinates(loc.coordinates);
  if (c) {
    const name = encodeURIComponent(loc.name || "自提点");
    return (
      `${AMAP_NAV_ENDPOINT}` +
      `?to=${c.lng},${c.lat},${name}` +
      `&mode=car&src=nshop&coordinate=gaode&callnative=1`
    );
  }
  const keyword = String(loc.address ?? "").trim();
  if (!keyword) return null;
  return (
    `${AMAP_SEARCH_ENDPOINT}` +
    `?keyword=${encodeURIComponent(keyword)}` +
    `&src=nshop&coordinate=gaode&callnative=1`
  );
}
