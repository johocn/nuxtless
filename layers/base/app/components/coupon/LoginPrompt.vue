<script setup lang="ts">
const { t } = useI18n();
const localePath = useTenantLocalePath();
</script>

<template>
  <div class="flex flex-col items-center gap-4 py-16">
    <p class="text-(--ui-text-muted)">{{ t("messages.coupon.loginPrompt") }}</p>
    <UButton :to="localePath('/account/login')">{{ t("messages.coupon.goLogin") }}</UButton>
  </div>
</template>
