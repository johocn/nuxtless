import { describe, it, expect } from 'vitest';
import { isProductVisible, type VisibilityCtx, type ProductLike } from './productVisibility';

const base = (patch: Partial<ProductLike['customFields']>): ProductLike => ({
  customFields: { belongCity: null, serviceCities: [], deliveryMethods: ['MAIL', 'SELF_PICKUP'], ...patch },
});

describe('isProductVisible', () => {
  it('自提-only 商品：北京隐藏、长春显示', () => {
    const p = base({ deliveryMethods: ['SELF_PICKUP'], belongCity: '长春', serviceCities: [] });
    expect(isProductVisible(p, { city: '北京', delivery: 'MAIL' })).toBe(false);
    expect(isProductVisible(p, { city: '长春', delivery: 'SELF_PICKUP' })).toBe(true);
  });

  it('邮寄全国（serviceCities 空、MAIL）：任何城市可见', () => {
    const p = base({ deliveryMethods: ['MAIL'], serviceCities: [] });
    expect(isProductVisible(p, { city: '北京', delivery: 'MAIL' })).toBe(true);
  });

  it('serviceCities 含 X 才显示', () => {
    const p = base({ deliveryMethods: ['MAIL'], serviceCities: ['长春', '吉林'] });
    expect(isProductVisible(p, { city: '长春', delivery: 'MAIL' })).toBe(true);
    expect(isProductVisible(p, { city: '北京', delivery: 'MAIL' })).toBe(false);
  });

  it('SELF_PICKUP 模式下邮寄-only 商品消失', () => {
    const p = base({ deliveryMethods: ['MAIL'], serviceCities: [] });
    expect(isProductVisible(p, { city: '长春', delivery: 'SELF_PICKUP' })).toBe(false);
  });

  it('城市未知且 MAIL 放行', () => {
    const p = base({ deliveryMethods: ['MAIL'], serviceCities: [] });
    expect(isProductVisible(p, { city: null, delivery: 'MAIL' })).toBe(true);
  });

  it('城市未知且 SELF_PICKUP 隐藏（空态触发）', () => {
    const p = base({ deliveryMethods: ['SELF_PICKUP'], belongCity: '长春', serviceCities: [] });
    expect(isProductVisible(p, { city: null, delivery: 'SELF_PICKUP' })).toBe(false);
  });
});
