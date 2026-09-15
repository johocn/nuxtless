// home 页配置走五级合并（L1 全局 defaults.home → L2 模板 pages.home → L3 店铺 shopContent）。
// sections 数组整段覆盖（模板配了整页积木则整体生效，店铺 shopContent 为空时回退模板/全局）。
import { getSections, type ShopSection } from "../utils/shop-content";

export function useShopContent() {
  const { pageConfig } = useThemeConfig();

  const cfg = computed(() => pageConfig("home"));
  const sections = computed<ShopSection[]>(() => {
    const s = cfg.value?.sections;
    return Array.isArray(s) ? (s as ShopSection[]) : [];
  });

  return { sections };
}
