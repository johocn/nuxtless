<script setup lang="ts">
definePageMeta({ middleware: "account" });

import {
  afterSalesTypeLabelKey,
  afterSalesStateInfo,
  afterSalesProgressIndex,
  AFTER_SALES_PROGRESS,
  canCancelAfterSales,
  canFillTracking,
} from "../../../utils/after-sales-state";
import { formatMoney } from "../../../utils/format-money";
import { assetSrc } from "../../../utils/image";

const { t, locale } = useI18n();
const localePath = useTenantLocalePath();
const id = useRouteParam("id");

// 该查询需登录态的 session 认证，SSR 阶段拿不到登录 cookie，改由客户端 onMounted 拉取，
// 与售后列表页 server:false 保持一致，避免 SSR 阶段 404 / 会话失效。
const { data, error, refresh } = await useAsyncGql(
  "AfterSalesRequest",
  { id },
  { immediate: false, server: false },
);
const request = computed(() => data.value?.afterSalesRequest ?? null);
const pageLoading = ref(true);
const hasError = computed(() => !!error.value || !request.value);
const { cancelRequest } = useAfterSales();

onMounted(async () => {
  try {
    await refresh();
  } catch {
    /* hasError 已覆盖 */
  } finally {
    pageLoading.value = false;
  }
});

const stateInfo = computed(() => (request.value ? afterSalesStateInfo(request.value.state) : null));
const typeKey = computed(() => (request.value ? afterSalesTypeLabelKey(request.value.type) : ""));
const amount = computed(() => (request.value ? formatMoney(request.value.refundAmount, "CNY", locale.value) : ""));
const progress = computed(() => (request.value ? afterSalesProgressIndex(request.value.state) : -1));
const preview = computed(
  () =>
    assetSrc(
      request.value?.orderLine?.featuredAsset?.preview ??
        request.value?.orderLine?.productVariant?.featuredAsset?.preview ??
        "",
      128,
    ),
);

const evidenceImages = computed(() => request.value?.evidenceImages ?? []);
const createdAtText = computed(() =>
  request.value?.createdAt ? new Date(request.value.createdAt).toLocaleString(locale.value) : "",
);
const updatedAtText = computed(() =>
  request.value?.updatedAt ? new Date(request.value.updatedAt).toLocaleString(locale.value) : "",
);

// 凭证图灯箱
const lightboxOpen = ref(false);
const activeEvidence = ref<string>("");
function openEvidence(src: string) {
  activeEvidence.value = src;
  lightboxOpen.value = true;
}

// 取消确认弹窗
const cancelConfirmOpen = ref(false);
const canceling = ref(false);
async function onCancelConfirm() {
  if (!request.value) return;
  canceling.value = true;
  try {
    const res = await cancelRequest(request.value.id);
    cancelConfirmOpen.value = false;
    if (res.ok) await refresh();
  } finally {
    canceling.value = false;
  }
}
</script>

