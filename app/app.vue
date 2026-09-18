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

const { config: themeConfig, loadTheme, customFields } = useChannelTheme();
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
// ⚠️ TTFB 关键修复：GetMenuCollections 在 Vendure 后端本身慢（实测 3.5-4.5s，非前端）。
// 若在 SSR 顶层 await，会阻塞所有页面 TTFB（首页/商品页 ~4.5-6s），微信链接预览抓取
// 有超时（~2-3s），在拿到 og 头之前就放弃 → 分享只出纯网址、无标题无图。
// 改为仅客户端加载（server:false）：SSR 首帧立即吐出带 og 的 HTML（~300ms，顶多等
// 快速的 GetProductDetail），顶部/首页分类导航在 hydration 后填充，可接受轻微 FOUC。
const { data: menuAsyncData } = useAsyncData<MenuCollections | null>(
  "menuCollections",
  async () => {
    const res = await useAsyncGql("GetMenuCollections");
    return res.data.value ?? null;
  },
  { server: false, lazy: true },
);
// 写回共享 state，供 Header/Footer/首页分类导航等消费（SSR 时为空，hydration 后填充）
const menuState = useState<MenuCollections | null>("menuCollections", () => null);
watchEffect(() => {
  if (menuAsyncData.value) menuState.value = menuAsyncData.value;
});

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

// OgImage（全局兜底）
// 商品详情页不用此全局 og：Product/[slug] 直接输出静态 CDN 商品图为 og:image
// （绕开 nuxt-og-image 的 _og/d 动态代理，确保微信稳定抓取商品图），故此处跳过 /product/ 路由。
const ogRoute = useRoute();
const ogStaticBase = useRuntimeConfig().public.i18NBaseUrl as string;
if (!ogRoute.path.startsWith("/product/")) {
  // 首页/其它页 og 标题/描述按租户 Channel.customFields 配置：shopName 标题、shopIntro 描述，
  // 未配置回退 i18n site 文案；og 默认图优先租户 shareImageUrl，未配置回退静态 share-logo.jpg（域名 logo 卡）。
  const ogImage = computed(() => {
    const custom = customFields.value?.shareImageUrl;
    if (custom) return /^https?:\/\//i.test(custom) ? custom : `${ogStaticBase}${custom.startsWith("/") ? custom : `/${custom}`}`;
    return `${ogStaticBase}/share-logo.jpg`;
  });
  useSeoMeta({
    title: computed(() => customFields.value?.shopName || t("messages.site.tagline")),
    description: computed(() => customFields.value?.shopIntro || t("messages.site.shareDesc")),
    ogTitle: computed(() => customFields.value?.shopName || t("messages.site.tagline")),
    ogDescription: computed(() => customFields.value?.shopIntro || t("messages.site.shareDesc")),
    ogImage,
    twitterImage: ogImage,
  });
}

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
