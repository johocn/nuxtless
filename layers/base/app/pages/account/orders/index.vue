<script setup lang="ts">
definePageMeta({ middleware: "account" });

import type { OrderTabKey } from "../../../utils/order-state";

const { t } = useI18n();
const { customer } = storeToRefs(useCustomerStore());
const { copy } = useClipboard();
const toast = useToast();
const activeTab = ref<OrderTabKey>("ALL");

async function onCopy(email: string) {
  await copy(email);
  toast.add({ title: t("messages.general.getLinkSuccess"), color: "success" });
}
</script>

<template>
  <main class="container py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">
        {{ t("messages.account.orders") }}
      </h1>
      <button
        class="mt-1 text-sm text-neutral-500 underline"
        @click="onCopy(customer?.emailAddress ?? '')"
      >
        {{ customer?.emailAddress }}
      </button>
    </header>
    <OrderTabBar v-model="activeTab" />
    <OrderCardList v-model:tab="activeTab" />
  </main>
</template>
