<script setup lang="ts">
definePageMeta({
  alias: ["/login"],
  middleware: "guest",
});

const router = useRouter();
const { t } = useI18n();
const localePath = useLocalePath();
const submitted = ref(false);

watch(submitted, (v) => {
  if (v) {
    router.push(localePath("/account"));
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
