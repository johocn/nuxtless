import { matchAnyCity, matchCity } from './city-match';

export type DeliveryMethod = 'MAIL' | 'SELF_PICKUP';

export interface VisibilityCtx {
  /** 当前城市；null=未授权 */
  city: string | null;
  /** 模块级配送选择 */
  delivery: DeliveryMethod;
  /**
   * 配送维度已由服务端 facet 过滤（为 true 时本地不再按配送能力判定）。
   * 搜索结果的 facet 与档案派生同源，本地再判一次会因缺 `deliveryModes` 而退回
   * 历史手工字段，与档案冲突导致误杀，故服务端已过滤时只保留城市维度。
   */
  deliveryFilteredServer?: boolean;
}

export interface ProductLike {
  /** 服务端派生的配送能力（档案真源，facet 同步结果）；缺省视为两者都支持（兜底） */
  deliveryModes?: DeliveryMethod[] | null;
  customFields?: {
    belongCity?: string | null;
    serviceCities?: Array<string | null> | null;
    /** @deprecated 手工字段，仅历史兼容；筛选一律以 deliveryModes 为准 */
    deliveryMethods?: DeliveryMethod[] | null;
  } | null;
}

/**
 * 城市维度过滤（配送维度在服务端 facet 可用时不再本地判定）。
 * 服务端过滤生效（`ctx.deliveryFilteredServer`）时只保留城市判定；
 * 服务端不可用时退回「配送 + 城市」本地判定，保持历史行为。
 */
export function isProductVisible(p: ProductLike | null | undefined, ctx: VisibilityCtx): boolean {
  // 只排除「已知不可达」：未选城市时不掌握任何城市维度信息，直接放行。
  // （否则单能力自提渠道未选城市时 belongCity 判据恒 false，会把全部商品误杀）
  if (!ctx.city) return true;
  const cf = p?.customFields ?? {};
  const serviceCities: string[] = (cf.serviceCities ?? []).map((s) => s?.trim() ?? '').filter(Boolean);
  const belongCity: string = cf.belongCity?.trim() ?? '';
  const methods: DeliveryMethod[] = p?.deliveryModes?.length
    ? p.deliveryModes
    : cf.deliveryMethods?.length
      ? cf.deliveryMethods
      : ['MAIL', 'SELF_PICKUP'];
  const isMail = methods.includes('MAIL');
  const isPickup = methods.includes('SELF_PICKUP');
  // 可寄到 X：MAIL 方式 && (serviceCities 空=全城 或 归一化后匹配 X)
  const canMail = (ctx.deliveryFilteredServer || isMail) && matchAnyCity(serviceCities, ctx.city);
  // 可自提于 X：SELF_PICKUP 方式 && (belongCity 未配置=不限制 或 归一化后匹配 X)
  const canPickup = (ctx.deliveryFilteredServer || isPickup) && (!belongCity || matchCity(belongCity, ctx.city));
  return ctx.delivery === 'SELF_PICKUP' ? canPickup : canMail;
}