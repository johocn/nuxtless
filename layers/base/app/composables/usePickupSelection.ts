import { reactive } from "vue";

/**
 * 自提点选择状态的模块级可重置单例（供 BoxPickupBlock 与 checkout/index.vue 共用）：
 * - `sel` 每箱(配送档案)已选自提点/承运方式；
 * - `boxSearch` 每箱自提点搜索关键词；`boxExpanded` 每箱选择器展开态。
 * 模块单例在 SPA 内跨路由、跨登录用户存活，必须暴露 resetSelection()
 * 在切换用户/重新进入结算页时清空，避免沿用上一用户的已选自提点。
 */
const sel = reactive<Record<string, { methodId: string; pickupId: string }>>({});
const boxSearch = reactive<Record<string, string>>({});
const boxExpanded = reactive<Record<string, boolean>>({});

export function usePickupSelection() {
  function resetSelection() {
    for (const k of Object.keys(sel)) delete sel[k];
    for (const k of Object.keys(boxSearch)) delete boxSearch[k];
    for (const k of Object.keys(boxExpanded)) delete boxExpanded[k];
  }

  return { sel, boxSearch, boxExpanded, resetSelection };
}