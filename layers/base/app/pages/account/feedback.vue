<script setup lang="ts">
// 意见反馈页：需登录（account middleware，参考 pages/account/index.vue）。
// 列表/提交走 useFeedback 运行时字符串查询（带登录态 Bearer，与 useInbox 同款姿势）；
// 数据在客户端 onMounted 拉取（SSR 拿不到会话 cookie 的场景可接受），首屏加载成功后幂等标记全部已读（失败静默）。
// 响应按 unknown + 防御式解析（参考 faq.vue），接口异常显示占位文案不白屏。
import { createFeedback, fetchMyFeedbacks, markFeedbacksRead } from "../../composables/useFeedback";

definePageMeta({ middleware: "account" });

const { t, locale } = useI18n();
const toast = useToast();

useHead(() => ({ title: t("messages.feedback.pageTitle") }));

// ---------- 类型与常量 ----------
/** 列表条目（防御式可选字段：后端字段异常时不抛错，统一过滤兜底） */
interface FeedbackItem {
  id?: string | number | null;
  title?: string | null;
  content?: string | null;
  status?: string | null;
  reply?: string | null;
  repliedAt?: string | number | null;
  createdAt?: string | number | null;
}

/** 列表单页条数（与定稿 mockup 一致：首次 take=20，底部加载更多） */
const PAGE_SIZE = 20;
const MAX_TITLE = 20;
const MAX_CONTACT = 30;

/** 反馈类型选项集与 vshop 反馈页一致（bug/experience/other）；后端无白名单校验，缺省 other */
const TYPE_KEYS = ["bug", "experience", "other"] as const;

/** 状态徽章三色系（codebase 现有色系）：待处理灰 / 处理中橙 / 已解决绿 */
const STATUS_META: Record<string, { color: "neutral" | "warning" | "success"; labelKey: string }> = {
  pending: { color: "neutral", labelKey: "messages.feedback.statusPending" },
  processing: { color: "warning", labelKey: "messages.feedback.statusProcessing" },
  resolved: { color: "success", labelKey: "messages.feedback.statusResolved" },
};

// ---------- 取数与防御式解析（纯函数，SSR 安全，不抛异常） ----------
const items = ref<FeedbackItem[]>([]);
const totalItems = ref(0);
const listLoading = ref(true);
const listError = ref(false);
const loadingMore = ref(false);

/** 从响应中安全解析反馈列表：结构异常返回空数组，title/content 为空的条目直接过滤 */
function parseFeedbacks(raw: unknown): FeedbackItem[] {
  const list = (raw as { items?: unknown } | null | undefined)?.items;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (it): it is FeedbackItem =>
      !!it &&
      typeof it === "object" &&
      typeof (it as FeedbackItem).title === "string" &&
      !!(it as FeedbackItem).title?.trim() &&
      typeof (it as FeedbackItem).content === "string" &&
      !!(it as FeedbackItem).content?.trim(),
  );
}

