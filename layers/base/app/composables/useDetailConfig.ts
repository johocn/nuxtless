// 读 detailConfig 并解析。themeId/shopContent/detailConfig/promoSchemes 等来自同一 GetChannelTheme 查询（SSR 去重，key="detail-config"）
import { useAsyncData } from "#imports";
import { parseDetailConfig, detailLayout, blockVisible, type DetailConfig, type DetailLayout } from "../utils/detail-config";
import { parseSchemeList, type Scheme } from "../utils/schemes";

export function useDetailConfig() {
  const { data } = useAsyncData(
    "detail-config",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields ?? null;
    },
    { server: true },
  );

  const cfs = computed(() => data.value ?? null);
  const config = computed<DetailConfig | null>(() => parseDetailConfig(cfs.value?.detailConfig ?? null));
  const layout = computed<DetailLayout>(() => detailLayout(config.value));
  const visible = (key: string) => blockVisible(config.value, key);
  const promoSchemes = computed<Scheme[] | null>(() => parseSchemeList(cfs.value?.promoSchemes ?? null));
  const serviceSchemes = computed<Scheme[] | null>(() => parseSchemeList(cfs.value?.serviceSchemes ?? null));

  return { config, layout, visible, promoSchemes, serviceSchemes };
}
