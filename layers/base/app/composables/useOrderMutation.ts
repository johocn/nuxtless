import type {
  ActiveOrder,
  OrderMutationResult,
  OrderStatus,
} from "~~/types/order";

export function useOrderMutation(
  order: Ref<ActiveOrder>,
  result: OrderMutationResult,
): OrderStatus {
  switch (result?.__typename) {
    case "Order":
      order.value = result;
      return { status: "success" };

    case "InsufficientStockError":
      if ("order" in result && "quantityAvailable" in result) {
        order.value = result.order;
        return {
          status: "partial",
          quantityAvailable: result.quantityAvailable,
        };
      }
      return {
        status: "error",
        message: result.message ?? "Unexpected InsufficientStockError format",
      };

    case "OrderModificationError":
    case "OrderLimitError":
    case "NegativeQuantityError":
    case "CouponCodeExpiredError":
    // 拦截器错误：优先透出 interceptorError（拦截器业务原因原文，如 "HOTEL_SOLD_OUT: 2026-10-12 …"），
    // 供调用方识别错误码转 i18n 文案；无则回退通用 message
    case "OrderInterceptorError": {
      const interceptor = (result as { interceptorError?: string | null }).interceptorError;
      return {
        status: "error",
        message: interceptor || (result.message ?? "Order mutation failed"),
      };
    }

    case "CouponCodeInvalidError":
    case "CouponCodeLimitError":
    case "AlreadyLoggedInError":
    case "EmailAddressConflictError":
    case "GuestCheckoutError":
    case "IneligibleShippingMethodError":
    case "NoActiveOrderError":
    case "OrderStateTransitionError":
    case "OrderPaymentStateError":
    case "IneligiblePaymentMethodError":
    case "PaymentFailedError":
    case "PaymentDeclinedError":
      return {
        status: "error",
        message: result.message ?? "Order mutation failed",
      };

    default:
      console.warn("[OrderMutation] Unknown mutation result:", result);
      return {
        status: "error",
        message: "Unknown response from server",
      };
  }
}
