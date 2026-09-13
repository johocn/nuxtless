<script setup lang="ts">
// 预订规则卡：入住/离店时间、取消政策、押金、加床费
import { computed } from "vue";
const { t } = useI18n();
const productStore = useProductStore();
const hotel = computed(() => productStore.product?.customFields?.hotelRoomConfig ?? null);
const cancelText = computed(() => {
  const c = hotel.value?.cancelPolicy;
  if (!c) return "";
  if (c.type === "nonRefundable") return t("messages.detail.nonRefundable");
  return t("messages.detail.freeUntil", { h: c.freeUntilHours ?? 24 });
});
const depositText = computed(() => {
  const d = hotel.value?.depositType ?? "none";
  if (d === "payAtHotel") return t("messages.detail.payAtHotel");
  if (d === "prepay") return t("messages.detail.prepay");
  return t("messages.detail.noDeposit");
});
</script>

<template>
  <div v-if="hotel" class="mx-4 mb-3 rounded-xl border border-gray-100 bg-white p-3 text-xs text-gray-500">
    <p class="flex justify-between"><span class="text-gray-400">{{ t("messages.detail.checkInOut") }}</span><span>{{ hotel.checkInTime }} / {{ hotel.checkOutTime }}</span></p>
    <p class="mt-1.5 flex justify-between"><span class="text-gray-400">{{ t("messages.detail.cancelPolicy") }}</span><span>{{ cancelText }}</span></p>
    <p class="mt-1.5 flex justify-between"><span class="text-gray-400">{{ t("messages.detail.deposit") }}</span><span>{{ depositText }}</span></p>
    <p v-if="hotel.specs?.addBed" class="mt-1.5 flex justify-between"><span class="text-gray-400">{{ t("messages.detail.addBedFee") }}</span><span>¥{{ ((hotel.specs.addBedFeeCent ?? 0) / 100).toFixed(0) }}</span></p>
  </div>
</template>
