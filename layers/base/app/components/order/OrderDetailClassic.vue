<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
const props = defineProps<{ order: any; refresh: () => void; block?: OrderBlockCfg }>();
const { t } = useI18n();
function isPickup(order: any) { return (order?.customFields?.deliveryType ?? "") === "pickup"; }
</script>

<template>
  <OrderStatusBanner :order="props.order" class="mb-4" />
  <OrderProgress :state="props.order.state" class="mb-8" />

  <OrderRedemptionCard :order-code="props.order.code" class="mb-4" />

  <section class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <OrderAddress :address="props.order.shippingAddress" />
  </section>

  <section class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <h2 class="mb-3 font-semibold">{{ t("messages.shop.orderSummary") }}</h2>
    <OrderItems :order="props.order">
      <template #line-actions="scope">
        <slot name="line-actions" v-bind="scope" />
      </template>
    </OrderItems>
  </section>

  <OrderPickupCard
    v-if="isPickup(props.order)"
    :order="props.order"
    class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
  />

  <section class="mb-4 max-w-md rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <h2 class="mb-3 font-semibold">{{ t("messages.general.amount") }}</h2>
    <OrderTotals :order="props.order" />
    <OrderShippingBreakdown :order="props.order" />
  </section>

  <section class="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <OrderMetaCard :order="props.order" />
  </section>

  <OrderActions :order="props.order" @updated="props.refresh" class="mb-10" />
</template>