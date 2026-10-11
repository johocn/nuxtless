<script setup lang="ts">
// 预订改期弹层（P4 Task 16）：选新入离日期 → 拉改期报价（房态/差价）→ 确认提交。
// 等价/退差直接完成；补差沿用原订单支付方式（即时结算直接完成，异步支付在途后服务端事件自动收口）。
const { t, locale } = useI18n();
const gql = useGql();
const toast = useToast();

const props = defineProps<{
  booking: {
    id: number | string;
    checkIn: string;
    checkOut: string;
  };
  /** 原订单支付方式 code（补差收款渠道；无支付记录时为 null → 后端校验报错兜底） */
  paymentMethod: string | null;
}>();

const isOpen = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ done: [] }>();

interface QuoteNight {
  date: string;
  remaining: number | null;
  closed: boolean;
  feasible: boolean;
}
interface RescheduleQuote {
  bookingId: string;
  eligible: boolean;
  reason: string | null;
  message: string | null;
  oldCheckIn: string;
  oldCheckOut: string;
  newCheckIn: string;
  newCheckOut: string;
  nights: number;
  oldTotalCent: number;
  newTotalCent: number | null;
  diffCent: number | null;
  refundCent: number | null;
  supplementCent: number | null;
  availability: QuoteNight[];
}

const checkIn = ref("");
const checkOut = ref("");
const quote = ref<RescheduleQuote | null>(null);
const quoting = ref(false);
const submitting = ref(false);

const today = new Date();
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// 日期边界：最早明天；最远 1 年（后端 advanceDays/连住上下限二次校验，前端从宽）
const minDate = toDateStr(new Date(today.getTime() + 86400000));
const maxDate = toDateStr(new Date(today.getTime() + 365 * 86400000));

const nights = computed(() => {
  if (!checkIn.value || !checkOut.value) return 0;
  return Math.round(
    (new Date(`${checkOut.value}T00:00:00`).getTime() - new Date(`${checkIn.value}T00:00:00`).getTime()) /
      86400000,
  );
});
/** 本地前置校验：日期齐 + 离店晚于入住；提前期/连住上限等交给后端报价 reason */
const canQuery = computed(() => nights.value >= 1);
const dirty = computed(
  () => checkIn.value !== props.booking.checkIn || checkOut.value !== props.booking.checkOut,
);

const money = (c: number | null | undefined) =>
  c == null
    ? "--"
    : new Intl.NumberFormat(locale.value, { style: "currency", currency: "CNY" }).format(c / 100);

/** 原支付方式展示名（复用订单支付方式 i18n map；无映射回退 code） */
const methodLabel = computed(() => {
  const m = props.paymentMethod;
  if (!m) return "";
  const label = t(`messages.order.paymentMethods.${m}`);
  return label.includes("paymentMethods.") ? m : label;
});

const reasonKey = (r: string) =>
  "messages.order.hotelRescheduleReason" + r.charAt(0).toUpperCase() + r.slice(1);
const blockedNights = computed(() =>
  quote.value ? quote.value.availability.filter((n) => !n.feasible).map((n) => n.date.slice(5)) : [],
);

async function fetchQuote() {
  if (!canQuery.value) return;
  quote.value = null;
  quoting.value = true;
  try {
    const res: any = await gql("GetHotelBookingRescheduleQuote", {
      id: String(props.booking.id),
      checkIn: checkIn.value,
      checkOut: checkOut.value,
    });
    quote.value = res?.hotelBookingRescheduleQuote ?? null;
  } catch (e: any) {
    toast.add({ title: e?.gqlErrors?.[0]?.message ?? e?.message ?? "error", color: "error" });
  } finally {
    quoting.value = false;
  }
}

watch([checkIn, checkOut], () => {
  // 日期变更后旧报价失效
  quote.value = null;
});

function onCheckInChange() {
  if (!checkIn.value) return;
  // 离店 ≤ 入住时自动顺延原晚数
  if (!checkOut.value || checkOut.value <= checkIn.value) {
    const d = new Date(`${props.booking.checkIn}T00:00:00`);
    const n = Math.max(
      1,
      Math.round(
        (new Date(`${props.booking.checkOut}T00:00:00`).getTime() - d.getTime()) / 86400000,
      ),
    );
    checkOut.value = toDateStr(new Date(new Date(`${checkIn.value}T00:00:00`).getTime() + n * 86400000));
  }
}

