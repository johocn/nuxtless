<script setup lang="ts">
// 协议页：服务条款 / 隐私政策双 tab。
// 文案来自 GetShopGlobalConfig.defaults.agreement（后端 seed 的纯文本，\n 分段），
// 经 useThemeConfig 在 SSR 侧取数；客户端 tab 切换仅 router.replace 同步 URL，不整页刷新。
import { toContentLang } from "../utils/content-lang";

definePageMeta({ title: "用户协议" });

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const { globalConfig } = useThemeConfig();

// ---------- 纯函数：协议数据解析（SSR 安全，字段缺失一律返回 null，不抛异常） ----------
interface AgreementContent {
  service?: Record<string, string> | null;
  privacy?: Record<string, string> | null;
  updatedAt?: string | null;
}

/** 从全局配置 defaults JSON 中安全取 agreement 对象；缺失/非普通对象返回 null */
function parseAgreement(
  defaults: Record<string, any> | null | undefined,
): AgreementContent | null {
  const raw = defaults?.agreement;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as AgreementContent)
    : null;
}

/** 文案回退链：当前内容语言 → zh-CN → 对象内第一个非空值；全缺失返回 null（由 i18n 占位文案兜底） */
function pickLocalizedText(
  map: Record<string, string> | null | undefined,
  contentLang: string,
): string | null {
  if (!map || typeof map !== "object") return null;
  const chain = [map[contentLang], map["zh-CN"], ...Object.values(map)];
  for (const v of chain) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** updatedAt 仅接受 YYYY-MM-DD 开头的日期串并截取日期部分；非法/缺失返回 null（徽章不渲染） */
function parseUpdatedDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}/.test(raw.trim()) ? raw.trim().slice(0, 10) : null;
}

// ---------- 取数与派生状态 ----------
const agreement = computed(() => parseAgreement(globalConfig.value?.defaults));
const contentLang = computed(() => toContentLang(locale.value));
const updatedAt = computed(() => parseUpdatedDate(agreement.value?.updatedAt));

// ---------- tab 状态：URL query.type 为唯一事实源（?type=privacy，默认 service） ----------
const activeTab = ref<string>(
  route.query.type === "privacy" ? "privacy" : "service",
);

const tabItems = computed(() => [
  { value: "service", label: t("messages.agreement.serviceTab") },
  { value: "privacy", label: t("messages.agreement.privacyTab") },
]);

// tab → URL：客户端切换用 replace 同步 query（service 为默认值时不带 type 参数），避免整页刷新
watch(activeTab, (v) => {
  const current = route.query.type === "privacy" ? "privacy" : "service";
  if (current === v) return;
  router.replace({
    query: { ...route.query, type: v === "privacy" ? "privacy" : undefined },
  });
});

// URL → tab：浏览器前进/后退或外链带参进入时同步 tab 状态
watch(
  () => route.query.type,
  (v) => {
    activeTab.value = v === "privacy" ? "privacy" : "service";
  },
);

// ---------- 正文：按回退链取文本，纯文本按 \n 拆段渲染（禁止 v-html） ----------
const paragraphs = computed<string[]>(() => {
  const map =
    activeTab.value === "privacy"
      ? agreement.value?.privacy
      : agreement.value?.service;
  const text = pickLocalizedText(map, contentLang.value);
  if (text) return text.split("\n").map((s) => s.trim()).filter(Boolean);
  return [
    activeTab.value === "privacy"
      ? t("messages.agreement.fallbackPrivacy")
      : t("messages.agreement.fallbackService"),
  ];
});

useHead(() => ({ title: t("messages.agreement.pageTitle") }));
</script>

<template>
  <main class="container my-14">
    <div class="mx-auto max-w-2xl">
      <h1 class="text-2xl font-semibold">{{ t("messages.agreement.pageTitle") }}</h1>
      <UBadge
        v-if="updatedAt"
        variant="soft"
        size="sm"
        icon="i-lucide-calendar"
        class="mt-3"
        :label="t('messages.agreement.updatedAtLabel', { date: updatedAt })"
      />
      <UTabs v-model="activeTab" :items="tabItems" class="mt-4 mb-6" />
      <article class="space-y-4 text-sm leading-relaxed text-(--ui-text-muted)">
        <p v-for="(p, i) in paragraphs" :key="i">{{ p }}</p>
      </article>
    </div>
  </main>
</template>
