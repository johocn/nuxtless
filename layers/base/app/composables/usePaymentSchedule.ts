import type { PaymentSchedule } from "~~/types/payment-schedule";

/**
 * 支付计划（期次调度）C 端状态与操作。
 * - fetchSchedule：拉取订单期次（无计划返回 null，订单详情页据此隐藏 ScheduleBar）
 * - payPeriod：支付指定期次；method = Vendure PaymentMethod code
 *   （在线默认 cloud-payment-template、COD 用 cod-payment-template，调用方可覆盖）
 * - cancel：买家主动取消；confirmForfeit=true 表示确认定金不退（legal_deposit 必须确认）。
 *   C 端暂无独立取消入口（订单取消走既有 cancelOrder，后端经 OrderStateTransitionEvent
 *   联动调度，见 Task 9），此方法保留供后续接入
 */
export function usePaymentSchedule() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const schedule = ref<PaymentSchedule | null>(null);

  async function fetchSchedule(orderId: string): Promise<PaymentSchedule | null> {
    loading.value = true;
    error.value = null;
    try {
      const res = await GqlGetPaymentSchedule({ orderId });
      schedule.value = (res?.paymentSchedule as PaymentSchedule | null) ?? null;
      return schedule.value;
    } catch (e: any) {
      error.value = e?.gqlErrors?.[0]?.message ?? e?.message ?? "fetch payment schedule failed";
      schedule.value = null;
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function payPeriod(orderId: string, seq: number, method = "cloud-payment-template"): Promise<PaymentSchedule | null> {
    loading.value = true;
    error.value = null;
    try {
      const res = await GqlPaySchedulePeriod({ orderId, seq, method });
      schedule.value = (res?.paySchedulePeriod as PaymentSchedule) ?? null;
      return schedule.value;
    } catch (e: any) {
      error.value = e?.gqlErrors?.[0]?.message ?? e?.message ?? "pay period failed";
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function cancel(orderId: string, confirmForfeit = false): Promise<PaymentSchedule | null> {
    loading.value = true;
    error.value = null;
    try {
      const res = await GqlCancelSchedule({ orderId, confirmForfeit: confirmForfeit || undefined });
      schedule.value = (res?.cancelSchedule as PaymentSchedule) ?? null;
      return schedule.value;
    } catch (e: any) {
      error.value = e?.gqlErrors?.[0]?.message ?? e?.message ?? "cancel schedule failed";
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, schedule, fetchSchedule, payPeriod, cancel };
}
