<script setup lang="ts">
definePageMeta({ middleware: "account" });

import {
  AFTER_SALES_TABS,
  tabOfAfterSales,
  type AfterSalesTabKey,
} from "../../../utils/after-sales-state";

const { t } = useI18n();
const localePath = useTenantLocalePath();
const activeTab = ref<AfterSalesTabKey>("ALL");
const loading = ref(true);
const listError = ref(false);

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

async function load() {
  listError.value = false;
  try {
    await refresh();
  } catch {
    listError.value = true;
  }
}

onMounted(async () => {
  await load();
  loading.value = false;
});
</script>

<template>
  <BaseLoader v-if="loading" width="sm:w-xs md:w-md" />
  <main v-else class="container">
    <header class="my-14">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{{ t("messages.afterSales.title") }}</h1>
        <UButton
          icon="i-lucide-refresh-cw"
          variant="ghost"
          size="sm"
          :label="t('messages.afterSales.refresh')"
          @click="load"
        />
      </div>
      <ULink :to="localePath('/account')" class="mt-2 text-sm">
        {{ t("messages.account.backToAccount") }}
      </ULink>
    </header>

    <UTabs
      v-model="activeTab"
      :items="AFTER_SALES_TABS.map((tb) => ({ value: tb.key, label: t(tb.labelKey) }))"
      class="mb-6"
    />

    <!-- 加载失败：重试 -->
    <div v-if="listError" class="rounded-lg border border-error/30 p-8 text-center">
      <p class="text-sm text-neutral-500">{{ t("messages.afterSales.loadFailed") }}</p>
      <UButton class="mt-4" variant="soft" :label="t('messages.afterSales.retry')" @click="load" />
    </div>
    <!-- 正常列表 -->
    <div v-else-if="filtered.length" class="flex flex-col gap-4">
      <AfterSalesCard v-for="r in filtered" :key="r.id" :request="r" />
    </div>
    <p v-else class="py-16 text-center text-neutral-500">{{ t("messages.afterSales.empty") }}</p>

    <!-- 联系客服 -->
    <div class="mt-10">
      <CustomerServiceCard />
    </div>
  </main>
</template>