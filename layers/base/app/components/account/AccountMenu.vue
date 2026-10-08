<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const { token: channelToken } = useTenantChannel();
const { t, locale } = useI18n();
const localePath = useTenantLocalePath();
const colorMode = useColorMode();
const { isAuthenticated } = storeToRefs(useAuthStore());
const { clearSession } = useAuthStore();
const { fetchCustomer, logout } = useCustomerStore();
const { customer } = storeToRefs(useCustomerStore());
const { fetchOrder } = useOrderStore();
const { localeItems, currentLocaleName } = useLangSwitcher();
const isOpen = ref(false);
const loading = ref(true);

const colorModeItems = computed<DropdownMenuItem[]>(() => [
  {
    label: t("messages.general.system"),
    icon: "i-lucide-laptop-minimal",
    active: colorMode.preference === "system",
    class: "items-center",
    onSelect: () => (colorMode.preference = "system"),
  },
  {
    label: t("messages.general.light"),
    icon: "i-lucide-sun",
    class: "items-center",
    active: colorMode.preference === "light",
    onSelect: () => (colorMode.preference = "light"),
  },
  {
    label: t("messages.general.dark"),
    icon: "i-lucide-moon",
    class: "items-center",
    active: colorMode.preference === "dark",
    onSelect: () => (colorMode.preference = "dark"),
  },
]);

const userItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: customer.value?.firstName,
      avatar: {
        alt: `${customer.value?.firstName} ${customer.value?.lastName}`,
      },
      type: "label",
    },
  ],
  [
    {
      label: t("messages.account.profile"),
      icon: "i-lucide-user",
      to: localePath("/account"),
      class: "items-center",
    },
    {
      label: t("messages.account.orders"),
      icon: "i-lucide-list",
      to: localePath("/account/orders"),
      class: "items-center",
    },
    {
      label: t("messages.account.addresses"),
      icon: "i-lucide-map-pin",
      to: localePath("/account/addresses"),
      class: "items-center",
    },
    {
      label: t("messages.account.afterSales"),
      icon: "i-lucide-rotate-ccw",
      to: localePath("/account/after-sales"),
      class: "items-center",
    },
    {
      label: t("messages.account.coupons"),
      icon: "i-lucide-ticket-percent",
      to: localePath("/coupon"),
      class: "items-center",
    },
    {
      label: t("messages.account.messages"),
      icon: "i-lucide-inbox",
      to: localePath("/messages"),
      class: "items-center",
    },
    {
      label: t("messages.order.lookupMenu"),
      icon: "i-lucide-search",
      to: localePath("/order/lookup"),
      class: "items-center",
    },
  ],
  [
    {
      label: t("messages.general.colorMode"),
      icon: colorMode.value === "light" ? "i-lucide-sun" : "i-lucide-moon",
      class: "items-center",
      children: colorModeItems.value,
    },
    {
      label: currentLocaleName.value,
      icon: "i-lucide-globe",
      class: "items-center",
      children: localeItems.value,
    },
  ],
  [
    {
      label: t("messages.account.logout"),
      icon: "i-lucide-log-out",
      kbds: ["shift", "meta", "q"],
      color: "error",
      class: "items-center",
      onSelect: async () => {
        // 顺序不可反：先服务端销毁会话（logout 内部已容错），再清本地凭证，最后导航。
        // 旧实现先导航后登出，导航竞态/网络失败会留下服务端会话仍有效而本地已清空。
        await logout();
        clearSession();
        await useGqlSession(locale.value, useGqlHostUrl(), channelToken.value, "default");
        await fetchOrder();
        await navigateTo(localePath("/"), { replace: true });
      },
    },
  ],
]);

const guestItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t("messages.account.login"),
      icon: "i-lucide-log-in",
      to: localePath("/account/login"),
      class: "items-center",
    },
  ],
  [
    {
      label: t("messages.order.lookupMenu"),
      icon: "i-lucide-search",
      to: localePath("/order/lookup"),
      class: "items-center",
    },
  ],
  [
    {
      label: t("messages.general.colorMode"),
      icon: colorMode.value === "light" ? "i-lucide-sun" : "i-lucide-moon",
      class: "items-center",
      children: colorModeItems.value,
    },
    {
      label: currentLocaleName.value,
      icon: "i-lucide-globe",
      class: "items-center",
      children: localeItems.value,
    },
  ],
]);

const items = computed(() =>
  isAuthenticated.value ? userItems.value : guestItems.value,
);

defineShortcuts(extractShortcuts(items.value));

onMounted(async () => {
  try {
    // me 查询放客户端：本组件在全站布局内，顶层 await 会让 SSR Suspense 每页
    // 串行多等一次 GraphQL RTT（游客也等），与 GetMenuCollections 的 server:false
    // 处理对齐。菜单先按 authStore.isAuthenticated（hydration 即知）渲染，用户名稍后填充。
    if (!customer.value) await fetchCustomer();
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <UDropdownMenu
    v-model:open="isOpen"
    :items="items"
    :ui="{
      content: 'w-48',
    }"
  >
    <template #language>
      <LangSwitcher color="neutral" />
    </template>

    <template #color-mode>
      <UColorModeSelect />
    </template>

    <UButton
      size="md"
      icon="i-lucide-user"
      variant="outline"
      :loading="loading"
    />
  </UDropdownMenu>

  <!-- <UButton
    v-else
    :to="localePath('/account/login')"
    size="xl"
    icon="i-lucide-user"
    variant="outline"
    :loading="loading"
    aria-label="Login"
  /> -->
</template>

<style lang="css" scoped></style>
