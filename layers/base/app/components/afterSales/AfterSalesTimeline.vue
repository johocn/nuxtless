<script setup lang="ts">
import { AFTER_SALES_PROGRESS, afterSalesProgressIndex } from "../../utils/after-sales-state";

interface TimelineRequest {
  state: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  refundedAt?: string | null;
  refundAmount: number;
  actualRefundAmount?: number | null;
  rejectReason?: string | null;
  returnCarrier?: string | null;
  returnTrackingNo?: string | null;
  receivedQuantity?: number | null;
  history?: { fromState?: string | null; toState: string; createdAt: string }[] | null;
}

const props = defineProps<{ request: TimelineRequest; returnAddress?: string | null }>();
const { t, locale } = useI18n();

const STEP_LABEL_KEY: Record<string, string> = {
  Pending: "messages.afterSales.stepPending",
  Approved: "messages.afterSales.stepApproved",
  Returning: "messages.afterSales.stepReturning",
  Received: "messages.afterSales.stepReceived",
  Refunded: "messages.afterSales.stepRefunded",
};

interface Node {
  key: string;
  label: string;
  time: string | null;
  timeIsRecent: boolean;
  detail: string | null;
  reached: boolean;
  current: boolean;
  failed: boolean;
}

function fmt(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(locale.value);
}

function fmtShort(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 节点精确时间：取该状态最后一次历史行 */
function historyTime(state: string): string | null {
  const rows = (props.request.history ?? []).filter((h) => h.toState === state);
  return rows.length ? fmtShort(rows[rows.length - 1].createdAt) : null;
}

const nodes = computed<Node[]>(() => {
  const r = props.request;
  const doneIndex = afterSalesProgressIndex(r.state);
  const list: Node[] = AFTER_SALES_PROGRESS.map((state, i) => {
    const isCurrent = i === doneIndex && r.state === state;
    let time: string | null = null;
    const ht = historyTime(state);
    if (state === "Pending") time = ht ?? (r.createdAt ? fmt(r.createdAt) : null);
    else if (state === "Refunded") time = ht ?? (r.refundedAt ? fmt(r.refundedAt) : null);
    else if (ht) time = ht;
    if (!time && isCurrent && r.updatedAt) time = fmt(r.updatedAt);
    return {
      key: state,
      label: t(STEP_LABEL_KEY[state] ?? ""),
      time,
      timeIsRecent: isCurrent && !!r.updatedAt && !ht,
      detail:
        state === "Returning" && (r.returnCarrier || r.returnTrackingNo)
          ? `${r.returnCarrier ?? ""} ${r.returnTrackingNo ?? ""}`.trim()
          : state === "Approved" && props.returnAddress
            ? t("messages.afterSales.returnAddressSeeAbove")
            : null,
      reached: i <= doneIndex,
      current: isCurrent,
      failed: false,
    };
  });

  if (r.state === "RefundFailed") {
    list.push({
      key: "RefundFailed",
      label: t("messages.afterSales.stateRefundFailed"),
      time: historyTime("RefundFailed") ?? fmt(r.updatedAt),
      timeIsRecent: true,
      detail: null,
      reached: true,
      current: true,
      failed: true,
    });
  } else if (r.state === "Rejected") {
    list.push({
      key: "Rejected",
      label: t("messages.afterSales.stateRejected"),
      time: historyTime("Rejected") ?? fmt(r.updatedAt),
      timeIsRecent: true,
      detail: r.rejectReason ?? null,
      reached: true,
      current: true,
      failed: true,
    });
  } else if (r.state === "Closed") {
    list.push({
      key: "Closed",
      label: t("messages.afterSales.stateClosed"),
      time: historyTime("Closed") ?? fmt(r.updatedAt),
      timeIsRecent: true,
      detail: null,
      reached: true,
      current: true,
      failed: false,
    });
  }
  return list;
});
</script>

<template>
  <ol class="mb-6">
    <li v-for="(n, i) in nodes" :key="n.key" class="flex gap-3">
      <div class="flex flex-col items-center">
        <span
          class="mt-1 h-3 w-3 shrink-0 rounded-full"
          :class="
            n.failed
              ? 'bg-error'
              : n.reached
                ? 'bg-primary'
                : 'border border-neutral-300 bg-transparent dark:border-neutral-700'
          "
        />
        <span
          v-if="i < nodes.length - 1"
          class="w-px flex-1"
          :class="n.reached && nodes[i + 1]?.reached ? 'bg-primary' : 'bg-neutral-200 dark:bg-neutral-800'"
        />
      </div>
      <div class="pb-5">
        <p
          class="text-sm"
          :class="n.reached ? 'font-medium' : 'text-neutral-400'"
        >
          {{ n.label }}
        </p>
        <p v-if="n.time" class="mt-0.5 text-xs text-neutral-500">
          {{ n.time }}
          <span v-if="n.timeIsRecent" class="ml-1 text-neutral-400">
            （{{ t("messages.afterSales.updatedAt") }}）
          </span>
        </p>
        <p v-if="n.detail" class="mt-0.5 text-xs" :class="n.failed ? 'text-error' : 'text-neutral-500'">
          {{ n.detail }}
        </p>
      </div>
    </li>
  </ol>
</template>
