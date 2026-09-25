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

// cn：容器＝既有 *Block 样式，观感与现状一致
const box = "rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
const titleCls = "mb-3 font-semibold";
</script>

<template>
  <section v-if="visible('status') && statusTitle" class="mb-2">
    <h2 :class="titleCls">{{ statusTitle }}</h2>
  </section>
  <OrderStatusBanner v-if="visible('status')" :order="order" variant="cn" class="mb-4" />
  <OrderProgress v-if="visible('progress')" :state="order.state" :order="order" variant="cn" class="mb-8" />

  <OrderRedemptionCard
    v-if="pickup && visible('redemption')"
    :order-code="order.code"
    :pickup-name="pickupName"
    :highlight="orderBlockHighlight(config ?? null, 'redemption')"
    variant="cn"
    class="mb-4"
  />

  <section v-if="!pickup && visible('address')" :class="['mb-4', box]">
    <OrderAddress :address="order.shippingAddress" />
  </section>

  <section v-if="visible('items')" :class="['mb-4', box]">
    <h2 :class="titleCls">{{ title('items', t('messages.shop.orderSummary')) }}</h2>
    <OrderItems :order="order">
      <template #line-actions="scope">
        <slot name="line-actions" v-bind="scope" />
      </template>
    </OrderItems>
  </section>

  <OrderPickupCard v-if="pickup && visible('pickup')" :order="order" :class="['mb-4', box]" />

  <section v-if="visible('totals')" :class="['mb-4 max-w-md', box]">
    <h2 :class="titleCls">{{ title('totals', t('messages.general.amount')) }}</h2>
    <OrderTotals :order="order" />
    <OrderShippingBreakdown :order="order" />
  </section>

  <section v-if="visible('meta')" :class="['mb-6', box]">
    <OrderMetaCard :order="order" />
  </section>

  <OrderActions v-if="visible('actions')" :order="order" variant="cn" class="mb-10" @updated="refresh" />
</template>