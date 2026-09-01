<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";

defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const { t, locale } = useI18n();

function paymentLine(order: NonNullable<GetOrderByCodeQuery["orderByCode"]>): string {
  const method = order.payments?.[0]?.method || "";
  const cf = (order.customFields as any) ?? {};
  const cod = method === "cash-on-delivery" || cf.paymentType === "cod";
  const collected = !!cf.collected;
  if (cod && !collected) return t("messages.order.collectPending");
  if (collected) return t("messages.order.collected");
  return method || t("messages.general.na");
}
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
      <dd>{{ paymentLine(order) }}</dd>
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