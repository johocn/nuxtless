import type { DeliveryMethod } from './productVisibility';

export interface ModuleFilterConfig {
  enabled: boolean;
  defaultDelivery: DeliveryMethod | null;
}

export interface HomeFilterBarConfig {
  visible: boolean;
  variant: 'segmented' | 'tabs';
}

export interface HomeFilterConfig {
  enabled: boolean;
  defaultDelivery: DeliveryMethod;
  bar: HomeFilterBarConfig;
  modules: {
    goods: ModuleFilterConfig;
    category: ModuleFilterConfig;
    promo: ModuleFilterConfig;
  };
}

export const DEFAULT_HOME_FILTER: HomeFilterConfig = {
  enabled: true,
  defaultDelivery: 'MAIL',
  bar: { visible: true, variant: 'segmented' },
  modules: {
    goods: { enabled: true, defaultDelivery: null },
    category: { enabled: true, defaultDelivery: null },
    promo: { enabled: true, defaultDelivery: null },
  },
};

function isObj(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function bool(v: unknown, dflt: boolean): boolean {
  return typeof v === 'boolean' ? v : dflt;
}

function delivery(v: unknown, dflt: DeliveryMethod | null): DeliveryMethod | null {
  return v === 'MAIL' || v === 'SELF_PICKUP' ? v : dflt;
}

function moduleCfg(v: unknown): ModuleFilterConfig {
  const o = isObj(v) ? v : {};
  return {
    enabled: bool(o.enabled, true),
    defaultDelivery: delivery(o.defaultDelivery, null),
  };
}

/** 解析店铺/模板/全局 home.filter 配置；坏值逐字段回退 L4 内建默认，不抛错（SSR 友好） */
export function parseHomeFilterConfig(raw: unknown): HomeFilterConfig {
  if (!isObj(raw)) return { ...DEFAULT_HOME_FILTER };
  const bar = isObj(raw.bar) ? raw.bar : {};
  return {
    enabled: bool(raw.enabled, DEFAULT_HOME_FILTER.enabled),
    defaultDelivery: delivery(raw.defaultDelivery, DEFAULT_HOME_FILTER.defaultDelivery),
    bar: {
      visible: bool(bar.visible, DEFAULT_HOME_FILTER.bar.visible),
      variant: bar.variant === 'tabs' ? 'tabs' : 'segmented',
    },
    modules: {
      goods: moduleCfg(isObj(raw.modules) ? raw.modules.goods : null),
      category: moduleCfg(isObj(raw.modules) ? raw.modules.category : null),
      promo: moduleCfg(isObj(raw.modules) ? raw.modules.promo : null),
    },
  };
}
