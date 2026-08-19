// /types/guard.ts
import type { ActiveCustomer } from "./customer";
import type { ActiveCustomerDetail } from "./customer";
import type { ActiveOrder, ActiveOrderDetail } from "./order";

/** detail 查询返回的 customer 含 phoneNumber（base 查询无）。 */
export function isActiveCustomerDetail(
  customer: ActiveCustomer | null,
): customer is ActiveCustomerDetail {
  return !!customer && "phoneNumber" in customer;
}

/** detail 查询返回的 order 含 shippingWithTax。 */
export function isActiveOrderDetail(
  order: ActiveOrder | null,
): order is ActiveOrderDetail {
  return !!order && "shippingWithTax" in order;
}
