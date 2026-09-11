<script setup lang="ts">
// nshop 自带 SSO 微信授权回调页（作为 wechatRedirect 的 redirect_uri，内含 ?return_url）。
// 流程：读 SSO 回跳的 ?code → exchange-token 兑 SSO 令牌 → authenticate 建 Vendure 会话
//      → 同源校验后精确回跳原分享页（return_url），否则回 /account。
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const localePath = useTenantLocalePath();
const { fetchProviders, ssoLoginWithCode, clearSsoState } = useSso();

const codeEl = computed(() => (typeof route.query.code === "string" ? route.query.code : ""));
const returnUrl = computed<string>(() => {
  const raw = typeof route.query.return_url === "string" ? route.query.return_url : "";
  try {
    return new URL(raw, window.location.origin).origin === window.location.origin ? raw : "";
  } catch {
    return "";
  }
});
const target = computed(() => returnUrl.value || localePath("/account"));

async function run() {
  if (!codeEl.value) {
    router.replace(target.value);
    return;
  }
  const providerKey = sessionStorage.getItem("youshop_sso_provider");
  const redirectUriStr =
    sessionStorage.getItem("youshop_sso_redirect_uri") ||
    `${window.location.origin}${localePath("/account/sso-callback")}`;
  const providers = await fetchProviders();
  const provider = providers.find((p) => p.providerKey === providerKey) ?? providers[0];
  if (!provider) {
    router.replace(target.value);
    return;
  }
  try {
    const result = await ssoLoginWithCode(provider, codeEl.value, redirectUriStr);
    clearSsoState();
    if (result?.id) {
      toast.add({ title: t("messages.share.loginSuccess"), color: "success" });
    } else {
      toast.add({ title: t("messages.share.loginFail"), description: t("messages.share.callbackFail"), color: "error" });
    }
  } catch {
    clearSsoState();
    toast.add({ title: t("messages.share.loginFail"), color: "error" });
  }
  router.replace(target.value);
}

onMounted(() => {
  void run();
});
</script>

<template>
  <main class="container flex min-h-[60vh] items-center justify-center">
    <div class="text-center text-sm text-gray-500">
      <UIcon name="i-lucide-loader-2" class="mr-1 animate-spin text-primary" />
      {{ t("messages.share.callbackProcessing") }}
    </div>
  </main>
</template>