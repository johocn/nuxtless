// 租户级税率方式（三态）：读 Channel.customFields.taxMode（'inclusive'含税 / 'zero'零税 / 'exclusive'不含税）。
// 兼容旧 taxEnabled 布尔：true→inclusive，false→zero。
// 复用 GetChannelTheme 查询（与 themeId/shopContent 同一请求，SSR 去重不增加请求数）。
import { useAsyncData } from "#imports";
import type { TaxMode } from "../utils/tax-price";

export function useTaxMode() {
  const { data } = useAsyncData(
    "channel-tax-mode",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      const cf = (res.data.value as any)?.activeChannel?.customFields ?? {};
      const mode = cf?.taxMode;
      if (mode === "inclusive" || mode === "zero" || mode === "exclusive") return mode as TaxMode;
      return cf?.taxEnabled === false ? "zero" : "inclusive";
    },
    { server: true },
  );

  const taxMode = computed(() => data.value ?? "inclusive");

  return { taxMode };
}