<script setup lang="ts">
definePageMeta({ middleware: "account" });

import {
  AFTER_SALES_TABS,
  tabOfAfterSales,
  type AfterSalesTabKey,
} from "../../../utils/after-sales-state";

const { t } = useI18n();
const localePath = useTenantLocalePath();
const activeTab = ref<AfterSalesTabKey>("ACTIVE");
const keyword = ref("");
const sortBy = ref<"newest" | "amount">("newest");
const loading = ref(true);
const listError = ref(false);

const { data: listData, refresh } = await useAsyncGql(
  "MyAfterSalesRequests",
  { options: { take: 100 } },
  { immediate: false, server: false },
);

const requests = computed(() => listData.value?.myAfterSalesRequests?.items ?? []);
const truncated = computed(() => requests.value.length >= 100);

// 搜索/排序/筛选全部本地完成：
// 插件 SDL 的 AfterSalesRequestListOptions 是空声明（无 filter / sort），列表本就走 take:100 全量拉取。
const matched = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  let list = requests.value;
  if (activeTab.value !== "ALL") {
    list = list.filter((r) => tabOfAfterSales(r.state) === activeTab.value);
  }
  if (kw) {
    list = list.filter((r) => {
      const code = r.order?.code?.toLowerCase() ?? "";
      const id = String(r.id).toLowerCase();
      const name = r.orderLine?.productVariant?.name?.toLowerCase() ?? "";
      return code.includes(kw) || id.includes(kw) || name.includes(kw);
    });
  }
  return [...list].sort((a, b) => {
    if (sortBy.value === "amount") return (b.refundAmount ?? 0) - (a.refundAmount ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
});

const tabItems = computed(() =>
  AFTER_SALES_TABS.map((tb) => ({ value: tb.key, label: t(tb.labelKey) })),
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

    <UTabs v-model="activeTab" :items="tabItems" class="mb-4" />

    <!-- 工具栏：搜索 + 排序 -->
    <div class="mb-6 flex items-center gap-2">
      <input
        v-model="keyword"
        :placeholder="t('messages.afterSales.searchPlaceholder')"
        class="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
      <select
        v-model="sortBy"
        class="shrink-0 rounded-md border border-neutral-300 px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        <option value="newest">{{ t("messages.afterSales.sortNewest") }}</option>
        <option value="amount">{{ t("messages.afterSales.sortAmount") }}</option>
      </select>
    </div>

    <!-- 空态三分 -->
    <div v-if="listError" class="rounded-lg border border-error/30 p-8 text-center">
      <p class="text-sm text-neutral-500">{{ t("messages.afterSales.loadFailed") }}</p>
      <UButton class="mt-4" variant="soft" :label="t('messages.afterSales.retry')" @click="load" />
    </div>
    <p v-else-if="!requests.length" class="py-16 text-center text-neutral-500">
      {{ t("messages.afterSales.empty") }}
    </p>
    <p v-else-if="!matched.length" class="py-16 text-center text-neutral-500">
      {{ t("messages.afterSales.emptySearch") }}
    </p>
    <div v-else class="flex flex-col gap-4">
      <AfterSalesCard v-for="r in matched" :key="r.id" :request="r" />
    </div>

    <p v-if="truncated && matched.length" class="mt-4 text-center text-xs text-neutral-400">
      {{ t("messages.afterSales.onlyRecent100") }}
    </p>

    <div class="mt-10">
      <CustomerServiceCard />
    </div>
  </main>
</template>
