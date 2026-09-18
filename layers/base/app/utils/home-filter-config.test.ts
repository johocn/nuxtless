import { describe, it, expect } from 'vitest';
import { parseHomeFilterConfig, DEFAULT_HOME_FILTER } from './home-filter-config';

describe('parseHomeFilterConfig', () => {
  it('null/undefined → 全默认', () => {
    expect(parseHomeFilterConfig(null)).toEqual(DEFAULT_HOME_FILTER);
    expect(parseHomeFilterConfig(undefined)).toEqual(DEFAULT_HOME_FILTER);
  });

  it('空对象 → 全默认', () => {
    expect(parseHomeFilterConfig({})).toEqual(DEFAULT_HOME_FILTER);
  });

  it('部分配置逐字段回退', () => {
    const cfg = parseHomeFilterConfig({ bar: { variant: 'tabs' } });
    expect(cfg.bar.variant).toBe('tabs');
    expect(cfg.bar.visible).toBe(true);
    expect(cfg.enabled).toBe(true);
    expect(cfg.defaultDelivery).toBe('MAIL');
  });

  it('模块级覆盖顶层 defaultDelivery', () => {
    const cfg = parseHomeFilterConfig({
      defaultDelivery: 'SELF_PICKUP',
      modules: { goods: { enabled: true, defaultDelivery: 'MAIL' } },
    });
    expect(cfg.defaultDelivery).toBe('SELF_PICKUP');
    expect(cfg.modules.goods.defaultDelivery).toBe('MAIL');
    expect(cfg.modules.category.defaultDelivery).toBeNull();
  });

  it('坏类型（string/数组/null 节点）→ 全默认', () => {
    expect(parseHomeFilterConfig('oops')).toEqual(DEFAULT_HOME_FILTER);
    expect(parseHomeFilterConfig([])).toEqual(DEFAULT_HOME_FILTER);
    expect(parseHomeFilterConfig({ filter: 'x' })).toEqual(DEFAULT_HOME_FILTER);
  });

  it('variant 非法值 → 回退 segmented', () => {
    const cfg = parseHomeFilterConfig({ bar: { variant: 'pill' } });
    expect(cfg.bar.variant).toBe('segmented');
  });

  it('enabled=false 整页关闭可配置', () => {
    const cfg = parseHomeFilterConfig({ enabled: false });
    expect(cfg.enabled).toBe(false);
  });
});
