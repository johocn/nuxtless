<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const { t } = useI18n();

const loc = computed(() => props.order.customFields?.selectedPickupLocationId ?? null);
</script>

<template>
  <div class="flex items-start gap-3">
    <span class="mt-1 text-red-600 i-lucide-map-pin" />
    <div class="min-w-0 text-sm">
      <p class="font-medium">{{ t("messages.shop.pickupInfo") }}</p>
      <p v-if="loc?.name" class="mt-1 font-medium">{{ loc.name }}</p>
      <p v-if="loc?.address" class="text-neutral-500">{{ loc.address }}</p>
      <p v-if="loc?.businessHours" class="text-neutral-500">
        {{ loc.businessHours }}
      </p>
      <p v-if="loc?.phoneNumber" class="text-neutral-500">
        {{ t("messages.general.contactPhone") }}: {{ loc.phoneNumber }}
      </p>
      <div
        v-if="order.customFields?.contactName || order.customFields?.contactPhone"
        class="mt-2 space-y-0.5 border-t border-neutral-100 pt-2 dark:border-neutral-800"
      >
        <p v-if="order.customFields?.contactName" class="text-neutral-500">
          {{ t("messages.shop.contactName") }}:
          {{ order.customFields.contactName }}
        </p>
        <p v-if="order.customFields?.contactPhone" class="text-neutral-500">
          {{ t("messages.general.contactPhone") }}:
          {{ order.customFields.contactPhone }}
        </p>
      </div>
    </div>
  </div>
</template>