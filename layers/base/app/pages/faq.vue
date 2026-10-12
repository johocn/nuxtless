<script setup lang="ts">
// 常见问题页：公开页（无需登录、无 account middleware）。
// SSR 一次拉全部分类 FAQ（不传 type）+ 当前内容语言；七个 tab 纯客户端过滤，不逐 tab 发请求。
// 列表用 UAccordion 手风琴渲染，正文按 \n 拆段纯文本展示（禁止 v-html）。
import { toContentLang } from "../utils/content-lang";

definePageMeta({ title: "常见问题" });

const { t, locale } = useI18n();

// ---------- 类型与常量 ----------
/** FAQ 条目（防御式可选字段：后端字段异常时不抛错，统一过滤兜底） */
interface FaqItem {
  id?: string | null;
  title?: string | null;
  content?: string | null;
  type?: string | null;
  sort?: number | string | null;
}

/** 六个 FAQ 分类键，与后端约定一致 */
const FAQ_TYPES = ["general", "order", "pay", "afterSale", "account", "register"] as const;

// ---------- 取数：SSR 拉全量；lang 为 computed 变量，useAsyncGql 内部会把它加入 useAsyncData 的 watch，locale 切换时自动重取 ----------
const contentLang = computed(() => toContentLang(locale.value));
const { data, error } = await useAsyncGql("Faqs", { lang: contentLang });

// ---------- 纯函数：响应解析与排序（SSR 安全，不抛异常） ----------
/** 从响应中安全解析 FAQ 列表：结构异常返回空数组，title/content 为空的条目直接过滤 */
function parseFaqs(raw: unknown): FaqItem[] {
  const list = (raw as { faqs?: unknown } | null | undefined)?.faqs;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (it): it is FaqItem =>
      !!it &&
      typeof it === "object" &&
      typeof (it as FaqItem).title === "string" &&
      !!(it as FaqItem).title?.trim() &&
      typeof (it as FaqItem).content === "string" &&
      !!(it as FaqItem).content?.trim(),
  );
}

/** sort 字段转有限数字；非法/缺失返回 null（排序时垫底） */
function toSortNumber(v: number | string | null | undefined): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 排序比较器：sort 升序，缺失垫底，同 sort 按 id 字典序保证稳定 */
function compareFaqs(a: FaqItem, b: FaqItem): number {
  const sa = toSortNumber(a.sort);
  const sb = toSortNumber(b.sort);
  if (sa === null || sb === null) {
    if (sa === null && sb === null) {
      return String(a.id ?? "") < String(b.id ?? "") ? -1 : 1;
    }
    return sa === null ? 1 : -1;
  }
  if (sa !== sb) return sa - sb;
  return String(a.id ?? "") < String(b.id ?? "") ? -1 : 1;
}

/** 正文按 \n 拆段为纯文本段落数组 */
function splitParagraphs(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- tab 状态与客户端过滤（数据一次拉全，切换 tab 不发请求） ----------
const activeTab = ref<string>("all");

const tabItems = computed(() => [
  { value: "all", label: t("messages.faq.tabAll") },
  ...FAQ_TYPES.map((type) => ({
    value: type,
    // 分类键 → i18n 键：general → tabGeneral、afterSale → tabAfterSale
    label: t(`messages.faq.tab${type.charAt(0).toUpperCase()}${type.slice(1)}`),
  })),
]);

const visibleFaqs = computed<FaqItem[]>(() => {
  const list = parseFaqs(data.value);
  const filtered =
    activeTab.value === "all" ? list : list.filter((f) => f.type === activeTab.value);
  return [...filtered].sort(compareFaqs);
});

// ---------- 手风琴数据源：value 用 id 保证唯一稳定，id 缺失时用索引兜底 ----------
const accordionItems = computed(() =>
  visibleFaqs.value.map((f, i) => ({
    value: f.id ? `faq-${f.id}` : `faq-idx-${i}`,
    label: (f.title ?? "").trim(),
    content: (f.content ?? "").trim(),
  })),
);

useHead(() => ({ title: t("messages.faq.pageTitle") }));
</script>

<template>
  <main class="container my-14">
    <div class="mx-auto max-w-2xl">
      <h1 class="text-2xl font-semibold">{{ t("messages.faq.pageTitle") }}</h1>
      <UTabs v-model="activeTab" :items="tabItems" class="mt-4 mb-6" />
      <UAccordion v-if="accordionItems.length" :items="accordionItems">
        <template #body="{ item }">
          <div class="space-y-2 text-sm leading-relaxed text-(--ui-text-muted)">
            <p v-for="(p, i) in splitParagraphs(item.content ?? '')" :key="i">{{ p }}</p>
          </div>
        </template>
      </UAccordion>
      <p v-else class="py-10 text-center text-sm text-(--ui-text-muted)">
        {{ error ? t("messages.faq.loadFailed") : t("messages.faq.empty") }}
      </p>
    </div>
  </main>
</template>
