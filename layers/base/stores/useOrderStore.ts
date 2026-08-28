import type {
  ActiveOrder,
  OrderStatus,
  ShippingMethods,
  PaymentMethods,
  OrderBoxes,
  CheckoutSplittedResult,
} from "~~/types/order";

export const useOrderStore = defineStore("order", () => {
  const loading = ref(false);
  const error = ref<string | null>(null);
  // Status is not wired up yet
  const status = ref<string | null>(null);

  const order = ref<ActiveOrder>(null);
  // TODO: Add logic for multiple coupon codes
  const couponCode = computed(() => order.value?.couponCodes?.[0] ?? null);
  const shippingMethods = ref<ShippingMethods | null>(null);
  const paymentMethods = ref<PaymentMethods | null>(null);
  const orderBoxes = ref<OrderBoxes>([]);

  async function fetchOrder(type: "base" | "detail" = "base"): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { activeOrder } = await (type === "detail"
        ? GqlGetActiveOrderDetail()
        : GqlGetActiveOrder());

      order.value = activeOrder ?? null;
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to fetch order";
      }
    } finally {
      loading.value = false;
    }
  }

  async function addItemToOrder(
    variantId: string,
    quantity: number,
  ): Promise<OrderStatus> {
    loading.value = true;
    error.value = null;

    try {
      const { addItemToOrder: result } = await GqlAddItemToOrder({
        variantId,
        quantity,
      });

      if (!result) return { status: "error", message: "No result" };
      const res = useOrderMutation(order, result);
      if (res.status === "error") error.value = res.message;
      return res;
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to add item to order";
        return { status: "error", message: error.value };
      }
      return { status: "error", message: "Failed to add item to order" };
    } finally {
      loading.value = false;
    }
  }

  async function removeItemFromOrder(orderLineId: string): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { removeOrderLine: result } = await GqlRemoveItemFromOrder({
        orderLineId,
      });

      if (result) {
        const res = useOrderMutation(order, result);
        if (res.status === "error") {
          error.value = res.message;
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to remove item from order";
      }
    } finally {
      loading.value = false;
    }
  }

  async function adjustOrderLine(
    orderLineId: string,
    quantity: number,
  ): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { adjustOrderLine: result } = await GqlAdjustOrderLine({
        orderLineId,
        quantity,
      });

      if (result) {
        const res = useOrderMutation(order, result);
        if (res.status === "error") {
          error.value = res.message;
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to adjust order line";
      }
    } finally {
      loading.value = false;
    }
  }

  async function applyCouponCode(couponCode: string): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { applyCouponCode: result } = await GqlApplyCouponCode({
        couponCode,
      });

      if (result) {
        const res = useOrderMutation(order, result);
        if (res.status === "error") {
          error.value = res.message;
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to apply coupon code";
      }
    } finally {
      loading.value = false;
    }
  }

  async function removeCouponCode(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      if (couponCode.value) {
        const { removeCouponCode: result } = await GqlRemoveCouponCode({
          couponCode: couponCode.value,
        });

        if (result) {
          const res = useOrderMutation(order, result);
          if (res.status === "error") {
            error.value = res.message;
          }
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to remove coupon code";
      }
    } finally {
      loading.value = false;
    }
  }

  async function setCustomerForOrder(input: {
    emailAddress?: string;
    firstName: string;
    lastName: string;
  }): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const result = (await GqlSetCustomerForOrder({ input }))
        .setCustomerForOrder;
      const res = useOrderMutation(order, result);

      if (res.status === "error") {
        error.value = res.message;
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to set customer for order";
      }
    } finally {
      loading.value = false;
    }
  }

  async function setOrderShippingAddress(input: {
    fullName?: string;
    streetLine1: string;
    streetLine2?: string;
    province?: string;
    city?: string;
    postalCode?: string;
    countryCode: string;
    phoneNumber?: string;
  }): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const result = (await GqlSetOrderShippingAddress({ input }))
        .setOrderShippingAddress;
      const res = useOrderMutation(order, result);

      if (res.status === "error") {
        error.value = res.message;
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to set shipping address";
      }
    } finally {
      loading.value = false;
    }
  }

  async function getShippingMethods(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { eligibleShippingMethods: result } = await GqlGetShippingMethods();
      shippingMethods.value = result ?? [];
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to fetch shipping methods";
      }
    } finally {
      loading.value = false;
    }
  }

  async function setShippingMethod(shippingMethodId: string): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { setOrderShippingMethod: result } = await GqlSetShippingMethod({
        id: shippingMethodId,
      });

      const res = useOrderMutation(order, result);
      if (res.status === "error") {
        error.value = res.message;
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to set shipping method";
      }
    } finally {
      loading.value = false;
    }
  }

  // 选择自提点：写入订单 customFields（selectedPickupLocationId/pickupType/pickup坐标）+ 同步发货地址
  async function setPickupLocation(
    pickupLocationId: string,
    pickupType: string,
  ): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const result = (await GqlSetOrderPickupLocation({
        pickupLocationId,
        pickupType,
      })).setOrderPickupLocation;
      if (result) {
        order.value = result;
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to set pickup location";
      }
    } finally {
      loading.value = false;
    }
  }

  async function getPaymentMethods(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { eligiblePaymentMethods: result } = await GqlGetPaymentMethods();
      paymentMethods.value = result ?? [];
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to fetch payment methods";
      }
    } finally {
      loading.value = false;
    }
  }

  async function transitionToState(state: string): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { transitionOrderToState: result } = await GqlTransitionToState({
        state,
      });
      const res = useOrderMutation(order, result);
      if (res.status === "error") {
        error.value = res.message;
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to transition order state";
      }
    } finally {
      loading.value = false;
    }
  }

  async function addPaymentToOrder(input: {
    method: string;
    metadata: {
      shouldDecline?: boolean;
      shouldError?: boolean;
      shouldErrorOnSettle?: boolean;
    };
  }): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { addPaymentToOrder: result } = await GqlAddPaymentToOrder({
        input,
      });
      const res = useOrderMutation(order, result);
      if (res.status === "error") {
        error.value = res.message;
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to add payment";
      }
    } finally {
      loading.value = false;
    }
  }

  // ===== 按配送档案分箱 + 支付拆合（后端 cjk-plugin）=====

  /** 拉取当前订单的分箱结果（每箱配送档案/可用方式/可用支付/自提点） */
  async function fetchOrderBoxes(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { orderBoxes: result } = await GqlGetOrderBoxes();
      orderBoxes.value = result ?? [];
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to fetch order boxes";
      }
    } finally {
      loading.value = false;
    }
  }

  /** 为某一箱设置配送方式（物流不传 pickupLocationId；自提需传相应自提点 + 该箱承运配送方式） */
  async function setOrderBoxShippingMethod(
    boxKey: string,
    shippingMethodId: string,
    pickupLocationId?: string | null,
  ): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { setOrderBoxShippingMethod: result } = await GqlSetOrderBoxShippingMethod({
        boxKey,
        shippingMethodId,
        pickupLocationId: pickupLocationId ?? null,
      });
      const res = useOrderMutation(order, result);
      if (res.status === "error") {
        error.value = res.message;
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to set order box shipping method";
      }
    } finally {
      loading.value = false;
    }
  }

  /**
   * 一次性拆单结算：内部完成「源订单分箱 + 按所选支付方式聚合拆合 + 逐单过渡 ArrangingPayment + addPayment」。
   * 返回已结算订单列表；活动订单已不存在，order 置空、orderBoxes 清空。
   */
  async function checkoutSplitted(
    method: string,
    metadata?: string,
  ): Promise<CheckoutSplittedResult> {
    loading.value = true;
    error.value = null;

    try {
      const { checkoutSplitted: result } = await GqlCheckoutSplitted({
        method,
        metadata: metadata ?? null,
      });
      order.value = null;
      orderBoxes.value = [];
      return (result ?? []) as CheckoutSplittedResult;
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to checkout";
      }
      return [];
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    status,
    order,
    shippingMethods,
    paymentMethods,
    orderBoxes,
    fetchOrder,
    addItemToOrder,
    removeItemFromOrder,
    adjustOrderLine,
    applyCouponCode,
    removeCouponCode,
    setCustomerForOrder,
    setOrderShippingAddress,
    getShippingMethods,
    setShippingMethod,
    setPickupLocation,
    getPaymentMethods,
    transitionToState,
    addPaymentToOrder,
    fetchOrderBoxes,
    setOrderBoxShippingMethod,
    checkoutSplitted,
  };
});
