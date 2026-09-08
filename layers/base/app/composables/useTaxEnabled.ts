// 租户级税率开关：读 Channel.customFields.taxEnabled（默认开启=true）。
// false 时 C 端商品展示价/结算价直接用净价（后台录入价），不再加税。
// 复用 GetChannelTheme 查询（与 themeId/shopContent 同一请求，SSR 去重不增加请求数）。
import { useAsyncData } from "#imports";

export function useTaxEnabled() {
  const { data } = useAsyncData(
    "channel-tax-enabled",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      const v = (res.data.value as any)?.activeChannel?.customFields?.taxEnabled;
      return v !== false;
    },
    { server: true },
  );

  const taxEnabled = computed(() => data.value !== false);

  return { taxEnabled };
}