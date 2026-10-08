<script setup lang="ts">
definePageMeta({ middleware: "account" });

const { t } = useI18n();
const localePath = useTenantLocalePath();
const code = useRouteParam("code");

const { data, error, refresh } = await useAsyncGql("GetOrderByCode", { code });

const order = computed(() => data.value?.orderByCode ?? null);

// --- 售后申请逻辑 ---
import { canApplyAfterSales } from "../../../utils/after-sales-state";
import type { OrderLine } from "~~/types/order";

const applyModalOpen = ref(false);
const applyLine = ref<OrderLine | null>(null);

const hasError = computed(() => !!error.value || !order.value);

// --- 支付计划（ScheduleBar / 首笔款弹窗）---
import type { PaymentScheduleItem } from "~~/types/payment-schedule";

const { schedule, fetchSchedule } = usePaymentSchedule();
const scheduleDialogOpen = ref(false);
const scheduleSeq = ref<number | undefined>(undefined);

function openScheduleDialog(item: PaymentScheduleItem) {
  scheduleSeq.value = item.seq;
  scheduleDialogOpen.value = true;
}

/** 弹窗支付成功 / 计划条直付成功 → 刷新计划与订单状态 */
async function onScheduleChanged() {
  if (order.value) await fetchSchedule(order.value.id);
  await refresh();
}

onMounted(async () => {
  if (!order.value) return;
  const s = await fetchSchedule(order.value.id);
  if (!s) return;
  // 首个 payable 的首笔款期次自动弹一次弹窗（按 orderId 防重，会话内只提醒一次）
  const key = `scheduleDialogShown:${order.value.id}`;
  const first = s.items.find(i => i.status === "payable" && i.seq === 1);
  if (first && !sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    scheduleSeq.value = first.seq;
    scheduleDialogOpen.value = true;
  }
});
</script>

<template>
  <UError
    v-if="hasError"
    :error="{
      statusCode: 404,
      statusMessage: t('messages.error.noOrder'),
      message: t('messages.error.orderNotFound'),
    }"
  />
  <main v-else-if="order" class="container mb-14">
    <header class="my-14 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ t("messages.shop.orderDetails") }}</h1>
      <ULink :to="localePath('/account/orders')" class="text-sm text-neutral-500">
        {{ t("messages.account.orders") }}
      </ULink>
    </header>

    <OrderDetailRenderer :order="order" :refresh="refresh">
      <template #line-actions="{ line, order: o }">
        <UButton
          v-if="canApplyAfterSales(o.state)"
          size="xs"
          variant="soft"
          color="primary"
          icon="i-lucide-receipt"
          :label="t('messages.afterSales.apply')"
          class="shrink-0"
          @click="applyLine = line; applyModalOpen = true"
        />
      </template>
    </OrderDetailRenderer>

    <ScheduleBar :order-id="order.id" :schedule="schedule" @pay="openScheduleDialog" @refresh="onScheduleChanged" />

    <ScheduleDialog v-model:open="scheduleDialogOpen" :order-id="order.id" :seq="scheduleSeq" @paid="onScheduleChanged" />

    <AfterSalesCreateModal
      v-if="applyLine"
      v-model:open="applyModalOpen"
      :order-id="order.id"
      :order-line="applyLine"
      :max-amount="applyLine.proratedLinePrice"
    />
  </main>
</template>