<script setup lang="ts">
import type { GetOrderHistoryQuery } from "#gql/default";
import { NuxtLink } from "#components";

type OrderListOrder = NonNullable<
  GetOrderHistoryQuery["activeCustomer"]
>["orders"]["items"][number];

defineProps<{ order: OrderListOrder }>();

const localePath = useLocalePath();
const emit = defineEmits<{ (e: "changed"): void }>();
</script>

<template>
  <article
    class="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
  >
    <!-- 整卡可点跳详情：头部/商品/合计包在链接内，操作区独立于链接外，避免按钮点击误触跳转 -->
    <NuxtLink
      :to="localePath(`/account/orders/${order.code}`)"
      class="block"
    >
      <OrderCardHeader :order="order" class="mb-2" />
      <OrderCardItems :order="order" />
      <OrderCardFooter :order="order" class="mt-2" />
    </NuxtLink>
    <OrderCardActions
      :order="order"
      class="mt-3"
      @changed="emit('changed')"
    />
  </article>
</template>
