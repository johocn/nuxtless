<script setup lang="ts">
// 逐日计价预览：calcNightPrices → 每日单价 + 总价/日均价（含节假日标注与连住折扣）
import { computed } from "vue";
import { calcNightPrices } from "../../utils/hotel-pricing";
const { t } = useI18n();
const productStore = useProductStore();
const parseHotel = (raw: unknown) => { if (typeof raw !== 'string') return raw ?? null; try { return JSON.parse(raw); } catch { return null; } };
const hotel = computed(() => parseHotel(productStore.product?.customFields?.hotelRoomConfig));
// 与 DateBar 共享日期：DateBar watch 写入 ProductStore.hotelDates（见 useProductStore），兜底取空（无日期不渲染）
const dates = computed(() => (productStore as any).hotelDates ?? { checkIn: "", checkOut: "" });

const result = computed(() => {
  if (!dates.value.checkIn || !dates.value.checkOut) return null;
  return calcNightPrices(hotel.value, dates.value.checkIn, dates.value.checkOut);
});
// 日类型 → 本地化标签（holiday/custom 高亮；weekday 不加角标）
const typeLabel = (ty: string): string =>
  ({
    weekday: t("messages.detail.tWeekday"),
    weekend: t("messages.detail.tWeekend"),
    holiday: t("messages.detail.tHoliday"),
    custom: t("messages.detail.tCustom"),
  } as Record<string, string>)[ty] ?? ty;
</script>

<template>
  <div v-if="result" class="mx-4 mb-3 rounded-xl border border-gray-100 bg-white p-3 text-sm">
    <p class="text-xs text-gray-400">{{ t("messages.detail.priceByDay") }}</p>
    <ul class="mt-2 space-y-1">
      <li v-for="n in result.nights" :key="n.date" class="flex justify-between text-xs text-gray-500">
        <span>{{ n.date }}<span v-if="n.type !== 'weekday'" class="ml-1 rounded bg-orange-50 px-1 text-orange-500">{{ typeLabel(n.type) }}</span></span>
        <span>¥{{ (n.priceCent / 100).toFixed(0) }}</span>
      </li>
    </ul>
    <div class="mt-2 flex justify-between border-t border-gray-100 pt-2">
      <span class="text-xs text-gray-400">{{ t("messages.detail.total") }}</span>
      <span class="text-base font-semibold text-primary">¥{{ (result.totalCent / 100).toFixed(0) }}</span>
    </div>
    <p class="mt-1 text-right text-xs text-gray-400">{{ t("messages.detail.avgNight") }} ¥{{ (result.avgCent / 100).toFixed(0) }}</p>
  </div>
</template>
