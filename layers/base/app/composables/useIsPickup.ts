import type { ComputedRef } from "vue";

/** 订单是否处于门店自提模式（customer.deliveryType === "pickup"） */
export function useIsPickup(): ComputedRef<boolean> {
  const orderStore = useOrderStore();
  return computed(() => (orderStore.order?.customFields?.deliveryType ?? "") === "pickup");
}