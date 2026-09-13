<script setup lang="ts">
// 入住/离店日期条：晚数 = 离店 - 入住；受 minNights/maxNights/advanceDays 约束
import { computed, ref, watch } from "vue";
const { t } = useI18n();
const productStore = useProductStore();
const hotel = computed(() => productStore.product?.customFields?.hotelRoomConfig ?? null);

const today = new Date();
const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const minDate = toDateStr(new Date(today.getTime() + 86400000)); // 最早明天入住
const maxAdvance = computed(() => {
  const adv = hotel.value?.advanceDays ?? 30;
  const d = new Date(today.getTime() + adv * 86400000);
  return toDateStr(d);
});

const checkIn = ref(minDate);
const checkOut = ref(toDateStr(new Date(today.getTime() + 2 * 86400000)));
const nights = computed(() => {
  const d = (new Date(checkOut.value).getTime() - new Date(checkIn.value).getTime()) / 86400000;
  return Math.round(d);
});
const minN = computed(() => hotel.value?.minNights ?? 1);
const maxN = computed(() => hotel.value?.maxNights ?? 30);

// 与 PricePreview 共享日期：写入 ProductStore.hotelDates（immediate 使初始默认 2 晚即同步）
watch([checkIn, checkOut], () => {
  (productStore as any).hotelDates = { checkIn: checkIn.value, checkOut: checkOut.value };
}, { immediate: true });

function onIn(v: string) {
  checkIn.value = v;
  const n = (new Date(checkOut.value).getTime() - new Date(v).getTime()) / 86400000;
  if (n < 1) {
    const d = new Date(new Date(v).getTime() + 86400000);
    checkOut.value = toDateStr(d);
  }
}
</script>

<template>
  <div v-if="hotel" class="mx-4 my-3 rounded-xl border border-gray-100 bg-white p-3 text-sm">
    <div class="flex items-center justify-between gap-2">
      <label class="flex-1">
        <span class="text-xs text-gray-400">{{ t("messages.detail.checkIn") }}</span>
        <input v-model="checkIn" type="date" class="mt-1 block w-full rounded-lg border border-gray-200 px-2 py-1.5 text-gray-700"
               :min="minDate" :max="maxAdvance" @change="onIn($event.target.value)" />
      </label>
      <label class="flex-1">
        <span class="text-xs text-gray-400">{{ t("messages.detail.checkOut") }}</span>
        <input v-model="checkOut" type="date" class="mt-1 block w-full rounded-lg border border-gray-200 px-2 py-1.5 text-gray-700"
               :min="minDate" :max="maxAdvance" />
      </label>
    </div>
    <p class="mt-2 text-xs text-gray-400">
      {{ t("messages.detail.nights", { n: nights }) }}
      <template v-if="nights > maxN || nights < minN"> · <span class="text-red-400">{{ t("messages.detail.nightsRange", { min: minN, max: maxN }) }}</span></template>
    </p>
  </div>
</template>
