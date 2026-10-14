<script setup lang="ts">
// 知识内容详情页（P2）：/kb/[type]/[id]，robots 无特别限制（内容型页面可被收录）。
// 数据直取 Meili 文档（useKbDocument，id 构造 `${type}-${sourceId}-${zh|en}`），无新后端。
// 版式：类型徽标 + 更新时间 + 标题 + 正文（\n 分段）+ 相关内容推荐（同 type 最新 2 篇，排除自身）。
// type=product 恒 404（商品走 /product/[slug]）；伪 id / 已删文档 404。
import { kbFormatDate, kbTypeLabelKey } from "../../../composables/useKbSearch";

definePageMeta({
  title: "知识内容",
  // 关键：/kb 内跳转（如相关内容推荐）复用组件实例，必须按 fullPath 强制 remount，
  // 否则 useAsyncData key 不变、route.params 变化后展示上一篇的陈旧数据
  key: (route) => route.fullPath,
});

const route = useRoute();
const { t } = useI18n();
const localePath = useTenantLocalePath();

const type = () => String(route.params.type ?? "");
const docId = () => String(route.params.id ?? "");

// ---------- 正文文档（SSR） ----------
const { data: doc } = await useKbDocument(type, docId, { key: "kb-doc-page" });
if (!doc.value) {
  throw createError({ statusCode: 404, statusMessage: t("messages.kb.notFound"), fatal: true });
}

// ---------- 相关内容：同 type 按 updatedAt 倒序取 3，排除自身后取 2 ----------
const related = await useKbSearch(
  () => ({ q: "", filter: `type = "${type()}"`, sort: ["updatedAt:desc"], limit: 3 }),
  { key: "kb-related" },
);
const relatedHits = computed(() =>
  (related.data.value?.hits ?? []).filter((h) => h.id !== doc.value?.id).slice(0, 2),
);

// 正文按 \n 拆段纯文本渲染（同 faq.vue 惯例，禁 v-html：正文非高亮字段）
const paragraphs = computed(() =>
  (doc.value?.body ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean),
);

useHead(() => ({ title: doc.value?.title || t("messages.kb.knowledgeBase") }));
</script>

<template>
  <main v-if="doc" class="container my-14">
    <div class="mx-auto max-w-2xl">
      <!-- 头部：类型徽标 + 更新时间 -->
      <div class="flex items-center gap-2 text-sm text-(--ui-text-muted)">
        <UBadge color="neutral" variant="soft">{{ $t(kbTypeLabelKey(doc.type)) }}</UBadge>
        <span>{{ $t("messages.search.updatedAt", { date: kbFormatDate(doc.updatedAt) }) }}</span>
      </div>

      <h1 class="mt-3 text-2xl font-semibold">{{ doc.title }}</h1>

      <!-- 正文（纯文本分段） -->
      <div class="mt-6 space-y-3 text-sm leading-relaxed">
        <p v-for="(p, i) in paragraphs" :key="i">{{ p }}</p>
      </div>

      <!-- 相关内容推荐 -->
      <section v-if="relatedHits.length" class="mt-10">
        <h2 class="text-base font-semibold">{{ $t("messages.search.related") }}</h2>
        <ul class="mt-3 grid gap-2">
          <li v-for="item in relatedHits" :key="item.id">
            <UButton
              variant="outline"
              :to="localePath(`/kb/${item.type}/${item.sourceId}`)"
              class="w-full"
            >
              <span class="flex w-full items-center gap-3 py-1 text-left">
                <UBadge color="neutral" variant="soft" class="shrink-0">
                  {{ $t(kbTypeLabelKey(item.type)) }}
                </UBadge>
                <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
                <span class="shrink-0 text-xs text-(--ui-text-muted)">
                  {{ $t("messages.search.updatedAt", { date: kbFormatDate(item.updatedAt) }) }}
                </span>
              </span>
            </UButton>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
