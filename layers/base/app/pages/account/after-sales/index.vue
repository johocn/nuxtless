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

// 加载更多分页：ListQueryBuilder 原生 skip/take；搜索/筛选/排序仍为本地实现（作用于已加载数据）
const PAGE_SIZE = 20;
const requests = ref<any[]>([]);
const totalItems = ref(0);
const loadingMore = ref(false);
const loadMoreError = ref(false);
const hasMore = computed(() => requests.value.length < totalItems.value);
const shownText = computed(() =>
  t("messages.afterSales.shownCount")
    .replace("{n}", String(requests.value.length))
    .replace("{m}", String(totalItems.value)),
);

async function loadFirst() {
  listError.value = false;
  try {
    const res = await GqlMyAfterSalesRequests({ options: { take: PAGE_SIZE, skip: 0 } });
    requests.value = (res?.myAfterSalesRequests?.items ?? []) as any[];
    totalItems.value = res?.myAfterSalesRequests?.totalItems ?? 0;
  } catch {
    listError.value = true;
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  loadMoreError.value = false;
  try {
    const res = await GqlMyAfterSalesRequests({ options: { take: PAGE_SIZE, skip: requests.value.length } });
    const items = (res?.myAfterSalesRequests?.items ?? []) as any[];
    requests.value = requests.value.concat(items);
    totalItems.value = res?.myAfterSalesRequests?.totalItems ?? totalItems.value;
  } catch {
    loadMoreError.value = true; // 保留已加载内容，行内重试
  } finally {
    loadingMore.value = false;
  }
}

async function load() {
  await loadFirst();
}

// 搜索/排序/筛选全部本地完成（作用于已加载数据）：
// 插件 SDL 的 AfterSalesRequestListOptions 是空声明（无 filter / sort）。
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

    <!-- 加载更多 -->
    <div v-if="hasMore" class="mt-6 text-center">
      <p v-if="loadMoreError" class="mb-2 text-xs text-error">
        {{ t("messages.afterSales.loadMoreFailed") }}
      </p>
      <UButton
        variant="soft"
        :loading="loadingMore"
        :label="loadMoreError ? t('messages.afterSales.retry') : t('messages.afterSales.loadMore')"
        @click="loadMore"
      />
    </div>
    <p v-else-if="requests.length" class="mt-6 text-center text-xs text-neutral-400">
      {{ t("messages.afterSales.allLoaded") }}
    </p>
    <p v-if="requests.length" class="mt-2 text-center text-xs text-neutral-400">{{ shownText }}</p>

    <div class="mt-10">
      <CustomerServiceCard />
    </div>
  </main>
</template>
