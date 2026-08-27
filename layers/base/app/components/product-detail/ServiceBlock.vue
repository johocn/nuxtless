<script setup lang="ts">
// 服务/保障条：固定文案走 i18n messages.detail（缺失自动回退 default locale）
const { t } = useI18n();
const items = computed(() => t("messages.detail.serviceItems")); // string[]，随 locale 变化
</script>

<template>
  <div class="flex gap-3 border-y border-gray-100 py-2 text-xs text-gray-500">
    <span v-for="it in items" :key="it" class="flex items-center gap-1">
      <UIcon name="i-lucide-check-circle-2" class="text-primary" />
      {{ it }}
    </span>
  </div>
</template>