// product 页配置走五级合并（L1 全局 → L2 模板 → L3 店铺 detailConfig → L4 块内建默认）。
// promoSchemes/serviceSchemes 属频道方案库，仍从 channel customFields 读取。
import {
  parseDetailConfig,
  detailLayout,
  blockVisible,
  type DetailConfig,
  type DetailLayout,
} from "../utils/detail-config";
import { parseSchemeList, type Scheme } from "../utils/schemes";

export function useDetailConfig() {
  const { channelCfs, pageConfig } = useThemeConfig();

  const config = computed<DetailConfig | null>(() => {
    const merged = pageConfig("product");
    if (!merged) return null;
    // 合并结果与 detailConfig 同构（version/layout/blocks），经解析器走 L4 兜底链
    return parseDetailConfig(JSON.stringify(merged));
  });
  const layout = computed<DetailLayout>(() => detailLayout(config.value));
  const visible = (key: string) => blockVisible(config.value, key);
  const promoSchemes = computed<Scheme[] | null>(() => parseSchemeList(channelCfs.value?.promoSchemes ?? null));
  const serviceSchemes = computed<Scheme[] | null>(() => parseSchemeList(channelCfs.value?.serviceSchemes ?? null));

  return { config, layout, visible, promoSchemes, serviceSchemes };
}
