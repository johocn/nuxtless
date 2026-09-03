<script setup lang="ts">
const { t } = useI18n();
const gql = useGql();

const props = withDefaults(defineProps<{
  orderCode: string;
  phone?: string;
  /** 高光卡开关（L3/L2 覆盖，缺省 true） */
  highlight?: boolean;
  /** 门店名（nullable：订单无自提信息则隐藏门店行） */
  pickupName?: string | null;
}>(), { highlight: true, pickupName: null });

interface RedemptionResult {
  redemptionCode?: string | null;
  qrPayload?: string | null;
  claimed: boolean;
  canAccess?: boolean;
  status?: string;
  expiresAt?: string | null;
  reissueable?: boolean;
  version?: number | null;
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
      qrDataUrl.value = await QRCode.toDataURL(r.qrPayload, { width: 164, margin: 1 });
    } catch {
      qrDataUrl.value = "";
    }
  }
}, { immediate: true });

// 状态机判优：已核销 > 已过期；重发仅作徽标（version>1）
const isClaimed = computed(() => !!result.value?.claimed);
const isExpired = computed(() => !isClaimed.value && result.value?.status === "expired");
const isExpiring = computed(() => !isClaimed.value && result.value?.status === "expiring_soon");
const isReissued = computed(() => (result.value?.version ?? 1) > 1);

const expiresText = computed(() => {
  const iso = result.value?.expiresAt;
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return t("messages.order.redeemExpiresTo", { date: `${mm}-${dd}` });
});

const fontScale = computed(() => props.highlight ? undefined : undefined); // 样式缩放由外层 config 传入
</script>

<template>
  <section
    :class="['overflow-hidden rounded-2xl border shadow-sm',
      props.highlight ? 'border-amber-150 from-amber-50 to-white bg-gradient-to-b dark:from-neutral-800 dark:to-neutral-900' : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900']"
  >
    <header class="flex items-center justify-between px-4 pb-2 pt-3">
      <h2 class="font-semibold">{{ t("messages.order.redemptionTitle") }}</h2>
      <span v-if="isExpired" class="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
        {{ t("messages.order.redeemStatusExpired") }}
      </span>
      <span v-else-if="isExpiring" class="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600">
        {{ t("messages.order.redeemStatusExpiring") }}
      </span>
      <span v-else-if="isReissued" class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        {{ t("messages.order.redeemStatusReissued") }}
      </span>
      <span v-else-if="isClaimed" class="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-500">
        {{ t("messages.order.redeemed") }}
      </span>
      <span v-else class="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
        {{ t("messages.order.redeemStatusPending") }}
      </span>
    </header>

    <div v-if="loading" class="px-4 pb-4 text-sm text-neutral-500">{{ t("messages.general.loading") }}</div>
    <p v-else-if="error" class="px-4 pb-4 text-sm text-neutral-500">
      {{ t("messages.order.redemptionUnavailable") }}
    </p>

    <div v-else-if="result" class="px-4 pb-4">
      <!-- 码区：已过期置灰遮罩 -->
      <div :class="['flex items-center justify-between rounded-xl px-4 py-3',
        props.highlight ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white' : 'border border-neutral-200',
        isExpired && 'opacity-60 grayscale']">
        <div class="min-w-0">
          <p class="text-xs opacity-80">{{ t("messages.order.redemptionCodeLabel") }}</p>
          <p class="mt-1 break-all font-mono text-3xl font-bold tracking-[0.3em]">
            {{ result.redemptionCode || "--" }}
          </p>
        </div>
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="核销码" class="h-20 w-20 shrink-0 rounded bg-white p-1" />
      </div>

      <!-- 门店行（可空隐藏） -->
      <div v-if="pickupName" class="mt-3 flex items-center justify-between text-sm">
        <span class="text-neutral-500">{{ t("messages.order.redeemPoint") }}</span>
        <span class="font-medium text-neutral-800">{{ pickupName }}</span>
      </div>

      <!-- 有效期与提示 -->
      <div class="mt-2 flex items-center justify-between text-sm">
        <span v-if="expiresText" class="text-neutral-500">{{ expiresText }}</span>
        <span v-if="isExpiring" class="text-orange-600">{{ t("messages.order.redeemExpireSoonTip") }}</span>
        <span v-else-if="isExpired" class="text-neutral-500">{{ t("messages.order.redeemExpiredTip") }}</span>
        <span v-else-if="isReissued" class="text-green-700">{{ t("messages.order.redeemReissuedTip") }}</span>
      </div>
    </div>
  </section>
</template>