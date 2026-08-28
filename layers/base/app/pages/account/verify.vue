<script setup lang="ts">
definePageMeta({
  alias: ["/verify"],
  middleware: "guest",
});

const token = useRouteQuery("token") || undefined;
const { t } = useI18n();
const localePath = useLocalePath();
const toast = useToast();

const { verify } = useCustomerStore();
const loading = ref(true);
const verifying = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  loading.value = false;

  if (!token) {
    error.value = "Missing verification token.";
    verifying.value = false;
    return;
  }

  const result = await verify(token);

  if (result && "identifier" in result) {
    await navigateTo(localePath("/account/login"), { replace: true });
    toast.add({
      title: t("messages.account.verifySuccess"),
      description: t("messages.account.verifySuccessMessage"),
      color: "success",
    });
  } else {
    error.value = result?.message ?? "Verification failed.";
    verifying.value = false;
  }
});
</script>

<template>
  <BaseLoader v-if="loading" width="sm:w-xs md:w-sm" />
  <main v-else class="container mt-14">
    <header
      class="mb-8 flex flex-col items-center"
      aria-labelledby="verify-heading"
    >
      <LogoElement
        aria-hidden="true"
        focusable="false"
        wrapper-class="w-1/2 h-[125px] justify-center"
        class="mb-4"
      />
      <h1 id="verify-heading" class="text-2xl font-bold">
        {{ t("messages.pages.account.accountVerify") }}
      </h1>
      <p>
        <ULink :to="localePath('/account/login')" class="underline">
          {{ t("messages.account.backToLogin") }}
        </ULink>
      </p>
    </header>

    <section class="mb-14 flex flex-col items-center">
      <div
        class="mx-auto flex w-full flex-col items-center text-center sm:w-xs md:w-sm"
      >
        <p v-if="verifying">Verifying your account...</p>
        <p v-else-if="error" role="alert" class="text-red-600">{{ error }}</p>
        <p v-else>{{ t("messages.account.verificationComplete") }}</p>
      </div>
    </section>
  </main>
</template>

<style lang="css" scoped></style>
