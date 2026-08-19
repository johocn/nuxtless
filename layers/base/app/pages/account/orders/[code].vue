<script setup lang="ts">
definePageMeta({ middleware: "account" });

const { t } = useI18n();
const localePath = useLocalePath();
const code = useRouteParam("code");

const { data, error, refresh } = await useAsyncGql("GetOrderByCode", { code });

const order = computed(() => data.value?.orderByCode ?? null);
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
    <header class="my-14">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{{ t("messages.shop.orderDetails") }}</h1>
        <OrderStateBadge :state="order.state" />
      </div>
      <ULink :to="localePath('/account/orders')" class="mt-2 text-sm">
        {{ t("messages.account.orders") }}
      </ULink>
      <p class="mt-2 text-sm text-neutral-500">
        {{ t("messages.shop.orderCode") }}: {{ order.code }}
      </p>
    </header>

    <OrderProgress :state="order.state" class="mb-8" />

    <section class="mb-10">
      <h2 class="mb-3 text-lg font-semibold">{{ t("messages.shop.orderSummary") }}</h2>
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

    <div class="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2">
      <OrderAddress :address="order.shippingAddress" />
      <DeliveryInfo :order="order" />
    </div>

    <section class="mb-10 max-w-md">
      <h2 class="mb-3 text-lg font-semibold">{{ t("messages.general.amount") }}</h2>
      <OrderTotals :order="order" />
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