import { describe, expect, it } from 'vitest';
import { HOME_SKELETON, resolveHomeSections } from '../home-skeleton';
import type { ShopContent } from '../shop-content';

const keys = (content: ShopContent | null) => resolveHomeSections(content).map((r) => r.slotKey);

describe('resolveHomeSections · 空配置自动补位', () => {
  it('null → 只产出 6 个兜底槽位，全部 auto，顺序为骨架顺序', () => {
    const out = resolveHomeSections(null);
    expect(keys(null)).toEqual(['banner', 'functionGrid', 'brandFloor', 'plaza', 'hot', 'recommend']);
    expect(out.every((r) => r.auto)).toBe(true);
  });
  it('坏 JSON（sections 非数组）等同 null', () => {
    expect(keys({ version: 1, sections: undefined as any })).toEqual([
      'banner', 'functionGrid', 'brandFloor', 'plaza', 'hot', 'recommend',
    ]);
  });
  it('十宫格兜底必须显式 round（与京东现状一致）', () => {
    const grid = resolveHomeSections(null).find((r) => r.slotKey === 'functionGrid')!;
    expect(grid.section).toMatchObject({ type: 'nav', shape: 'round', layout: 'grid5x2', items: [] });
  });
  it('banner 兜底 images 为空（由 BannerBlock 回退 useHomeContent）', () => {
    const banner = resolveHomeSections(null).find((r) => r.slotKey === 'banner')!;
    expect(banner.section).toMatchObject({ type: 'banner', images: [] });
  });
});

describe('resolveHomeSections · 运营区块覆盖槽位', () => {
  it('配置 hot → hot 槽位 auto:false 且保留其配置', () => {
    const out = resolveHomeSections({ version: 1, sections: [{ type: 'hot', layout: 'sliding', limit: 8 }] });
    const hot = out.find((r) => r.slotKey === 'hot')!;
    expect(hot.auto).toBe(false);
    expect(hot.section).toMatchObject({ type: 'hot', layout: 'sliding', limit: 8 });
    // 其余兜底槽位仍自动补位
    expect(keys({ version: 1, sections: [] })).toEqual(['banner', 'functionGrid', 'brandFloor', 'plaza', 'hot', 'recommend']);
  });
  it('配置 nav → 覆盖 functionGrid，hot/recommend 仍自动补位', () => {
    const out = resolveHomeSections({ version: 1, sections: [{ type: 'nav', items: [{ label: 'A' }] }] });
    const grid = out.find((r) => r.slotKey === 'functionGrid')!;
    expect(grid.auto).toBe(false);
    expect(grid.section).toMatchObject({ type: 'nav', items: [{ label: 'A' }] });
    expect(out.filter((r) => r.auto && r.slotKey === 'hot').length).toBe(1);
  });
  it('配置 notice → 锚定十宫格上方（banner 之后、functionGrid 之前）', () => {
    const out = resolveHomeSections({ version: 1, sections: [{ type: 'notice', text: '公告' }] });
    expect(out.map((r) => r.slotKey ?? r.section.type)).toEqual([
      'banner', 'notice', 'functionGrid', 'brandFloor', 'plaza', 'hot', 'recommend',
    ]);
  });
  it('配置 coupon / latest → 各自锚定（coupon 在十宫格与品牌闪购之间；latest 在 recommend 之后）', () => {
    const out = resolveHomeSections({
      version: 1,
      sections: [{ type: 'coupon' }, { type: 'latest', collectionId: 'new' }],
    });
    expect(out.map((r) => r.slotKey ?? r.section.type)).toEqual([
      'banner', 'notice', 'functionGrid', 'coupon', 'brandFloor', 'plaza', 'goods', 'hot', 'recommend', 'latest',
    ].filter((k) => k !== 'notice' && k !== 'goods'));
  });
  it('配置 goods → 锚定品质专区与热门之间', () => {
    const out = resolveHomeSections({ version: 1, sections: [{ type: 'goods', collectionId: 'c1' }] });
    expect(out.map((r) => r.slotKey ?? r.section.type)).toEqual([
      'banner', 'functionGrid', 'brandFloor', 'plaza', 'goods', 'hot', 'recommend',
    ]);
  });
  it('两个 hot → 第一个覆盖槽位，第二个追加末尾', () => {
    const out = resolveHomeSections({
      version: 1,
      sections: [{ type: 'hot', limit: 4 }, { type: 'hot', limit: 6 }],
    });
    const hot = out.find((r) => r.slotKey === 'hot')!;
    expect(hot.section).toMatchObject({ limit: 4 });
    const extra = out.filter((r) => r.slotKey === null);
    expect(extra.length).toBe(1);
    expect(extra[0]!.section).toMatchObject({ type: 'hot', limit: 6 });
    expect(out[out.length - 1]).toBe(extra[0]);
  });
  it('未纳入骨架的类型（richText）保持原序追加末尾', () => {
    const out = resolveHomeSections({
      version: 1,
      sections: [{ type: 'richText', html: '<p>a</p>' }, { type: 'richText', html: '<p>b</p>' }],
    });
    const extra = out.filter((r) => r.slotKey === null);
    expect(extra.map((r) => (r.section as any).html)).toEqual(['<p>a</p>', '<p>b</p>']);
  });
});

