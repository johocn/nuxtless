import type { PickupLocation } from "~~/.nuxt/gql/default";
import {
  nearbyPickups,
  parseCoordinates,
} from "~~/layers/base/app/utils/checkout-config";

/**
 * 自提箱「就近默认」选择：为每箱(配送档案)预选承运方式 + 就近自提点。
 * 与 usePickupSelection.resetSelection() 配对使用：
 * - 回到结算页入口 或 切换用户后调用 resetSelection() 清空旧选择，
 *   再调 ensurePickupDefaults() 按当前用户定位就近重选。
 * 仅写模块级 sel（不含后端持久化），最终在提交时 applyBox 落库。
 */
export function usePickupDefaults() {
  const orderStore = useOrderStore();
  const locationStore = useLocationStore();
  const { sel } = usePickupSelection();

  function ensurePickupDefaults() {
    const coords = locationStore.coords;
    for (const box of orderStore.orderBoxes ?? []) {
      if (box.type !== "pickup") continue;
      if (sel[box.boxKey]) continue;
      const cid =
        String(box.defaultShippingMethodId ?? "") ||
        String(box.availableShippingMethodIds?.[0] ?? "");
      const locs = (box.pickupLocations ?? []) as PickupLocation[];
      const near = nearbyPickups(locs, coords, (l) => parseCoordinates(l.coordinates));
      const nearest = near[0] ?? null;
      if (cid && nearest) {
        sel[box.boxKey] = { methodId: cid, pickupId: String(nearest.id) };
      }
    }
  }

  return { ensurePickupDefaults, sel };
}