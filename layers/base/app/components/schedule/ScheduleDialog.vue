<script setup lang="ts">
import type { PaymentSchedule, PaymentScheduleItem } from "~~/types/payment-schedule";

/**
 * 付首笔款弹窗（版式 A：结构化规则清单式，设计 §9）。
 * 仅用于首笔款期次（押金/定金/订金/首付）：罚则明示 + 协议勾选（agreementVersion 展示）后调 payPeriod。
 * props:
 * - orderId：订单 id
 * - seq：待支付期次 seq（不传则自动取首个 payable）
 * emit: paid(schedule) 支付成功
 */
const props = defineProps<{ orderId: string; seq?: number }>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ (e: "paid", schedule: PaymentSchedule): void }>();

const { t } = useI18n();
const toast = useToast();
const { loading, error, schedule, fetchSchedule, payPeriod } = usePaymentSchedule();

const agreed = ref(false);
const paying = ref(false);

const item = computed<PaymentScheduleItem | null>(() => {
  if (!schedule.value) return null;
  if (props.seq) return schedule.value.items.find(i => i.seq === props.seq) ?? null;
  return schedule.value.items.find(i => i.status === "payable") ?? null;
});

/** 性质徽章文案（depositRule.kind → i18n；无规则按尾款兜底） */
const badge = computed(() => {
  switch (schedule.value?.depositRule?.kind) {
    case "legal_deposit": return t("messages.schedule.badgeLegalDeposit");
    case "earnest": return t("messages.schedule.badgeEarnest");
    case "down_payment": return t("messages.schedule.badgeDownPayment");
    case "security_deposit": return t("messages.schedule.badgeSecurityDeposit");
    default: return t("messages.schedule.badgeBalance");
  }
});

/** 结构化规则（3-4 条，按 depositRule.kind 切换；团购触发追加全额退条款） */
const rules = computed<string[]>(() => {
  const s = schedule.value;
  if (!s) return [];
  const list: string[] = [t("messages.schedule.ruleWindow", { hours: item.value?.graceHours ?? 0 })];
  switch (s.depositRule?.kind) {
    case "legal_deposit":
      list.push(t("messages.schedule.ruleLegalDeposit"));
      break;
    case "earnest": {
      const p = s.depositRule?.earnestRefundPolicy;
      list.push(
        p?.onTimeout === "partial" && p.partialRate
          ? t("messages.schedule.ruleEarnestPartial", { rate: Math.round(p.partialRate * 100) })
          : t("messages.schedule.ruleEarnestFull"),
      );
      break;
    }
    case "security_deposit":
      list.push(t("messages.schedule.ruleDeposit"));
      break;
    default:
      list.push(t("messages.schedule.ruleDownPayment"));
  }
  if (s.items.some(i => i.trigger?.type === "group_buy")) {
    list.push(t("messages.schedule.ruleGroupBuy"));
  }
  return list;
});

watch(open, async v => {
  if (v) {
    agreed.value = false;
    await fetchSchedule(props.orderId);
  }
});

async function onPay() {
  if (!item.value) return;
  paying.value = true;
  const updated = await payPeriod(props.orderId, item.value.seq, "cloud-payment-template");
  paying.value = false;
  if (updated) {
    toast.add({ title: t("messages.schedule.paidSuccess"), color: "success" });
    emit("paid", updated);
    open.value = false;
  }
}

function yuan(amount: number) {
  return (amount / 100).toFixed(2);
}
</script>

<template>
  <UModal v-model:open="open">
    <UCard>
      <div v-if="!schedule || !item" class="py-8 text-center text-sm text-neutral-400">
        {{ t("messages.schedule.loading") }}
      </div>
      <template v-else>
        <div class="text-center">
          <UBadge :color="schedule.depositRule?.kind === 'legal_deposit' ? 'error' : 'primary'" variant="soft">
            {{ badge }}
          </UBadge>
          <p class="mt-3 text-3xl font-semibold">¥{{ yuan(item.amount) }}</p>
          <p class="mt-1 text-xs text-neutral-500">
            {{ t("messages.schedule.periodLabel", { seq: item.seq, total: schedule.items.length }) }}
          </p>
        </div>

        <ul class="mt-5 space-y-2 rounded-lg bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-600">
          <li v-for="(r, idx) in rules" :key="idx" class="flex gap-2">
            <UIcon name="i-lucide-info" class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{{ r }}</span>
          </li>
        </ul>

        <p class="mt-3 text-xs text-neutral-500">
          {{ t("messages.schedule.agreementTitle", { version: schedule.agreementVersion }) }}
        </p>
        <UCheckbox v-model="agreed" :label="t('messages.schedule.agreeCheckbox')" class="mt-2" />

        <p v-if="error" class="mt-2 text-xs text-red-500">{{ error }}</p>

        <UButton
          class="mt-4 w-full justify-center"
          :disabled="!agreed || paying || loading"
          :loading="paying"
          :label="t('messages.schedule.payNow')"
          @click="onPay"
        />
      </template>
    </UCard>
  </UModal>
</template>
