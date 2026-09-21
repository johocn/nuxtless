import { describe, expect, it } from 'vitest';
import { mergePageConfig, mergeThemeTokens, parseThemeTokensOverride } from '../merge-config';

describe('mergePageConfig 合并顺序（模板为主、渠道增量）', () => {
  const tpl = {
    pages: { product: { layout: 'classic', blocks: { a: { show: true, scale: 2 }, b: { show: false } } } },
  } as any;
  const shop = { detailConfig: JSON.stringify({ blocks: { a: { show: false } } }) } as any;
  it('模板 layout 不被渠道覆盖，渠道仅覆盖同 key 块', () => {
    const r = mergePageConfig(null, tpl, shop, 'product')!;
    expect(r.layout).toBe('classic');
    expect(r.blocks.a.show).toBe(false);
    expect(r.blocks.a.scale).toBe(2);
    expect(r.blocks.b.show).toBe(false);
  });
});

describe('mergeThemeTokens 配色回退', () => {
  it('无模板/无全局时为空', () => {
    expect(mergeThemeTokens(null, null)).toEqual({});
  });
  it('模板 palette.scheme 展开 primaryColor 并覆盖全局同名', () => {
    const g = { themeTokens: { primaryColor: '#000000', radius: 4 } } as any;
    const t = { theme: { palette: { scheme: 'jd-red' } } } as any;
    const r = mergeThemeTokens(g, t);
    expect(r.primaryColor).toBe('#e1251b');
    // 说明：preset 扩展属于模板级（L2），按「全局 themeTokens ← palette 展开 tokens」语义
    // 展开的 radius 覆盖全局同名；业务需自定义圆角时应写模板显式 theme.radius。
    expect(r.radius).toBe(8);
  });
  it('未知 scheme 回退全局，不抛错', () => {
    const g = { themeTokens: { primaryColor: '#000000' } } as any;
    const t = { theme: { palette: { scheme: 'nope' } } } as any;
    const r = mergeThemeTokens(g, t);
    expect(r.primaryColor).toBe('#000000');
  });
});

describe('mergeThemeTokens L3 店铺令牌覆盖', () => {
  it('L3 覆盖 L2 palette 展开值', () => {
    const g = { themeTokens: { primaryColor: '#000000' } } as any;
    const t = { theme: { palette: { scheme: 'jd-red' } } } as any;
    const r = mergeThemeTokens(g, t, { primaryColor: '#123456' });
    expect(r.primaryColor).toBe('#123456');
  });
  it('L3 覆盖 L2 显式 theme 令牌', () => {
    const t = { theme: { primaryColor: '#aaaaaa' } } as any;
    const r = mergeThemeTokens(null, t, { primaryColor: '#bbbbbb' });
    expect(r.primaryColor).toBe('#bbbbbb');
  });
  it('L3 为 null/undefined 时结果与旧签名一致', () => {
    const g = { themeTokens: { primaryColor: '#000000' } } as any;
    expect(mergeThemeTokens(g, null, null).primaryColor).toBe('#000000');
    expect(mergeThemeTokens(g, null, undefined).primaryColor).toBe('#000000');
  });
  it('L3 缺字段不误伤其他层级', () => {
    const g = { themeTokens: { primaryColor: '#000000', radius: 4 } } as any;
    const r = mergeThemeTokens(g, null, { accentColor: '#eee' });
    expect(r.primaryColor).toBe('#000000');
    expect(r.radius).toBe(4);
    expect(r.accentColor).toBe('#eee');
  });
});

describe('parseThemeTokensOverride 坏数据一律不覆盖', () => {
  it('空值 → null', () => {
    expect(parseThemeTokensOverride('')).toBeNull();
    expect(parseThemeTokensOverride(null)).toBeNull();
    expect(parseThemeTokensOverride(undefined)).toBeNull();
  });
  it('坏 JSON / 非对象 → null', () => {
    expect(parseThemeTokensOverride('{bad')).toBeNull();
    expect(parseThemeTokensOverride('"x"')).toBeNull();
    expect(parseThemeTokensOverride('[1,2]')).toBeNull();
  });
  it('合法对象 → 原样返回', () => {
    expect(parseThemeTokensOverride('{"primaryColor":"#fff"}')).toEqual({ primaryColor: '#fff' });
  });
});