/** 从响应中安全解析 totalItems：非法/缺失返回 0 */
function parseTotal(raw: unknown): number {
  const n = Number((raw as { totalItems?: unknown } | null | undefined)?.totalItems);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** 日期展示：与 codebase 现有 Intl 本地化格式一致（非法/缺失返回空串） */
function formatDateTime(v?: string | number | null): string {
  if (v === null || v === undefined || v === "") return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(locale.value);
}

async function loadFirstPage() {
  listLoading.value = true;
  listError.value = false;
  try {
    const raw = await fetchMyFeedbacks(0, PAGE_SIZE);
    items.value = parseFeedbacks(raw);
    totalItems.value = parseTotal(raw);
    // 进入页面标记全部已读（幂等；失败静默，不影响列表展示）
    markFeedbacksRead().catch(() => {});
  } catch {
    items.value = [];
    totalItems.value = 0;
    listError.value = true;
  } finally {
    listLoading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || items.value.length >= totalItems.value) return;
  loadingMore.value = true;
  try {
    const raw = await fetchMyFeedbacks(items.value.length, PAGE_SIZE);
    const next = parseFeedbacks(raw);
    // 按 id 去重追加，防止分页窗口移动导致重复渲染
    const seen = new Set(items.value.map((it) => String(it.id)));
    items.value = [...items.value, ...next.filter((it) => !seen.has(String(it.id)))];
    totalItems.value = parseTotal(raw);
  } catch {
    // 加载更多失败静默，保留现有列表
  } finally {
    loadingMore.value = false;
  }
}

onMounted(loadFirstPage);

// ---------- 列表视图模型：徽章/回复/日期统一在此解析，模板保持薄 ----------
const hasMore = computed(() => items.value.length < totalItems.value);

const viewItems = computed(() =>
  items.value.map((it, i) => {
    const meta = STATUS_META[typeof it.status === "string" ? it.status : ""] ?? null;
    return {
      key: it.id != null && it.id !== "" ? `fb-${it.id}` : `fb-idx-${i}`,
      title: (it.title ?? "").trim(),
      content: (it.content ?? "").trim(),
      badge: meta ? { color: meta.color, label: t(meta.labelKey) } : null,
      createdAt: formatDateTime(it.createdAt),
      reply: typeof it.reply === "string" ? it.reply.trim() : "",
      repliedAt: formatDateTime(it.repliedAt),
    };
  }),
);

// ---------- 新建反馈表单（UModal 弹窗，不跳页） ----------
const createOpen = ref(false);
const submitType = ref<string | undefined>(undefined);
const submitTitle = ref("");
const submitContent = ref("");
const submitContact = ref("");
const submitting = ref(false);

const typeItems = computed(() =>
  TYPE_KEYS.map((k) => ({
    label: t(`messages.feedback.type${k.charAt(0).toUpperCase()}${k.slice(1)}`),
    value: k,
  })),
);

const canSubmit = computed(
  () => !!submitTitle.value.trim() && !!submitContent.value.trim() && !submitting.value,
);

function resetForm() {
  submitType.value = undefined;
  submitTitle.value = "";
  submitContent.value = "";
  submitContact.value = "";
  submitting.value = false;
}

// 打开弹窗时重置全部字段（避免残留上次填写内容）
watch(createOpen, (open) => {
  if (open) resetForm();
});

async function onSubmit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    await createFeedback({
      type: submitType.value || undefined,
      title: submitTitle.value.trim(),
      content: submitContent.value.trim(),
      contactWay: submitContact.value.trim() || undefined,
    });
    createOpen.value = false;
    resetForm();
    toast.add({ title: t("messages.feedback.submitSuccess"), color: "success" });
    await loadFirstPage();
  } catch {
    // 提交失败弹层不关闭，保留已填内容，仅 toast 提示
    toast.add({ title: t("messages.feedback.submitFailed"), color: "error" });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="container my-14">
    <div class="mx-auto max-w-2xl">
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-semibold">{{ t("messages.feedback.pageTitle") }}</h1>
        <UButton color="primary" :label="t('messages.feedback.newBtn')" @click="createOpen = true" />
      </div>

      <!-- 加载骨架 -->
      <div v-if="listLoading" class="space-y-4 py-8">
        <div
          v-for="i in 3"
          :key="i"
          class="h-20 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900"
        />
      </div>

      <template v-else>
        <!-- 反馈列表 -->
        <div v-if="viewItems.length" class="mt-6 space-y-4">
          <article
            v-for="it in viewItems"
            :key="it.key"
            class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div class="flex items-start justify-between gap-3">
              <h2 class="min-w-0 break-words text-base font-medium">{{ it.title }}</h2>
              <UBadge
                v-if="it.badge"
                :color="it.badge.color"
                variant="soft"
                size="sm"
                :label="it.badge.label"
              />
            </div>
            <p class="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-(--ui-text-muted)">
              {{ it.content }}
            </p>
            <p v-if="it.createdAt" class="mt-2 text-xs text-neutral-400">{{ it.createdAt }}</p>

            <!-- 商家回复：soft 背景卡片，视觉上与正文区分 -->
            <div v-if="it.reply" class="mt-3 rounded-md bg-primary/5 p-3">
              <p class="text-xs font-medium text-primary">{{ t("messages.feedback.replyTitle") }}</p>
              <p class="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{{ it.reply }}</p>
              <p v-if="it.repliedAt" class="mt-1 text-xs text-neutral-400">{{ it.repliedAt }}</p>
            </div>
          </article>

          <!-- 加载更多 / 没有更多 -->
          <div class="pt-2 text-center">
            <UButton
              v-if="hasMore"
              variant="soft"
              :loading="loadingMore"
              :label="t('messages.feedback.loadMore')"
              @click="loadMore"
            />
            <p v-else class="text-xs text-neutral-400">{{ t("messages.feedback.noMore") }}</p>
          </div>
        </div>

        <!-- 空态 / 加载异常占位 -->
        <p v-else class="py-10 text-center text-sm text-(--ui-text-muted)">
          {{ listError ? t("messages.feedback.loadFailed") : t("messages.feedback.empty") }}
        </p>
      </template>
    </div>

    <!-- 新建反馈弹窗（注意：UModal 默认插槽是触发器，表单必须放 #body） -->
    <UModal v-model:open="createOpen" :ui="{ content: 'sm:max-w-lg' }">
      <template #body>
        <h3 class="mb-4 text-lg font-semibold">{{ t("messages.feedback.newBtn") }}</h3>

        <p class="mb-2 text-sm font-medium">{{ t("messages.feedback.typeLabel") }}</p>
        <USelect
          v-model="submitType"
          :items="typeItems"
          variant="outline"
          :placeholder="t('messages.feedback.typePlaceholder')"
          class="mb-4 w-full"
        />

        <p class="mb-2 text-sm font-medium">
          {{ t("messages.feedback.titleLabel") }} <span class="text-error">*</span>
        </p>
        <div class="relative mb-4">
          <input
            v-model="submitTitle"
            :maxlength="MAX_TITLE"
            :placeholder="t('messages.feedback.titlePlaceholder')"
            class="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span class="pointer-events-none absolute bottom-2 right-2 text-xs text-neutral-400">
            {{ t("messages.feedback.countHint", { count: submitTitle.length, max: MAX_TITLE }) }}
          </span>
        </div>

        <p class="mb-2 text-sm font-medium">
          {{ t("messages.feedback.contentLabel") }} <span class="text-error">*</span>
        </p>
        <textarea
          v-model="submitContent"
          rows="5"
          :placeholder="t('messages.feedback.contentPlaceholder')"
          class="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
        />

        <p class="mb-2 text-sm font-medium">{{ t("messages.feedback.contactLabel") }}</p>
        <input
          v-model="submitContact"
          :maxlength="MAX_CONTACT"
          :placeholder="t('messages.feedback.contactPlaceholder')"
          class="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
        />
      </template>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="ghost" :label="t('messages.feedback.cancel')" @click="createOpen = false" />
          <UButton
            color="primary"
            :loading="submitting"
            :disabled="!canSubmit"
            :label="t('messages.feedback.submit')"
            @click="onSubmit"
          />
        </div>
      </template>
    </UModal>
  </main>
</template>

<style lang="css" scoped></style>
