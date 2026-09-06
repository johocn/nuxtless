<script setup lang="ts">
import type { OrderDetailConfig } from "../../utils/order-config";
import { isPickupOrder } from "../../utils/order-config";
import { useOrderDetailConfig } from "../../composables/useOrderDetailConfig";
const props = defineProps<{ order: any; refresh: () => void; config?: OrderDetailConfig | null }>();
const emit = defineEmits<{ (e: "apply", line: any): void }>();
const { visible } = useOrderDetailConfig();
const block = (key: string) => props.config?.blocks?.[key];
const pickup = computed(() => isPickupOrder(props.order));
</script>

<template>
  <OrderDetailStatusBlock v-if="visible('status')" :order="order" :block="block('status')" />
  <OrderDetailProgressBlock v-if="visible('progress')" :order="order" :block="block('progress')" />
  <OrderDetailRedemptionBlock v-if="pickup && visible('redemption')" :order="order" :config="props.config" :block="block('redemption')" />
  <OrderDetailAddressBlock v-if="!pickup && visible('address')" :order="order" :block="block('address')" />
  <OrderDetailItemsBlock v-if="visible('items')" :order="order" :block="block('items')">
    <template #line-actions="scope">
      <slot name="line-actions" v-bind="scope" />
    </template>
  </OrderDetailItemsBlock>
  <OrderDetailPickupBlock v-if="pickup && visible('pickup')" :order="order" :block="block('pickup')" />
  <OrderDetailTotalsBlock v-if="visible('totals')" :order="order" :block="block('totals')" />
  <OrderDetailMetaBlock v-if="visible('meta')" :order="order" :block="block('meta')" />
  <OrderDetailActionsBlock v-if="visible('actions')" :order="order" :block="block('actions')" @updated="props.refresh" />
</template>