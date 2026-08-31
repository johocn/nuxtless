<script setup lang="ts">
definePageMeta({ middleware: "account" });

const { t } = useI18n();
const localePath = useLocalePath();
const code = useRouteParam("code");

const { data, error, refresh } = await useAsyncGql("GetOrderByCode", { code });

const order = computed(() => data.value?.orderByCode ?? null);

// --- 售后申请逻辑（保留原文件） ---
import { canApplyAfterSales } from "../../../utils/after-sales-state";
import type { OrderLine } from "~~/types/order";

const applyModalOpen = ref(false);
const applyLine = ref<OrderLine | null>(null);

const hasError = computed(() => !!error.value || !order.value);
const isPickup = computed(
  () => (order.value?.customFields?.deliveryType ?? "") === "pickup",
);
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

    <OrderStatusBanner :order="order" class="mb-4" />
    <OrderProgress :state="order.state" class="mb-8" />

    <OrderRedemptionCard :order-code="order.code" class="mb-4" />

    <section
      class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <OrderAddress :address="order.shippingAddress" />
    </section>

    <section
      class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 class="mb-3 font-semibold">{{ t("messages.shop.orderSummary") }}</h2>
      <OrderItems :order="order">
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
      </OrderItems>
    </section>

    <OrderPickupCard
      v-if="isPickup"
      :order="order"
      class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    />

    <section
      class="mb-4 max-w-md rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 class="mb-3 font-semibold">{{ t("messages.general.amount") }}</h2>
      <OrderTotals :order="order" />
      <OrderShippingBreakdown :order="order" />
    </section>

    <section
      class="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <OrderMetaCard :order="order" />
    </section>

    <OrderActions :order="order" @updated="refresh" class="mb-10" />

    <AfterSalesCreateModal
      v-if="applyLine"
      v-model:open="applyModalOpen"
      :order-id="order.id"
      :order-line="applyLine"
      :max-amount="applyLine.proratedLinePrice"
    />
  </main>
</template>

<style lang="css" scoped></style>