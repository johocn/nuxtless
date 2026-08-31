<script setup lang="ts">
import { ORDER_TABS } from "../../utils/order-state";
import type { OrderTabKey } from "../../utils/order-state";

const { t } = useI18n();
const model = defineModel<OrderTabKey>();

const items = ORDER_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }));
</script>

<template>
  <div class="mb-4 flex gap-1 overflow-x-auto">
    <button
      v-for="it in items"
      :key="it.key"
      class="shrink-0 rounded-full px-3 py-1 text-sm"
      :class="
        model === it.key
          ? 'bg-red-600 font-semibold text-white'
          : 'bg-neutral-100 dark:bg-neutral-800'
      "
      @click="model = it.key"
    >
      {{ it.label }}
    </button>
  </div>
</template>
