<script setup lang="ts">
// 统一搜索结果页（P2）：/search?q=，robots 已 disallow（nuxt.config）。
// 数据源：MeiliSearch kb-{zh|en} 索引（useKbSearch，SSR 首屏 + CSR 加载更多）。
// 分段：全部（无 type filter）/ 商品（type=product）/ 知识（type!=product + 类型 chips）。
// 商品价格单位为分（formatCents ÷100）；商品跳 /product/[slug]（禁用文档 url 字段，其含绝对域名），
// 知识内容跳 /kb/[type]/[sourceId]。
import type { KbHit } from "../composables/useKbSearch";
import { formatCents } from "../utils/format-money";
import { assetSrc } from "../utils/image";
import { kbFormatDate, kbTypeLabelKey } from "../composables/useKbSearch";

definePageMeta({ title: "搜索" });

const { t } = useI18n();
const route = useRoute();
const localePath = useTenantLocalePath();

// ---------- 查询参数 ----------
const q = computed(() => String(route.query.q ?? "").trim());
const PAGE_SIZE = 10;
const SORT = ["updatedAt:desc"];

// useHead 须在 q 声明之后：getter 读取 q.value，若在 TDZ 期被 watchEffect 立即执行会中断，
// 导致 unhead entry 未创建、页面卸载时报 "Cannot read properties of undefined (reading 'dispose')"
useHead(() => ({ title: q.value ? `${q.value} - ${t("messages.search.pageTitle")}` : t("messages.search.pageTitle") }));

/** 分段筛选：all / product / knowledge */
type Segment = "all" | "product" | "knowledge";
const segment = ref<Segment>("all");
/** 知识态类型 chips（多选，空 = 全部知识类型） */
const CONTENT_TYPES = ["article", "faq", "tutorial", "case", "download"] as const;
const activeTypes = ref<string[]>([]);

const filter = computed(() => {
  if (segment.value === "product") return 'type = "product"';
  if (segment.value === "knowledge") {
    return activeTypes.value.length
      ? `type IN [${activeTypes.value.map((x) => `"${x}"`).join(",")}]`
      : 'type != "product"';
  }
  return undefined;
});

// ---------- 首屏（SSR）：q/filter 变化自动重取并重置追加列表 ----------
// 注意：不能把 data 拷进 ref 渲染（SSR 期间 watch 在 await 后不 flush，会渲染成初始空值）。
// 首屏 hits/total 用 computed 直读 asyncData；「加载更多」的追加项单独存 appended，q/filter 变化时清空。
const { data, pending, searchOnce } = useKbSearch(
  () => ({ q: q.value, filter: filter.value, limit: PAGE_SIZE, offset: 0, sort: SORT }),
  { key: "kb-search-page", watch: [q, filter] },
);

const appended = ref<KbHit[]>([]);
/** 加载更多后以该响应的 estimatedTotalHits 为准（null = 尚未追加过） */
const appendedTotal = ref<number | null>(null);
watch([q, filter], () => {
  appended.value = [];
  appendedTotal.value = null;
});

const hits = computed<KbHit[]>(() => [...(data.value?.hits ?? []), ...appended.value]);
const total = computed(() => appendedTotal.value ?? data.value?.estimatedTotalHits ?? 0);

// ---------- 加载更多（CSR 追加，不动首屏 useAsyncData） ----------
const loadingMore = ref(false);
const hasMore = computed(() => hits.value.length < total.value);
async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const res = await searchOnce({
      q: q.value,
      filter: filter.value,
      limit: PAGE_SIZE,
      offset: hits.value.length,
      sort: SORT,
    });
    if (res) {
      appended.value.push(...res.hits);
      appendedTotal.value = res.estimatedTotalHits;
    }
  } finally {
    loadingMore.value = false;
  }
}

function toggleType(type: string) {
  const i = activeTypes.value.indexOf(type);
  if (i >= 0) activeTypes.value.splice(i, 1);
  else activeTypes.value.push(type);
}

const segmentItems = computed(() => [
  { value: "all", label: t("messages.search.all") },
  { value: "product", label: t("messages.search.products") },
  { value: "knowledge", label: t("messages.search.knowledge") },
] as const);

const isProduct = (hit: KbHit) => hit.type === "product";
</script>

