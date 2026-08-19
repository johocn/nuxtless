<script setup lang="ts">
import {
  AFTER_SALES_TABS,
  tabOfAfterSales,
  type AfterSalesTabKey,
} from "../../../utils/after-sales-state";

const { t } = useI18n();
const localePath = useLocalePath();
const { isAuthenticated } = storeToRefs(useAuthStore());
const activeTab = ref<AfterSalesTabKey>("ALL");
const loading = ref(true);

const { data: listData, refresh } = await useAsyncGql(
  "MyAfterSalesRequests",
  { options: { take: 100 } },
  { immediate: false, server: false },
);

const requests = computed(() => listData.value?.myAfterSalesRequests?.items ?? []);
const filtered = computed(() =>
  activeTab.value === "ALL"
    ? requests.value
    : requests.value.filter((r) => tabOfAfterSales(r.state) === activeTab.value),
);

onMounted(async () => {
  if (!isAuthenticated.value) {
    navigateTo(localePath("/account/login"), { replace: true });
    return;
  }
  await refresh();
  loading.value = false;
});
</script>

<template>
  <BaseLoader v-if="loading || !isAuthenticated" width="sm:w-xs md:w-md" />
  <main v-else class="container">
    <header class="my-14">
      <h1 class="text-2xl font-semibold">{{ t("messages.afterSales.title") }}</h1>
      <ULink :to="localePath('/account')" class="mt-2 text-sm">
        {{ t("messages.account.backToAccount") }}
      </ULink>
    </header>

    <UTabs
      v-model="activeTab"
      :items="AFTER_SALES_TABS.map((tb) => ({ value: tb.key, label: t(tb.labelKey) }))"
      class="mb-6"
    />

    <div v-if="filtered.length" class="flex flex-col gap-4">
      <AfterSalesCard v-for="r in filtered" :key="r.id" :request="r" />
    </div>
    <p v-else class="py-16 text-center text-neutral-500">{{ t("messages.afterSales.empty") }}</p>
  </main>
</template>
