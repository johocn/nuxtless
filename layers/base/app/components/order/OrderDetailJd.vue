<script setup lang="ts">
import type { OrderDetailConfig } from "../../utils/order-config";
import { isPickupOrder, localizeOrderText, orderBlockHighlight } from "../../utils/order-config";
import { useOrderDetailConfig } from "../../composables/useOrderDetailConfig";

const props = defineProps<{ order: any; refresh: () => void; config?: OrderDetailConfig | null }>();
const emit = defineEmits<{ (e: "apply", line: any): void }>();
const { t, locale } = useI18n();
const { visible } = useOrderDetailConfig();
const block = (key: string) => props.config?.blocks?.[key];
const pickup = computed(() => isPickupOrder(props.order));
const statusTitle = computed(() => title("status", ""));
/** 块标题：块定制 title 优先（L3），缺省回退 i18n 兜底（L4） */
function title(key: string, dft: string) {
  const raw = block(key)?.title;
  return raw ? localizeOrderText(raw, locale.value) : dft;
}
// 门店名尽力提取（自提点/配送自定义字段，null-safe），拿不到则隐藏
const pickupName = computed(() => {
  const o: any = props.order ?? {};
  return o?.customFields?.pickupStoreName ?? o?.delivery?.method?.name ?? o?.shippingMethod?.name ?? null;
});

// jd：小圆角白卡（无描边）+ 轻投影；标题带 3px 红竖条
const box = "rounded-md bg-white p-3 shadow-[0_1px_2px_#0000000d]";
const titleCls = "mb-2.5 flex items-center text-[0.84375rem] font-bold";
const bar = "mr-1.5 h-[13px] w-[3px] rounded-sm bg-[#e1251b]";
</script>

<template>
  <section v-if="visible('status') && statusTitle" class="mb-2">
    <h2 :class="titleCls"><span :class="bar" />{{ statusTitle }}</h2>
  </section>
  <OrderStatusBanner v-if="visible('status')" :order="order" variant="jd" class="mb-4" />
  <OrderProgress v-if="visible('progress')" :state="order.state" :order="order" variant="jd" class="mb-8" />

  <OrderRedemptionCard
    v-if="pickup && visible('redemption')"
    :order-code="order.code"
    :pickup-name="pickupName"
    :highlight="orderBlockHighlight(config ?? null, 'redemption')"
    variant="jd"
    class="mb-4"
  />

  <OrderHotelBookingCard v-if="visible('redemption')" :order="order" variant="jd" />

  <section v-if="!pickup && visible('address')" :class="['mb-4', box]">
    <OrderAddress :address="order.shippingAddress" />
  </section>

  <section v-if="visible('items')" :class="['mb-4', box]">
    <h2 :class="titleCls"><span :class="bar" />{{ title('items', t('messages.shop.orderSummary')) }}</h2>
    <OrderItems :order="order">
      <template #line-actions="scope">
        <slot name="line-actions" v-bind="scope" />
      </template>
    </OrderItems>
  </section>

  <OrderPickupCard v-if="pickup && visible('pickup')" :order="order" :class="['mb-4', box]" />

  <section v-if="visible('totals')" :class="['mb-4 max-w-md', box]">
    <h2 :class="titleCls"><span :class="bar" />{{ title('totals', t('messages.general.amount')) }}</h2>
    <OrderTotals :order="order" />
    <OrderShippingBreakdown :order="order" />
  </section>

  <section v-if="visible('meta')" :class="['mb-6', box]">
    <OrderMetaCard :order="order" />
  </section>

  <OrderActions v-if="visible('actions')" :order="order" variant="jd" class="mb-10" @updated="refresh" />
</template>