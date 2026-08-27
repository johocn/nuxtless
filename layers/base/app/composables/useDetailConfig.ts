// 读 detailConfig 并解析。themeId/shopContent/detailConfig 来自同一 GetChannelTheme 查询（SSR 去重）
import { useAsyncData } from "#imports";
import { parseDetailConfig, detailLayout, blockVisible, type DetailConfig, type DetailLayout } from "../utils/detail-config";

export function useDetailConfig() {
  const { data } = useAsyncData(
    "detail-config",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields?.detailConfig ?? null;
    },
    { server: true },
  );

  const config = computed<DetailConfig | null>(() => parseDetailConfig(data.value ?? null));
  const layout = computed<DetailLayout>(() => detailLayout(config.value));
  const visible = (key: string) => blockVisible(config.value, key);

  return { config, layout, visible };
}