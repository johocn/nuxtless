<script setup lang="ts">
import { SortOrder } from "~~/types/default";
import type { OrderTabKey } from "../../utils/order-state";
import { tabOfState } from "../../utils/order-state";

const { t } = useI18n();
const activeTab = defineModel<OrderTabKey>("tab", { default: "ALL" });

const take = ref(10);
const loading = ref(true);

const { data, refresh, error } = await useAsyncGql(
  "GetOrderHistory",
  computed(() => ({
    options: { sort: { createdAt: SortOrder.DESC }, take: take.value },
  })),
  { immediate: false, server: false },
);

const rawItems = computed(() => data.value?.activeCustomer?.orders?.items ?? []);
const orders = computed(
  () =>
    rawItems.value.filter(
      // 幽灵单（0 件 0 元）过滤：加购物车自动新建的空单 / 取消失败遗留空单不上榜
      // 商户子单过滤：cross-channel 下单产生的 type=Seller 子订单仅面向商户结算/履约，
      // 客户视角只展示自己的聚合单（type=Aggregate/Regular），否则会"一单变两单"（待支付配送单+待发货自提单）
      (o) =>
        Number((o as any).totalQuantity ?? 0) > 0 &&
        (o as any).type !== "Seller",
    ),
);
const total = computed(
  () => data.value?.activeCustomer?.orders?.totalItems ?? 0,
);
const filtered = computed(() =>
  activeTab.value === "ALL"
    ? orders.value
    : orders.value.filter((o) => tabOfState(o.state) === activeTab.value),
);

async function loadMore() {
  take.value += 10;
  await refresh();
}

onMounted(async () => {
  await refresh();
  loading.value = false;
});

async function changed() {
  await refresh();
}
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
