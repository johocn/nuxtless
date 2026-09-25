<script setup lang="ts">
import type { OrderTabKey } from "../../utils/order-state";

const { t } = useI18n();
const activeTab = defineModel<OrderTabKey>("tab", { default: "ALL" });

const { loading, error, rawItems, orders, filtered, total, loadMore, changed } =
  useOrderList(activeTab);
</script>

<template>
  <div>
    <div
      v-if="loading"
      class="py-12 text-center text-neutral-500"
    >
      {{ t("messages.general.loading") }}
    </div>
    <div
      v-else-if="error"
      class="py-12 text-center text-neutral-500"
    >
      {{ t("messages.order.loadFailed") }}
    </div>
    <div
      v-else-if="!orders.length"
      class="py-12 text-center text-neutral-500"
    >
      {{ t("messages.order.empty") }}
    </div>
    <div
      v-else
      class="grid grid-cols-1 gap-3 md:grid-cols-2"
    >
      <OrderCard
        v-for="o in filtered"
        :key="o.id"
        :order="o"
        @changed="changed"
      />
    </div>
    <div
      v-if="rawItems.length < total"
      class="mt-4 text-center"
    >
      <UButton
        variant="soft"
        size="sm"
        :label="t('messages.order.loadMore')"
        @click="loadMore"
      />
    </div>
  </div>
</template>
