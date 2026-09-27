// home 页配置走五级合并（L1 全局 defaults.home → L2 模板 pages.home → L3 店铺 shopContent）。
// sections 数组整段覆盖（模板配了整页积木则整体生效，店铺 shopContent 为空时回退模板/全局）。
// resolvedSections：把原始配置交给骨架合并（未配置的兜底楼层自动补位），页面只消费它。
import { sanitizeHiddenSlots, type ShopContent, type ShopSection } from "../utils/shop-content";
import { resolveHomeSections, type ResolvedSection } from "../utils/home-skeleton";

export function useShopContent() {
  const { pageConfig } = useThemeConfig();

  const cfg = computed(() => pageConfig("home"));
  const sections = computed<ShopSection[]>(() => {
    const s = cfg.value?.sections;
    return Array.isArray(s) ? (s as ShopSection[]) : [];
  });
  const hiddenSlots = computed<string[]>(() => sanitizeHiddenSlots(cfg.value?.hiddenSlots));
  const content = computed<ShopContent>(() => ({
    version: 1,
    sections: sections.value,
    hiddenSlots: hiddenSlots.value,
  }));
  const resolvedSections = computed<ResolvedSection[]>(() => resolveHomeSections(content.value));

  return { sections, hiddenSlots, resolvedSections };
}
