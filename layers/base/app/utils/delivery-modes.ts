import type { DeliveryMethod } from './productVisibility';

/** 由结果的 facetValueIds + 渠道能力映射，折算派生能力；无匹配 → 兜底两者都支持 */
export function modesFromFacetIds(
  facetValueIds: Array<string | number> | null | undefined,
  map: Record<string, string> | null | undefined,
): DeliveryMethod[] {
  if (!map) return ['MAIL', 'SELF_PICKUP'];
  const set = new Set((facetValueIds ?? []).map(String));
  const out: DeliveryMethod[] = [];
  if (map.MAIL && set.has(String(map.MAIL))) out.push('MAIL');
  if (map.SELF_PICKUP && set.has(String(map.SELF_PICKUP))) out.push('SELF_PICKUP');
  return out.length ? out : ['MAIL', 'SELF_PICKUP'];
}

/**
 * 渠道 facet 映射 + 当前配送方式 → 服务端筛选入参（`facetValueFilters`）。
 * 映射缺失（facet 未建/未同步）或该方式无 id 时返回 null，调用方退回本地过滤。
 */
export function deliveryFacetFilter(
  map: Record<string, string> | null | undefined,
  delivery: DeliveryMethod,
): Array<{ or: string[] }> | null {
  const id = map?.[delivery];
  return id ? [{ or: [String(id)] }] : null;
}