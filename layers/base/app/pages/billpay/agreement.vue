<script setup lang="ts">
import { UButton } from "#components";

/**
 * 《委托服务协议》页（t3 代买单合规收口）：
 * 六节全文（服务性质 / 服务对价 / 代办身份与凭证 / 退款规则 / 限额与风控 / 禁止用途）。
 * ?from=submit 时底部固定「同意并返回」：置共享 useState('billpay-agreed') 后返回提交页，
 * 提交表单 onMounted 读取该 state 回填协议勾选（同 tab 内流转，共享 state 才生效）。
 */
definePageMeta({ title: "messages.billpayAgreement.title" });

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const localePath = useTenantLocalePath();

const agreed = useState("billpay-agreed", () => false);
const fromSubmit = computed(() => route.query.from === "submit");

const sections = computed(() =>
  [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t(`messages.billpayAgreement.s${n}Title`),
    body: t(`messages.billpayAgreement.s${n}Body`),
  })),
);

function goBack() {
  if (fromSubmit.value) navigateTo(localePath("/billpay"));
  else router.back();
}

function agreeAndReturn() {
  agreed.value = true;
  navigateTo(localePath("/billpay"));
}
</script>

<template>
  <main class="mx-auto my-4 w-full max-w-3xl px-3 pb-40">
    <!-- 顶栏：返回 + 标题 + 生效日期徽章 -->
    <div class="mb-3 flex items-center gap-2">
      <UButton variant="ghost" size="xs" icon="i-lucide-arrow-left" @click="goBack" />
      <h1 class="min-w-0 flex-1 truncate text-lg font-semibold">
        {{ t("messages.billpayAgreement.title") }}
      </h1>
      <span class="effective-badge">{{ t("messages.billpayAgreement.effectiveBadge") }}</span>
    </div>

    <!-- 六节全文 -->
    <section v-for="(s, i) in sections" :key="i" class="agree-panel">
      <h2 class="agree-title">{{ s.title }}</h2>
      <p class="agree-body">{{ s.body }}</p>
    </section>

    <p class="agree-tail">{{ t("messages.billpayAgreement.tail") }}</p>

    <!-- from=submit：底部固定「同意并返回」 -->
    <div v-if="fromSubmit" class="agree-bar">
      <UButton block size="lg" @click="agreeAndReturn">
        {{ t("messages.billpayAgreement.agreeAndReturn") }}
      </UButton>
    </div>
  </main>
</template>

<style scoped>
.effective-badge { flex: none; border-radius: 999px; background: var(--ui-bg-muted); padding: 4px 10px; font-size: 11px; color: var(--ui-text-muted); white-space: nowrap; }
.agree-panel { border-radius: 14px; background: var(--ui-bg); border: 1px solid var(--ui-border); margin-bottom: 10px; padding: 14px 16px; }
.agree-title { font-size: 14px; font-weight: 700; color: var(--ui-text-highlighted); }
.agree-body { margin-top: 8px; font-size: 13px; line-height: 1.8; color: var(--ui-text-muted); }
.agree-tail { padding: 4px 2px; font-size: 12px; line-height: 1.7; color: var(--ui-text-muted); }
.agree-bar { position: fixed; inset-inline: 0; bottom: 0; z-index: 70; background: var(--ui-bg); border-top: 1px solid var(--ui-border); margin-inline: auto; max-width: 48rem; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); }
</style>
