export type AfterSalesState =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Returning"
  | "Received"
  | "Refunded"
  | "Closed";

export type AfterSalesType = "return_refund" | "refund_only" | "exchange";

export type AfterSalesTabKey =
  | "ALL"
  | "Pending"
  | "Approved"
  | "Returning"
  | "Refunded"
  | "Rejected"
  | "Closed";

export const AFTER_SALES_TABS: { key: AfterSalesTabKey; labelKey: string }[] = [
  { key: "ALL", labelKey: "afterSales.tabAll" },
  { key: "Pending", labelKey: "afterSales.tabPending" },
  { key: "Approved", labelKey: "afterSales.tabToReturn" },
  { key: "Returning", labelKey: "afterSales.tabReturning" },
  { key: "Refunded", labelKey: "afterSales.tabRefunded" },
  { key: "Rejected", labelKey: "afterSales.tabRejected" },
  { key: "Closed", labelKey: "afterSales.tabClosed" },
];

const TYPE_LABEL_KEY: Record<AfterSalesType, string> = {
  return_refund: "afterSales.typeReturnRefund",
  refund_only: "afterSales.typeRefundOnly",
  exchange: "afterSales.typeExchange",
};

export function afterSalesTypeLabelKey(type: string): string {
  return TYPE_LABEL_KEY[type as AfterSalesType] ?? "afterSales.typeUnknown";
}

export interface AfterSalesStateInfo {
  labelKey: string;
  color: "neutral" | "warning" | "info" | "success" | "error";
}

export function afterSalesStateInfo(state: string): AfterSalesStateInfo {
  switch (state) {
    case "Pending":
      return { labelKey: "afterSales.statePending", color: "warning" };
    case "Approved":
      return { labelKey: "afterSales.stateApproved", color: "info" };
    case "Rejected":
      return { labelKey: "afterSales.stateRejected", color: "error" };
    case "Returning":
      return { labelKey: "afterSales.stateReturning", color: "info" };
    case "Received":
      return { labelKey: "afterSales.stateReceived", color: "warning" };
    case "Refunded":
      return { labelKey: "afterSales.stateRefunded", color: "success" };
    case "Closed":
      return { labelKey: "afterSales.stateClosed", color: "neutral" };
    default:
      return { labelKey: "afterSales.stateUnknown", color: "neutral" };
  }
}

export const AFTER_SALES_PROGRESS: AfterSalesState[] = [
  "Pending",
  "Approved",
  "Returning",
  "Received",
  "Refunded",
];

export function afterSalesProgressIndex(state: string): number {
  return AFTER_SALES_PROGRESS.indexOf(state as AfterSalesState);
}

export function tabOfAfterSales(state: string): AfterSalesTabKey {
  switch (state) {
    case "Pending":
      return "Pending";
    case "Approved":
      return "Approved";
    case "Returning":
    case "Received":
      return "Returning";
    case "Refunded":
      return "Refunded";
    case "Rejected":
      return "Rejected";
    case "Closed":
      return "Closed";
    default:
      return "ALL";
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