<script setup lang="ts">
const { t } = useI18n();
const gql = useGql();

const props = defineProps<{ orderCode: string; phone?: string }>();

interface RedemptionResult {
  redemptionCode?: string | null;
  qrPayload?: string | null;
  claimed: boolean;
}

const result = ref<RedemptionResult | null>(null);
const loading = ref(true);
const error = ref(false);

onMounted(async () => {
  try {
    const res: any = await gql("OrderRedemptionCode", {
      input: { orderCode: props.orderCode, phone: props.phone },
    });
    result.value = (res?.orderRedemptionCode ?? null) as RedemptionResult | null;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
});

const qrDataUrl = ref("");

watch(result, async (r) => {
  if (r?.qrPayload) {
    try {
      const QRCode = (await import("qrcode")).default;
      qrDataUrl.value = await QRCode.toDataURL(r.qrPayload, {
        width: 160,
        margin: 1,
      });
    } catch {
      qrDataUrl.value = "";
    }
  }
}, { immediate: true });
</script>

<template>
  <section
    class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
  >
    <h2 class="mb-3 font-semibold">{{ t("messages.order.redemptionTitle") }}</h2>
    <div v-if="loading" class="text-sm text-neutral-500">
      {{ t("messages.general.loading") }}
    </div>
    <p v-else-if="error" class="text-sm text-neutral-500">
      {{ t("messages.order.redemptionUnavailable") }}
    </p>
    <div v-else-if="result" class="flex items-center gap-4">
      <img
        v-if="qrDataUrl"
        :src="qrDataUrl"
        alt="核销码"
        class="h-24 w-24 shrink-0 rounded border border-neutral-200 dark:border-neutral-800"
      />
      <div class="min-w-0 text-sm">
        <p class="text-neutral-500">{{ t("messages.order.redemptionCodeLabel") }}</p>
        <p class="mt-1 break-all font-mono text-2xl font-bold tracking-widest">
          {{ result.redemptionCode || "--" }}
        </p>
        <UBadge
          v-if="result.claimed"
          color="neutral"
          variant="outline"
          :label="t('messages.order.redeemed')"
          class="mt-2"
        />
      </div>
    </div>
  </section>
</template>