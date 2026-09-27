// 首页骨架槽位与「自动补位」合并纯函数（SSR 友好，无副作用、不做取数）。
//
// 语义：京东兜底楼层被抽象为 6 个「兜底槽位」（fallback 非空，未配置即自动补位）；
// 另有 4 个「可选槽位」（fallback 为 null，运营不配置即不渲染）。
// 运营的同类型区块覆盖对应槽位；未被任何槽位消费的区块按原序追加到骨架末尾。
//
// 注意：分类导航（JdCategoryNav）不进骨架、不进 ShopSection 类型，由页面常驻渲染。
import { sanitizeHiddenSlots } from './shop-content';
import type { ShopContent, ShopSection } from './shop-content';

export type SkeletonSlotKey =
  // 6 个兜底槽位
  | 'banner'
  | 'functionGrid'
  | 'brandFloor'
  | 'plaza'
  | 'hot'
  | 'recommend'
  // 4 个可选槽位（无兜底）
  | 'notice'
  | 'coupon'
  | 'goods'
  | 'latest';

export interface SkeletonSlot {
  /** 槽位 key：用于 hiddenSlots，也是自动补位区块的标识 */
  key: SkeletonSlotKey;
  /** 运营同 type 的区块覆盖此槽位 */
  match: ShopSection['type'];
  /** null = 可选槽位（京东兜底楼本就没有此楼层，不补默认） */
  fallback: ShopSection | null;
}

/**
 * 骨架顺序 = 最终渲染顺序。
 * functionGrid 槽位的默认值必须显式 `shape: 'round'`：JdFunctionGrid 自身兜底是 round，
 * 而 NavGrid 传入的京东默认是 square，不显式给 round 会与改动前的十宫格视觉不一致。
 */
export const HOME_SKELETON: SkeletonSlot[] = [
  { key: 'banner',       match: 'banner',     fallback: { type: 'banner', images: [] } },
  { key: 'notice',       match: 'notice',     fallback: null },
  { key: 'functionGrid', match: 'nav',        fallback: { type: 'nav', items: [], shape: 'round', layout: 'grid5x2' } },
  { key: 'coupon',       match: 'coupon',     fallback: null },
  { key: 'brandFloor',   match: 'brandFloor', fallback: { type: 'brandFloor' } },
  { key: 'plaza',        match: 'plaza',      fallback: { type: 'plaza' } },
  { key: 'goods',        match: 'goods',      fallback: null },
  { key: 'hot',          match: 'hot',        fallback: { type: 'hot', source: 'auto', limit: 10, layout: 'compact' } },
  { key: 'recommend',    match: 'recommend',  fallback: { type: 'recommend', source: 'auto', limit: 10, layout: 'compact', dedupe: true } },
  { key: 'latest',       match: 'latest',     fallback: null },
];

export interface ResolvedSection {
  section: ShopSection;
  /** null = 运营的额外区块（未纳入骨架） */
  slotKey: SkeletonSlotKey | null;
  /** true = 本次自动补位生成 */
  auto: boolean;
}

/**
 * 合法 section type 白名单：未知 type 一律丢弃，避免渲染器拿到无法映射的区块。
 * 注意：含未纳入骨架的 `richText`（合法类型，未被任何槽位消费时按原序追加到末尾），
 * 与后台校验的 VALID_TYPES 对齐；不能仅取 HOME_SKELETON 的 match（会漏掉 richText）。
 */
const KNOWN_TYPES = new Set<string>([
  'banner', 'notice', 'nav', 'goods', 'richText',
  'hot', 'recommend', 'brandFloor', 'plaza', 'coupon', 'latest',
]);

/**
 * 骨架合并（纯函数、确定性）：
 * 1. content 为 null / sections 非数组 → 所有兜底槽位自动补位（可选槽位不产出）；
 * 2. 同类型区块取「第一个未被消费」的覆盖对应槽位，保留其全部配置；
 * 3. 槽位 key ∈ hiddenSlots → 无论覆盖还是补位都不产出（已消费的运营区块同时作废）；
 * 4. 未被消费的区块保持原序追加到末尾（slotKey: null）；
 * 5. 未知 type 丢弃（不渲染、不阻断其它槽位）。
 */
export function resolveHomeSections(content: ShopContent | null | undefined): ResolvedSection[] {
  const hidden = new Set(sanitizeHiddenSlots(content?.hiddenSlots));
  const raw = Array.isArray(content?.sections) ? content!.sections : [];
  const pool = raw.filter(
    (s): s is ShopSection => !!s && typeof s === 'object' && KNOWN_TYPES.has((s as ShopSection).type),
  );

  const consumed = new Set<number>();
  const out: ResolvedSection[] = [];

  for (const slot of HOME_SKELETON) {
    const idx = pool.findIndex((s, i) => !consumed.has(i) && s.type === slot.match);
    const covered = idx >= 0;
    if (covered) consumed.add(idx);
    if (hidden.has(slot.key)) continue;
    if (covered) out.push({ section: pool[idx]!, slotKey: slot.key, auto: false });
    else if (slot.fallback) out.push({ section: slot.fallback, slotKey: slot.key, auto: true });
  }

  pool.forEach((s, i) => {
    if (!consumed.has(i)) out.push({ section: s, slotKey: null, auto: false });
  });

  return out;
}