<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const emit = defineEmits<{
  (e: "updated"): void;
}>();
const { t } = useI18n();
const localePath = useLocalePath();
const router = useRouter();
const { loading, canCancel, cancelOrder, reorder, copyOrderLink } =
  useOrderActions();

const lines = computed(() =>
  (props.order.lines ?? []).map((l) => ({
    productVariantId: l.productVariant?.id ?? "",
    quantity: l.quantity,
  })),
);

async function onCancel() {
  const ok = await cancelOrder(props.order.state);
  if (ok) emit("updated");
}

async function onReorder() {
  const ok = await reorder(lines.value);
  if (ok) router.push(localePath("/checkout"));
}
</script>

<template>
  <div class="flex flex-wrap gap-3">
    <UButton
      v-if="canCancel(order.state)"
      icon="i-lucide-x"
      color="error"
      variant="soft"
      :loading="loading"
      :label="t('order.cancel')"
      @click="onCancel"
    />
    <UButton
      icon="i-lucide-shopping-cart"
      color="primary"
      :loading="loading"
      :label="t('order.reorder')"
      @click="onReorder"
    />
    <UButton
      icon="i-lucide-link"
      variant="ghost"
      :label="t('messages.general.getLink')"
      @click="copyOrderLink(order.code)"
    />
  </div>
</template>