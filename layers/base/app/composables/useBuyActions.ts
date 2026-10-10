import { storeToRefs } from "pinia";

export function useBuyActions() {
  const { t } = useI18n();
  const localePath = useTenantLocalePath();
  const toast = useToast();
  const orderStore = useOrderStore();
  const { loading } = storeToRefs(orderStore);
  const { addItemToOrder } = orderStore;
  const productStore = useProductStore();
  const { selectedVariant } = storeToRefs(productStore);
  const { isServiceable } = useCityService();
  const { isHotelVariant, hotelConfig, resolveStay } = useHotelStay();

  const canBuy = computed(() => {
    const v = selectedVariant.value;
    return !!v?.id && isServiceable(v);
  });

  /** 所选区间含关房/满房晚 → 前端拦截（服务端 OrderInterceptor 仍是最终防线） */
  function soldOutBlock(): string | null {
    if (!isHotelVariant.value) return null;
    return (productStore as any).hotelRangeSoldOut ?? null;
  }

  /** 拦截器错误原文 → i18n 文案：HOTEL_SOLD_OUT: <date> … → 满房提示；非满房返回 null 走通用 message */
  function hotelSoldOutDesc(msg?: string): string | null {
    if (!msg || !msg.startsWith("HOTEL_SOLD_OUT")) return null;
    const date = msg.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    return t("messages.hotel.roomsSoldOut", date ? { date } : {});
  }

  /** 解析下单参数：酒店走日期→晚数，普通商品恒为 1 件 */
  function resolveLine():
    | { ok: true; quantity: number; customFields?: Record<string, unknown> }
    | { ok: false; message: string } {
    if (!isHotelVariant.value) return { ok: true, quantity: 1 };
    const stay = resolveStay();
    if (stay.ok) {
      return { ok: true, quantity: stay.quantity, customFields: stay.customFields };
    }
    if (stay.error === "selectDatesFirst") {
      return { ok: false, message: t("messages.hotel.selectDatesFirst") };
    }
    const cfg = hotelConfig.value ?? {};
    return {
      ok: false,
      message: t("messages.hotel.nightsOutOfRange", { min: cfg.minNights ?? 1, max: cfg.maxNights ?? 30 }),
    };
  }

  async function addToCartHandler() {
    const id = selectedVariant.value?.id;
    if (!id || !canBuy.value) return;
    const blocked = soldOutBlock();
    if (blocked) {
      toast.add({ title: t("messages.detail.addToCart"), description: t("messages.hotel.roomsSoldOut", { date: blocked }), color: "error" });
      return;
    }
    const line = resolveLine();
    if (!line.ok) {
      toast.add({ title: t("messages.detail.addToCart"), description: line.message, color: "error" });
      return;
    }
    const res = await addItemToOrder(id, line.quantity, line.customFields);
    if (res.status === "error") {
      toast.add({
        title: t("messages.detail.addToCart"),
        description: hotelSoldOutDesc(res.message) || res.message || t("messages.shop.addToCart"),
        color: "error",
      });
    } else if (res.status === "partial") {
      toast.add({
        title: t("messages.detail.addToCart"),
        description: t("messages.detail.stockShortage", { n: res.quantityAvailable ?? 0 }),
        color: "warning",
      });
    } else {
      toast.add({
        title: t("messages.detail.addToCart"),
        description: t("messages.detail.addedToCart"),
        color: "success",
      });
    }
  }

  async function buyNowHandler() {
    const id = selectedVariant.value?.id;
    if (!id || !canBuy.value) return;
    const blocked = soldOutBlock();
    if (blocked) {
      toast.add({ title: t("messages.detail.buyNow"), description: t("messages.hotel.roomsSoldOut", { date: blocked }), color: "error" });
      return;
    }
    const line = resolveLine();
    if (!line.ok) {
      toast.add({ title: t("messages.detail.buyNow"), description: line.message, color: "error" });
      return;
    }
    const res = await addItemToOrder(id, line.quantity, line.customFields);
    if (res.status === "error") {
      toast.add({
        title: t("messages.detail.buyNow"),
        description: hotelSoldOutDesc(res.message) || res.message || t("messages.detail.buyNowFailed"),
        color: "error",
      });
      return;
    }
    if (res.status === "partial") {
      toast.add({
        title: t("messages.detail.buyNow"),
        description: t("messages.detail.stockShortage", { n: res.quantityAvailable ?? 0 }),
        color: "warning",
      });
      return;
    }
    await navigateTo(localePath("/checkout"));
  }

  return { loading, canBuy, addToCartHandler, buyNowHandler };
}
