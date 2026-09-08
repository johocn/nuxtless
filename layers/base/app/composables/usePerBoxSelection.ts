import type { OrderBoxInfo } from "~~/types/order";

/** boxKey -> lineId -> qty；值为 0 表示该行未选 */
export type BoxSelection = Record<string, Record<string, number>>;

/** 模块级单例：所有调用方（BoxLines / 各箱块 / PaymentBlock / 汇总）共享同一选择状态 */
let _singleton: BoxSelection | null = null;

/** 结构指纹缓存：仅当箱/行集合发生变化（切单、结算后回流重新加购）才重建单例，避免数量截留 */
let _boundFingerprint = "";

export function usePerBoxSelection() {
  const orderStore = useOrderStore();
  const { orderBoxes } = storeToRefs(orderStore);

  // 以「boxKey:lineId」全集作为指纹：结构不变则保留用户勾选状态；结构变了（新单）则作废旧选择
  const fingerprint = computed(() =>
    (orderBoxes.value ?? [])
      .flatMap((b) => (b.lines ?? []).map((l) => `${b.boxKey}:${l.orderLineId}`))
      .sort()
      .join("|"),
  );
  if (_boundFingerprint !== fingerprint.value) {
    _singleton = null;
    _boundFingerprint = fingerprint.value;
  }

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

  /** 单行勾选/取消：整行粒度——选中=该行原 quantity（整行结算），取消=0（留在购物车回流） */
  function setLineChecked(boxKey: string, lineId: string, checked: boolean) {
    ensureBox(boxKey);
    const box = (orderBoxes.value ?? []).find((b) => b.boxKey === boxKey);
    const line = box?.lines.find((l) => l.orderLineId === lineId);
    if (line) selection[boxKey]![lineId] = checked ? line.quantity : 0;
  }

  /** 加减数量后同步该行选中数量：仅当该行已勾选(qty>0)时才更新为新整行数量，
   *  保持选中并按新数量整行结算；未选中行保持 0（仍在购物车，不结算）。 */
  function setLineQty(boxKey: string, lineId: string, newQty: number): void {
    if (newQty < 1) return;
    ensureBox(boxKey);
    const cur = selection[boxKey]?.[lineId] ?? 0;
    if (cur > 0) selection[boxKey]![lineId] = newQty;
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

  /** 被选行 lineTotal 求和（整行粒度：金额 = 行原数量×单价，无需乘当前数量） */
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
   * 未选行清单：结算成功后按 (variantId, qty) 回流到购物车。
   * 必须在 checkoutSplitted 之前捕获——成功后 store 会清空 orderBoxes/order。
   * 整行粒度：仅当整行未选（selQty<=0）才回流整行原 quantity；不存在行内部分数量，故无差额回流分支。
   */
  function excludedItems(): { variantId: string; qty: number }[] {
    const out: { variantId: string; qty: number }[] = [];
    for (const box of orderBoxes.value ?? []) {
      for (const l of box.lines ?? []) {
        const selQty = selection[box.boxKey]?.[l.orderLineId] ?? l.quantity;
        if (selQty <= 0) out.push({ variantId: String(l.productVariantId), qty: l.quantity });
      }
    }
    return out;
  }

  /** 以真实 orderBoxes 为唯一真源重建勾选：为缺失的箱/行补全默认全选与最新数量，
   *  消除「数量加减/删除/换单后勾选单例与实际订单不同步」导致的漏选回流。
   *  保留用户显式置 0 的未选项（不覆盖已存在选择），仅补齐不存在项。 */
  function syncWithOrderBoxes() {
    for (const box of orderBoxes.value ?? []) {
      ensureBox(box.boxKey);
      const sel = selection[box.boxKey]!;
      for (const l of box.lines ?? []) {
        if (sel[l.orderLineId] == null) sel[l.orderLineId] = l.quantity;
      }
    }
  }

  /** 是否全选：所有箱的所有行均已选中（qty>0）。全选时应走后端「无限定」路径，杜绝漏行回流。 */
  function isFullSelection(): boolean {
    const boxes = orderBoxes.value ?? [];
    if (!boxes.length) return false;
    for (const box of boxes) {
      const sel = selection[box.boxKey];
      if (!sel) return false;
      for (const l of box.lines ?? []) {
        if ((sel[l.orderLineId] ?? 0) <= 0) return false;
      }
    }
    return true;
  }

  initAll();

  return {
    selection,
    initAll,
    syncWithOrderBoxes,
    isFullSelection,
    isBoxChecked,
    toggleBox,
    isLineChecked,
    setLineChecked,
    setLineQty,
    removeLine,
    selectedBoxes,
    selectedAmount,
    excludedItems,
  };
}