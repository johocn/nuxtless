// 秒杀活动纯函数（SSR 友好）：与 vshop flash-normalize 同口径（utils/flash-normalize.ts）。
// 数据源为共享 shop-api 的 activeFlashSaleActivities 查询（flash-sale plugin），价格单位为分。

export interface FlashActivityRaw {
  id: string;
  name?: string;
  startAt?: string;
  endAt?: string;
  flashPrice?: number;
  totalStock?: number;
  soldCount?: number;
  productId?: string;
  variantId?: string;
  status?: string;
}

export interface FlashItem {
  activityId: string;
  productId: string;
  variantId: string;
  name: string;
  flashPrice: number;
  soldCount: number;
  totalStock: number;
  endAt: string;
}

/** 只保留可展示项：过滤已结束 / 售罄 / 非 active / 缺 id 的脏数据 */
export function normalizeFlashActivities(raw: FlashActivityRaw[] | null | undefined, nowMs: number): FlashItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FlashItem[] = [];
  for (const a of raw) {
    if (!a || !a.id || !a.productId || !a.variantId) continue;
    if (a.status && a.status !== "active") continue;
    const end = a.endAt ? Date.parse(a.endAt) : NaN;
    if (!Number.isFinite(end) || end <= nowMs) continue;
    const total = Number(a.totalStock ?? 0);
    const sold = Number(a.soldCount ?? 0);
    if (total > 0 && sold >= total) continue;
    out.push({
      activityId: String(a.id),
      productId: String(a.productId),
      variantId: String(a.variantId),
      name: a.name || "",
      flashPrice: Number(a.flashPrice ?? 0),
      soldCount: sold,
      totalStock: total,
      endAt: a.endAt as string,
    });
  }
  return out;
}

/** 楼层只挂一个计时器：取所有项里最先结束的 endAt（毫秒）；无项返回 null */
export function earliestEndAt(items: FlashItem[]): number | null {
  let min: number | null = null;
  for (const it of items) {
    const t = Date.parse(it.endAt);
    if (!Number.isFinite(t)) continue;
    if (min === null || t < min) min = t;
  }
  return min;
}

/** 剩余毫秒 → `hh:mm:ss`；不足 0 返回 `00:00:00` */
export function formatCountdown(remainMs: number): string {
  const ms = Math.max(0, remainMs);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** 已售百分比（0..100 整数）；totalStock<=0 时返回 0 */
export function soldPercent(item: Pick<FlashItem, "soldCount" | "totalStock">): number {
  if (!item.totalStock || item.totalStock <= 0) return 0;
  const pct = Math.floor((item.soldCount / item.totalStock) * 100);
  return Math.min(100, Math.max(0, pct));
}
