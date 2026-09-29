<script setup lang="ts">
import type { MyAfterSalesRequestsQuery } from "#gql/default";
import { formatMoney } from "../../utils/format-money";
import {
  AFTER_SALES_PROGRESS,
  afterSalesPrimaryAction,
  afterSalesPrimaryActionLabelKey,
  afterSalesProgressIndex,
  afterSalesStateInfo,
  afterSalesTypeLabelKey,
} from "../../utils/after-sales-state";
import { assetSrc } from "../../utils/image";

const props = defineProps<{
  request: NonNullable<MyAfterSalesRequestsQuery["myAfterSalesRequests"]>["items"][number];
}>();

const request = props.request;
const { t, locale } = useI18n();
const localePath = useTenantLocalePath();

const stateInfo = computed(() => afterSalesStateInfo(request.state));
const typeKey = computed(() => afterSalesTypeLabelKey(request.type));
const amount = computed(() => formatMoney(request.refundAmount, "CNY", locale.value));
const productName = computed(() => request.orderLine?.productVariant?.name);
const preview = computed(() =>
  assetSrc(
    request.orderLine?.featuredAsset?.preview ??
      request.orderLine?.productVariant?.featuredAsset?.preview ??
      "",
    128,
  ),
);
const createdAtText = computed(() =>
  request.createdAt ? new Date(request.createdAt).toLocaleDateString(locale.value) : "",
);
const progressIndex = computed(() => afterSalesProgressIndex(request.state));
const stepLabel = computed(() =>
  progressIndex.value >= 0 ? t(`messages.afterSales.step${AFTER_SALES_PROGRESS[progressIndex.value]}`) : "",
);

const action = computed(() => afterSalesPrimaryAction(request.state));
const actionLabel = computed(() => t(afterSalesPrimaryActionLabelKey(action.value)));
const actionTarget = computed(() => {
  const base = `/account/after-sales/${request.id}`;
  if (action.value === "cancel") return `${base}?action=cancel`;
  if (action.value === "tracking") return `${base}?action=tracking`;
  return base;
});
</script>

<template>
  <div class="rounded-lg border border-neutral-200 transition hover:border-primary dark:border-neutral-800">
    <ULink :to="localePath(`/account/after-sales/${request.id}`)" class="block p-4">
      <div class="flex items-center gap-4">
        <NuxtImg :src="preview" :alt="productName ?? ''" class="h-16 w-16 rounded object-cover" format="webp" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ t(typeKey) }}</span>
            <UBadge :color="stateInfo.color" variant="outline" :label="t(stateInfo.labelKey)" />
          </div>
          <p class="truncate text-sm text-neutral-500">{{ productName ?? request.id }}</p>
          <p class="text-xs text-neutral-400">
            {{ t("messages.afterSales.orderCode") }}: {{ request.order?.code }} ·
            {{ t("messages.afterSales.amount") }}: {{ amount }}
          </p>
          <p v-if="createdAtText" class="text-xs text-neutral-400">
            {{ t("messages.afterSales.createdAt") }}: {{ createdAtText }}
          </p>
        </div>
      </div>

      <!-- 五段进度 + 当前步骤 -->
      <div class="mt-3 flex items-center gap-1">
        <span
          v-for="(s, i) in AFTER_SALES_PROGRESS"
          :key="s"
          class="h-1 flex-1 rounded-full"
          :class="i <= progressIndex ? 'bg-primary' : 'bg-neutral-200 dark:bg-neutral-800'"
        />
      </div>
      <p v-if="stepLabel" class="mt-1 text-xs text-neutral-500">
        {{ t("messages.afterSales.currentStep") }}: {{ stepLabel }}
      </p>
    </ULink>

    <div v-if="action !== 'none'" class="flex justify-end border-t border-neutral-100 px-4 py-2 dark:border-neutral-800">
      <UButton size="xs" variant="soft" color="primary" :label="actionLabel" :to="localePath(actionTarget)" />
    </div>
  </div>
</template>
