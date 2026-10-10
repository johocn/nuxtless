// 酒店逐日计价纯函数（SSR 友好：无 DOM/无副作用）
// 晚数 N = 离店日期 − 入住日期（天数差，入住当日计第 1 晚；N ≥ 1）
// 判定优先级：custom > holiday > weekend（周五~周日）> weekday（周一~周四）
export type PriceSegmentType = 'weekday' | 'weekend' | 'holiday' | 'custom';

export interface PriceSegment {
  type: PriceSegmentType;
  rate?: number;
  priceCent?: number;
  dates?: string[];
}

export interface HotelPricingInput {
  basePriceCent?: number;
  priceCalendar?: PriceSegment[];
  longStayDiscount?: Array<{ minNights: number; rate: number }>;
}

/** 房价方案套用（与后端 rate-plan-logic 同语义）：discount 千分比 / fixed 固定价 / surcharge 加价 */
export interface RatePlanAdjustment {
  adjustType: "discount" | "fixed" | "surcharge";
  adjustValue: number;
}

/** 单晚价套用方案：discount ×adjustValue/1000；fixed =adjustValue；surcharge +adjustValue（四舍五入到分） */
export function applyNightlyAdjustment(basePriceCent: number, adj: RatePlanAdjustment | null | undefined): number {
  if (!adj) return basePriceCent;
  const v = Math.round(adj.adjustValue);
  if (adj.adjustType === "discount") return Math.round((basePriceCent * v) / 1000);
  if (adj.adjustType === "fixed") return v;
  return basePriceCent + v;
}

export interface NightPrice {
  date: string;
  priceCent: number;
  type: PriceSegmentType;
}

export interface NightPriceResult {
  nights: NightPrice[];
  totalCent: number;
  avgCent: number;
}

export function dayTypeFor(dateStr: string, segments: PriceSegment[]): PriceSegmentType {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return 'weekday';
  for (const seg of segments) {
    if ((seg.type === 'holiday' || seg.type === 'custom') && seg.dates?.includes(dateStr)) {
      return seg.type;
    }
  }
  const dow = d.getDay();
  return dow === 0 || dow === 5 || dow === 6 ? 'weekend' : 'weekday';
}

export function calcNightPrices(
  cfg: HotelPricingInput | null | undefined,
  checkIn: string,
  checkOut: string,
  ratePlan?: RatePlanAdjustment | null,
): NightPriceResult | null {
  if (!cfg || typeof cfg.basePriceCent !== 'number' || cfg.basePriceCent < 0) return null;
  const segments: PriceSegment[] = Array.isArray(cfg.priceCalendar) ? cfg.priceCalendar : [];
  const inD = new Date(checkIn + 'T00:00:00');
  const outD = new Date(checkOut + 'T00:00:00');
  if (Number.isNaN(inD.getTime()) || Number.isNaN(outD.getTime())) return null;
  const nights = Math.round((outD.getTime() - inD.getTime()) / 86400000);
  if (nights < 1) return null;

  const nightsOut: NightPrice[] = [];
  let baseTotal = 0;
  for (let i = 0; i < nights; i++) {
    const day = new Date(inD.getTime() + i * 86400000);
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const type = dayTypeFor(dateStr, segments);
    const seg = segments.find(s => s.type === type && (!s.dates || s.dates.includes(dateStr))) ?? segments.find(s => s.type === type);
    let price = cfg.basePriceCent;
    if (seg) {
      price = seg.priceCent != null ? seg.priceCent : Math.round(cfg.basePriceCent * (seg.rate ?? 1));
    }
    nightsOut.push({ date: dateStr, priceCent: applyNightlyAdjustment(price, ratePlan), type });
    baseTotal += nightsOut[nightsOut.length - 1].priceCent;
  }

  // 连住折扣：fixed 方案为固定价直接生效，不再叠加；discount/surcharge 继续叠加
  const discounts = (cfg.longStayDiscount ?? []).filter(d => nights >= d.minNights).sort((a, b) => b.minNights - a.minNights);
  const rate = ratePlan?.adjustType === 'fixed' ? 1 : discounts.length ? discounts[0].rate : 1;
  const totalCent = Math.round(baseTotal * rate);
  return { nights: nightsOut, totalCent, avgCent: Math.round(totalCent / nights) };
}
