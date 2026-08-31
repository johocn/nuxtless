<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";

defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const { t, locale } = useI18n();
</script>

<template>
  <dl class="grid grid-cols-2 gap-4 text-sm">
    <div>
      <dt class="text-neutral-500">{{ t("messages.shop.orderCode") }}</dt>
      <dd class="font-mono font-medium">{{ order.code }}</dd>
    </div>
    <div>
      <dt class="text-neutral-500">{{ t("messages.general.date") }}</dt>
      <dd>
        {{
          order.orderPlacedAt
            ? new Date(order.orderPlacedAt).toLocaleDateString(locale)
            : t("messages.general.na")
        }}
      </dd>
    </div>
    <div>
      <dt class="text-neutral-500">{{ t("messages.general.paymentMethod") }}</dt>
      <dd>{{ order.payments?.[0]?.method || t("messages.general.na") }}</dd>
    </div>
    <div>
      <dt class="text-neutral-500">{{ t("messages.general.shippingSelect") }}</dt>
      <dd>
        {{
          order.shippingLines?.[0]?.shippingMethod?.name ||
          t("messages.general.na")
        }}
      </dd>
    </div>
  </dl>
</template>