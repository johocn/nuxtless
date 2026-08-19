<script setup lang="ts">
import { useAfterSales } from "../../composables/useAfterSales";

const props = defineProps<{
  orderId: string;
  orderLine: { id: string; proratedLinePrice?: number; productVariant?: { name?: string } | null };
  maxAmount: number;
}>();

const isOpen = defineModel<boolean>("open", { default: false });
const { loading, createRequest } = useAfterSales();
const { t } = useI18n();
const localePath = useLocalePath();

const typeItems = computed(() => [
  { value: "return_refund", label: t("messages.afterSales.typeReturnRefund") },
  { value: "refund_only", label: t("messages.afterSales.typeRefundOnly") },
  { value: "exchange", label: t("messages.afterSales.typeExchange") },
]);

const refundAmount = ref<number>(Math.max(1, Math.floor(props.maxAmount)));
const selectedType = ref<string>("return_refund");
const reason = ref("");
const description = ref("");
const formError = ref<string | null>(null);

const productName = computed(() => props.orderLine.productVariant?.name ?? "");
const canSubmit = computed(
  () => !loading.value && !!reason.value.trim() && refundAmount.value > 0 && refundAmount.value <= props.maxAmount,
);

async function onSubmit() {
  formError.value = null;
  if (!canSubmit.value) return;
  const res = await createRequest({
    orderId: props.orderId,
    orderLineId: props.orderLine.id,
    type: selectedType.value,
    reason: reason.value.trim(),
    description: description.value.trim() || null,
    refundAmount: Math.floor(refundAmount.value),
  });
  isOpen.value = false;
  if (res.ok && res.id) {
    navigateTo(localePath(`/account/after-sales/${res.id}`));
  } else {
    formError.value = res.message ?? null;
  }
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #body>
      <div class="space-y-4">
        <h3 class="text-lg font-semibold">{{ t("messages.afterSales.applyTitle") }}</h3>
        <p class="text-sm text-neutral-500">{{ productName }}</p>

        <UFormGroup :label="t('messages.afterSales.type')">
          <select
            v-model="selectedType"
            class="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option v-for="o in typeItems" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </UFormGroup>

        <UFormGroup :label="t('messages.afterSales.refundAmount')" :hint="`${t('messages.afterSales.amountHint')}: ${maxAmount}`">
          <UInput v-model.number="refundAmount" type="number" min="1" :max="maxAmount" />
        </UFormGroup>

        <UFormGroup :label="t('messages.afterSales.reason')" required>
          <UInput v-model="reason" :placeholder="t('messages.afterSales.reasonPlaceholder')" />
        </UFormGroup>

        <UFormGroup :label="t('messages.afterSales.description')">
          <UTextarea v-model="description" :placeholder="t('messages.afterSales.descPlaceholder')" />
        </UFormGroup>

        <p v-if="formError" class="text-sm text-error">{{ formError }}</p>
        <p v-else-if="!canSubmit" class="text-sm text-neutral-500">{{ t("messages.afterSales.reasonHint") }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton variant="ghost" :label="t('messages.afterSales.cancel')" @click="isOpen = false" />
        <UButton color="primary" :loading="loading" :disabled="!canSubmit" :label="t('messages.afterSales.submit')" @click="onSubmit" />
      </div>
    </template>
  </UModal>
</template>