// 酒店房型下单参数：把详情页选定的入离日期折算为数量(customFields)。
// 非酒店变体返回 null，调用方按普通商品流程处理。
// 用 type 别名而非 interface：interface 无隐式索引签名，无法赋给 Record<string, unknown>
export type HotelOrderLineFields = {
  hotelCheckIn: string;
  hotelCheckOut: string;
  hotelNights: number;
};

export function useHotelStay() {
  const productStore = useProductStore();

  const parseHotel = (raw: unknown) => {
    if (typeof raw !== "string") return null;
    try {
      return JSON.parse(raw) as { minNights?: number; maxNights?: number } | null;
    } catch {
      return null;
    }
  };

  /** 当前选中变体的酒店配置（非酒店返回 null） */
  const hotelConfig = computed(() => {
    const raw = (productStore.selectedVariant as any)?.customFields?.hotelRoomConfig;
    return parseHotel(raw);
  });

  const isHotelVariant = computed(() => hotelConfig.value !== null);

  /** 校验通过时返回下单参数；不通过返回 { error } */
  function resolveStay():
    | { ok: true; quantity: number; customFields: HotelOrderLineFields }
    | { ok: false; error: "selectDatesFirst" | "nightsOutOfRange" } {
    const cfg = hotelConfig.value!;
    const { checkIn, checkOut } = productStore.hotelDates ?? { checkIn: "", checkOut: "" };
    if (!checkIn || !checkOut) return { ok: false, error: "selectDatesFirst" };
    const nights = Math.round(
      (new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()) / 86400000,
    );
    const min = cfg.minNights ?? 1;
    const max = cfg.maxNights ?? 30;
    if (!Number.isFinite(nights) || nights < min || nights > max) {
      return { ok: false, error: "nightsOutOfRange" };
    }
    return {
      ok: true,
      quantity: nights,
      customFields: { hotelCheckIn: checkIn, hotelCheckOut: checkOut, hotelNights: nights },
    };
  }

  return { hotelConfig, isHotelVariant, resolveStay };
}
