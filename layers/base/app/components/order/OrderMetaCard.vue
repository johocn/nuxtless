<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";

defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const { t, locale } = useI18n();

function paymentLine(order: NonNullable<GetOrderByCodeQuery["orderByCode"]>): string {
  const method = order.payments?.[0]?.method || "";
  const cf = (order.customFields as any) ?? {};
  const cod = ["cash-on-delivery", "cod", "cod-payment-template", "cloud-payment-template"].includes(method) || cf.paymentType === "cod";
  const collected = !!cf.collected;
  if (cod && !collected) return t("messages.order.collectPending");
  if (collected) return t("messages.order.collected");
  return method
    ? paymentMethodLabel(method)
    : t("messages.general.na");
}

// 兜底：i18n 缺词条（返回 key）→ 直接回退显示原始 method code
function paymentMethodLabel(method: string): string {
  const key = `messages.order.paymentMethods.${method}`;
  const label = t(key);
  return label === key ? method : label;
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