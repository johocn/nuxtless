import type { CheckoutState } from "~~/types/general";

export function useCheckout() {
  const GqlInstance = useGql();
  const orderStore = useOrderStore();
  const checkoutState = useState<CheckoutState>("checkoutState");

  async function recalcShipping() {
    await orderStore.setOrderShippingAddress({
      fullName: checkoutState.value.addressForm.fullName,
      streetLine1: checkoutState.value.addressForm.streetLine1,
      city: checkoutState.value.addressForm.city,
      postalCode: checkoutState.value.addressForm.postalCode,
      countryCode: checkoutState.value.addressForm.countryCode,
    });
  }

  // 结账时写入定位自定义字段（lat/lng/city/deliveryType），供就近履约使用
  async function syncOrderLocation() {
    const locationStore = useLocationStore();
    const coords = locationStore.coords;
    const city = locationStore.city;
    if (!coords && !city) return;

    // 已选自提（deliveryType=pickup）时不得覆盖为 delivery，否则就近锚点/核销失效
    const current = orderStore.order?.customFields?.deliveryType;
    const deliveryType = current === "pickup" ? "pickup" : "delivery";

    await GqlInstance("SetOrderCustomFields", {
      input: {
        customFields: {
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          city: city?.name ?? null,
          deliveryType,
        },
      },
    });
  }

  watch(
    () => checkoutState.value.addressForm.postalCode,
    async (n, o) => {
      if (n !== o) await recalcShipping();
    },
  );

  return { syncOrderLocation };
}
