<script setup lang="ts">
// 房型卡：规格/设施/特色标签 + 房间明细（房间号/楼层/景观）折叠展开
import { computed, ref } from "vue";
const { t, locale } = useI18n();
const productStore = useProductStore();
const { productName } = useProductDetailView();
const hotel = computed(() => productStore.product?.customFields?.hotelRoomConfig ?? null);
const selectedRoomNo = ref<string | null>(null);
const openRoom = ref(false);
const localize = (v: unknown) => (typeof v === "string" ? v : (v as any)?.[locale.value] ?? (v as any)?.["zh-CN"] ?? "");

const specs = computed(() => hotel.value?.specs ?? {});
const rooms = computed(() => hotel.value?.rooms ?? []);
const amenities = computed(() => (specs.value?.amenities ?? []).map(localize));
const tags = computed(() => (specs.value?.tags ?? []).map(localize));
const breakfastText = computed(() => {
  const b = specs.value?.breakfast;
  if (b === "included") return t("messages.detail.breakfastIncluded", { n: specs.value?.breakfastCount ?? 0 });
  return t("messages.detail.breakfastNotIncluded");
});
const priceText = computed(() => {
  const base = hotel.value?.basePriceCent ?? 0;
  return `¥${(base / 100).toFixed(0)}`;
});
</script>

<template>
  <div v-if="hotel" class="mx-4 mb-3 rounded-xl border border-gray-100 bg-white p-3">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-base font-medium text-gray-800">{{ productName }}</p>
        <p class="mt-1 text-xs text-gray-400">{{ specs.bedDesc || t("messages.detail.bedType") }} · {{ specs.area }}㎡ · {{ specs.capacity }}人{{ specs.addBed ? " · " + t("messages.detail.addBed") : "" }}</p>
        <p class="mt-0.5 text-xs text-gray-400">{{ breakfastText }}</p>
      </div>
      <p class="text-base font-semibold text-primary">{{ priceText }}<span class="text-xs font-normal text-gray-400">/{{ t("messages.detail.perNight") }}</span></p>
    </div>
    <div v-if="tags.length" class="mt-2 flex flex-wrap gap-1">
      <span v-for="tag in tags" :key="tag" class="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">{{ tag }}</span>
    </div>
    <div v-if="amenities.length" class="mt-2 flex flex-wrap gap-1">
      <span v-for="a in amenities" :key="a" class="rounded bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400">{{ a }}</span>
    </div>
    <template v-if="rooms.length">
      <button class="mt-3 text-xs font-medium text-primary" @click="openRoom = !openRoom">
        {{ openRoom ? t("messages.detail.collapseRooms") : t("messages.detail.expandRooms", { n: rooms.length }) }}
      </button>
      <ul v-if="openRoom" class="mt-2 divide-y divide-gray-50 border-t border-gray-100">
        <li v-for="r in rooms" :key="r.no" class="flex items-center justify-between py-1.5 text-xs text-gray-500">
          <span>{{ r.no }} {{ t("messages.detail.room") }} · {{ r.floor }}F</span>
          <span v-if="r.view" class="text-gray-400">{{ r.view }}</span>
          <span class="rounded-full border border-gray-200 px-2 py-0.5" :class="selectedRoomNo === r.no ? 'border-primary text-primary' : ''"
                @click="selectedRoomNo = r.no">{{ selectedRoomNo === r.no ? t("messages.detail.selected") : t("messages.detail.select") }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>
