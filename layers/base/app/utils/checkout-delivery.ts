/**
 * 配送方式区的版式（可回退积木式构建器）。
 * - `folded`（默认）：四入口平级 + 物流子项默认展开可折叠。
 * - `flat`（备选）：物流/自提两组分组标题 + 平铺单选。
 */
export type DeliveryLayout = "folded" | "flat";

/** 纯函数：解析版式，非法值回退默认 `folded`，保证 SSR/客户端一致 */
export function deliveryLayout(raw: string | null | undefined): DeliveryLayout {
  return raw === "flat" ? "flat" : "folded";
}

/** 前端常量（当前默认 folded，未来可拆后端 customFields + SSR 读取） */
export const deliveryConfig: { layout: DeliveryLayout } = {
  layout: "folded",
};