<script setup lang="ts">
import {
  getMyMessages,
  markMessageRead,
  type MyMessage,
} from "~~/layers/base/app/composables/useMessages";

definePageMeta({ title: "消息中心" });

const { t } = useI18n();
const localePath = useTenantLocalePath();
const { isAuthenticated } = storeToRefs(useAuthStore());

const list = ref<MyMessage[]>([]);
const loading = ref(false);

async function load() {
  if (!isAuthenticated.value) return;
  loading.value = true;
  try {
    list.value = await getMyMessages();
  } finally {
    loading.value = false;
  }
}

async function read(m: MyMessage) {
  if (m.readAt) return;
  m.readAt = new Date().toISOString();
  try {
    await markMessageRead(m.id);
  } catch {
    /* 标记已读失败不打断浏览 */
  }
}

onMounted(load);
</script>

<template>
  <main class="container my-14">
    <template v-if="!isAuthenticated">
      <div class="flex flex-col items-center gap-4 py-16">
        <p class="text-(--ui-text-muted)">{{ t("messages.coupon.loginPrompt") }}</p>
        <UButton :to="localePath('/account/login')">{{ t("messages.coupon.goLogin") }}</UButton>
      </div>
    </template>
    <div v-else class="mx-auto max-w-2xl">
      <h1 class="mb-6 text-2xl font-semibold">{{ t("messages.account.messages") }}</h1>
      <div v-if="list.length" class="space-y-3">
        <div
          v-for="m in list"
          :key="m.id"
          class="rounded-xl border p-4"
          :class="m.readAt ? 'border-(--ui-border)' : 'border-(--ui-primary)'"
          @click="read(m)"
        >
          <div class="flex items-center justify-between">
            <p class="font-semibold">{{ m.title }}</p>
            <span v-if="!m.readAt" class="h-2 w-2 shrink-0 rounded-full bg-(--ui-error)" />
          </div>
          <p class="mt-1 whitespace-pre-line text-sm text-(--ui-text-muted)">{{ m.body }}</p>
          <p class="mt-2 text-xs text-(--ui-text-muted)">
            {{ m.createdAt?.slice(0, 16).replace("T", " ") }}
          </p>
        </div>
      </div>
      <p v-else>{{ t("messages.account.noMessages") }}</p>
    </div>
  </main>
</template>