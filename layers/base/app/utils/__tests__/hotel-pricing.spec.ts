import { describe, expect, it } from 'vitest';
import { calcNightPrices } from '../hotel-pricing';

const cfg = {
  basePriceCent: 88800,
  priceCalendar: [
    { type: 'weekday', rate: 1.0 },
    { type: 'weekend', rate: 1.2 },
    { type: 'holiday', rate: 1.8, dates: ['2026-10-01', '2026-10-02'] },
  ],
  longStayDiscount: [{ minNights: 3, rate: 0.9 }],
};

describe('calcNightPrices', () => {
  it('平日入住 2 晚按平日价', () => {
    const r = calcNightPrices(cfg, '2026-09-14', '2026-09-16'); // 周一→周三
    expect(r).not.toBeNull();
    expect(r!.nights).toHaveLength(2);
    expect(r!.totalCent).toBe(88800 * 2);
    expect(r!.avgCent).toBe(88800);
  });
  it('跨周末按日类型计价', () => {
    const r = calcNightPrices(cfg, '2026-09-18', '2026-09-21'); // 五、六、日（3 晚同时触发连住 9 折）
    expect(r!.nights.map(n => n.type)).toEqual(['weekend', 'weekend', 'weekend']);
    expect(r!.totalCent).toBe(Math.round(88800 * 1.2 * 3 * 0.9));
    expect(r!.avgCent).toBe(Math.round((88800 * 1.2 * 3 * 0.9) / 3));
  });
  it('节假日日期段优先', () => {
    const r = calcNightPrices(cfg, '2026-10-01', '2026-10-03'); // 国庆 1、2 日
    expect(r!.nights.map(n => n.type)).toEqual(['holiday', 'holiday']);
    expect(r!.totalCent).toBe(Math.round(88800 * 1.8 * 2));
  });
  it('连住优惠取最高档且日均价=折扣后/N', () => {
    const r = calcNightPrices(cfg, '2026-09-14', '2026-09-17'); // 3 晚
    expect(r!.totalCent).toBe(Math.round(88800 * 3 * 0.9));
    expect(r!.avgCent).toBe(Math.round((88800 * 3 * 0.9) / 3));
  });
  it('priceCent 固定价段覆盖 basePrice', () => {
    const r = calcNightPrices(
      {
        basePriceCent: 88800,
        priceCalendar: [{ type: 'weekend', priceCent: 99900 }],
      },
      '2026-09-18',
      '2026-09-19', // 周五 1 晚
    );
    expect(r!.nights[0].type).toBe('weekend');
    expect(r!.totalCent).toBe(99900);
  });
  it('坏 JSON / 缺字段返回 null', () => {
    expect(calcNightPrices(null as any, '2026-09-14', '2026-09-16')).toBeNull();
    expect(calcNightPrices({} as any, '2026-09-14', '2026-09-16')).toBeNull();
    expect(calcNightPrices(cfg, '2026-09-16', '2026-09-16')).toBeNull(); // 0 晚
  });
});
