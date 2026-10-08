export type ScheduleScenario = "presale" | "installment" | "rental";
export type ScheduleStatus = "pending" | "in_progress" | "completed" | "breached" | "cancelled";
export type ScheduleBreachType = "buyer_timeout" | "seller_breach" | "group_buy_failed";
export type ScheduleItemStatus = "locked" | "payable" | "paid" | "overdue" | "forfeited" | "refunded" | "waived";
export type ScheduleItemKind = "deposit" | "balance" | "down_payment" | "installment" | "rent" | "buyout";

export type ScheduleTrigger =
  | { type: "date"; at: string }
  | { type: "interval"; unit: "day" | "week" | "month"; count: number; anchor: string }
  | { type: "group_buy"; groupBuyActivityId: string }
  | { type: "manual" };

/** depositRule（下单快照，JSON 标量） */
export interface ScheduleDepositRule {
  kind: "legal_deposit" | "earnest" | "down_payment" | "security_deposit";
  capRatio?: number;
  earnestRefundPolicy?: { onTimeout: "full" | "partial"; partialRate?: number };
  [key: string]: any;
}

/** meta（下单快照：rental 买断/可买断、installment/pre-sale 扩展，JSON 标量） */
export interface ScheduleMeta {
  rental?: { buyoutPrice: number | null; allowBuyout: boolean };
  installment?: Record<string, any>;
  presale?: Record<string, any>;
  [key: string]: any;
}

export interface PaymentScheduleItem {
  id: string;
  seq: number;
  kind: ScheduleItemKind;
  /** 分 */
  amount: number;
  paidAmount: number;
  allowCod: boolean;
  status: ScheduleItemStatus;
  dueAt: string | null;
  graceHours: number;
  trigger: ScheduleTrigger | null;
  paidAt: string | null;
  lateFeeAccrued: number;
}

export interface PaymentSchedule {
  id: string;
  orderId: string;
  scenario: ScheduleScenario;
  status: ScheduleStatus;
  breachType: ScheduleBreachType | null;
  depositRule: ScheduleDepositRule | null;
  deliveryGate: "all_paid" | "first_period" | "deposit_paid";
  agreementVersion: string;
  meta: ScheduleMeta | null;
  items: PaymentScheduleItem[];
  /** 分 */
  paidTotal: number;
  /** 分 */
  totalAmount: number;
}
