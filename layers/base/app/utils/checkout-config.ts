/**
 * checkout 页面「可回退积木式构建器」前端配置。
 *
 * 遵循 C 端模板强制组合：多语言 + 多城市 + 四级可回退风格体系。
 * - 本配置为「L2 页面级」前端常量，默认 `jd`（京东新版）、备选 `legacy`（原有版式回退）；
 *   未来如需渠道级下发，可拆到后端 customFields（SSR 读取）而无需改动组件。
 */

export type CheckoutLayout = "jd" | "legacy";

export interface CheckoutPageConfig {
  layout: CheckoutLayout;
}

/** 前端常量（纯函数解析需要时再抽离；当前单一常量） */
export const checkoutConfig: CheckoutPageConfig = {
  layout: "jd",
};

/** 纯函数：解析布局，非法值回退默认 `jd`，保证 SSR/客户端一致 */
export function checkLayout(raw: string | null | undefined): CheckoutLayout {
  return raw === "legacy" ? "legacy" : "jd";
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