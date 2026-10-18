<script setup lang="ts">
definePageMeta({ title: "messages.couponStore.blockedTitle" });
const { t } = useI18n();
const localePath = useTenantLocalePath();
const { customFields } = useChannelTheme();
const shopName = computed(() => customFields.value?.shopName || "");
</script>

<template>
  <main class="mx-auto my-16 w-full max-w-md px-4 text-center">
    <UIcon name="i-lucide-ticket" class="mx-auto h-12 w-12 text-(--ui-primary)" />
    <h1 class="mt-4 text-lg font-semibold">
      {{ shopName ? `${shopName} · ` : "" }}{{ t("messages.couponStore.blockedTitle") }}
    </h1>
    <p class="mt-2 text-sm text-(--ui-text-muted)">{{ t("messages.couponStore.blockedDesc") }}</p>
    <UButton class="mt-6" :to="localePath('/')">{{ t("messages.couponStore.backHome") }}</UButton>
  </main>
</template>
