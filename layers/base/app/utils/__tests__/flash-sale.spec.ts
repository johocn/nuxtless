import { describe, expect, it } from 'vitest';
import { earliestEndAt, formatCountdown, normalizeFlashActivities, soldPercent } from '../flash-sale';
import type { FlashActivityRaw } from '../flash-sale';

const NOW = Date.parse('2026-10-17T12:00:00Z');

function raw(overrides: Partial<FlashActivityRaw>): FlashActivityRaw {
  return {
    id: 'a1',
    name: '秒杀一',
    startAt: '2026-10-17T00:00:00Z',
    endAt: '2026-10-17T18:00:00Z',
    flashPrice: 990,
    totalStock: 100,
    soldCount: 30,
    productId: 'p1',
    variantId: 'v1',
    status: 'active',
    ...overrides,
  };
}

describe('normalizeFlashActivities', () => {
  it('非数组 / null → 空数组', () => {
    expect(normalizeFlashActivities(null, NOW)).toEqual([]);
    expect(normalizeFlashActivities(undefined, NOW)).toEqual([]);
    expect(normalizeFlashActivities('x' as any, NOW)).toEqual([]);
  });

  it('保留 active 且未结束未售罄的有效项', () => {
    const out = normalizeFlashActivities([raw({})], NOW);
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ activityId: 'a1', productId: 'p1', flashPrice: 990, soldCount: 30, totalStock: 100 });
  });

  it('过滤：缺 id/productId/variantId 的脏数据', () => {
    const out = normalizeFlashActivities([raw({ id: '' }), raw({ productId: undefined }), raw({ variantId: undefined })], NOW);
    expect(out).toEqual([]);
  });

  it('过滤：status 非 active（scheduled/ended）', () => {
    const out = normalizeFlashActivities([raw({ status: 'scheduled' }), raw({ status: 'ended' })], NOW);
    expect(out).toEqual([]);
  });

  it('过滤：已结束（endAt <= now）与坏 endAt', () => {
    const out = normalizeFlashActivities(
      [raw({ endAt: '2026-10-17T12:00:00Z' }), raw({ endAt: '2026-10-16T00:00:00Z' }), raw({ endAt: 'not-a-date' })],
      NOW,
    );
    expect(out).toEqual([]);
  });

  it('过滤：售罄（totalStock>0 且 soldCount>=totalStock）', () => {
    expect(normalizeFlashActivities([raw({ soldCount: 100 })], NOW)).toEqual([]);
    expect(normalizeFlashActivities([raw({ soldCount: 101 })], NOW)).toEqual([]);
  });

  it('totalStock=0 视为不限量，不按售罄过滤', () => {
    const out = normalizeFlashActivities([raw({ totalStock: 0 })], NOW);
    expect(out.length).toBe(1);
    expect(out[0]!.totalStock).toBe(0);
  });

  it('缺省字段兜底：name→空串、flashPrice/soldCount→0', () => {
    const out = normalizeFlashActivities([raw({ name: undefined, flashPrice: undefined, soldCount: undefined })], NOW);
    expect(out[0]).toMatchObject({ name: '', flashPrice: 0, soldCount: 0 });
  });
});

describe('earliestEndAt', () => {
  it('取最早 endAt；坏时间戳跳过', () => {
    const items = normalizeFlashActivities(
      [
        raw({ id: 'a1', endAt: '2026-10-17T18:00:00Z' }),
        raw({ id: 'a2', endAt: '2026-10-17T15:00:00Z' }),
        raw({ id: 'a3', endAt: 'bad' }),
      ],
      NOW,
    );
    expect(earliestEndAt(items)).toBe(Date.parse('2026-10-17T15:00:00Z'));
  });

  it('空数组 → null', () => {
    expect(earliestEndAt([])).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('毫秒 → hh:mm:ss 补零', () => {
    expect(formatCountdown(3661000)).toBe('01:01:01');
    expect(formatCountdown(5000)).toBe('00:00:05');
    expect(formatCountdown(0)).toBe('00:00:00');
  });

  it('负数 → 00:00:00', () => {
    expect(formatCountdown(-1000)).toBe('00:00:00');
  });
});

describe('soldPercent', () => {
  it('按 soldCount/totalStock 取整；clamp 0-100', () => {
    expect(soldPercent({ soldCount: 30, totalStock: 100 })).toBe(30);
    expect(soldPercent({ soldCount: 1, totalStock: 3 })).toBe(33);
    expect(soldPercent({ soldCount: 200, totalStock: 100 })).toBe(100);
    expect(soldPercent({ soldCount: -5, totalStock: 100 })).toBe(0);
  });

  it('totalStock<=0 → 0', () => {
    expect(soldPercent({ soldCount: 10, totalStock: 0 })).toBe(0);
    expect(soldPercent({ soldCount: 10, totalStock: -1 })).toBe(0);
  });
});
