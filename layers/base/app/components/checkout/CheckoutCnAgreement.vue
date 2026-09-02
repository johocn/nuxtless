<script setup lang="ts">
// 中国本地化版式：提交前协议勾选（默认勾选）。未勾选时由吸底结算栏在提交前拦截并提示。
const { t } = useI18n();

// 协议勾选状态，供 CheckoutCnSummaryBar 读取拦截（通过 v-model 双向）
const accepted = defineModel<boolean>({ default: true });
</script>

<template>
  <label class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
    <UCheckbox v-model="accepted" size="sm" />
    <span>
      <span class="text-primary-600 dark:text-primary-300">{{ t("messages.checkout.cnAgreementTerms") }}</span>
      <span class="mx-0.5">{{ t("messages.general.and") }}</span>
      <span class="text-primary-600 dark:text-primary-300">{{ t("messages.checkout.cnAgreementPrivacy") }}</span>
      {{ t("messages.checkout.cnAgreementNotice") }}
    </span>
  </label>
</template>