<script setup lang="ts">
definePageMeta({
  alias: ["/login"],
  middleware: "guest",
});

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const authStore = useAuthStore();
const { hasPendingCallback, exchangeSsoAccessToken, clearSsoState } = useSso();
const submitted = ref(false);

watch(submitted, (v) => {
  if (v) {
    router.push(localePath("/account"));
  }
});

// SSO 回调：h.joho.cn 统一页登录成功后回跳本页（?token=xxx），用 accessToken 直验换 Vendure 会话
onMounted(async () => {
  const token = route.query.token as string | undefined;
  if (!hasPendingCallback(token)) return;
  const providerKey = sessionStorage.getItem("youshop_sso_provider");
  if (!providerKey) return;
  try {
    const result = await exchangeSsoAccessToken(providerKey, token as string);
    clearSsoState();
    await router.replace({ query: {} });
    if (result?.id) {
      authStore.setUser({ id: result.id, email: result.identifier || "" });
      toast.add({
        title: t("messages.account.loginSuccess"),
        description: t("messages.account.successMessage"),
        color: "success",
      });
      router.push(localePath("/account"));
    } else {
      toast.add({
        title: t("messages.account.loginFail"),
        description: result?.message || t("messages.account.failMessage"),
        color: "error",
      });
    }
  } catch (e) {
    clearSsoState();
    toast.add({
      title: t("messages.account.loginFail"),
      description: t("messages.error.generalMessage"),
      color: "error",
    });
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

    <AccountLoginForm
      class="mx-auto mb-14 flex w-full flex-col sm:w-xs md:w-sm"
      @success="submitted = true"
    />
  </main>
</template>

<style lang="css" scoped></style>