<template>
  <BaseLoader v-if="pageLoading" width="sm:w-xs md:w-sm" />
  <UError
    v-else-if="hasError"
    :error="{ statusCode: 404, statusMessage: t('messages.afterSales.notFound'), message: t('messages.afterSales.notFound') }"
  />
  <main v-else-if="request" class="container mb-14">
    <header class="my-14">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{{ t("messages.afterSales.detailTitle") }}</h1>
        <UBadge v-if="stateInfo" :color="stateInfo.color" variant="outline" :label="t(stateInfo.labelKey)" />
      </div>
      <ULink :to="localePath('/account/after-sales')" class="mt-2 text-sm">{{ t("messages.afterSales.backToList") }}</ULink>
      <ULink
        v-if="request.order?.code"
        :to="localePath(`/account/orders/${request.order.code}`)"
        class="mt-1 block text-sm text-primary"
      >
        {{ t("messages.afterSales.orderCode") }}: {{ request.order.code }}
      </ULink>
    </header>

    <!-- 进度时间线 -->
    <ol v-if="progress >= 0" class="mb-6 flex items-center gap-1 text-xs">
      <li v-for="(s, i) in AFTER_SALES_PROGRESS" :key="s" class="flex items-center gap-1">
        <div
          class="rounded-full px-2 py-0.5"
          :class="
            i < progress
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
              : i === progress
                ? 'bg-primary text-white'
                : 'bg-neutral-100 text-neutral-500'
          "
        >
          {{ t(`messages.afterSales.step${s}`) }}
        </div>
        <i v-if="i < AFTER_SALES_PROGRESS.length - 1" class="h-px w-5 bg-neutral-300"></i>
      </li>
    </ol>
    <dl class="mb-6 flex flex-wrap gap-x-8 gap-y-1 text-xs text-neutral-500">
      <div v-if="createdAtText"><dt class="inline">{{ t("messages.afterSales.createdAt") }}</dt> <dd class="inline">{{ createdAtText }}</dd></div>
      <div v-if="updatedAtText"><dt class="inline">{{ t("messages.afterSales.updatedAt") }}</dt> <dd class="inline">{{ updatedAtText }}</dd></div>
    </dl>

    <section class="mb-6 flex items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <NuxtImg
        :src="preview"
        :alt="request.orderLine?.productVariant?.name ?? ''"
        class="h-20 w-20 rounded object-cover"
        loading="lazy"
      />
      <div class="min-w-0">
        <p class="font-medium">{{ t(typeKey) }}</p>
        <p class="truncate text-sm text-neutral-500">{{ request.orderLine?.productVariant?.name }}</p>
        <p class="text-sm">{{ t("messages.afterSales.amount") }}: {{ amount }}</p>
      </div>
    </section>

    <dl class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.reason") }}</dt>
        <dd class="mt-1">{{ request.reason }}</dd>
      </div>
      <div v-if="request.description">
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.description") }}</dt>
        <dd class="mt-1 whitespace-pre-line">{{ request.description }}</dd>
      </div>
      <div v-if="request.rejectReason">
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.rejectReason") }}</dt>
        <dd class="mt-1 text-error">{{ request.rejectReason }}</dd>
      </div>
      <div v-if="request.returnTrackingNo">
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.trackingNo") }}</dt>
        <dd class="mt-1 font-mono">{{ request.returnCarrier }} {{ request.returnTrackingNo }}</dd>
      </div>
    </dl>

    <!-- 凭证图片 -->
    <section v-if="evidenceImages.length" class="mb-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 class="mb-3 text-sm font-medium text-neutral-500">{{ t("messages.afterSales.evidence") }}</h2>
      <div class="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <button
          v-for="(img, i) in evidenceImages"
          :key="i"
          type="button"
          class="aspect-square overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800"
          @click="openEvidence(img)"
        >
          <NuxtImg :src="assetSrc(img, 256)" :alt="t('messages.afterSales.evidence')" class="h-full w-full object-cover" loading="lazy" format="webp" />
        </button>
      </div>
    </section>
    <p v-else class="mb-6 text-xs text-neutral-400">{{ t("messages.afterSales.noEvidence") }}</p>

    <!-- 联系客服 -->
    <CustomerServiceCard class="mb-6" />

    <div class="flex flex-wrap gap-3">
      <UButton
        v-if="canCancelAfterSales(request.state)"
        color="error"
        variant="soft"
        :label="t('messages.afterSales.cancel')"
        @click="cancelConfirmOpen = true"
      />
    </div>

    <AfterSalesTrackForm
      v-if="canFillTracking(request.state)"
      :id="request.id"
      class="mt-6"
      @updated="refresh"
    />

    <!-- 凭证图灯箱 -->
    <UModal v-model:open="lightboxOpen" :ui="{ content: 'sm:max-w-xl' }">
      <div class="p-3">
        <img v-if="activeEvidence" :src="activeEvidence" :alt="t('messages.afterSales.evidence')" class="w-full rounded-md object-contain" />
      </div>
    </UModal>

    <!-- 取消确认 -->
    <UModal v-model:open="cancelConfirmOpen" :ui="{ content: 'sm:max-w-sm' }">
      <div class="p-5 text-center">
        <h2 class="text-base font-medium">{{ t("messages.afterSales.cancelConfirm") }}</h2>
        <p class="mt-1 text-sm text-neutral-500">{{ t("messages.afterSales.cancelConfirmDesc") }}</p>
        <div class="mt-5 flex justify-center gap-3">
          <UButton variant="soft" :label="t('messages.afterSales.keepRequest')" @click="cancelConfirmOpen = false" />
          <UButton color="error" :loading="canceling" :label="t('messages.afterSales.confirmCancel')" @click="onCancelConfirm" />
        </div>
      </div>
    </UModal>
  </main>
</template>