<template>
  <main class="container my-14">
    <div class="mx-auto max-w-2xl">
      <h1 class="text-2xl font-semibold">{{ $t("messages.search.pageTitle") }}</h1>

      <!-- 分段筛选 + 知识类型 chips（无 q 时整体隐藏，仅显示提示） -->
      <div v-if="q" class="mt-4 mb-6 space-y-3">
        <UTabs
          v-model="segment"
          :items="segmentItems.map((s) => ({ value: s.value, label: s.label }))"
          size="sm"
        />
        <div v-if="q && segment === 'knowledge'" class="flex flex-wrap gap-2">
          <UButton
            v-for="ty in CONTENT_TYPES"
            :key="ty"
            size="xs"
            :color="activeTypes.includes(ty) ? 'primary' : 'neutral'"
            :variant="activeTypes.includes(ty) ? 'soft' : 'outline'"
            :label="$t(kbTypeLabelKey(ty))"
            @click="toggleType(ty)"
          />
        </div>
      </div>

      <!-- 搜索词 + 结果计数 -->
      <p v-if="q" class="mb-4 text-sm text-(--ui-text-muted)">
        {{ $t("messages.search.resultCount", { count: total, q }) }}
      </p>

      <!-- 空态 / 加载中 -->
      <p v-if="!q" class="py-10 text-center text-sm text-(--ui-text-muted)">
        {{ $t("messages.search.inputHint") }}
      </p>
      <p v-else-if="pending" class="py-10 text-center text-sm text-(--ui-text-muted)">
        {{ $t("messages.search.searching") }}
      </p>
      <div v-else-if="!hits.length" role="alert" class="py-10 text-center">
        <p class="text-sm text-(--ui-text-muted)">{{ $t("messages.search.empty") }}</p>
        <p class="mt-1 text-sm text-(--ui-text-muted)">{{ $t("messages.search.emptyHint") }}</p>
      </div>

      <!-- 结果列表 -->
      <ul v-else class="grid gap-3">
        <li v-for="item in hits" :key="item.id">
          <!-- 商品卡片：缩略图 + 高亮标题 + 价格 -->
          <UButton
            v-if="isProduct(item)"
            variant="outline"
            :to="localePath(`/product/${item.slug}`)"
            external
            class="w-full"
          >
            <span class="flex w-full items-center gap-3 py-1 text-left">
              <img
                v-if="item.thumbnail"
                :src="assetSrc(item.thumbnail, 128)"
                :alt="item.title"
                class="size-14 shrink-0 rounded object-cover"
              />
              <span class="min-w-0 flex-1">
                <span class="line-clamp-2" v-html="item._formatted?.title || item.title"></span>
                <span v-if="item.price != null" class="mt-1 block text-sm font-medium text-primary">
                  {{ formatCents(item.price) }}
                </span>
              </span>
            </span>
          </UButton>

          <!-- 知识内容卡片：类型徽标 + 高亮标题 + 摘片 + 日期 -->
          <UButton v-else variant="outline" :to="localePath(`/kb/${item.type}/${item.sourceId}`)" class="w-full">
            <span class="flex w-full flex-col items-start gap-1 py-1 text-left">
              <span class="flex w-full items-center gap-2">
                <UBadge color="neutral" variant="soft" class="shrink-0">
                  {{ $t(kbTypeLabelKey(item.type)) }}
                </UBadge>
                <span class="min-w-0 flex-1 truncate" v-html="item._formatted?.title || item.title"></span>
                <span class="shrink-0 text-xs text-(--ui-text-muted)">
                  {{ $t("messages.search.updatedAt", { date: kbFormatDate(item.updatedAt) }) }}
                </span>
              </span>
              <span
                v-if="item._formatted?.body || item.body"
                class="line-clamp-2 text-sm font-normal text-(--ui-text-muted)"
                v-html="item._formatted?.body || item.body"
              ></span>
            </span>
          </UButton>
        </li>
      </ul>

      <!-- 加载更多 -->
      <div v-if="q && hits.length" class="mt-6 text-center">
        <UButton
          v-if="hasMore"
          variant="soft"
          :loading="loadingMore"
          :label="$t('messages.search.loadMore')"
          @click="loadMore"
        />
        <p v-else class="text-sm text-(--ui-text-muted)">{{ $t("messages.search.noMore") }}</p>
      </div>
    </div>
  </main>
</template>
