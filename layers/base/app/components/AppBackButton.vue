<script setup lang="ts">
// 全局可复用「返回上级」按钮：有浏览历史时 router.back()，无历史回退到 :to（默认首页）。
const router = useRouter();
const localePath = useTenantLocalePath();
const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    /** 无浏览历史时的回退目标路径（相对应用根，如 "/"） */
    to?: string;
    /** 自定义文案；缺省取通用词条「返回」 */
    label?: string;
  }>(),
  { to: "/", label: "" },
);

function goBack() {
  const isBrowser = typeof window !== "undefined";
  if (isBrowser && window.history.length > 1) {
    router.back();
    return;
  }
  void router.push(localePath(props.to));
}
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 transition hover:text-primary-600 dark:text-neutral-300 dark:hover:text-primary-400"
    @click="goBack"
  >
    <UIcon name="i-lucide:arrow-left" class="size-4 shrink-0" />
    <span>{{ label || t("messages.general.back") }}</span>
  </button>
</template>