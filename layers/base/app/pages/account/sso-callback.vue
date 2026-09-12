<script setup lang="ts">
// nshop 自带 SSO 回调落点页（统一登录页与直连授权的共同 return_url，内含 ?return_url）。
// 统一页流程回跳带 ?token（accessToken 直验换 Vendure 会话）；直连授权回跳带 ?code（兑令牌）。
// 完成后同源校验精确回跳原分享页（return_url），缺省回 /account。
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const localePath = useTenantLocalePath();
const { fetchProviders, exchangeSsoAccessToken, ssoLoginWithCode, clearSsoState } = useSso();

const tokenEl = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));
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

/** 解析统一页回跳的 ?user 参数（base64(encodeURIComponent(JSON))），取用户自有邀请码 */
function parseUserInviteCode(userParam: string): string {
  try {
    const json = decodeURIComponent(atob(userParam));
    return (JSON.parse(json)?.inviteCode as string) || "";
  } catch {
    return "";
  }
}

async function run() {
  const providerKey = sessionStorage.getItem("youshop_sso_provider");
  const providers = await fetchProviders();
  const provider = providers.find((p) => p.providerKey === providerKey) ?? providers[0];

  // 统一页回跳：token 直验换 Vendure 会话
  if (tokenEl.value) {
    if (!provider) {
      router.replace(target.value);
      return;
    }
    try {
      const result = await exchangeSsoAccessToken(provider.providerKey, tokenEl.value);
      clearSsoState();
      if (result?.id) {
        const invite =
          (typeof route.query.user === "string" ? parseUserInviteCode(route.query.user) : "") ||
          "";
        authStore.setUser({
          id: result.id,
          email: result.identifier ?? "",
          ...(invite ? { inviteCode: invite } : {}),
        });
        toast.add({ title: t("messages.share.loginSuccess"), color: "success" });
      } else {
        toast.add({ title: t("messages.share.loginFail"), description: t("messages.share.callbackFail"), color: "error" });
      }
    } catch {
      clearSsoState();
      toast.add({ title: t("messages.share.loginFail"), color: "error" });
    }
    router.replace(target.value);
    return;
  }

  // 直连授权回跳：code 兑令牌（保留兼容）
  if (codeEl.value) {
    if (!provider) {
      router.replace(target.value);
      return;
    }
    const redirectUriStr =
      sessionStorage.getItem("youshop_sso_redirect_uri") ||
      `${window.location.origin}${localePath("/account/sso-callback")}`;
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
    return;
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