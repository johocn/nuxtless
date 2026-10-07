<script setup lang="ts">
definePageMeta({ middleware: "account" });

import {
  afterSalesPrimaryAction,
  afterSalesPrimaryActionLabelKey,
  afterSalesStateInfo,
  afterSalesTypeLabelKey,
  canCancelAfterSales,
  canConfirmExchange,
  canFillTracking,
} from "../../../utils/after-sales-state";
import { formatMoney } from "../../../utils/format-money";
import { assetSrc } from "../../../utils/image";

const { t, locale } = useI18n();
const localePath = useTenantLocalePath();
const id = useRouteParam("id");
const route = useRoute();

// 该查询需登录态 session 认证，SSR 阶段拿不到登录 cookie，改由客户端 onMounted 拉取
const { data, error, refresh } = await useAsyncGql(
  "AfterSalesRequest",
  { id },
  { immediate: false, server: false },
);
const request = computed(() => data.value?.afterSalesRequest ?? null);
const pageLoading = ref(true);
const hasError = computed(() => !!error.value || !request.value);
const { cancelRequest, fetchReturnAddress, exchangeReceive } = useAfterSales();

// 售后寄回地址（Approved 态展示）
const returnAddress = ref("");
const toast = useToast();
async function copyReturnAddress() {
  try {
    await navigator.clipboard.writeText(returnAddress.value);
    toast.add({ title: t("messages.afterSales.copied"), color: "success" });
  } catch {
    /* 剪贴板不可用忽略 */
  }
}

onMounted(async () => {
  try {
    await refresh();
  } catch {
    /* hasError 已覆盖 */
  } finally {
    pageLoading.value = false;
  }
  if (request.value?.state === "Approved") {
    void fetchReturnAddress().then((a) => (returnAddress.value = a));
  }
  // 从列表卡片带过来的动作直达参数
  const action = route.query.action;
  if (action === "tracking" && request.value && canFillTracking(request.value.state)) trackingOpen.value = true;
  if (action === "cancel" && request.value && canCancelAfterSales(request.value.state)) cancelConfirmOpen.value = true;
});

const stateInfo = computed(() => (request.value ? afterSalesStateInfo(request.value.state) : null));
const typeKey = computed(() => (request.value ? afterSalesTypeLabelKey(request.value.type) : ""));
const isExchange = computed(() => request.value?.type === "exchange");
const amount = computed(() =>
  request.value ? formatMoney(request.value.refundAmount, "CNY", locale.value) : "",
);
const actualAmount = computed(() =>
  request.value?.actualRefundAmount != null
    ? formatMoney(request.value.actualRefundAmount, "CNY", locale.value)
    : "",
);
const refundedAtText = computed(() =>
  request.value?.refundedAt ? new Date(request.value.refundedAt).toLocaleString(locale.value) : "",
);
const preview = computed(() =>
  assetSrc(
    request.value?.orderLine?.featuredAsset?.preview ??
      request.value?.orderLine?.productVariant?.featuredAsset?.preview ??
      "",
    128,
  ),
);

const evidenceImages = computed(() => request.value?.evidenceImages ?? []);

const primaryAction = computed(() =>
  request.value ? afterSalesPrimaryAction(request.value.state) : "none",
);
const primaryLabel = computed(() => t(afterSalesPrimaryActionLabelKey(primaryAction.value)));

// 凭证图灯箱
const lightboxOpen = ref(false);
const activeEvidence = ref<string>("");
function openEvidence(src: string) {
  activeEvidence.value = src;
  lightboxOpen.value = true;
}

// 填写退货单号弹层
const trackingOpen = ref(false);

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

// 换货确认收货（ExchangeShipped → Closed）
const exchangeConfirmOpen = ref(false);
const receiving = ref(false);
async function onExchangeReceive() {
  if (!request.value) return;
  receiving.value = true;
  try {
    const res = await exchangeReceive(request.value.id);
    exchangeConfirmOpen.value = false;
    if (res.ok) await refresh();
  } finally {
    receiving.value = false;
  }
}

function onPrimary() {
  if (primaryAction.value === "cancel") cancelConfirmOpen.value = true;
  else if (primaryAction.value === "tracking") trackingOpen.value = true;
  else if (primaryAction.value === "exchangeReceive") {
    if (request.value && canConfirmExchange(request.value.state)) exchangeConfirmOpen.value = true;
  }
}
</script>

