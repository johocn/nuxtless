import { describe, it, expect } from 'vitest';
import { normalizeCity, matchCity, matchAnyCity } from './city-match';

describe('normalizeCity', () => {
  it('去掉末尾行政后缀并小写', () => {
    expect(normalizeCity('长春市')).toBe('长春');
    expect(normalizeCity('长春')).toBe('长春');
    expect(normalizeCity(' 北京市 ')).toBe('北京');
    expect(normalizeCity('朝阳区')).toBe('朝阳');
    expect(normalizeCity('XX县')).toBe('xx');
  });

  it('空值返回空串', () => {
    expect(normalizeCity(null)).toBe('');
    expect(normalizeCity(undefined)).toBe('');
    expect(normalizeCity('')).toBe('');
  });
});

describe('matchCity', () => {
  it('归一化后相等命中（长春市 ↔ 长春）', () => {
    expect(matchCity('长春市', '长春')).toBe(true);
    expect(matchCity('长春', '长春市')).toBe(true);
    expect(matchCity('北京市', '北京')).toBe(true);
  });

  it('前缀包含命中', () => {
    expect(matchCity('吉林省长春', '吉林省')).toBe(true);
    expect(matchCity('吉林省', '吉林省长春')).toBe(true);
  });

  it('不相关城市不命中', () => {
    expect(matchCity('长春', '北京')).toBe(false);
    expect(matchCity('吉林市', '长春')).toBe(false);
  });

  it('任一侧为空 → 放行（不判定）', () => {
    expect(matchCity('', '长春')).toBe(true);
    expect(matchCity('长春', '')).toBe(true);
    expect(matchCity(null, null)).toBe(true);
  });
});

describe('matchAnyCity', () => {
  it('非数组 / 空数组 = 不限制', () => {
    expect(matchAnyCity(null, '长春')).toBe(true);
    expect(matchAnyCity(undefined, '长春')).toBe(true);
    expect(matchAnyCity([], '长春')).toBe(true);
    expect(matchAnyCity('长春', '长春')).toBe(true);
  });

  it('city 为空 = 不限制', () => {
    expect(matchAnyCity(['长春'], null)).toBe(true);
    expect(matchAnyCity(['长春'], '')).toBe(true);
  });

  it('归一化命中 / 不命中', () => {
    expect(matchAnyCity(['长春市', '吉林'], '长春')).toBe(true);
    expect(matchAnyCity(['长春', '吉林'], '北京市')).toBe(false);
    expect(matchAnyCity([null, '长春市'], '长春')).toBe(true);
  });
});