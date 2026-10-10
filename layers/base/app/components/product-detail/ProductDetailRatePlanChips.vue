<script setup lang="ts">
// 房价方案 chips：当前会员可见方案横向滑动选择（写入 ProductStore.selectedRatePlanCode）
// 选中后下单行带 ratePlanCode（服务端校验可用性，坏码/不可售静默回退基价），价格预览同步重算
import { computed, watch } from "vue";
import { useHotelRatePlans } from "../../composables/useHotelRatePlans";
const { t } = useI18n();
const productStore = useProductStore();

const variantId = computed(() => productStore.selectedVariant?.id ?? null);
const checkIn = computed(() => (productStore as any).hotelDates?.checkIn ?? "");
const { plans } = useHotelRatePlans(variantId, checkIn);

// 切换变体/清空时丢弃不在可见列表里的旧选择（可见性随会员/日期变化）
watch(plans, (list) => {
  // 同步方案快照给 PricePreview 重算
  productStore.ratePlanChips = list.map((p) => ({
    code: p.code,
    name: p.name,
    adjustType: p.adjustType,
    adjustValue: p.adjustValue,
  }));
  const code = productStore.selectedRatePlanCode;
  if (code && !list.some((p) => p.code === code)) {
    productStore.selectedRatePlanCode = "";
  }
}, { immediate: true });

function toggle(code: string) {
  productStore.selectedRatePlanCode = productStore.selectedRatePlanCode === code ? "" : code;
}

const badge = (p: { adjustType: string; memberOnly: string | null }): string => {
  if (p.memberOnly) return t("messages.hotel.planMember");
  if (p.adjustType === "fixed") return t("messages.hotel.planFixed");
  if (p.adjustType === "surcharge") return t("messages.hotel.planSurcharge");
  return t("messages.hotel.planDiscount");
};
</script>

<template>
  <!-- 方案 chips：无可见方案（或非酒店）不渲染；日期未选时后端按 null 不限，进入页面即有默认入住日 -->
  <div v-if="plans.length" class="mx-4 mb-3 rounded-xl border border-gray-100 bg-white p-3 text-sm">
    <p class="text-xs text-gray-400">{{ t("messages.hotel.ratePlans") }}</p>
    <div class="mt-2 flex gap-2 overflow-x-auto pb-1" data-testid="rate-plan-chips">
      <!-- 标准价：清除所选方案 -->
      <button
        type="button"
        class="shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors"
        :class="!productStore.selectedRatePlanCode
          ? 'border-primary bg-primary/10 text-primary font-medium'
          : 'border-gray-200 text-gray-500'"
        @click="productStore.selectedRatePlanCode = ''"
      >
        {{ t("messages.hotel.defaultPlan") }}
      </button>
      <button
        v-for="p in plans"
        :key="p.code"
        type="button"
        class="shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors"
        :class="productStore.selectedRatePlanCode === p.code
          ? 'border-primary bg-primary/10 text-primary font-medium'
          : 'border-gray-200 text-gray-600'"
        :data-testid="`rate-plan-${p.code}`"
        @click="toggle(p.code)"
      >
        <span class="mr-1 rounded bg-orange-50 px-1 text-orange-500">{{ badge(p) }}</span>
        {{ p.name }}
        <span class="ml-1">¥{{ (p.avgNightlyEstimateCent / 100).toFixed(0) }}{{ t("messages.hotel.perNight") }}</span>
      </button>
    </div>
  </div>
</template>
