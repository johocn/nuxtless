/** SSR 直连用的渠道主题查询（与 GetChannelTheme 字段一致；供 $fetch 携带租户 token 使用） */
const CHANNEL_THEME_SSR_QUERY = `query GetChannelThemeSsr {
  activeChannel {
    customFields {
      themeId
      templateId
      themeTokensOverride
      shopContent
      detailConfig
      orderDetailConfig
      orderListConfig
      taxMode
      promoSchemes
      serviceSchemes
      shareImageUrl
      shopName
      shopIntro
      storefrontMode
      storefrontHomeLayout
    }
  }
}`;

export function useChannelTheme() {
  const config = useState<string>("channel-theme", () => "default");
  const customFields = useState<Record<string, any> | null>(
    "channel-theme-customfields",
    () => null,
  );

  async function loadTheme() {
    // 已加载短路：route middleware（券店 guard）先于 app.vue 执行，二者都会调用 loadTheme；
    // useAsyncData("channel-theme-ssr") 同 key 复用保证 SSR 只发一次请求。
    if (customFields.value) return config.value;
    // ⚠️ Nuxt 上下文规则：所有 composable 必须在本函数第一个 await 之前同步取好，
    // useAsyncData 的 handler 回调执行时（await 之后）Nuxt instance 已不可用。
    const pub = useRuntimeConfig().public;
    const token = useTenantChannel().token.value;
    try {
      if (import.meta.server) {
        // SSR 端不走 useAsyncGql：graphql-client 的 nitro 直连只带构建期烧录的默认渠道
        // 静态头（vendure-token=CHANNEL_TOKEN），useGqlHeaders 的租户 token 切换对它无效，
        // 首帧会拿到默认店数据（券店模式判断失效）。这里改 $fetch 直连并显式带当前租户 token。
        const { data } = await useAsyncData("channel-theme-ssr", () =>
          $fetch<{ data?: { activeChannel?: { customFields?: Record<string, any> } } }>(
            (pub.GQL_HOST as string) || "",
            {
              method: "POST",
              headers: { "content-type": "application/json", "vendure-token": token },
              body: JSON.stringify({ query: CHANNEL_THEME_SSR_QUERY }),
              timeout: 8000,
            },
          ).catch(() => null),
        );
        const cf = data.value?.data?.activeChannel?.customFields ?? null;
        customFields.value = cf;
        config.value = cf?.themeId ?? "default";
      } else {
        const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
        const cf = res.data.value?.activeChannel?.customFields ?? null;
        customFields.value = cf;
        config.value = cf?.themeId ?? "default";
      }
    } catch {
      config.value = "default";
    }
    return config.value;
  }

  function applyTheme() {
    if (import.meta.server) return;
    document.documentElement.setAttribute("data-theme", config.value);
  }

  return { config, customFields, loadTheme, applyTheme };
}
