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
const { fetchProviders, exchangeSsoAccessToken, ssoLoginWithCode, clearSsoState, readSsoReturnUrl, clearSsoReturnUrl, consumeSsoCsrfState } = useSso();

const tokenEl = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));
const codeEl = computed(() => (typeof route.query.code === "string" ? route.query.code : ""));
const target = computed(() => readSsoReturnUrl() || localePath("/account"));

/** 先读取回跳目标（同源校验后），清掉 sessionStorage 记录，再跳转；防止旧目标被复用 */
function leave() {
  const tgt = target.value;
  clearSsoReturnUrl();
  router.replace(tgt);
}

/** 解析统一页回跳的 ?user 参数（base64(encodeURIComponent(JSON))），取用户自有邀请码。
 *  信任边界（勿升级为权威值）：?user 来自 URL，本地可任意构造，仅作首屏展示占位；
 *  真实分销归因由 SSO 服务端 buildReferralRelation 落库，Vendure 侧 me 查询无
 *  inviteCode 字段可回拉。后续若有功能依赖 inviteCode（推荐人展示/返佣计算），
 *  必须新增服务端权威查询，不得直接消费 authStore 里此处写入的值。 */
function parseUserInviteCode(userParam: string): string {
  try {
    const json = decodeURIComponent(atob(userParam));
    return (JSON.parse(json)?.inviteCode as string) || "";
  } catch {
    return "";
  }
}

async function run() {
  // 登录 CSRF 防护：先按流程类型校验并一次性消费发起证明（useSso 生成），
  // 未经本站发起的回调 URL（如直开的 ?token=<他人 accessToken>）因证明缺失/过期被拒绝。
  if (tokenEl.value && !consumeSsoCsrfState("unified")) {
    toast.add({ title: t("messages.share.loginFail"), color: "error" });
    leave();
    return;
  }
  if (codeEl.value && !consumeSsoCsrfState("wechat")) {
    toast.add({ title: t("messages.share.loginFail"), color: "error" });
    leave();
    return;
  }

  const providerKey = sessionStorage.getItem("youshop_sso_provider");
  const providers = await fetchProviders();
  const provider = providers.find((p) => p.providerKey === providerKey) ?? providers[0];

  // 统一页回跳：token 直验换 Vendure 会话
  if (tokenEl.value) {
    if (!provider) {
      leave();
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
    leave();
    return;
  }

  // 直连授权回跳：code 兑令牌（保留兼容）
  if (codeEl.value) {
    if (!provider) {
      leave();
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
    leave();
    return;
  }

  leave();
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