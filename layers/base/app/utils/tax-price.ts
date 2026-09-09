// 按渠道 taxMode 把「运营端录入的净价(分)」换算成 C 端展示价(分)。
// 该函数为 SSR 友好纯计算，前后协同同一口径：
//  - inclusive(含税价) / zero(零税价)：录入净价即展示价，不换算。
//  - exclusive(不含税价)：展示价 = 净价 × (1 + rate/100)，价税分离。
export type TaxMode = 'inclusive' | 'zero' | 'exclusive';
export const TAX_RATE_PERCENT = 13; // 当前生产默认税率；未来可从后台动态读取替换

export function displayCentsFromNet(netCents: number, mode: TaxMode, ratePercent = TAX_RATE_PERCENT): number {
  if (mode !== 'exclusive' || !ratePercent) return Math.round(netCents);
  return Math.round(netCents * (1 + ratePercent / 100));
}