async function onSubmit() {
  if (!quote.value?.eligible || submitting.value) return;
  submitting.value = true;
  try {
    const res: any = await gql("RescheduleMyHotelBooking", {
      id: String(props.booking.id),
      checkIn: checkIn.value,
      checkOut: checkOut.value,
      paymentMethod: props.paymentMethod ?? null,
    });
    const r = res?.rescheduleMyHotelBooking;
    if (r?.applied) {
      toast.add({ title: t("messages.order.hotelRescheduleSuccess"), color: "success" });
    } else {
      // 异步补差在途：支付完成后服务端事件自动收口
      toast.add({ title: t("messages.order.hotelReschedulePending"), color: "info" });
    }
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
      <h3 class="mb-1 text-lg font-semibold">{{ t("messages.order.hotelRescheduleTitle") }}</h3>
      <p class="mb-3 text-xs text-neutral-500">{{ t("messages.order.hotelRescheduleOnceHint") }}</p>

      <!-- ① 选日期 -->
      <p class="mb-2 text-sm font-medium">{{ t("messages.order.hotelReschedulePickDates") }}</p>
      <div class="mb-3 flex items-center gap-2">
        <label class="flex-1">
          <span class="text-xs text-neutral-500">{{ t("messages.order.hotelCheckinLabel") }}</span>
          <input
            v-model="checkIn"
            type="date"
            class="mt-1 block w-full rounded-lg border border-neutral-200 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            :min="minDate"
            :max="maxDate"
            @change="onCheckInChange"
          />
        </label>
        <span class="mt-4 text-xs text-neutral-400">→</span>
        <label class="flex-1">
          <span class="text-xs text-neutral-500">{{ t("messages.order.hotelCheckoutLabel") }}</span>
          <input
            v-model="checkOut"
            type="date"
            class="mt-1 block w-full rounded-lg border border-neutral-200 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            :min="minDate"
            :max="maxDate"
          />
        </label>
      </div>

      <button
        type="button"
        class="mb-3 w-full rounded-full bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        :disabled="!canQuery || quoting"
        @click="fetchQuote"
      >
        {{ t("messages.order.hotelRescheduleQuery") }}
      </button>

      <!-- ② 报价结果 -->
      <div v-if="quoting" class="py-6 text-center text-sm text-neutral-500">
        {{ t("messages.order.hotelRescheduleLoading") }}
      </div>
      <template v-else-if="quote">
        <div v-if="!quote.eligible" class="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          <p>{{ t(reasonKey(quote.reason ?? "")) }}</p>
          <p v-if="blockedNights.length" class="mt-1 text-xs">
            {{ t("messages.order.hotelRescheduleSoldOutDates", { dates: blockedNights.join("、") }) }}
          </p>
        </div>
        <div v-else class="rounded-xl bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
          <p class="text-xs text-neutral-500">
            {{ t("messages.order.hotelNightsRooms", { n: quote.nights, r: 1 }) }}
          </p>
          <div class="mt-1 flex items-center justify-between">
            <span class="text-neutral-500">{{ t("messages.order.hotelRescheduleOldTotal") }}</span>
            <span>{{ money(quote.oldTotalCent) }}</span>
          </div>
          <div class="flex items-center justify-between font-semibold">
            <span>{{ t("messages.order.hotelRescheduleNewTotal") }}</span>
            <span>{{ money(quote.newTotalCent) }}</span>
          </div>
          <p
            v-if="(quote.diffCent ?? 0) > 0"
            class="mt-1 text-orange-600 dark:text-orange-400"
          >
            {{ t("messages.order.hotelRescheduleDiffSupplement", { amount: money(quote.diffCent), method: methodLabel }) }}
          </p>
          <p v-else-if="(quote.diffCent ?? 0) < 0" class="mt-1 text-brand-700 dark:text-brand-500">
            {{ t("messages.order.hotelRescheduleDiffRefund", { amount: money(-(quote.diffCent ?? 0)) }) }}
          </p>
          <p v-else class="mt-1 text-xs text-neutral-500">
            {{ t("messages.order.hotelRescheduleDiffEquiv") }}
          </p>
        </div>
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
          type="button"
          class="flex-1 rounded-full bg-brand-600 py-2 text-sm font-medium text-white disabled:opacity-40"
          :disabled="!quote?.eligible || submitting"
          @click="onSubmit"
        >
          {{ t("messages.order.hotelRescheduleConfirm") }}
        </button>
      </div>
    </template>
  </UModal>
</template>
