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

// mall：大圆角白卡（无描边）+ 珊瑚投影；标题带 5px 珊瑚竖条
const box = "rounded-[18px] bg-white p-4 shadow-[0_3px_14px_#1118270f]";
const titleCls = "mb-3 flex items-center text-[14.5px] font-extrabold";
const bar = "mr-2 h-[15px] w-[5px] rounded bg-[#e0433f]";
</script>

<template>
  <section v-if="visible('status') && statusTitle" class="mb-2">
    <h2 :class="titleCls"><span :class="bar" />{{ statusTitle }}</h2>
  </section>
  <OrderStatusBanner v-if="visible('status')" :order="order" variant="mall" class="mb-4" />
  <OrderProgress v-if="visible('progress')" :state="order.state" :order="order" variant="mall" class="mb-8" />

  <OrderRedemptionCard
    v-if="pickup && visible('redemption')"
    :order-code="order.code"
    :pickup-name="pickupName"
    :highlight="orderBlockHighlight(config ?? null, 'redemption')"
    variant="mall"
    class="mb-4"
  />

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

  <OrderActions v-if="visible('actions')" :order="order" variant="mall" class="mb-10" @updated="refresh" />
</template>