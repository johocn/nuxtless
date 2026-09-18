// home 页过滤配置走五级合并：pageConfig("home") 已由 useThemeConfig 完成
// L1 全局 defaults.home ← L2 模板 pages.home ← L3 店铺 shopContent(filter 节点)，
// 本 composable 只做解析 + L4 内建默认兜底（与 useShopContent 同源同缓存）。
import { parseHomeFilterConfig, type HomeFilterConfig } from "../utils/home-filter-config";

export function useHomeFilterConfig() {
  const { pageConfig } = useThemeConfig();
  const config = computed<HomeFilterConfig>(() =>
    parseHomeFilterConfig(pageConfig("home")?.filter ?? null),
  );
  return { config };
}
