<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const { t, locale } = useI18n();
const fmt = (amount: number) =>
  new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: props.order.currencyCode || "CNY",
  }).format(amount / 100);
</script>

<template>
  <dl class="space-y-2 text-sm">
    <div class="flex justify-between">
      <dt>{{ t("messages.shop.subtotal") }}</dt>
      <dd>{{ fmt(order.subTotal) }}</dd>
    </div>
    <div class="flex justify-between">
      <dt>{{ t("messages.general.shipping") }}</dt>
      <dd>{{ fmt(order.shippingWithTax) }}</dd>
    </div>
    <template v-for="d in order.discounts" :key="d.description">
      <div class="flex justify-between text-error">
        <dt>{{ d.description }}</dt>
        <dd>-{{ fmt(d.amountWithTax) }}</dd>
      </div>
    </template>
    <div class="flex justify-between border-t pt-2 text-base font-bold">
      <dt>{{ t("messages.shop.total") }}</dt>
      <dd>{{ fmt(order.totalWithTax) }}</dd>
    </div>
  </dl>
</template>