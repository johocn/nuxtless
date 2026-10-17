import { describe, expect, it } from 'vitest';
import { floorCount, sanitizeHiddenSlots } from '../shop-content';

describe('sanitizeHiddenSlots 容错（后台/历史脏数据）', () => {
  it('非数组 → 空数组', () => {
    expect(sanitizeHiddenSlots(null)).toEqual([]);
    expect(sanitizeHiddenSlots(undefined)).toEqual([]);
    expect(sanitizeHiddenSlots('brandFloor')).toEqual([]);
    expect(sanitizeHiddenSlots({ 0: 'brandFloor' })).toEqual([]);
  });
  it('逐项过滤非字符串与空白，并 trim + 去重', () => {
    expect(sanitizeHiddenSlots(['brandFloor', 1, null, '  ', 'plaza', 'brandFloor'])).toEqual([
      'brandFloor',
      'plaza',
    ]);
  });
  it('合法数组原序返回', () => {
    expect(sanitizeHiddenSlots(['hot', 'recommend'])).toEqual(['hot', 'recommend']);
  });
});

describe('floorCount 跨端楼层条数兜底（limitGoods.limit / hotGoods.pageSize）', () => {
  it('正整数原样取用', () => {
    expect(floorCount(6, 10)).toBe(6);
    expect(floorCount(1, 6)).toBe(1);
  });
  it('越界按 20 截断（与后台校验 1-20 对齐）', () => {
    expect(floorCount(21, 6)).toBe(20);
    expect(floorCount(100, 10)).toBe(20);
  });
  it('非正整数 / 非数字 → 缺省值', () => {
    expect(floorCount(0, 6)).toBe(6);
    expect(floorCount(-3, 6)).toBe(6);
    expect(floorCount(2.5, 10)).toBe(10);
    expect(floorCount(null, 6)).toBe(6);
    expect(floorCount(undefined, 10)).toBe(10);
    expect(floorCount('8' as any, 6)).toBe(6);
  });
});