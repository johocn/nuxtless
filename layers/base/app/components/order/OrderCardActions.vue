<script setup lang="ts">
import type { GetOrderHistoryQuery } from "#gql/default";

type OrderListOrder = NonNullable<
  GetOrderHistoryQuery["activeCustomer"]
>["orders"]["items"][number];

const { t } = useI18n();
const localePath = useLocalePath();
const router = useRouter();
const { canCancel, cancelOrder, reorder, loading } = useOrderActions();

const props = defineProps<{ order: OrderListOrder }>();
const emit = defineEmits<{ (e: "changed"): void }>();

async function onReorder() {
  const lines = props.order.lines.map((l) => ({
    productVariantId: l.productVariant.id,
    quantity: l.quantity,
  }));
  if (await reorder(lines)) router.push(localePath("/checkout"));
}

async function onCancel() {
  if (await cancelOrder(props.order.state)) emit("changed");
}
</script>

<template>
  <div class="flex flex-wrap justify-end gap-2">
    <UButton
      v-if="canCancel(order.state)"
      size="sm"
      variant="soft"
      color="neutral"
      :label="t('messages.order.cancel')"
      :loading="loading"
      @click="onCancel"
    />
    <UButton
      size="sm"
      variant="soft"
      color="primary"
      :label="t('messages.order.reorder')"
      @click="onReorder"
    />
    <UButton
      size="sm"
      color="primary"
      :label="t('messages.order.viewDetail')"
      :to="localePath(`/account/orders/${order.code}`)"
    />
  </div>
</template>
