<script setup lang="ts">
/**
 * 售后单协商留言卡（三期 §二）：留言按 createdAt 正序气泡展示，顾客右/商家左。
 * Closed 后只读（隐藏输入区）；图片复用 EvidenceUploader（≤3 张，同一上传通道）。
 */
const props = defineProps<{ request: { id: string; state: string } }>();
const { t } = useI18n();
const { fetchMessages, addMessage } = useAfterSales();
const toast = useToast();

interface Msg {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  images?: string[] | null;
  createdAt: string;
}

const TAKE = 50;
const items = ref<Msg[]>([]);
const total = ref(0);
const listLoading = ref(false);
const readonly = computed(() => props.request.state === "Closed");

async function load() {
  listLoading.value = true;
  try {
    const res = await fetchMessages(props.request.id);
    items.value = res.items as Msg[];
    total.value = res.totalItems;
  } finally {
    listLoading.value = false;
  }
}

/** 加载更多：正序排列，已有条数即 skip 向后翻页 */
const hasMore = computed(() => items.value.length < total.value);
async function loadMore() {
  const res = await fetchMessages(props.request.id, items.value.length, TAKE);
  items.value = [...items.value, ...(res.items as Msg[])];
  total.value = res.totalItems;
}

const content = ref("");
const images = ref<string[]>([]);
const sending = ref(false);
// 与 AfterSalesCreateModal 相同的 exposed 访问模式（defineExpose 已解包 ref）
const uploaderRef = ref<{ hasPending: boolean; hasFailed: boolean } | null>(null);

async function onSend() {
  if (!content.value.trim() && !images.value.length) return;
  if (uploaderRef.value?.hasPending) {
    toast.add({ title: t("messages.afterSales.errUploading"), color: "warning" });
    return;
  }
  if (uploaderRef.value?.hasFailed) {
    toast.add({ title: t("messages.afterSales.errUploadFailed"), color: "warning" });
    return;
  }
  sending.value = true;
  try {
    const res = await addMessage(props.request.id, content.value.trim(), images.value);
    if (res.ok) {
      content.value = "";
      images.value = [];
      await load();
    }
  } finally {
    sending.value = false;
  }
}

function fmt(v: string): string {
  return v?.slice(0, 16).replace("T", " ") ?? "";
}

onMounted(load);
</script>

<template>
  <section class="mb-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
    <h2 class="mb-3 text-sm font-medium text-neutral-500">{{ t("messages.afterSales.messagesTitle") }}</h2>

    <p v-if="!items.length && !listLoading" class="py-2 text-sm text-neutral-400">
      {{ t("messages.afterSales.messagesEmpty") }}
    </p>

    <div class="space-y-3">
      <div
        v-for="m in items"
        :key="m.id"
        class="flex flex-col"
        :class="m.senderType === 'customer' ? 'items-end' : 'items-start'"
      >
        <p class="mb-1 text-xs text-neutral-400">{{ m.senderName }} · {{ fmt(m.createdAt) }}</p>
        <div
          class="max-w-[80%] rounded-xl px-3 py-2 text-sm"
          :class="m.senderType === 'customer'
            ? 'bg-primary text-white'
            : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100'"
        >
          <p class="whitespace-pre-line break-all">{{ m.content }}</p>
          <div v-if="m.images?.length" class="mt-2 flex flex-wrap gap-2">
            <img
              v-for="(img, i) in m.images"
              :key="i"
              :src="img"
              :alt="t('messages.afterSales.messagesTitle')"
              class="h-16 w-16 rounded object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>

    <UButton
      v-if="hasMore"
      variant="ghost"
      block
      class="mt-3"
      :label="t('messages.afterSales.messagesLoadMore')"
      @click="loadMore"
    />

    <template v-if="!readonly">
      <div class="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <UTextarea
          v-model="content"
          :placeholder="t('messages.afterSales.messagesPlaceholder')"
          :rows="2"
          autoresize
          class="w-full"
        />
        <div class="mt-2 flex items-end justify-between gap-3">
          <div class="w-40">
            <AfterSalesEvidenceUploader ref="uploaderRef" v-model="images" :max="3" />
          </div>
          <UButton
            :loading="sending"
            :disabled="!content.trim() && !images.length"
            :label="t('messages.afterSales.messagesSend')"
            @click="onSend"
          />
        </div>
      </div>
    </template>
    <p v-else class="mt-3 text-xs text-neutral-400">{{ t("messages.afterSales.messagesClosedReadonly") }}</p>
  </section>
</template>
