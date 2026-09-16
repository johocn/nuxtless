<script setup lang="ts">
// R4 配置版本化响应头：模板/全局配置 version 变化即派生 Unique 响应头
import { setResponseHeader } from "h3";
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
// data-theme 之上（模板库为上层覆盖）。
// 特异性说明：theme.css 用 :root[data-theme]（(0,2,0)）定义 --ui-primary/--ui-radius，
// 而 Tailwind @theme 的 --color-brand-* 在 @layer theme 内。这里用 :root:root 提特异性
// 压过 data-theme；未分层样式天然压过 @layer，故 --color-brand-* 一并覆盖即可换肤。
function darken(hex: string, pct = 0.1): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - pct));
  const g = Math.round(((n >> 8) & 255) * (1 - pct));
  const b = Math.round((n & 255) * (1 - pct));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
const { themeTokens } = useThemeConfig();
const themeCssVars = computed(() => {
  const t = themeTokens.value;
  const vars: string[] = [];
  if (t.primaryColor) {
    vars.push(`--ui-primary:${t.primaryColor};--theme-primary:${t.primaryColor};`);
    vars.push(`--color-brand-500:${t.primaryColor};`);
    vars.push(`--color-brand-600:${darken(t.primaryColor)};`);
  }
  if (t.accentColor) vars.push(`--theme-accent:${t.accentColor};`);
  if (t.radius !== undefined && t.radius !== "") vars.push(`--ui-radius:${t.radius}px;`);
  return vars.length ? `html:root:root{${vars.join("")}}` : "";
});
useHead(() => ({ style: themeCssVars.value ? [{ innerHTML: themeCssVars.value }] : [] }));

// R4: 配置版本化——模板/全局配置 version 变化即派生 Unique 响应头，破 nginx/CDN 对
// SSR 首帧 HTML 的缓存（缓存 key 含该头变化即视为不同）。客户端不设此头。
if (import.meta.server) {
  const { template: tpl, globalConfig: gCfg } = useThemeConfig();
  const versionSig = `${tpl.value?.version ?? 0}-${gCfg.value ? 1 : 0}-${channelToken.value ?? ''}`;
  const event = useRequestEvent();
  if (event) setResponseHeader(event, "X-Template-Version", versionSig);
}

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
