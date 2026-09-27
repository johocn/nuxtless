/**
 * 城市名匹配单一真源（纯函数，SSR 友好）。
 *
 * 与后端 `vendure/packages/cjk-plugin/src/inventory/stock-city-filter.ts` 的
 * `cityServes` 口径对齐：那边是 trim + toLowerCase 后的「相等 / 前缀包含」；
 * 本模块在此之上再加一层「去行政后缀（省/市/区/县）」归一化，
 * 属更宽松的超集（后端能匹配的，这里一定也能匹配）。
 *
 * 消费方三处同源：productVisibility / useCityService / 后端 stock-city-filter（参照）。
 */

/** 归一化：trim + 去掉末尾的 省/市/区/县 + toLowerCase（「长春市」↔「长春」） */
export function normalizeCity(name?: string | null): string {
  if (!name) return '';
  return name.trim().replace(/[省市区县]$/, '').toLowerCase();
}

/**
 * 两个城市名是否匹配：归一化后 相等 ∨ a 是 b 前缀 ∨ b 是 a 前缀。
 * 任一侧为空时按「不判定 → 匹配」处理（与设计文档「任何一侧为空 → 放行」一致）。
 */
export function matchCity(a?: string | null, b?: string | null): boolean {
  const x = normalizeCity(a);
  const y = normalizeCity(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/**
 * serviceCities 型数组匹配（语义同后端 `cityServes`）：
 * - 非数组 / 空数组 = 不限制（返回 true）；
 * - city 为空 = 不限制（返回 true）；
 * - 否则：数组内任一项与 city 匹配即命中。
 */
export function matchAnyCity(list: unknown, city?: string | null): boolean {
  if (!Array.isArray(list) || list.length === 0) return true;
  if (!city || !city.trim()) return true;
  return list.some((s) => typeof s === 'string' && matchCity(s, city));
}