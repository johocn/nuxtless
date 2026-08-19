export type OrderTabKey =
  | "ALL"
  | "PAYMENT_PENDING"
  | "TO_SHIP"
  | "TO_RECEIVE"
  | "COMPLETED"
  | "CANCELLED";

export const ORDER_TABS: { key: OrderTabKey; labelKey: string }[] = [
  { key: "ALL", labelKey: "messages.order.tabAll" },
  { key: "PAYMENT_PENDING", labelKey: "messages.order.tabPaymentPending" },
  { key: "TO_SHIP", labelKey: "messages.order.tabToShip" },
  { key: "TO_RECEIVE", labelKey: "messages.order.tabToReceive" },
  { key: "COMPLETED", labelKey: "messages.order.tabCompleted" },
  { key: "CANCELLED", labelKey: "messages.order.tabCancelled" },
];

const PAYMENT_PENDING = new Set(["AddingItems", "ArrangingPayment"]);
const TO_SHIP = new Set([
  "PaymentAuthorized",
  "PaymentSettled",
  "ArrangingAdditionalPayment",
]);
const TO_RECEIVE = new Set(["PartiallyShipped", "Shipped"]);
const COMPLETED = new Set(["PartiallyDelivered", "Delivered"]);
const CANCELLED = new Set(["Cancelled"]);

export function tabOfState(state: string): OrderTabKey {
  if (PAYMENT_PENDING.has(state)) return "PAYMENT_PENDING";
  if (TO_SHIP.has(state)) return "TO_SHIP";
  if (TO_RECEIVE.has(state)) return "TO_RECEIVE";
  if (COMPLETED.has(state)) return "COMPLETED";
  if (CANCELLED.has(state)) return "CANCELLED";
  return "ALL";
}

export interface StateBadge {
  labelKey: string;
  color: "neutral" | "warning" | "info" | "success" | "error";
}

export function stateBadge(state: string): StateBadge {
  switch (state) {
    case "AddingItems":
    case "ArrangingPayment":
      return { labelKey: "messages.order.statePaymentPending", color: "warning" };
    case "PaymentAuthorized":
    case "PaymentSettled":
      return { labelKey: "messages.order.statePaid", color: "info" };
    case "PartiallyShipped":
    case "Shipped":
      return { labelKey: "messages.order.stateShipped", color: "info" };
    case "PartiallyDelivered":
    case "Delivered":
      return { labelKey: "messages.order.stateDelivered", color: "success" };
    case "Cancelled":
      return { labelKey: "messages.order.stateCancelled", color: "error" };
    default:
      return { labelKey: "messages.order.stateProcessing", color: "neutral" };
  }
}

export const ORDER_PROGRESS_STEPS = [
  "messages.order.progressPlaced",
  "messages.order.progressPaid",
  "messages.order.progressShipped",
  "messages.order.progressCompleted",
];

export function progressIndex(state: string): number {
  if (CANCELLED.has(state)) return -1;
  if (TO_SHIP.has(state)) return 1;
  if (TO_RECEIVE.has(state)) return 2;
  if (COMPLETED.has(state)) return 3;
  return 0;
}