<template>
  <BaseLoader v-if="pageLoading" width="sm:w-xs md:w-sm" />
  <UError
    v-else-if="hasError"
    :error="{ statusCode: 404, statusMessage: t('messages.afterSales.notFound'), message: t('messages.afterSales.notFound') }"
  />
  <main v-else-if="request" class="container mb-32">
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

    <!-- 你需要做什么 -->
    <AfterSalesNextStep :state="request.state">
      <div
        v-if="returnAddress"
        class="mt-3 flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div class="min-w-0">
          <p class="text-xs text-neutral-500">{{ t("messages.afterSales.returnAddress") }}</p>
          <p class="mt-0.5 text-sm break-all">{{ returnAddress }}</p>
        </div>
        <UButton size="xs" variant="soft" icon="i-lucide-copy" :label="t('messages.afterSales.copyAddress')" @click="copyReturnAddress" />
      </div>
    </AfterSalesNextStep>

    <!-- 商品卡 -->
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
        <p v-if="!isExchange" class="text-sm">{{ t("messages.afterSales.amount") }}: {{ amount }}</p>
        <p v-if="actualAmount" class="text-sm">
          {{ t("messages.afterSales.actualRefundAmount") }}: {{ actualAmount }}
        </p>
      </div>
    </section>

    <!-- 处理进度 -->
    <section class="mb-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 class="mb-3 text-sm font-medium text-neutral-500">{{ t("messages.afterSales.progressTitle") }}</h2>
      <AfterSalesTimeline :request="request" :return-address="returnAddress" />
    </section>

    <!-- 协商留言（时间线下方） -->
    <AfterSalesMessages :request="request" />

    <!-- 申请信息 -->
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
      <div v-if="request.refundedAt && refundedAtText">
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.refundedAt") }}</dt>
        <dd class="mt-1">{{ refundedAtText }}</dd>
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

    <CustomerServiceCard class="mb-6" />

    <!-- 吸底动作区 -->
    <div
      class="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      <div class="container flex items-center justify-between gap-3 py-3">
        <UButton
          icon="i-lucide-headset"
          variant="soft"
          :label="t('messages.afterSales.customerService')"
          @click="() => $el?.scrollIntoView?.()"
        />
        <UButton
          v-if="primaryAction === 'cancel' || primaryAction === 'tracking' || primaryAction === 'exchangeReceive'"
          color="primary"
          :label="primaryLabel"
          @click="onPrimary"
        />
      </div>
    </div>

    <!-- 填写退货单号 -->
    <UModal v-model:open="trackingOpen" :ui="{ content: 'sm:max-w-md' }">
      <template #body>
        <h3 class="mb-3 text-base font-medium">{{ t("messages.afterSales.trackTitle") }}</h3>
        <AfterSalesTrackForm :id="request.id" :embedded="true" @updated="refresh" />
      </template>
    </UModal>

    <!-- 凭证图灯箱 -->
    <UModal v-model:open="lightboxOpen" :ui="{ content: 'sm:max-w-xl' }">
      <!-- 必须放 #body：UModal 默认插槽是触发器，内容写那里会常驻页面 -->
      <template #body>
        <div class="p-3">
          <img v-if="activeEvidence" :src="activeEvidence" :alt="t('messages.afterSales.evidence')" class="w-full rounded-md object-contain" />
        </div>
      </template>
    </UModal>

    <!-- 取消确认 -->
    <UModal v-model:open="cancelConfirmOpen" :ui="{ content: 'sm:max-w-sm' }">
      <template #body>
        <div class="p-5 text-center">
          <h2 class="text-base font-medium">{{ t("messages.afterSales.cancelConfirm") }}</h2>
          <p class="mt-1 text-sm text-neutral-500">{{ t("messages.afterSales.cancelConfirmDesc") }}</p>
          <div class="mt-5 flex justify-center gap-3">
            <UButton variant="soft" :label="t('messages.afterSales.keepRequest')" @click="cancelConfirmOpen = false" />
            <UButton color="error" :loading="canceling" :label="t('messages.afterSales.confirmCancel')" @click="onCancelConfirm" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- 换货确认收货 -->
    <UModal v-model:open="exchangeConfirmOpen" :ui="{ content: 'sm:max-w-sm' }">
      <template #body>
        <div class="p-5 text-center">
          <h2 class="text-base font-medium">{{ t("messages.afterSales.exchangeConfirmTitle") }}</h2>
          <p class="mt-1 text-sm text-neutral-500">{{ t("messages.afterSales.exchangeConfirmBody") }}</p>
          <div class="mt-5 flex justify-center gap-3">
            <UButton variant="soft" :label="t('messages.afterSales.cancel')" @click="exchangeConfirmOpen = false" />
            <UButton color="primary" :loading="receiving" :label="t('messages.afterSales.actionConfirmExchange')" @click="onExchangeReceive" />
          </div>
        </div>
      </template>
    </UModal>
  </main>
</template>
