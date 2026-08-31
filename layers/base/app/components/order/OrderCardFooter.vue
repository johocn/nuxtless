<script setup lang="ts">
import type { GetOrderHistoryQuery } from "#gql/default";
import { formatMoney } from "../../utils/format-money";

type OrderListOrder = NonNullable<
  GetOrderHistoryQuery["activeCustomer"]
>["orders"]["items"][number];

const props = defineProps<{ order: OrderListOrder }>();

const { t, locale } = useI18n();

const actualPaid = formatMoney(
  props.order.totalWithTax,
  props.order.currencyCode,
  locale.value,
);
</script>

<template>
  <div class="flex items-center justify-between border-t pt-2 text-sm">
    <span class="text-neutral-500">
      {{ t("messages.order.totalItems", { n: order.totalQuantity }) }}
    </span>
    <span>
      {{ t("messages.order.actualPaid") }}
      <b>{{ actualPaid }}</b>
    </span>
  </div>
</template>
