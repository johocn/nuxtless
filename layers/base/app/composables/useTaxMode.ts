// 租户级税率方式（三态）+ 渠道价字段解释（pricesIncludeTax）：读 Channel.customFields.taxMode
// （'inclusive'含税 / 'zero'零税 / 'exclusive'不含税）与 Channel.pricesIncludeTax。
// 兼容旧 taxEnabled 布尔：true→inclusive，false→zero。
// 复用 GetChannelTheme 查询（与 themeId/shopContent 同一请求，SSR 去重不增加请求数）。
import { useAsyncData } from "#imports";
import type { TaxMode } from "../utils/tax-price";

export function useTaxMode() {
  const { data } = useAsyncData(
    "channel-tax-mode",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      const ch = (res.data.value as any)?.activeChannel ?? {};
      const cf = ch.customFields ?? {};
      const mode = cf?.taxMode;
      const taxMode: TaxMode =
        mode === "inclusive" || mode === "zero" || mode === "exclusive"
          ? mode
          : (cf?.taxEnabled === false ? "zero" : "inclusive");
      const pricesIncludeTax = !!ch.pricesIncludeTax;
      return { taxMode, pricesIncludeTax };
    },
    { server: true },
  );

  const taxMode = computed<TaxMode>(() => data.value?.taxMode ?? "inclusive");
  const pricesIncludeTax = computed<boolean>(() => data.value?.pricesIncludeTax ?? false);

  return { taxMode, pricesIncludeTax };
}