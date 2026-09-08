<script setup lang="ts">
import type { OrderDetailConfig } from "../../utils/order-config";
import { isPickupOrder } from "../../utils/order-config";
import { useOrderDetailConfig } from "../../composables/useOrderDetailConfig";

const props = defineProps<{ order: any; refresh: () => void; config?: OrderDetailConfig | null }>();
const emit = defineEmits<{ (e: "apply", line: any): void }>();
const { t } = useI18n();
const { visible } = useOrderDetailConfig();
const block = (key: string) => props.config?.blocks?.[key];
const pickup = computed(() => isPickupOrder(props.order));

function printReceipt() {
  if (import.meta.client) window.print();
}
</script>

<template>
  <main class="container">
    <!-- 感谢头部（确认场景独有） -->
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">
        {{ t("messages.shop.orderReceived") }}
      </h1>
      <UBadge
        color="error"
        :label="t('messages.shop.thankYou')"
        trailing-icon="i-lucide-heart"
        class="text-sm font-bold"
      >
      </UBadge>
    </header>

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

    <!-- 确认场景：游客预约自提手机号补录 slot -->
    <slot name="phone-record" />

    <!-- 确认场景：完成提示 + 打印 -->
    <section class="no-print my-6 text-sm">
      <p>{{ t("messages.shop.orderThanks") }}</p>
    </section>
    <section aria-labelledby="actions-heading" class="no-print mb-10">
      <h2 id="actions-heading" class="sr-only">
        {{ t("messages.general.actions") }}
      </h2>
      <UButton variant="soft" @click="printReceipt">
        {{ t("messages.general.printReceipt") }}
      </UButton>
    </section>
  </main>
</template>

<style lang="css">
@media print {
  nav,
  header,
  footer,
  .no-print {
    display: none !important;
  }
}
</style>