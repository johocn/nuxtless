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

const { t, locale } = useI18n();
const localePath = useLocalePath();
const id = useRouteParam("id");

const { data, error, refresh } = await useAsyncGql("AfterSalesRequest", { id });
const request = computed(() => data.value?.afterSalesRequest ?? null);
const hasError = computed(() => !!error.value || !request.value);
const { loading, cancelRequest } = useAfterSales();

const stateInfo = computed(() => (request.value ? afterSalesStateInfo(request.value.state) : null));
const typeKey = computed(() => (request.value ? afterSalesTypeLabelKey(request.value.type) : ""));
const amount = computed(() => (request.value ? formatMoney(request.value.refundAmount, "CNY", locale.value) : ""));
const progress = computed(() => (request.value ? afterSalesProgressIndex(request.value.state) : -1));
const preview = computed(
  () =>
    request.value?.orderLine?.featuredAsset?.preview ??
    request.value?.orderLine?.productVariant?.featuredAsset?.preview ??
    "",
);

async function onCancel() {
  if (!request.value) return;
  const res = await cancelRequest(request.value.id);
  if (res.ok) await refresh();
}
</script>

<template>
  <UError
    v-if="hasError"
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

    <ol v-if="progress >= 0" class="mb-8 flex items-center gap-1 text-xs">
      <li v-for="(s, i) in AFTER_SALES_PROGRESS" :key="s" class="flex items-center gap-1">
        <div class="rounded-full px-2 py-0.5" :class="i <= progress ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-500'">
          {{ t(`messages.afterSales.step${s}`) }}
        </div>
        <i v-if="i < AFTER_SALES_PROGRESS.length - 1" class="h-px w-4 bg-neutral-300"></i>
      </li>
    </ol>

    <section class="mb-8 flex items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <NuxtImg
        :src="preview"
        :alt="request.orderLine?.productVariant?.name ?? ''"
        class="h-20 w-20 rounded object-cover"
        format="webp"
      />
      <div class="min-w-0">
        <p class="font-medium">{{ t(typeKey) }}</p>
        <p class="text-sm text-neutral-500">{{ request.orderLine?.productVariant?.name }}</p>
        <p class="text-sm">{{ t("messages.afterSales.amount") }}: {{ amount }}</p>
      </div>
    </section>

    <dl class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.reason") }}</dt>
        <dd class="mt-1">{{ request.reason }}</dd>
      </div>
      <div v-if="request.description">
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.description") }}</dt>
        <dd class="mt-1">{{ request.description }}</dd>
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

    <div class="flex flex-wrap gap-3">
      <UButton
        v-if="canCancelAfterSales(request.state)"
        color="error"
        variant="soft"
        :loading="loading"
        :label="t('messages.afterSales.cancel')"
        @click="onCancel"
      />
    </div>

    <AfterSalesTrackForm
      v-if="canFillTracking(request.state)"
      :id="request.id"
      class="mt-6"
      @updated="refresh"
    />
  </main>
</template>
