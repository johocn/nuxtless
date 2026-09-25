<script setup lang="ts">
import { useOrderListConfig } from "../../composables/useOrderListConfig";
import type { OrderTabKey } from "../../utils/order-state";

const activeTab = defineModel<OrderTabKey>({ required: true });
const { layout } = useOrderListConfig();
</script>

<template>
  <!-- card（默认，沿用现状）｜cn｜jd｜mall：非法值已被 orderListLayout 收敛为 card -->
  <template v-if="layout === 'cn'">
    <OrderListCn v-model="activeTab" />
  </template>
  <template v-else-if="layout === 'jd'">
    <OrderListJd v-model="activeTab" />
  </template>
  <template v-else-if="layout === 'mall'">
    <OrderListMall v-model="activeTab" />
  </template>
  <template v-else>
    <OrderTabBar v-model="activeTab" />
    <OrderCardList v-model:tab="activeTab" />
  </template>
</template>