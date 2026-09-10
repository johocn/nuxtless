<script setup lang="ts">
import { LoginForm } from "~~/layers/base/validators/loginForm";

import type { FormSubmitEvent } from "@nuxt/ui";

const emit = defineEmits<{
  (e: "success"): void;
}>();

const { fetchProviders, loginWithSso } = useSso();
const providers = ref<Awaited<ReturnType<typeof fetchProviders>>>([]);
onMounted(async () => {
  providers.value = await fetchProviders();
});

const { token: channelToken } = useTenantChannel();
const { t, locale } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { fetchOrder } = useOrderStore();
const { fetchCustomer } = useCustomerStore();
const { setUser } = useAuthStore();
const { customer } = storeToRefs(useCustomerStore());

const state = reactive({
  email: "",
  password: "",
});

async function onSubmit(event: FormSubmitEvent<LoginForm>) {
  const result = await useGqlSession(
    locale.value,
    useGqlHostUrl(),
    channelToken.value,
    "login",
    {
      emailAddress: event.data.email,
      password: event.data.password,
      rememberMe: true,
    },
  );

  if (result && "identifier" in result) {
    await fetchOrder();
    await fetchCustomer();

    if (!customer.value) {
      throw new Error("Customer not available after login");
    }

    setUser({
      id: customer.value.id,
      email: customer.value.emailAddress,
    });

    toast.add({
      title: t("messages.account.loginSuccess"),
      description: t("messages.account.successMessage"),
      color: "success",
    });

    emit("success");
  } else if (result && "errorCode" in result) {
    toast.add({
      title: t("messages.account.loginFail"),
      description: t("messages.account.failMessage"),
      color: "error",
    });
  } else {
    toast.add({
      title: t("messages.error.general"),
      description: t("messages.error.generalMessage"),
      color: "error",
    });
  }
}
</script>

<template>
  <UForm
    :schema="LoginForm"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UFormField :label="t('messages.account.email')" name="email" size="xl">
      <UInput
        v-model="state.email"
        type="email"
        :placeholder="t('messages.account.emailPlaceholder')"
        class="w-full"
      />
    </UFormField>

    <UFormField
      :label="t('messages.account.password')"
      name="password"
      size="xl"
    >
      <UInput
        v-model="state.password"
        type="password"
        :placeholder="t('messages.account.passwordPlaceholder')"
        class="w-full"
      />
    </UFormField>

    <UButton size="xl" loading-auto class="w-full justify-center" type="submit">
      {{ t("messages.account.login") }}
    </UButton>

    <template v-if="providers.length">
      <div class="flex items-center gap-3 py-2" aria-hidden="true">
        <span class="h-px flex-1 bg-(--ui-border)" />
        <span class="text-xs text-(--ui-text-muted)">{{ t("messages.account.otherLogin") }}</span>
        <span class="h-px flex-1 bg-(--ui-border)" />
      </div>
      <UButton
        v-for="p in providers"
        :key="p.providerKey"
        size="xl"
        variant="outline"
        class="w-full justify-center"
        @click="loginWithSso(p)"
      >
        {{ p.name }}
      </UButton>
    </template>

    <ULink
      :to="localePath('/account/request-password-reset')"
      class="block text-center underline"
    >
      {{ t("messages.account.forgotPassword") }}
    </ULink>
  </UForm>
</template>

<style lang="css" scoped></style>
