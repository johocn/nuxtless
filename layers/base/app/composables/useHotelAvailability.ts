// 酒店房态拉取：按变体 + 入住/离店区间查询逐晚余量（C 端 DateBar 余量展示用）
// 口径：hotelAvailability 含头不含尾（checkOut 当晚不计）；remaining=null = 不限房
import { computed, ref, watch, type Ref } from 'vue';

export interface HotelAvailabilityDay {
  date: string;
  priceCent: number;
  dayType: 'weekday' | 'weekend' | 'holiday' | 'custom';
  remaining: number | null;
  closed: boolean;
}

export interface HotelRangeSummary {
  /** 区间内最紧一晚的剩余（null = 不限房或无数据） */
  minRemaining: number | null;
  /** 区间内第一个不可订（关房/满房）的日期；null = 全部可订 */
  firstBlockedDate: string | null;
  loading: boolean;
}

export function useHotelAvailability(
  variantId: Ref<string | number | null | undefined>,
  range: Ref<{ checkIn: string; checkOut: string } | null>,
) {
  const days = ref<HotelAvailabilityDay[]>([]);
  const loading = ref(false);

  async function load() {
    const r = range.value;
    if (!variantId.value || !r?.checkIn || !r?.checkOut || r.checkOut <= r.checkIn) {
      days.value = [];
      return;
    }
    loading.value = true;
    try {
      const res = await GqlHotelAvailability({
        variantId: String(variantId.value),
        from: r.checkIn,
        to: r.checkOut,
      });
      days.value = (res?.hotelAvailability ?? []) as HotelAvailabilityDay[];
    } catch {
      // 房态拉取失败不阻塞下单（服务端拦截器仍是最终防线），仅不展示余量
      days.value = [];
    } finally {
      loading.value = false;
    }
  }

  watch(() => [variantId.value, range.value?.checkIn, range.value?.checkOut], load, { immediate: true });

  const summary = computed<HotelRangeSummary>(() => {
    const nights = days.value.filter(d => d && d.date);
    let minRemaining: number | null = null;
    let firstBlockedDate: string | null = null;
    for (const d of nights) {
      if (d.closed || d.remaining === 0) {
        if (!firstBlockedDate) firstBlockedDate = d.date;
        continue;
      }
      if (d.remaining != null && (minRemaining == null || d.remaining < minRemaining)) {
        minRemaining = d.remaining;
      }
    }
    // 不可订晚存在时，最紧一晚记 0
    if (firstBlockedDate) minRemaining = 0;
    return { minRemaining, firstBlockedDate, loading: loading.value };
  });

  return { days, summary, reload: load };
}
