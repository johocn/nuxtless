import { describe, it, expect } from 'vitest';
import {
  parseShopContent,
  curatedGoodsConfig,
  goodsCardLayout,
  curatedLimit,
  curatedSlugs,
  GOODS_CARD_LAYOUTS,
} from './shop-content';

describe('parseShopContent（沿用既有行为）', () => {
  it('坏 JSON / 缺 sections → null', () => {
    expect(parseShopContent('{oops')).toBeNull();
    expect(parseShopContent('{"version":1}')).toBeNull();
    expect(parseShopContent('[]')).toBeNull();
    expect(parseShopContent(null)).toBeNull();
    expect(parseShopContent('')).toBeNull();
  });

  it('合法 sections 原样返回（含 hot / recommend）', () => {
    const content = parseShopContent(
      JSON.stringify({ version: 1, sections: [{ type: 'hot' }, { type: 'recommend' }] }),
    );
    expect(content?.sections).toHaveLength(2);
    expect(content?.sections[0]?.type).toBe('hot');
  });
});

describe('goodsCardLayout（版式枚举）', () => {
  it('三种合法值原样采用', () => {
    expect(GOODS_CARD_LAYOUTS).toEqual(['compact', 'sliding', 'hero']);
    expect(goodsCardLayout('compact')).toBe('compact');
    expect(goodsCardLayout('sliding')).toBe('sliding');
    expect(goodsCardLayout('hero')).toBe('hero');
  });

  it('非法 / 缺省 / 非字符串 → compact', () => {
    expect(goodsCardLayout('masonry')).toBe('compact');
    expect(goodsCardLayout('')).toBe('compact');
    expect(goodsCardLayout(undefined)).toBe('compact');
    expect(goodsCardLayout(null)).toBe('compact');
  });
});

describe('curatedLimit（默认 10 / 上限 30）', () => {
  it('缺省 / 非法 → 10', () => {
    expect(curatedLimit(undefined)).toBe(10);
    expect(curatedLimit(null)).toBe(10);
    expect(curatedLimit(0)).toBe(10);
    expect(curatedLimit(-3)).toBe(10);
    expect(curatedLimit(2.5)).toBe(10);
    expect(curatedLimit(NaN)).toBe(10);
  });

  it('正整数采用；越上界截断为 30', () => {
    expect(curatedLimit(1)).toBe(1);
    expect(curatedLimit(10)).toBe(10);
    expect(curatedLimit(30)).toBe(30);
    expect(curatedLimit(31)).toBe(30);
    expect(curatedLimit(999)).toBe(30);
  });
});

describe('curatedSlugs（source=slugs 时的类型校验）', () => {
  it('非数组 → 空数组', () => {
    expect(curatedSlugs(undefined)).toEqual([]);
    expect(curatedSlugs(null)).toEqual([]);
    expect(curatedSlugs('a,b')).toEqual([]);
    expect(curatedSlugs({ 0: 'a' })).toEqual([]);
  });

  it('仅保留非空字符串并去重（保序）；数字 / 空串 / 嵌套项丢弃', () => {
    expect(curatedSlugs(['a', ' b ', '', '  ', 3, null, ['c'], 'a'])).toEqual(['a', 'b']);
  });
});

describe('curatedGoodsConfig（区块字段缺省兜底）', () => {
  it('hot 全部缺省：source=auto / limit=10 / layout=compact / dedupe=true', () => {
    expect(curatedGoodsConfig({ type: 'hot' })).toEqual({
      source: 'auto',
      collectionId: null,
      slugs: [],
      limit: 10,
      layout: 'compact',
      dedupe: true,
    });
  });

  it('非法 layout + 越界 limit + dedupe=false 时逐字段兜底', () => {
    const cfg = curatedGoodsConfig({
      type: 'recommend',
      source: 'collection',
      collectionId: 'featured',
      layout: 'masonry' as never,
      limit: 500,
      dedupe: false,
    });
    expect(cfg.layout).toBe('compact');
    expect(cfg.limit).toBe(30);
    expect(cfg.dedupe).toBe(false);
    expect(cfg.source).toBe('collection');
  });

  it('source=collection 但缺 collectionId → 退回 auto', () => {
    expect(curatedGoodsConfig({ type: 'hot', source: 'collection' }).source).toBe('auto');
    expect(curatedGoodsConfig({ type: 'hot', source: 'collection', collectionId: '  ' }).source).toBe('auto');
  });

  it('source=slugs：slugs 合法才生效，非法类型 / 空 → 退回 auto（slugs 亦被清洗）', () => {
    const ok = curatedGoodsConfig({ type: 'recommend', source: 'slugs', slugs: ['a', 'b', 'a'] });
    expect(ok.source).toBe('slugs');
    expect(ok.slugs).toEqual(['a', 'b']);

    const wrongType = curatedGoodsConfig({ type: 'recommend', source: 'slugs', slugs: 'a' as never });
    expect(wrongType.source).toBe('auto');
    expect(wrongType.slugs).toEqual([]);

    const mixed = curatedGoodsConfig({ type: 'recommend', source: 'slugs', slugs: [1, '', null] as never });
    expect(mixed.source).toBe('auto');

    expect(curatedGoodsConfig({ type: 'hot', source: 'slugs' as never }).source).toBe('auto');
  });

  it('hot 不识别 slugs（即使配置了也不得作为 source）', () => {
    const cfg = curatedGoodsConfig({ type: 'hot', source: 'auto', layout: 'hero', limit: 4 });
    expect(cfg.source).toBe('auto');
    expect(cfg.layout).toBe('hero');
    expect(cfg.limit).toBe(4);
  });
});
