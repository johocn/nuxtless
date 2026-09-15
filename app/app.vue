<script setup lang="ts">
// 按 URL 首段租户动态取 channel token；未命中回退默认渠道
const { token: channelToken } = useTenantChannel();
const colorMode = useColorMode();
const { t, locale } = useI18n();
const toast = useToast();
const siteName = useSiteName();

// Set initial locale for Vendure requests (must run before any useAsyncGql,
// otherwise queries like GetChannelTheme fall back to the baked GQL_HOST=localhost
// which is NOT proxied in production and returns 404, so the theme stays "default")
useGqlHost(`${useGqlHostUrl()}?languageCode=${locale.value}`);

const { config: themeConfig, loadTheme } = useChannelTheme();
// 渠道级固定主题：SSR 首帧即写入 <html data-theme>，避免 FOUC
useHead(() => ({ htmlAttrs: { "data-theme": themeConfig.value } }));
await loadTheme();

// 模板级主题令牌（L1 全局配置 → L2 风格模板合并）：内联 CSS 变量叠加在
// data-theme 之上（模板库为上层覆盖），--ui-primary/--ui-radius 驱动 Nuxt UI 语义色。
const { themeTokens } = useThemeConfig();
const themeCssVars = computed(() => {
  const t = themeTokens.value;
  const vars: string[] = [];
  if (t.primaryColor) vars.push(`--ui-primary:${t.primaryColor};--theme-primary:${t.primaryColor};`);
  if (t.accentColor) vars.push(`--theme-accent:${t.accentColor};`);
  if (t.radius !== undefined && t.radius !== "") vars.push(`--ui-radius:${t.radius}px;`);
  return vars.length ? `:root{${vars.join("")}}` : "";
});
useHead(() => ({ style: themeCssVars.value ? [{ innerHTML: themeCssVars.value }] : [] }));

const ogColorMode = computed<"dark" | "light">(() =>
  colorMode.value === "dark" ? "dark" : "light",
);

const orderStore = useOrderStore();
const { error } = storeToRefs(orderStore);

// Create shared menu collections. Could be rewritten as composable.
const { data: menuCollections } = await useAsyncGql("GetMenuCollections");
useState("menuCollections", () => menuCollections.value);

// 微信内置浏览器全站自动 SSO 登录：任意页面进入即静默跳统一登录页，成功后回跳原页（含 ?invite）
useAutoWechatSsoLogin();

// Set GQL session and fetch current order
onBeforeMount(async () => {
  await useGqlSession(locale.value, useGqlHostUrl(), channelToken.value, "default");
  await orderStore.fetchOrder();
});

// Set and watch locale for Vendure requests
watch(locale, (val, oldVal) => {
  if (val === oldVal) return;

  useGqlHost(`?languageCode=${val}`);
  // Workaround for refreshing Vendure data
  const route = useRoute();
  const localePath = useTenantLocalePath();
  window.location.href = localePath(route.fullPath);
});

// Watch for order processing errors
watch(error, (val) => {
  if (!val) return;

  toast.add({
    title: "Order Processing Error",
    description: val,
    color: "error",
  });
});

// OgImage
defineOgImage("BlogPost.satori", {
  colorMode: ogColorMode,
  title: t("messages.site.tagline"),
  category: siteName.value,
  author: t("messages.site.shortDescription"),
  backgroundImage: "logo-top.svg",
  // image: "/logo.png",
  // logo: "/logo-full.svg",
});

// SchemaOrg
useSchemaOrg([
  defineWebPage({
    name: siteName.value,
    description: t("messages.site.tagline"),
  }),
  defineWebSite({
    name: siteName.value,
    description: t("messages.site.tagline"),
  }),
]);
</script>

<template>
  <NuxtLoadingIndicator />
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<style lang="css" scoped></style>
