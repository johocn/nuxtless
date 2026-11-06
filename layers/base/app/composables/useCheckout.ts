import type { CheckoutState } from "~~/types/general";

/** 结算成功后需回流到购物车的未选项（productVariantId, qty） */
export interface FlowBackItem {
  variantId: string;
  qty: number;
}

export function useCheckout() {
  const GqlInstance = useGql();
  const orderStore = useOrderStore();
  const checkoutState = useState<CheckoutState>("checkoutState");
  const { t } = useI18n();
  const toast = useToast();

  async function recalcShipping() {
    await orderStore.setOrderShippingAddress({
      fullName: checkoutState.value.addressForm.fullName,
      streetLine1: checkoutState.value.addressForm.streetLine1,
      city: checkoutState.value.addressForm.city,
      postalCode: checkoutState.value.addressForm.postalCode,
      countryCode: checkoutState.value.addressForm.countryCode,
    });
  }

  // 结账时写入定位自定义字段（lat/lng/city/deliveryType），供就近履约使用。
  // 写入后按服务端返回的订单回读校验，未落库/被覆盖均视为失败，由调用方提示可重试。
  async function syncOrderLocation(): Promise<{ ok: boolean; message?: string }> {
    const locationStore = useLocationStore();
    const coords = locationStore.coords;
    const city = locationStore.city;
    if (!coords && !city) return { ok: true };

    // 已选自提（deliveryType=pickup）时不得覆盖为 delivery，否则就近锚点/核销失效
    const current = orderStore.order?.customFields?.deliveryType;
    const deliveryType = current === "pickup" ? "pickup" : "delivery";
    const expected = {
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      city: city?.name ?? null,
      deliveryType,
    };

    try {
      const res = await GqlInstance("SetOrderCustomFields", {
        input: { customFields: expected },
      });
      const result = res?.setOrderCustomFields;
      if (!result || result.__typename !== "Order") {
        return {
          ok: false,
          message:
            (result as { message?: string } | null)?.message ??
            t("messages.checkout.locationSaveFailed"),
        };
      }
      // 回读校验：返回值即落库后的订单，逐字段比对
      const written = (result as { customFields?: Record<string, unknown> }).customFields ?? {};
      const mismatched =
        ((written.city as string | null) ?? null) !== expected.city ||
        ((written.deliveryType as string | null) ?? null) !== expected.deliveryType ||
        (expected.lat !== null && Number(written.lat) !== expected.lat) ||
        (expected.lng !== null && Number(written.lng) !== expected.lng);
      if (mismatched) {
        return { ok: false, message: t("messages.checkout.locationSaveFailed") };
      }
      // 同步本地订单，避免后续读取旧定位
      orderStore.order = result as any;
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : t("messages.checkout.locationSaveFailed"),
      };
    }
  }

  watch(
    () => checkoutState.value.addressForm.postalCode,
    async (n, o) => {
      if (n !== o) await recalcShipping();
    },
  );

  /**
   * 结算成功后把未选箱/未选行按 (variantId, qty) 加回购物车。
   * 幂等：成功（含 partial）即视为已回流；失败不抛异常、不做移除（防丢单）。
   * 并行回流 + 限定单次重试，避免逐条串行 await 遇生产负载叠加成几分钟。
   * 回流总数 > 0 时 toast「剩余 N 件未结算，已放回购物车」。
   */
  async function flowBackUnselected(excluded: FlowBackItem[]) {
    const settledQty = await Promise.all(
      excluded.map(async (item) => {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const res = await orderStore.addItemToOrder(item.variantId, item.qty);
            if (res.status === "success" || res.status === "partial") return item.qty;
            return 0;
          } catch {
            if (attempt === 2) return 0;
            // 单次重试：短暂让出事件循环后重试一次，仍失败则放弃本条，不阻断其余回流
            await new Promise((r) => setTimeout(r, 300));
          }
        }
        return 0;
      }),
    );
    const total = settledQty.reduce((s, n) => s + n, 0);
    if (total > 0) {
      toast.add({
        title: t("messages.checkout.flowBackTitle"),
        description: t("messages.checkout.flowBack", { n: total }),
        color: "success",
      });
    }
  }

  return { syncOrderLocation, flowBackUnselected };
}
