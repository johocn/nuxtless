<script setup lang="ts">
import type { PaymentSchedule, PaymentScheduleItem } from "~~/types/payment-schedule";

/**
 * 支付计划条（通用组件，设计 §9）：预订/分期/租赁复用，期次行动态展开。
 * - locked：显示触发条件（日期 / 周期到期 / 成团 / 手动开启）
 * - payable：「在线支付」；首笔款期次 emit pay（页面打开 ScheduleDialog 明示罚则），
 *   其余期次直接 payPeriod；allowCod 期次附「货到付款」
 * - overdue / forfeited / breached：违约提示按场景展示法律后果
 * props:
 * - orderId：订单 id
 * - schedule：外部已取到的计划（页面传入则不再自取；外部刷新后本组件自动跟随）
 * - payMethod：在线支付 PaymentMethod code（默认 cloud-payment-template，
 *   按租户接入的支付模板经 props 覆盖；对接收银台组件后替换为实际选择逻辑）
 */
const props = withDefaults(
  defineProps<{ orderId: string; schedule?: PaymentSchedule | null; payMethod?: string }>(),
  { schedule: null, payMethod: "cloud-payment-template" },
);
const emit = defineEmits<{ (e: "pay", item: PaymentScheduleItem): void; (e: "refresh"): void }>();

const { t } = useI18n();
const toast = useToast();
const { loading, error, schedule: localSchedule, fetchSchedule: localFetch, payPeriod } = usePaymentSchedule();

const expanded = ref(false);
const sched = computed<PaymentSchedule | null>(() => props.schedule ?? localSchedule.value);

onMounted(() => {
  if (!props.schedule) localFetch(props.orderId);
});

const topItems = computed(() => (sched.value?.items ?? []).slice(0, 2));
const restItems = computed(() => (sched.value?.items ?? []).slice(2));

/** 是否首笔款期次（押金/首付性质）——需弹窗明示罚则 */
function isFirstPayment(i: PaymentScheduleItem) {
  return i.seq === 1 && ["deposit", "down_payment"].includes(i.kind);
}

const breachNotice = computed(() => {
  switch (sched.value?.breachType) {
    case "buyer_timeout": return t("messages.schedule.breachBuyerTimeout");
    case "seller_breach": return t("messages.schedule.breachSellerBreach");
    case "group_buy_failed": return t("messages.schedule.breachGroupBuyFailed");
    default: return "";
  }
});

function kindLabel(i: PaymentScheduleItem) {
  const map: Record<string, string> = {
    deposit: "messages.schedule.kindDeposit",
    balance: "messages.schedule.kindBalance",
    down_payment: "messages.schedule.kindDownPayment",
    installment: "messages.schedule.kindInstallment",
    rent: "messages.schedule.kindRent",
    buyout: "messages.schedule.kindBuyout",
  };
  return t(map[i.kind] ?? "messages.schedule.kindBalance");
}

function statusLabel(i: PaymentScheduleItem) {
  return t(`messages.schedule.status.${i.status}`);
}

function triggerLabel(i: PaymentScheduleItem): string {
  const tr = i.trigger;
  if (!tr) return "";
  switch (tr.type) {
    case "date": return t("messages.schedule.triggerDate", { date: fmtDate(tr.at) });
    case "interval":
      return t("messages.schedule.triggerInterval", { unit: t(`messages.schedule.unit.${tr.unit}`), date: i.dueAt ? fmtDate(i.dueAt) : "-" });
    case "group_buy": return t("messages.schedule.triggerGroupBuy");
    case "manual": return t("messages.schedule.triggerManual");
    default: return "";
  }
}

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yuan(amount: number) {
  return (amount / 100).toFixed(2);
}

function onPayClick(i: PaymentScheduleItem) {
  if (isFirstPayment(i)) {
    emit("pay", i); // 页面打开 ScheduleDialog（seq）
  } else {
    pay(i, props.payMethod);
  }
}

async function pay(i: PaymentScheduleItem, method: string) {
  const updated = await payPeriod(props.orderId, i.seq, method);
  if (updated) {
    toast.add({ title: t("messages.schedule.paidSuccess"), color: "success" });
    emit("refresh"); // 页面刷新计划与订单状态（props.schedule 更新后本组件跟随）
  }
}
</script>

<template>
  <section v-if="sched" class="my-4 rounded-xl border border-neutral-200 bg-white p-4">
    <header class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold">{{ t("messages.schedule.title") }}</h2>
      <UBadge v-if="breachNotice" color="error" variant="soft">{{ breachNotice }}</UBadge>
    </header>

    <ul class="mt-1 divide-y divide-neutral-100">
      <li v-for="i in (expanded ? sched.items : topItems)" :key="i.id" class="flex items-center gap-3 py-3">
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-sm">
            <span class="font-medium">{{ kindLabel(i) }}</span>
            <UBadge
              size="xs"
              variant="subtle"
              :color="i.status === 'paid' ? 'success' : i.status === 'overdue' || i.status === 'forfeited' ? 'error' : i.status === 'payable' ? 'warning' : 'neutral'"
            >
              {{ statusLabel(i) }}
            </UBadge>
          </p>
          <p class="mt-0.5 text-xs text-neutral-500">
            ¥{{ yuan(i.amount) }}
            <template v-if="i.status === 'locked'"> · {{ triggerLabel(i) }}</template>
            <template v-else-if="i.status === 'payable' && i.dueAt"> · {{ t("messages.schedule.dueAt", { date: fmtDate(i.dueAt) }) }}</template>
          </p>
          <p v-if="i.status === 'overdue' && i.lateFeeAccrued > 0" class="mt-0.5 text-xs text-red-500">
            {{ t("messages.schedule.overdueNotice", { fee: yuan(i.lateFeeAccrued) }) }}
          </p>
          <p v-if="i.status === 'forfeited'" class="mt-0.5 text-xs text-red-500">{{ t("messages.schedule.forfeitNotice") }}</p>
          <p v-if="i.status === 'refunded'" class="mt-0.5 text-xs text-neutral-500">{{ t("messages.schedule.refundNotice") }}</p>
        </div>

        <div v-if="i.status === 'payable'" class="flex shrink-0 gap-2">
          <UButton size="xs" :loading="loading" :label="t('messages.schedule.payOnline')" @click="onPayClick(i)" />
          <UButton v-if="i.allowCod" size="xs" variant="soft" :label="t('messages.schedule.payCod')" @click="pay(i, 'cod-payment-template')" />
        </div>
      </li>
    </ul>

    <p v-if="error" class="mt-1 text-xs text-red-500">{{ error }}</p>

    <UButton v-if="restItems.length" variant="ghost" size="xs" class="mt-1 w-full justify-center" @click="expanded = !expanded">
      {{ expanded ? t("messages.schedule.expandLess") : t("messages.schedule.expandMore", { count: restItems.length }) }}
    </UButton>
  </section>
</template>
