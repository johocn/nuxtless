/**
 * checkout 页面「可回退积木式构建器」前端配置。
 *
 * 遵循 C 端模板强制组合：多语言 + 多城市 + 四级可回退风格体系。
 * - 本配置为「L2 页面级」前端常量：默认 `cn`（中国本地化）、备选 `jd`（京东新版）、
 *   `jd-legacy`（旧京东薄装配回退）、`legacy`（原有版式回退）；
 *   未来如需渠道级下发，可拆到后端 customFields（SSR 读取）而无需改动组件。
 */

export type CheckoutLayout = "cn" | "jd" | "jd-legacy" | "legacy" | "mall";

export interface CheckoutPageConfig {
  layout: CheckoutLayout;
}

/** 前端常量（默认 usemall 版式 `mall`；可回退 `cn`/`jd`/`jd-legacy`/`legacy`） */
export const checkoutConfig: CheckoutPageConfig = {
  layout: "mall",
};

/**
 * 纯函数：解析布局，非法值回退默认 `cn`，保证 SSR/客户端一致。
 * cn（默认）｜jd｜jd-legacy｜legacy｜mall 五级可回退。
 */
export function checkLayout(raw: string | null | undefined): CheckoutLayout {
  if (raw === "jd") return "jd";
  if (raw === "jd-legacy") return "jd-legacy";
  if (raw === "legacy") return "legacy";
  if (raw === "mall") return "mall";
  return "cn";
}

/**
 * 配送 / 自提取向，全页联动单一事实源：
 * - `shipping` = 物流配送（展示地址块 + 配送方式单选）
 * - `store` / `employee` / `point` = 对应自提类型（展示对应自提点列表、隐藏地址块）
 */
export type CheckoutDeliveryMode = "shipping" | "store" | "employee" | "point";

/** 自提类型 → 后端 PickupLocation.type（setOrderPickupLocation 写入 pickupType） */
export const DELIVERY_MODE_TO_PICKUP_TYPE: Record<
  Exclude<CheckoutDeliveryMode, "shipping">,
  "store" | "employee" | "point"
> = {
  store: "store",
  employee: "employee",
  point: "point",
};

/** 自提类型（后端枚举） → 配送模式 */
export const PICKUP_TYPE_TO_DELIVERY_MODE: Record<
  "store" | "employee" | "point",
  Exclude<CheckoutDeliveryMode, "shipping">
> = {
  store: "store",
  employee: "employee",
  point: "point",
};

/** 是否配送模式 */
export function isShippingMode(m: CheckoutDeliveryMode): boolean {
  return m === "shipping";
}

/** 是否自提模式（任一自提类型） */
export function isPickupMode(m: CheckoutDeliveryMode): boolean {
  return m !== "shipping";
}

/** 解析后端返回的自提点坐标（simple-json：`{lat,lng}`），坏数据返回 null */
export function parseCoordinates(
  coordinates: unknown,
): { lat: number; lng: number } | null {
  if (!coordinates) return null;
  if (typeof coordinates === "string") {
    const [latStr = "", lngStr = ""] = coordinates.split(",");
    const lat = Number.parseFloat(latStr);
    const lng = Number.parseFloat(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  }
  const c = coordinates as Record<string, unknown>;
  const lat = Number(c.lat);
  const lng = Number(c.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

/** Haversine 距离（公里），用于自提点就近预选 */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 自提点「同城就近」过滤半径（公里）。自提点无城市字段，用距当前定位的距离衡量。 */
export const PICKUP_RADIUS_KM = 50;

/**
 * 按「距当前定位 ≤ PICKUP_RADIUS_KM」就近过滤并升序；纯函数，SSR 友好。
 * 有定位且过滤后有结果则返回就近列表；无定位或无结果时回退全部（保持原序），
 * 确保任何坏数据/缺定位下结算页仍可展示完整自提点。
 */
export function nearbyPickups<T>(
  pickups: readonly T[],
  coords: { lat: number; lng: number } | null,
  getLatLng: (p: T) => { lat: number; lng: number } | null,
  restrict = true,
): T[] {
  if (!pickups.length) return [];
  if (!coords || !restrict) return [...pickups];
  const near = pickups
    .map((p) => {
      const c = getLatLng(p);
      return { p, km: c ? haversineKm(coords, c) : Number.POSITIVE_INFINITY };
    })
    .filter((x) => x.km <= PICKUP_RADIUS_KM);
  if (!near.length) return [...pickups];
  return near.sort((a, b) => a.km - b.km).map((x) => x.p);
}