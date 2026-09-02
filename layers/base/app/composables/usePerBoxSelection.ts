import type { OrderBoxInfo } from "~~/types/order";

/** boxKey -> lineId -> qty；值为 0 表示该行未选 */
export type BoxSelection = Record<string, Record<string, number>>;

/** 模块级单例：所有调用方（BoxLines / 各箱块 / PaymentBlock / 汇总）共享同一选择状态 */
let _singleton: BoxSelection | null = null;

export function usePerBoxSelection() {
  const orderStore = useOrderStore();
  const { orderBoxes } = storeToRefs(orderStore);

  const selection = (_singleton ??= reactive<BoxSelection>({}));

  /** 若该箱尚未初始化，则按箱内所有行 quantity 默认全选 */
  function ensureBox(boxKey: string) {
    if (!selection[boxKey]) {
      const box = (orderBoxes.value ?? []).find((b) => b.boxKey === boxKey);
      const init: Record<string, number> = {};
      for (const l of box?.lines ?? []) init[l.orderLineId] = l.quantity;
      selection[boxKey] = init;
    }
  }

  /** 为每个箱初始化选择状态（默认全选）；数据就绪后可再次调用 */
  function initAll() {
    for (const box of orderBoxes.value ?? []) ensureBox(box.boxKey);
  }

  /** 整箱是否全选：所有行 qty>0 */
  function isBoxChecked(boxKey: string): boolean {
    const sel = selection[boxKey];
    if (!sel) return false;
    const lines = (orderBoxes.value ?? []).find((b) => b.boxKey === boxKey)?.lines ?? [];
    return lines.every((l) => sel[l.orderLineId]! > 0);
  }

  /** 整箱勾选/取消：checked=true 全选该箱所有行，false 全部置 0 */
  function toggleBox(boxKey: string, checked: boolean) {
    const box = (orderBoxes.value ?? []).find((b) => b.boxKey === boxKey);
    if (!box) return;
    ensureBox(boxKey);
    const sel = selection[boxKey]!;
    const all = box.lines.length > 0 && box.lines.every((l) => sel[l.orderLineId]! > 0);
    if (checked !== all) {
      for (const l of box.lines) sel[l.orderLineId] = checked ? l.quantity : 0;
    }
  }

  /** 单行是否选中：qty>0 */
  function isLineChecked(boxKey: string, lineId: string): boolean {
    return (selection[boxKey]?.[lineId] ?? 0) > 0;
  }

  /** 单行勾选/取消：选中=该行原 quantity，取消=0 */
  function setLineChecked(boxKey: string, lineId: string, checked: boolean) {
    ensureBox(boxKey);
    const box = (orderBoxes.value ?? []).find((b) => b.boxKey === boxKey);
    const line = box?.lines.find((l) => l.orderLineId === lineId);
    if (line) selection[boxKey]![lineId] = checked ? line.quantity : 0;
  }

  /** 设置行数量；qty<=0 忽略 */
  function setQty(boxKey: string, lineId: string, qty: number) {
    ensureBox(boxKey);
    if (qty <= 0) return;
    selection[boxKey]![lineId] = qty;
  }

  /** 删除该行：置 0，视为未选 */
  function removeLine(boxKey: string, lineId: string) {
    ensureBox(boxKey);
    selection[boxKey]![lineId] = 0;
  }

  /** 被选箱及其被选行，供 checkoutSplitted 的 boxKeys/lineIds 使用 */
  function selectedBoxes(): { boxKey: string; lineIds: string[] }[] {
    const out: { boxKey: string; lineIds: string[] }[] = [];
    for (const box of orderBoxes.value ?? []) {
      const lineIds = (box.lines ?? [])
        .filter((l) => (selection[box.boxKey]?.[l.orderLineId] ?? 0) > 0)
        .map((l) => l.orderLineId);
      if (lineIds.length) out.push({ boxKey: box.boxKey, lineIds });
    }
    return out;
  }

  /** 被选行 lineTotal 求和 */
  function selectedAmount(): number {
    let sum = 0;
    for (const box of orderBoxes.value ?? []) {
      for (const l of box.lines ?? []) {
        if ((selection[box.boxKey]?.[l.orderLineId] ?? 0) > 0) sum += l.lineTotal;
      }
    }
    return sum;
  }

  /**
   * 未选箱/未选行清单：结算成功后按 (variantId, qty) 回流到购物车。
   * 必须在 checkoutSplitted 之前捕获——成功后 store 会清空 orderBoxes/order。
   * 规则：selQty<=0 → 回流整行原 quantity；0<selQty<原 quantity → 回流差额；selQty>=原 quantity → 不回流。
   */
  function excludedItems(): { variantId: string; qty: number }[] {
    const out: { variantId: string; qty: number }[] = [];
    for (const box of orderBoxes.value ?? []) {
      for (const l of box.lines ?? []) {
        const selQty = selection[box.boxKey]?.[l.orderLineId] ?? l.quantity;
        if (selQty <= 0) out.push({ variantId: String(l.productVariantId), qty: l.quantity });
        else if (selQty < l.quantity) out.push({ variantId: String(l.productVariantId), qty: l.quantity - selQty });
      }
    }
    return out;
  }

  initAll();

  return {
    selection,
    initAll,
    isBoxChecked,
    toggleBox,
    isLineChecked,
    setLineChecked,
    setQty,
    removeLine,
    selectedBoxes,
    selectedAmount,
    excludedItems,
  };
}