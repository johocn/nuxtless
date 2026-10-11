<script setup lang="ts">
// 预订取消确认弹层（P4 Task 16）：打开时拉取消报价，按 mode 展示退款/扣款口径，确认后调取消 mutation。
// mode = free（窗口内全额退）| partial（扣首晚退余款）| forfeit（扣全款）| unpaid（未付款直接取消）| blocked（引导联系酒店）
const { t, locale } = useI18n();
const gql = useGql();
const toast = useToast();

const props = defineProps<{
  booking: { id: number | string; status: string };
}>();

const isOpen = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ done: [] }>();

interface CancelQuote {
  bookingId: string;
  mode: "free" | "partial" | "forfeit" | "unpaid" | "blocked";
  free: boolean;
  cancellable: boolean;
  refundCent: number;
  feeCent: number;
  totalCent: number;
  paidCent: number;
  firstNightFeeCent: number;
  deadline: string | null;
}

const quote = ref<CancelQuote | null>(null);
const loading = ref(false);
const submitting = ref(false);

const money = (c: number) =>
  new Intl.NumberFormat(locale.value, { style: "currency", currency: "CNY" }).format((c || 0) / 100);

const modeKey = (m: string) => "messages.order.hotelCancelMode" + m.charAt(0).toUpperCase() + m.slice(1);
const modeCls = (m: string) =>
  m === "free" || m === "unpaid"
    ? "text-brand-700 dark:text-brand-500"
    : m === "blocked"
      ? "text-neutral-500"
      : "text-orange-600";

async function fetchQuote() {
  quote.value = null;
  loading.value = true;
  try {
    const res: any = await gql("GetHotelBookingCancelQuote", { id: String(props.booking.id) });
    quote.value = res?.hotelBookingCancelQuote ?? null;
  } catch (e: any) {
    toast.add({ title: e?.gqlErrors?.[0]?.message ?? e?.message ?? "error", color: "error" });
    isOpen.value = false;
  } finally {
    loading.value = false;
  }
}

watch(isOpen, (v) => {
  if (v) fetchQuote();
});

async function onConfirm() {
  if (!quote.value || submitting.value) return;
  submitting.value = true;
  try {
    await gql("CancelMyHotelBooking", { id: String(props.booking.id), reason: null });
    toast.add({ title: t("messages.order.hotelCancelSuccess"), color: "success" });
    isOpen.value = false;
    emit("done");
  } catch (e: any) {
    toast.add({ title: e?.gqlErrors?.[0]?.message ?? e?.message ?? "error", color: "error" });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #body>
      <h3 class="mb-3 text-lg font-semibold">{{ t("messages.order.hotelCancelTitle") }}</h3>

      <div v-if="loading" class="py-8 text-center text-sm text-neutral-500">
        {{ t("messages.order.hotelRescheduleLoading") }}
      </div>

      <template v-else-if="quote">
        <!-- 退款/扣款口径 -->
        <div class="rounded-xl bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
          <p class="font-medium" :class="modeCls(quote.mode)">{{ t(modeKey(quote.mode), { amount: money(quote.refundCent), fee: money(quote.feeCent) }) }}</p>
          <p class="mt-1 text-xs text-neutral-500">
            {{ t("messages.order.hotelRescheduleOldTotal") }}：{{ money(quote.paidCent || quote.totalCent) }}
          </p>
        </div>
        <p class="mt-3 text-xs text-neutral-500">{{ t("messages.order.hotelCancelIrreversible") }}</p>
      </template>
    </template>

    <template #footer>
      <div class="flex w-full gap-2">
        <button
          type="button"
          class="flex-1 rounded-full border border-neutral-300 py-2 text-sm font-medium dark:border-neutral-700"
          @click="isOpen = false"
        >
          {{ t("messages.order.hotelActionBack") }}
        </button>
        <button
          v-if="quote && quote.mode !== 'blocked'"
          type="button"
          class="flex-1 rounded-full bg-red-600 py-2 text-sm font-medium text-white disabled:opacity-50"
          :disabled="loading || submitting"
          @click="onConfirm"
        >
          {{ t("messages.order.hotelCancelConfirm") }}
        </button>
      </div>
    </template>
  </UModal>
</template>
