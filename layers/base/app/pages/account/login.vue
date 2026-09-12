<script setup lang="ts">
definePageMeta({
  alias: ["/login"],
  middleware: "guest",
});

import { isWechatBrowser, useSso } from "../../composables/useSso";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const authStore = useAuthStore();
const { hasPendingCallback, exchangeSsoAccessToken, clearSsoState, fetchProviders, loginWithSso } = useSso();
const submitted = ref(false);
const wechatLogging = ref(false);

async function wechatLogin() {
  if (wechatLogging.value) return;
  wechatLogging.value = true;
  const providers = await fetchProviders();
  const provider = providers[0];
  if (provider) {
    sessionStorage.setItem("youshop_sso_auto_jumped", "1");
    loginWithSso(provider, { returnUrl: `${window.location.origin}${localePath("/account")}` });
  } else {
    wechatLogging.value = false;
  }
}

watch(submitted, (v) => {
  if (v) {
    router.push(localePath("/account"));
  }
});

const AUTO_JUMP_KEY = "youshop_sso_auto_jumped";
onMounted(async () => {
  const token = route.query.token as string | undefined;
  if (hasPendingCallback(token)) {
    const providerKey = sessionStorage.getItem("youshop_sso_provider");
    if (!providerKey) return;
    try {
      const result = await exchangeSsoAccessToken(providerKey, token as string);
      clearSsoState();
      sessionStorage.removeItem(AUTO_JUMP_KEY);
      await router.replace({ query: {} });
      if (result?.id) {
        authStore.setUser({ id: result.id, email: result.identifier || "" });
        toast.add({ title: t("messages.account.loginSuccess"), description: t("messages.account.successMessage"), color: "success" });
        router.push(localePath("/account"));
      } else {
        toast.add({ title: t("messages.account.loginFail"), description: result?.message || t("messages.account.failMessage"), color: "error" });
      }
    } catch {
      clearSsoState();
      sessionStorage.removeItem(AUTO_JUMP_KEY);
      toast.add({ title: t("messages.account.loginFail"), description: t("messages.error.generalMessage"), color: "error" });
    }
    return;
  }

  // 微信内置浏览器且未在进行微信登录 → 自动跳转 h.joho.cn 统一登录页
  if (isWechatBrowser() && !wechatLogging.value) {
    void wechatLogin();
  }
});
</script>

<template>
  <main class="container mt-14">
    <header
      class="mb-8 flex flex-col items-center"
      aria-labelledby="login-heading"
    >
      <LogoElement
        aria-hidden="true"
        focusable="false"
        wrapper-class="w-1/2 h-[125px] justify-center"
        class="mb-4"
      />
      <h1 id="login-heading" class="text-2xl font-bold">
        {{ t("messages.pages.account.signIn") }}
      </h1>
      <p>
        {{ t("messages.account.noAccount") }}
        <ULink :to="localePath('/account/register')" class="underline">
          {{ t("messages.account.accountRegister") }}.
        </ULink>
      </p>
    </header>

    <div class="mx-auto mt-2 flex w-full flex-col sm:w-xs md:w-sm">
      <div class="mb-3 flex items-center gap-3 text-xs text-gray-400">
        <span class="h-px flex-1 bg-gray-200" />
        <span>或</span>
        <span class="h-px flex-1 bg-gray-200" />
      </div>
      <UButton
        color="primary"
        variant="outline"
        size="lg"
        icon="i-lucide-message-circle"
        :loading="wechatLogging"
        @click="wechatLogin"
      >{{ t("messages.share.wechatLogin") }}</UButton>
    </div>

    <AccountLoginForm
      class="mx-auto mb-14 flex w-full flex-col sm:w-xs md:w-sm"
      @success="submitted = true"
    />
  </main>
</template>

<style lang="css" scoped></style>
