export type AfterSalesState =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Returning"
  | "Received"
  | "Refunded"
  | "RefundFailed"
  | "Closed";

export type AfterSalesType = "return_refund" | "refund_only" | "exchange";

/** 5 个页签：进行中（默认）/ 全部 / 已完成 / 已拒绝 / 已取消 */
export type AfterSalesTabKey = "ACTIVE" | "ALL" | "DONE" | "REJECTED" | "CLOSED";

export const AFTER_SALES_TABS: { key: AfterSalesTabKey; labelKey: string }[] = [
  { key: "ACTIVE", labelKey: "messages.afterSales.tabActive" },
  { key: "ALL", labelKey: "messages.afterSales.tabAll" },
  { key: "DONE", labelKey: "messages.afterSales.tabDone" },
  { key: "REJECTED", labelKey: "messages.afterSales.tabRejected" },
  { key: "CLOSED", labelKey: "messages.afterSales.tabClosed" },
];

/** 「进行中」收纳的状态集合（与服务端 STATE_TRANSITIONS 的非终态一致） */
export const AFTER_SALES_ACTIVE_STATES = new Set<string>([
  "Pending",
  "Approved",
  "Returning",
  "Received",
  "RefundFailed",
]);

const TYPE_LABEL_KEY: Record<AfterSalesType, string> = {
  return_refund: "messages.afterSales.typeReturnRefund",
  refund_only: "messages.afterSales.typeRefundOnly",
  exchange: "messages.afterSales.typeExchange",
};

export function afterSalesTypeLabelKey(type: string): string {
  return TYPE_LABEL_KEY[type as AfterSalesType] ?? "messages.afterSales.typeUnknown";
}

export interface AfterSalesStateInfo {
  labelKey: string;
  color: "neutral" | "warning" | "info" | "success" | "error";
}

export function afterSalesStateInfo(state: string): AfterSalesStateInfo {
  switch (state) {
    case "Pending":
      return { labelKey: "messages.afterSales.statePending", color: "warning" };
    case "Approved":
      return { labelKey: "messages.afterSales.stateApproved", color: "info" };
    case "Rejected":
      return { labelKey: "messages.afterSales.stateRejected", color: "error" };
    case "Returning":
      return { labelKey: "messages.afterSales.stateReturning", color: "info" };
    case "Received":
      return { labelKey: "messages.afterSales.stateReceived", color: "warning" };
    case "Refunded":
      return { labelKey: "messages.afterSales.stateRefunded", color: "success" };
    case "RefundFailed":
      return { labelKey: "messages.afterSales.stateRefundFailed", color: "error" };
    case "Closed":
      return { labelKey: "messages.afterSales.stateClosed", color: "neutral" };
    default:
      return { labelKey: "messages.afterSales.stateUnknown", color: "neutral" };
  }
}

/** 主流程 5 节点（时间线 / 进度条共用） */
export const AFTER_SALES_PROGRESS: AfterSalesState[] = [
  "Pending",
  "Approved",
  "Returning",
  "Received",
  "Refunded",
];

/**
 * 当前处于主流程第几节点。
 * RefundFailed 落在「商家收货」之上（退款在收货后失败）；Rejected / Closed 落在「提交申请」。
 */
export function afterSalesProgressIndex(state: string): number {
  const i = AFTER_SALES_PROGRESS.indexOf(state as AfterSalesState);
  if (i >= 0) return i;
  if (state === "RefundFailed") return 3;
  if (state === "Rejected" || state === "Closed") return 0;
  return -1;
}

export function tabOfAfterSales(state: string): AfterSalesTabKey {
  if (AFTER_SALES_ACTIVE_STATES.has(state)) return "ACTIVE";
  if (state === "Refunded") return "DONE";
  if (state === "Rejected") return "REJECTED";
  if (state === "Closed") return "CLOSED";
  return "ALL";
}

export interface AfterSalesNextStep {
  titleKey: string;
  descKey: string;
  tone: "info" | "warning" | "success" | "error" | "neutral";
}

/** 「你需要做什么」引导条：按状态给一句话主行动 + 一条说明 */
export function afterSalesNextStep(state: string): AfterSalesNextStep {
  switch (state) {
    case "Pending":
      return {
        titleKey: "messages.afterSales.nextPendingTitle",
        descKey: "messages.afterSales.nextPendingDesc",
        tone: "info",
      };
    case "Approved":
      return {
        titleKey: "messages.afterSales.nextApprovedTitle",
        descKey: "messages.afterSales.nextApprovedDesc",
        tone: "warning",
      };
    case "Returning":
      return {
        titleKey: "messages.afterSales.nextReturningTitle",
        descKey: "messages.afterSales.nextReturningDesc",
        tone: "info",
      };
    case "Received":
      return {
        titleKey: "messages.afterSales.nextReceivedTitle",
        descKey: "messages.afterSales.nextReceivedDesc",
        tone: "info",
      };
    case "Refunded":
      return {
        titleKey: "messages.afterSales.nextRefundedTitle",
        descKey: "messages.afterSales.nextRefundedDesc",
        tone: "success",
      };
    case "Rejected":
      return {
        titleKey: "messages.afterSales.nextRejectedTitle",
        descKey: "messages.afterSales.nextRejectedDesc",
        tone: "error",
      };
    case "RefundFailed":
      return {
        titleKey: "messages.afterSales.nextRefundFailedTitle",
        descKey: "messages.afterSales.nextRefundFailedDesc",
        tone: "error",
      };
    case "Closed":
      return {
        titleKey: "messages.afterSales.nextClosedTitle",
        descKey: "messages.afterSales.nextClosedDesc",
        tone: "neutral",
      };
    default:
      return {
        titleKey: "messages.afterSales.nextUnknownTitle",
        descKey: "messages.afterSales.nextUnknownDesc",
        tone: "neutral",
      };
  }
}

/** 卡片 / 详情页主行动 */
export type AfterSalesPrimaryAction = "cancel" | "tracking" | "service" | "detail" | "none";

export function afterSalesPrimaryAction(state: string): AfterSalesPrimaryAction {
  switch (state) {
    case "Pending":
      return "cancel";
    case "Approved":
      return "tracking";
    case "Returning":
    case "Received":
    case "RefundFailed":
      return "service";
    case "Refunded":
    case "Rejected":
      return "detail";
    default:
      return "none";
  }
}

/** 主行动按钮的 i18n key（卡片与详情页吸底共用） */
export function afterSalesPrimaryActionLabelKey(action: AfterSalesPrimaryAction): string {
  switch (action) {
    case "cancel":
      return "messages.afterSales.cancel";
    case "tracking":
      return "messages.afterSales.fillTracking";
    case "service":
      return "messages.afterSales.customerService";
    case "detail":
      return "messages.afterSales.viewDetail";
    default:
      return "messages.afterSales.viewDetail";
  }
}

export function canCancelAfterSales(state: string): boolean {
  return state === "Pending";
}

export function canFillTracking(state: string): boolean {
  return state === "Approved";
}

export const AFTER_SALES_ELIGIBLE_ORDER_STATES = new Set([
  "Shipped",
  "Delivered",
  "PartiallyDelivered",
  "Cancelled",
]);

export function canApplyAfterSales(orderState: string): boolean {
  return AFTER_SALES_ELIGIBLE_ORDER_STATES.has(orderState);
}
