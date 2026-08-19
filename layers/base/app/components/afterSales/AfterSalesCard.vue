<script setup lang="ts">
import type { MyAfterSalesRequestsQuery } from "#gql/default";
import { formatMoney } from "../../utils/format-money";
import { afterSalesTypeLabelKey, afterSalesStateInfo } from "../../utils/after-sales-state";

const props = defineProps<{
  request: NonNullable<MyAfterSalesRequestsQuery["myAfterSalesRequests"]>["items"][number];
}>();

const request = props.request;

const { t, locale } = useI18n();
const localePath = useLocalePath();
const stateInfo = computed(() => afterSalesStateInfo(request.state));
const typeKey = computed(() => afterSalesTypeLabelKey(request.type));
const amount = computed(() => formatMoney(request.refundAmount, "CNY", locale.value));
const productName = computed(() => request.orderLine?.productVariant?.name);
const preview = computed(
  () =>
    request.orderLine?.featuredAsset?.preview ??
    request.orderLine?.productVariant?.featuredAsset?.preview ??
    "",
);
</script>

<template>
  <ULink
    :to="localePath(`/account/after-sales/${request.id}`)"
    class="block rounded-lg border border-neutral-200 p-4 transition hover:border-primary dark:border-neutral-800"
  >
    <div class="flex items-center gap-4">
      <NuxtImg :src="preview" :alt="productName ?? ''" class="h-16 w-16 rounded object-cover" format="webp" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ t(typeKey) }}</span>
          <UBadge :color="stateInfo.color" variant="outline" :label="t(stateInfo.labelKey)" />
        </div>
        <p class="truncate text-sm text-neutral-500">{{ productName ?? request.id }}</p>
        <p class="text-xs text-neutral-400">
          {{ t("messages.afterSales.orderCode") }}: {{ request.order?.code }} · {{ t("messages.afterSales.amount") }}: {{ amount }}
        </p>
      </div>
    </div>
  </ULink>
</template>