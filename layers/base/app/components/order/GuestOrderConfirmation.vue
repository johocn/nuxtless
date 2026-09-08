<script setup lang="ts">
import type { GuestOrderLookupQuery } from "#gql/default";
import { formatMoney } from "../../utils/format-money";

const props = defineProps<{
  overview: NonNullable<GuestOrderLookupQuery["guestOrderLookup"]>;
}>();
const overview = props.overview;

const { t, locale } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();

const currency = computed(() => overview.currencyCode ?? "CNY");
const totalWithTax = computed(() => formatMoney(overview.totalWithTax, currency.value, locale.value));
const subTotal = computed(() => formatMoney(overview.subTotal, currency.value, locale.value));
const shippingWithTax = computed(() =>
  formatMoney(
    (overview as { shippingWithTax?: number | null }).shippingWithTax ?? 0,
    currency.value,
    locale.value,
  ),
);
const placedAt = computed(() =>
  overview.orderPlacedAt ? new Date(overview.orderPlacedAt).toLocaleString(locale.value) : "",
);

// 游客概览状态 → 语义化标签（复用订单词典，未知状态回退原文）
const stateKey = computed(() => {
  const s = overview.state;
  const map: Record<string, string> = {
    ArrangingPayment: "messages.order.statePaid",
    PaymentAuthorized: "messages.order.statePaid",
    PaymentSettled: "messages.order.statePaid",
    PartiallyShipped: "messages.order.stateShipped",
    Shipped: "messages.order.stateShipped",
    Delivered: "messages.order.stateDelivered",
    Cancelled: "messages.order.stateCancelled",
  };
  return map[s] ?? null;
});
const stateLabel = computed(() => (stateKey.value ? t(stateKey.value) : overview.state));

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast.add({ title: t("messages.general.getLinkSuccess"), color: "success" });
  } catch {
    /* 忽略剪贴板不可用 */
  }
}
</script>

<template>
  <main class="container">
    <header class="mb-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{{ t("messages.error.guestOrderTitle") }}</h1>
        <UBadge variant="outline" :label="stateLabel" />
      </div>
      <p class="mt-1 text-sm text-neutral-500">{{ t("messages.error.guestOrderHint") }}</p>
    </header>

    <!-- 订单号 + 状态 + 金额 -->
    <dl class="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <div class="col-span-2 flex items-center justify-between gap-2">
        <dt class="text-neutral-500">{{ t("messages.shop.orderCode") }}</dt>
        <dd class="flex items-center gap-1 font-mono">
          {{ overview.orderCode }}
          <UButton size="xs" icon="i-lucide-copy" variant="ghost" color="neutral" @click="copyCode(overview.orderCode)" />
        </dd>
      </div>
      <div v-if="placedAt">
        <dt class="text-neutral-500">{{ t("messages.afterSales.createdAt") }}</dt>
        <dd>{{ placedAt }}</dd>
      </div>
      <div class="flex items-center justify-between gap-1">
        <dt class="text-neutral-500">{{ t("messages.order.totalWithTax") }}</dt>
        <dd class="font-medium text-error">{{ totalWithTax }}</dd>
      </div>
      <div>
        <dt class="text-neutral-500">{{ t("messages.shop.subtotal") }}</dt>
        <dd>{{ subTotal }}</dd>
      </div>
      <div v-if="overview.isPickup">
        <dt class="text-neutral-500">{{ t("messages.shop.pickupCode") }}</dt>
        <dd class="flex items-center gap-1 font-mono text-warning">
          {{ overview.pickupCode || "--" }}
        </dd>
      </div>
      <div>
        <dt class="text-neutral-500">{{ t("messages.shop.shipping") }}</dt>
        <dd>{{ shippingWithTax }}</dd>
      </div>
    </dl>

    <!-- 自提信息 -->
    <section v-if="overview.isPickup && overview.pickupLocation" class="mt-4 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <p class="font-medium">{{ overview.pickupLocation.name }}</p>
      <p class="mt-1 text-neutral-500">{{ overview.pickupLocation.address }}</p>
      <p v-if="overview.pickupLocation.businessHours" class="text-neutral-500">{{ overview.pickupLocation.businessHours }}</p>
      <UBadge class="mt-2" :color="overview.pickupClaimed ? 'success' : 'warning'" variant="outline">
        {{ overview.pickupClaimed ? t("messages.shop.pickupClaimed") : t("messages.shop.pickupPending") }}
      </UBadge>
      <p class="mt-2 text-xs text-neutral-400">{{ t("messages.order.pickupKeepHint") }}</p>
    </section>

    <!-- 商品明细 -->
    <section class="mt-4 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <h2 class="mb-2 font-medium">{{ t("messages.order.orderItems") }}（共 {{ overview.totalQuantity }} 件）</h2>
      <div
        v-for="(line, idx) in overview.lines"
        :key="idx"
        class="flex items-center justify-between gap-3 border-t border-neutral-100 py-2 first:border-t-0 first:pt-0 dark:border-neutral-800"
      >
        <div class="min-w-0">
          <p class="truncate font-medium">{{ line.productName || line.sku }}</p>
          <p class="text-xs text-neutral-500">SKU: {{ line.sku }}</p>
        </div>
        <div class="shrink-0 text-right">
          <p>x{{ line.quantity }}</p>
          <p class="text-xs text-neutral-500">{{ formatMoney(line.linePriceWithTax, currency, locale) }}</p>
        </div>
      </div>
      <div class="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2 dark:border-neutral-800">
        <span class="text-neutral-500">{{ t("messages.order.totalWithTax") }}</span>
        <span class="font-medium text-error">{{ totalWithTax }}</span>
      </div>
    </section>

    <div class="mt-6 flex flex-wrap gap-3">
      <UButton
        :to="localePath(`/order/lookup`)"
        variant="soft"
        :label="t('messages.order.lookupTitle')"
      />
      <UButton
        :to="localePath('/')"
        variant="ghost"
        :label="t('messages.general.home')"
      />
    </div>
  </main>
</template>