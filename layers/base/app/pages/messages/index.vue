<script setup lang="ts">
import {
  getMyMessages,
  markMessageRead,
  type MyMessage,
} from "~~/layers/base/app/composables/useMessages";
import {
  getMyInbox,
  markInboxRead,
  type InboxItem,
} from "~~/layers/base/app/composables/useInbox";

definePageMeta({ title: "消息中心" });

const { t } = useI18n();
const localePath = useTenantLocalePath();
const router = useRouter();
const { isAuthenticated } = storeToRefs(useAuthStore());

interface FeedItem {
  key: string; // inbox:<id> | msg:<id>
  source: "inbox" | "msg";
  id: string;
  title: string;
  body: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

const list = ref<FeedItem[]>([]);
const loading = ref(false);

function toFeed(messages: MyMessage[], inbox: InboxItem[]): FeedItem[] {
  const items: FeedItem[] = [
    ...inbox.map((m) => ({
      key: `inbox:${m.id}`, source: "inbox" as const, id: m.id,
      title: m.title, body: m.content, link: m.link ?? null, isRead: m.isRead, createdAt: m.createdAt,
    })),
    ...messages.map((m) => ({
      key: `msg:${m.id}`, source: "msg" as const, id: m.id,
      title: m.title, body: m.body, link: null, isRead: !!m.readAt, createdAt: m.createdAt,
    })),
  ];
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function load() {
  if (!isAuthenticated.value) return;
  loading.value = true;
  try {
    const [messages, inbox] = await Promise.all([
      getMyMessages().catch(() => [] as MyMessage[]),
      getMyInbox().catch(() => [] as InboxItem[]),
    ]);
    list.value = toFeed(messages, inbox);
  } finally {
    loading.value = false;
  }
}

async function markRead(item: FeedItem) {
  item.isRead = true;
  try {
    if (item.source === "inbox") await markInboxRead(item.id);
    else await markMessageRead(item.id);
  } catch {
    /* 标记已读失败不打断浏览 */
  }
}

async function read(item: FeedItem) {
  // 售后等带跳转链接的通知：直达目标页（如 /account/after-sales/{id}）
  if (item.link) {
    if (!item.isRead) void markRead(item);
    router.push(localePath(item.link));
    return;
  }
  if (item.isRead) return;
  await markRead(item);
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
          :key="m.key"
          class="rounded-xl border p-4"
          :class="m.isRead ? 'border-(--ui-border)' : 'border-(--ui-primary)'"
          @click="read(m)"
        >
          <div class="flex items-center justify-between">
            <p class="font-semibold">{{ m.title }}</p>
            <span v-if="!m.isRead" class="h-2 w-2 shrink-0 rounded-full bg-(--ui-error)" />
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
