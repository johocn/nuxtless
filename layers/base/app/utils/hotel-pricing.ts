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
    nightsOut.push({ date: dateStr, priceCent: price, type });
    baseTotal += price;
  }

  const discounts = (cfg.longStayDiscount ?? []).filter(d => nights >= d.minNights).sort((a, b) => b.minNights - a.minNights);
  const rate = discounts.length ? discounts[0].rate : 1;
  const totalCent = Math.round(baseTotal * rate);
  return { nights: nightsOut, totalCent, avgCent: Math.round(totalCent / nights) };
}
