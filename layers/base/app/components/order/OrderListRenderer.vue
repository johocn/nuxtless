<script setup lang="ts">
import { useOrderListConfig } from "../../composables/useOrderListConfig";
import type { OrderTabKey } from "../../utils/order-state";

const activeTab = defineModel<OrderTabKey>({ required: true });
const { layout } = useOrderListConfig();
</script>

<template>
  <!-- 本期仅卡片版式；未来按 layout 扩展 classic/table -->
  <OrderTabBar v-model="activeTab" />
  <OrderCardList v-model:tab="activeTab" />
</template>