describe('resolveHomeSections · hiddenSlots 显式移除', () => {
  it("hiddenSlots:['brandFloor'] → 结果无品牌闪购槽位，其余兜底不变", () => {
    expect(keys({ version: 1, sections: [], hiddenSlots: ['brandFloor'] })).toEqual([
      'banner', 'functionGrid', 'plaza', 'hot', 'recommend',
    ]);
  });
  it('hiddenSlots 含运营已覆盖的槽位 → 该运营区块一并不渲染（不追加到末尾）', () => {
    const out = resolveHomeSections({
      version: 1,
      sections: [{ type: 'hot', limit: 8 }],
      hiddenSlots: ['hot'],
    });
    expect(out.some((r) => r.section.type === 'hot')).toBe(false);
    expect(out.map((r) => r.slotKey)).toEqual(['banner', 'functionGrid', 'brandFloor', 'plaza', 'recommend']);
  });
  it('hiddenSlots 含非字符串项 → 被过滤，不抛错', () => {
    expect(() =>
      resolveHomeSections({ version: 1, sections: [], hiddenSlots: [1 as any, 'plaza'] }),
    ).not.toThrow();
    expect(keys({ version: 1, sections: [], hiddenSlots: [1 as any, 'plaza'] })).toEqual([
      'banner', 'functionGrid', 'brandFloor', 'hot', 'recommend',
    ]);
  });
});

describe('resolveHomeSections · 未知 type', () => {
  it('未知 type 丢弃且不影响其它槽位', () => {
    const out = resolveHomeSections({
      version: 1,
      sections: [{ type: 'flashSale' } as any, { type: 'richText', html: 'x' }],
    });
    expect(out.some((r) => (r.section as any).type === 'flashSale')).toBe(false);
    expect(out.filter((r) => r.slotKey === null).length).toBe(1);
    expect(out.filter((r) => r.auto).length).toBe(6);
  });
});

describe('HOME_SKELETON 常量', () => {
  it('10 个槽位，6 兜底 + 4 可选，顺序即最终渲染顺序', () => {
    expect(HOME_SKELETON.map((s) => s.key)).toEqual([
      'banner', 'notice', 'functionGrid', 'coupon', 'brandFloor', 'plaza', 'goods', 'hot', 'recommend', 'latest',
    ]);
    expect(HOME_SKELETON.filter((s) => s.fallback).length).toBe(6);
    expect(HOME_SKELETON.filter((s) => !s.fallback).map((s) => s.key)).toEqual([
      'notice', 'coupon', 'goods', 'latest',
    ]);
  });
});