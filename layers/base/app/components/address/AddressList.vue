<script setup lang="ts">
import type { AddressRecord } from "~~/types/address";

const props = defineProps<{
  addresses: AddressRecord[];
  defaultId?: string | null;
  loading?: boolean;
}>();
const emit = defineEmits<{
  (e: "edit", record: AddressRecord): void;
  (e: "delete", id: string): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    v-if="!loading && !addresses.length"
    class="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700"
  >
    {{ t("messages.account.noAddresses") }}
  </div>
  <div
    v-else
    class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
  >
    <USkeleton
      v-for="i in 3"
      v-if="loading"
      :key="i"
      class="h-36 rounded-lg"
    />
    <div
      v-for="record in addresses"
      :key="record.id"
      class="relative rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <UBadge
        v-if="record.id === defaultId"
        color="primary"
        variant="outline"
        class="mb-2"
      >
        {{ t("messages.account.defaultAddress") }}
      </UBadge>
      <div class="text-sm font-medium">{{ record.fullName }}</div>
      <address class="mt-1 not-italic text-sm text-neutral-500">
        <div>{{ record.streetLine1 }}</div>
        <div v-if="record.streetLine2">{{ record.streetLine2 }}</div>
        <div>{{ record.city }} {{ record.postalCode }}</div>
        <div>{{ record.countryName }}</div>
        <div v-if="record.phoneNumber">{{ record.phoneNumber }}</div>
      </address>
      <div class="mt-3 flex gap-2">
        <UButton
          size="sm"
          variant="soft"
          icon="i-lucide-pencil"
          @click="emit('edit', record)"
        >
          {{ t("messages.account.edit") }}
        </UButton>
        <UButton
          size="sm"
          color="error"
          variant="ghost"
          icon="i-lucide-trash"
          @click="emit('delete', record.id)"
        >
          {{ t("messages.account.delete") }}
        </UButton>
      </div>
    </div>
  </div>
</template>