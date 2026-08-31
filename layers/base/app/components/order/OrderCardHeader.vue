<script setup lang="ts">
import type { GetOrderHistoryQuery } from "#gql/default";

type OrderListOrder = NonNullable<
  GetOrderHistoryQuery["activeCustomer"]
>["orders"]["items"][number];

defineProps<{ order: OrderListOrder }>();

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2 text-sm">
      <span class="i-lucide-store" />
      <span class="font-medium">
        {{
          order.customFields?.deliveryType === "pickup"
            ? t("messages.shop.pickupInfo")
            : t("messages.account.selfOperated")
        }}
      </span>
    </div>
    <OrderStateBadge :state="order.state" />
  </div>
</template>
