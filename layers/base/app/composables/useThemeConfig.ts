// 主题配置消费入口（五级合并）：L0 全局默认 → L1 ShopGlobalConfig → L2 ShopTemplate
// → L3 店铺覆盖（channel customFields）→ L4 页面/模块内建默认。
// 三个 useAsyncData 各自 handler 内单次 useAsyncGql（SSR 安全）；
// GetChannelTheme 与 useDetailConfig/useShopContent 同操作名共享 payload 去重。
import { mergePageConfig, mergeThemeTokens } from "../utils/merge-config";
import type { ShopGlobalConfigData, ShopTemplateData, ThemeTokens } from "../utils/merge-config";

const APP = "nshop";

export function useThemeConfig() {
  const { data: templateData, refresh: refreshTemplate } = useAsyncData(
    "theme-template",
    async () => {
      const res = await useAsyncGql("GetShopTemplate", { app: APP }, { server: true });
      return res.data.value?.shopTemplate ?? null;
    },
    { server: true, getCachedData: () => null },
  );

  const { data: globalData, refresh: refreshGlobal } = useAsyncData(
    "theme-global-config",
    async () => {
      const res = await useAsyncGql("GetShopGlobalConfig", { app: APP }, { server: true });
      return res.data.value?.shopGlobalConfig ?? null;
    },
    { server: true, getCachedData: () => null },
  );

  const { data: channelData, refresh: refreshChannel } = useAsyncData(
    "theme-channel-cfs",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields ?? null;
    },
    { server: true, getCachedData: () => null },
  );

  const template = computed<ShopTemplateData | null>(() => templateData.value ?? null);
  const globalConfig = computed<ShopGlobalConfigData | null>(() => globalData.value ?? null);
  const channelCfs = computed<Record<string, any> | null>(() => channelData.value ?? null);
  const themeTokens = computed<ThemeTokens>(() => mergeThemeTokens(globalConfig.value, template.value));

  function pageConfig(page: string): Record<string, any> | null {
    return mergePageConfig(globalConfig.value, template.value, channelCfs.value, page);
  }

  /** R3: 后台改配置后强制刷新主题三件套，供页面/操作后调用，替代「怎么改都不变」。 */
  async function refreshTheme() {
    await Promise.all([refreshTemplate(), refreshGlobal(), refreshChannel()]);
  }

  return { template, globalConfig, channelCfs, themeTokens, pageConfig, refreshTheme };
}