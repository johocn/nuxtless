<script setup lang="ts">
definePageMeta({
  alias: ["/order/:code"],
});

const { t } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const orderStore = useOrderStore();

const code = useRouteParam("code");
const isMounted = ref(false);

const redirectStatus = computed(
  () => route.query.redirect_status as string | undefined,
);
const paymentIntent = computed(
  () => route.query.payment_intent as string | undefined,
);

const isStripeReturn = computed(() => {
  return !!paymentIntent.value;
});

const isSuccessfulStripeReturn = computed(() => {
  return redirectStatus.value === "succeeded";
});

const isPending = ref(false);

const {
  data: orderData,
  error,
  refresh,
} = await useAsyncGql("GetOrderByCode", { code });

const order = computed(() => orderData.value?.orderByCode ?? null);
const hasError = computed(() => !!error.value);

// 自提/核销信息展示
const isPickupOrder = computed(
  () => (order.value?.customFields?.deliveryType ?? "") === "pickup",
);
const pickupLocation = computed(
  () => order.value?.customFields?.selectedPickupLocationId ?? null,
);
const pickupClaimed = computed(
  () => order.value?.customFields?.pickupClaimed ?? false,
);
// 履约状态：取任一 fulfillment 的状态作为核销展示依据
const fulfillmentState = computed(() => {
  const f = order.value?.fulfillments?.[0];
  return f?.state ?? null;
});

const transitionalStates = ["AddingItems", "ArrangingPayment"];

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollOrder(maxAttempts = 20, interval = 2000) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    await refresh();

    const state = order.value?.state;

    if (!state || transitionalStates.includes(state)) {
      await sleep(interval);
      continue;
    }

    return true;
  }

  return false;
}

function printReceipt() {
  if (import.meta.client) {
    window.print();
  }
}

onMounted(async () => {
  isMounted.value = true;

  if (
    isStripeReturn.value &&
    redirectStatus.value &&
    !isSuccessfulStripeReturn.value
  ) {
    await orderStore.transitionToState("AddingItems");
    await router.replace(localePath("/checkout"));

    toast.add({
      title: t("messages.error.general"),
      description: t("messages.error.generalMessage"),
      color: "error",
    });

    return;
  } else if (
    isStripeReturn.value &&
    redirectStatus.value &&
    isSuccessfulStripeReturn.value
  ) {
    await orderStore.addPaymentToOrder({
      method: "stripe-payment",
      metadata: {
        isAsyncRedirect: true,
        paymentIntentId: paymentIntent.value,
      } as Record<string, unknown>,
    });

    // TODO: investigate why the active order state is not rehydrated/reset here
    // like it is in the normal COD/non-redirect checkout success flow.
    orderStore.order = null;

    await router.replace(
      localePath(`/checkout/confirmation/${route.params.code}`),
    );
  }

  const state = order.value?.state;

  if (!state || transitionalStates.includes(state)) {
    isPending.value = true;
    const resolved = await pollOrder();
    isPending.value = false;

    if (!resolved) {
      console.error("Order confirmation polling timed out", {
        code,
        state: order.value?.state,
        redirectStatus: redirectStatus.value,
        paymentIntent: paymentIntent.value,
        hasError: hasError.value,
        error: error.value,
      });
      return;
    }
  }
});
</script>

