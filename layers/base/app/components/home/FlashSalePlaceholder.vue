<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <section class="mb-12 rounded-lg bg-brand-50 p-6">
    <h2 class="text-xl font-semibold text-brand-600">{{ t("messages.home.flashSale") }}</h2>
    <p class="mt-1 text-sm text-neutral-500">{{ t("messages.home.flashSaleSoon") }}</p>
  </section>
</template>
