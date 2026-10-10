// 酒店房价方案拉取：按变体 + 入住日查询当前会员可见方案（C 端 RatePlanChips 用）
// 可见性口径：enabled + 会员达标（memberOnly ≤ 当前 memberLevel）+ 售卖期含入住日（fail-closed）
import { computed, ref, watch, type Ref } from 'vue';

export interface HotelRatePlanChip {
  id: string;
  code: string;
  name: string;
  adjustType: 'discount' | 'fixed' | 'surcharge';
  adjustValue: number;
  memberOnly: string | null;
  /** 日均价预估（分）：变体基准价套用单晚方案价 */
  avgNightlyEstimateCent: number;
}

export function useHotelRatePlans(
  variantId: Ref<string | number | null | undefined>,
  checkIn: Ref<string>,
) {
  const plans = ref<HotelRatePlanChip[]>([]);
  const loading = ref(false);

  async function load() {
    const vid = variantId.value;
    const ci = checkIn.value;
    if (!vid || !ci) {
      plans.value = [];
      return;
    }
    loading.value = true;
    try {
      const res = await GqlHotelRatePlans({
        variantId: String(vid),
        checkIn: ci,
      });
      plans.value = (res?.hotelRatePlans ?? []) as HotelRatePlanChip[];
    } catch {
      // 方案拉取失败不阻塞下单（服务端仍按 code 计价），仅不展示 chips
      plans.value = [];
    } finally {
      loading.value = false;
    }
  }

  watch(() => [variantId.value, checkIn.value], load, { immediate: true });

  const byCode = computed(() => {
    const m = new Map<string, HotelRatePlanChip>();
    for (const p of plans.value) m.set(p.code, p);
    return m;
  });

  return { plans, byCode, loading, reload: load };
}