<template>
  <BaseLoader
    v-if="(!isMounted && !order) || isPending"
    width="sm:w-xs md:w-sm"
  />

  <UError
    v-else-if="isMounted && hasError"
    :error="{
      statusCode: 404,
      statusMessage: t('messages.error.noOrder'),
      message: t('messages.error.orderNotFound'),
    }"
  >
    <template #links>
      <UButton
        :to="localePath('/account/login')"
        :label="t('messages.account.login')"
        class="px-7"
      />
    </template>
  </UError>

  <main v-else-if="order" class="container mt-14">
    <!-- 1. Heading -->
    <header class="mb-14">
      <h1 class="text-2xl font-semibold">
        {{ t("messages.shop.orderReceived") }}
      </h1>
      <UBadge
        color="error"
        :label="t('messages.shop.thankYou')"
        trailing-icon="i-lucide-heart"
        class="text-sm font-bold"
      >
      </UBadge>
    </header>

    <!-- 2. Order meta -->
    <section aria-labelledby="order-meta-heading" class="mb-14">
      <h2 id="order-meta-heading" class="sr-only">Order Details</h2>
      <dl
        class="outline-primary grid grid-cols-2 gap-4 rounded outline-2 outline-offset-4 md:grid-cols-4"
      >
        <div>
          <dt class="font-medium">{{ t("messages.shop.orderCode") }}</dt>
          <dd>{{ order?.code }}</dd>
        </div>
        <div>
          <dt class="font-medium">{{ t("messages.general.date") }}</dt>
          <dd v-if="isMounted">
            {{ new Date(order?.orderPlacedAt).toLocaleDateString() }}
          </dd>
          <USkeleton v-else class="h-4 w-full md:w-1/2" />
        </div>
        <div>
          <dt class="font-medium">{{ t("messages.shop.rateEmail") }}</dt>
          <dd>{{ order?.customer?.emailAddress }}</dd>
        </div>
        <div>
          <dt class="font-medium">{{ t("messages.general.status") }}</dt>
          <dd>{{ order?.state }}</dd>
        </div>
      </dl>
    </section>

    <!-- 2.5 自提/核销信息 -->
    <section
      v-if="isPickupOrder"
      aria-labelledby="pickup-info-heading"
      class="mb-14"
    >
      <h2 id="pickup-info-heading" class="text-xl font-semibold underline mb-4">
        {{ t("messages.shop.pickupInfo") }}
      </h2>
      <div class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h3 class="font-medium mb-1">{{ pickupLocation?.name }}</h3>
        <p class="text-sm text-neutral-500 mb-1">{{ pickupLocation?.address }}</p>
        <p class="text-sm text-neutral-500 mb-3">
          {{ pickupLocation?.businessHours }}
        </p>
        <div class="flex items-center gap-2">
          <UBadge
            :color="pickupClaimed ? 'success' : 'warning'"
            variant="outline"
          >
            {{
              pickupClaimed
                ? t("messages.shop.pickupClaimed")
                : t("messages.shop.pickupPending")
            }}
          </UBadge>
          <span v-if="fulfillmentState" class="text-sm text-neutral-500">
            {{ t("messages.general.status") }}: {{ fulfillmentState }}
          </span>
        </div>
      </div>
    </section>

    <!-- 3. Order summary -->
    <section aria-labelledby="order-summary-heading" class="mb-14">
      <h2 id="order-summary-heading" class="text-xl font-semibold underline">
        {{ t("messages.shop.orderSummary") }}
      </h2>
      <OrderItems :order="order" />
    </section>

    <!-- 4. Order details -->
    <section aria-labelledby="order-details-heading" class="mb-14">
      <h2
        id="order-details-heading"
        class="mb-4 text-xl font-semibold underline"
      >
        {{ t("messages.shop.orderDetails") }}
      </h2>

      <div
        class="order-details-grid grid grid-cols-1 gap-6 md:grid-cols-3 md:divide-x"
      >
        <!-- Column 1: Shipping -->
        <div class="">
          <OrderAddress :address="order?.shippingAddress ?? null" />
        </div>

        <!-- Column 2: Payment & Shipping method -->
        <div class="">
          <h3 class="mb-2 font-medium">
            {{ t("messages.general.shippingDetails") }}
          </h3>
          <p>
            {{ t("messages.general.paymentMethod") }}:
            {{ order?.payments?.[0]?.method }}
          </p>
          <p>
            {{ t("messages.general.shippingSelect") }}:
            {{ order?.shippingLines?.[0]?.shippingMethod?.name }}
          </p>
        </div>

        <!-- Column 3: Totals -->
        <div>
          <h3 class="mb-2 font-medium">{{ t("messages.general.amount") }}</h3>
          <OrderTotals :order="order" />
        </div>
      </div>
    </section>

    <!-- 4. Gratuity -->
    <section class="no-print mb-14 text-sm">
      <p>
        {{ t("messages.shop.orderThanks") }}
      </p>
    </section>

    <!-- 4. Actions -->
    <section aria-labelledby="actions-heading" class="no-print mb-14">
      <h2 id="actions-heading" class="sr-only">
        {{ t("messages.general.actions") }}
      </h2>
      <UButton variant="soft" @click="printReceipt">{{
        t("messages.general.printReceipt")
      }}</UButton>
    </section>
  </main>
</template>

<style lang="css">
@media print {
  nav,
  header,
  footer,
  .no-print {
    display: none !important;
  }
  main {
    padding: 0;
  }
  .order-details-grid {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr) !important;
    gap: 1rem !important;
  }
}
</style>
