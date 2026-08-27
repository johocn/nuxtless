<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";
import { assetSrc } from "../../utils/image";

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
  <ul class="divide-y">
    <li
      v-for="line in order.lines"
      :key="line.id"
      class="flex items-center gap-4 py-4"
    >
      <NuxtImg
        :src="assetSrc(line.featuredAsset?.preview, 128)"
        :alt="line.productVariant?.name ?? ''"
        class="h-20 w-20 rounded object-cover"
        loading="lazy"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium">{{ line.productVariant?.name }}</p>
        <p class="text-sm text-neutral-500">
          {{ t("messages.shop.price") }}: {{ fmt(line.unitPriceWithTax) }}
        </p>
      </div>
      <div class="text-right">
        <p class="text-sm">×{{ line.quantity }}</p>
        <p class="font-semibold">{{ fmt(line.linePriceWithTax) }}</p>
      </div>
      <slot name="line-actions" :line="line" :order="order" />
    </li>
  </ul>
</template>