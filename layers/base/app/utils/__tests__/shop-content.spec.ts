import { describe, expect, it } from 'vitest';
import { sanitizeHiddenSlots } from '../shop-content';

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