import { describe, expect, it } from 'vitest';
import { displayCentsFromNet, TAX_RATE_PERCENT } from './tax-price';

describe('displayCentsFromNet', () => {
  it('inclusive: 录入净价原样展示', () => {
    expect(displayCentsFromNet(20000, 'inclusive')).toBe(20000);
  });
  it('zero: 原样展示', () => {
    expect(displayCentsFromNet(20000, 'zero')).toBe(20000);
  });
  it('exclusive: 净价 × 1.13', () => {
    expect(displayCentsFromNet(20000, 'exclusive', 13)).toBe(22600);
  });
  it('exclusive: 使用默认税率 13', () => {
    expect(displayCentsFromNet(20000, 'exclusive')).toBe(22600);
  });
  it('exclusive: 四舍五入到分', () => {
    expect(displayCentsFromNet(135, 'exclusive', 13)).toBe(153);
  });
  it('默认税率常量 13', () => {
    expect(TAX_RATE_PERCENT).toBe(13);
  });
});