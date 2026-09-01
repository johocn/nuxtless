<script setup lang="ts">
definePageMeta({ middleware: "account" });

const { t } = useI18n();
const localePath = useLocalePath();
const code = useRouteParam("code");

const { data, error, refresh } = await useAsyncGql("GetOrderByCode", { code });

const order = computed(() => data.value?.orderByCode ?? null);

// --- 售后申请逻辑 ---
import { canApplyAfterSales } from "../../../utils/after-sales-state";
import type { OrderLine } from "~~/types/order";

const applyModalOpen = ref(false);
const applyLine = ref<OrderLine | null>(null);

const hasError = computed(() => !!error.value || !order.value);
</script>

<template>
  <UError
    v-if="hasError"
    :error="{
      statusCode: 404,
      statusMessage: t('messages.error.noOrder'),
      message: t('messages.error.orderNotFound'),
    }"
  />
  <main v-else-if="order" class="container mb-14">
    <header class="my-14 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ t("messages.shop.orderDetails") }}</h1>
      <ULink :to="localePath('/account/orders')" class="text-sm text-neutral-500">
        {{ t("messages.account.orders") }}
      </ULink>
    </header>

    <OrderDetailRenderer :order="order" :refresh="refresh">
      <template #line-actions="{ line, order: o }">
        <UButton
          v-if="canApplyAfterSales(o.state)"
          size="xs"
          variant="soft"
          color="primary"
          icon="i-lucide-receipt"
          :label="t('messages.afterSales.apply')"
          class="shrink-0"
          @click="applyLine = line; applyModalOpen = true"
        />
      </template>
    </OrderDetailRenderer>

    <AfterSalesCreateModal
      v-if="applyLine"
      v-model:open="applyModalOpen"
      :order-id="order.id"
      :order-line="applyLine"
      :max-amount="applyLine.proratedLinePrice"
    />
  </main>
</template>