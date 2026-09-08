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

const ogColorMode = computed<"dark" | "light">(() =>
  colorMode.value === "dark" ? "dark" : "light",
);

const orderStore = useOrderStore();
const { error } = storeToRefs(orderStore);

// Create shared menu collections. Could be rewritten as composable.
const { data: menuCollections } = await useAsyncGql("GetMenuCollections");
useState("menuCollections", () => menuCollections.value);

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
