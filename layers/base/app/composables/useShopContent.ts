// 读 shopContent 并解析 sections。themeId 与 shopContent 来自同一 GetChannelTheme 查询（SSR 去重，不新增请求）
import { useAsyncData } from "#imports";
import { parseShopContent, getSections } from "../utils/shop-content";

export function useShopContent() {
  const { data } = useAsyncData(
    "shop-content",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields?.shopContent ?? null;
    },
    { server: true },
  );

  const sections = computed(() => getSections(parseShopContent(data.value)));

  return { sections };
}