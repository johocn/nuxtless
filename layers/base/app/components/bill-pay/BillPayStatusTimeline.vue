<script setup lang="ts">
import type { BillPayOrder } from "~~/layers/base/app/composables/useBillPay";

/**
 * 状态时间线（委托单详情页）：按状态推进展示关键节点与时间。
 * CANCELLED/REFUNDED 为终态分支，单独渲染原因色。
 */
const props = defineProps<{ order: BillPayOrder }>();

const { t, locale } = useI18n();

interface Step {
  key: string;
  label: string;
  time?: string | null;
  state: "done" | "active" | "todo";
}

const fmtTime = (v?: string | null) => (v ? new Date(v).toLocaleString() : null);

const steps = computed<Step[]>(() => {
  const o = props.order;
  const label = (k: string) => t(`messages.billpay.step${k}`);
  const closedKey = o.status === "CANCELLED" ? "Cancelled" : "Refunded";

  // 终态分支（取消/退款）：已提交 → 已报价（到达过）→ 终态
  if (o.status === "CANCELLED" || o.status === "REFUNDED") {
    return [
      { key: "Submitted", label: label("Submitted"), time: fmtTime(o.createdAt), state: "done" },
      { key: "Quoted", label: label("Quoted"), time: null, state: o.status === "REFUNDED" ? "done" : "todo" },
      {
        key: closedKey,
        label: t(`messages.billpay.status${o.status}`),
        time: fmtTime(o.refundedAt ?? o.updatedAt),
        state: "active",
      },
    ];
  }

  // 正向链：当前及之前 done，当前 active，之后 todo
  const chain: { key: string; time?: string | null }[] = [
    { key: "Submitted", time: o.createdAt },
    { key: "Quoted", time: null },
    { key: "Paid", time: o.paidAt },
    { key: "InService", time: null },
    { key: "Completed", time: o.completedAt },
    { key: "Settled", time: o.settledAt },
  ];
  const keys = ["PENDING_QUOTE", "QUOTED", "PAID", "IN_SERVICE", "COMPLETED", "SETTLED"];
  const idx = keys.indexOf(o.status);
  return chain.map((c, i) => ({
    key: c.key,
    label: label(c.key),
    time: fmtTime(c.time),
    state: i < idx ? "done" : i === idx ? "active" : "todo",
  }));
});
</script>

<template>
  <div class="tl">
    <div v-for="(s, i) in steps" :key="s.key" class="tl-row">
      <div class="tl-rail">
        <span class="tl-dot" :class="`tl-${s.state}`" />
        <span v-if="i < steps.length - 1" class="tl-line" :class="{ 'tl-line-done': s.state === 'done' }" />
      </div>
      <div class="tl-body">
        <div class="tl-label" :class="{ 'tl-label-active': s.state === 'active' }">{{ s.label }}</div>
        <div v-if="s.time" class="tl-time">{{ s.time }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tl { display: flex; flex-direction: column; }
.tl-row { display: flex; gap: 10px; }
.tl-rail { display: flex; flex-direction: column; align-items: center; width: 14px; flex: none; }
.tl-dot { width: 10px; height: 10px; border-radius: 999px; margin-top: 5px; flex: none; }
.tl-done { background: var(--ui-primary); }
.tl-active { background: var(--ui-bg); border: 2px solid var(--ui-primary); width: 9px; height: 9px; }
.tl-todo { background: var(--ui-border); }
.tl-line { width: 2px; flex: 1; min-height: 18px; background: var(--ui-border); }
.tl-line-done { background: var(--ui-primary); }
.tl-body { padding-bottom: 14px; min-width: 0; }
.tl-label { font-size: 14px; color: var(--ui-text-muted); }
.tl-label-active { color: var(--ui-text); font-weight: 600; }
.tl-time { margin-top: 2px; font-size: 12px; color: var(--ui-text-muted); }
</style>
