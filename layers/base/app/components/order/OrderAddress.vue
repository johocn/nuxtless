<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";

const props = defineProps<{
  address?: NonNullable<GetOrderByCodeQuery["orderByCode"]>["shippingAddress"] | null;
}>();
const { t } = useI18n();
const address = computed(() => props.address);
</script>

<template>
  <address v-if="address" class="not-italic">
    <div class="font-medium">
      {{ t("messages.general.shippingAddress") }}
    </div>
    <div class="mt-1 text-neutral-500">
      <div>{{ address.fullName }}</div>
      <div>{{ address.streetLine1 }}</div>
      <div v-if="address.streetLine2">{{ address.streetLine2 }}</div>
      <div>{{ address.city }} {{ address.postalCode }}</div>
      <div>{{ address.country }}</div>
    </div>
  </address>
  <p v-else class="text-neutral-500">{{ t("order.noAddress") }}</p>
</template>