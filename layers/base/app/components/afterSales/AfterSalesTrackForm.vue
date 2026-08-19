<script setup lang="ts">
import { useAfterSales } from "../../composables/useAfterSales";

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ (e: "updated"): void }>();
const { t } = useI18n();
const { loading, updateTracking } = useAfterSales();
const trackingNo = ref("");
const carrier = ref("");
const errorMsg = ref<string | null>(null);

async function onSubmit() {
  errorMsg.value = null;
  if (!trackingNo.value.trim() || !carrier.value.trim()) return;
  const res = await updateTracking(props.id, trackingNo.value.trim(), carrier.value.trim());
  if (res.ok) {
    emit("updated");
    trackingNo.value = "";
    carrier.value = "";
  } else {
    errorMsg.value = res.message ?? null;
  }
}
</script>

<template>
  <div class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
    <h3 class="mb-3 font-medium">{{ t("messages.afterSales.trackTitle") }}</h3>
    <div class="grid grid-cols-2 gap-3">
      <UFormGroup :label="t('messages.afterSales.carrier')" required>
        <UInput v-model="carrier" :placeholder="t('messages.afterSales.carrierPlaceholder')" />
      </UFormGroup>
      <UFormGroup :label="t('messages.afterSales.trackingNo')" required>
        <UInput v-model="trackingNo" :placeholder="t('messages.afterSales.trackingPlaceholder')" />
      </UFormGroup>
    </div>
    <p v-if="errorMsg" class="mt-2 text-sm text-error">{{ errorMsg }}</p>
    <UButton class="mt-3" color="primary" :loading="loading" @click="onSubmit">
      {{ t("messages.afterSales.submitTracking") }}
    </UButton>
  </div>
</template>