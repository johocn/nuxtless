<script setup lang="ts">
import type { GetOrderHistoryQuery } from "#gql/default";
import { assetSrc } from "../../utils/image";

type OrderListOrder = NonNullable<
  GetOrderHistoryQuery["activeCustomer"]
>["orders"]["items"][number];

const props = defineProps<{ order: OrderListOrder }>();

const { locale } = useI18n();

const fmt = (amount: number) =>
  new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: props.order.currencyCode || "CNY",
  }).format(amount / 100);
</script>

<template>
  <ul class="divide-y">
    <li
      v-for="line in order.lines"
      :key="line.id"
      class="flex items-center gap-3 py-2"
    >
      <NuxtImg
        :src="assetSrc(line.featuredAsset?.preview, 96)"
        :alt="line.productVariant?.name ?? ''"
        class="h-12 w-12 rounded object-cover"
        loading="lazy"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">
          {{ line.productVariant?.name }}
        </p>
        <p class="text-xs text-neutral-500">×{{ line.quantity }}</p>
      </div>
      <p class="text-sm font-medium">{{ fmt(line.linePriceWithTax) }}</p>
    </li>
  </ul>
</template>
