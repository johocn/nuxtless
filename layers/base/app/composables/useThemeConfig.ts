// 主题配置消费入口（五级合并）：L0 全局默认 → L1 ShopGlobalConfig → L2 ShopTemplate
// → L3 店铺覆盖（channel customFields）→ L4 页面/模块内建默认。
// 三个 useAsyncData 各自 handler 内单次 useAsyncGql（SSR 安全）；
// GetChannelTheme 与 useDetailConfig/useShopContent 同操作名共享 payload 去重。
import { mergePageConfig, mergeThemeTokens } from "../utils/merge-config";
import type { ShopGlobalConfigData, ShopTemplateData, ThemeTokens } from "../utils/merge-config";

const APP = "nshop";

export function useThemeConfig() {
  const { data: templateData } = useAsyncData(
    "theme-template",
    async () => {
      const res = await useAsyncGql("GetShopTemplate", { app: APP }, { server: true });
      return res.data.value?.shopTemplate ?? null;
    },
    { server: true },
  );

  const { data: globalData } = useAsyncData(
    "theme-global-config",
    async () => {
      const res = await useAsyncGql("GetShopGlobalConfig", { app: APP }, { server: true });
      return res.data.value?.shopGlobalConfig ?? null;
    },
    { server: true },
  );

  const { data: channelData } = useAsyncData(
    "theme-channel-cfs",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields ?? null;
    },
    { server: true },
  );

  const template = computed<ShopTemplateData | null>(() => templateData.value ?? null);
  const globalConfig = computed<ShopGlobalConfigData | null>(() => globalData.value ?? null);
  const channelCfs = computed<Record<string, any> | null>(() => channelData.value ?? null);
  const themeTokens = computed<ThemeTokens>(() =>
    mergeThemeTokens(globalConfig.value, template.value),
  );

  function pageConfig(page: string): Record<string, any> | null {
    return mergePageConfig(globalConfig.value, template.value, channelCfs.value, page);
  }

  return { template, globalConfig, channelCfs, themeTokens, pageConfig };
}
