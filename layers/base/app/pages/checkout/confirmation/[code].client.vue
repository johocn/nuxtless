<script setup lang="ts">
import type { GuestOrderLookupQuery } from "#gql/default";
import OrderDetailConfirmation from "../../../components/order/OrderDetailConfirmation.vue";
import GuestOrderConfirmation from "../../../components/order/GuestOrderConfirmation.vue";

definePageMeta({
  alias: ["/order/:code"],
});

const { t } = useI18n();
const localePath = useTenantLocalePath();
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

// 订单不可用（无权限/无效码/未找到/HTTP 错误）→ 不轮询，立即走游客公开查询兜底或快速报错
const orderUnavailable = computed(() => hasError.value || order.value == null);

// 自提/核销信息展示
const isPickupOrder = computed(
  () => (order.value?.customFields?.deliveryType ?? "") === "pickup",
);
const pickupClaimed = computed(
  () => order.value?.customFields?.pickupClaimed ?? false,
);

const GqlInstance = useGql();
const pickupOverview = ref<GuestOrderLookupQuery["guestOrderLookup"] | null>(null);
const guestOverview = ref<GuestOrderLookupQuery["guestOrderLookup"] | null>(null);
const guestLoading = ref(false);
const renderError = ref(false);
const showAddPhone = ref(false);
const addPhoneForm = reactive({ phone: '' });
const savingPhone = ref(false);
const savedPhoneMsgOpen = ref(false);

const notFoundError = computed(() => ({
  statusCode: 404,
  statusMessage: t("messages.error.noOrder"),
  message: t("messages.error.orderExpiredLink"),
}));

watch(order, async (o) => {
  if (o && isPickupOrder.value) {
    try {
      const res = await GqlInstance('GuestOrderLookup', { input: { orderCode: code } });
      pickupOverview.value = res?.guestOrderLookup ?? null;
      showAddPhone.value = !!pickupOverview.value && !pickupOverview.value.hasPhone && !pickupClaimed.value;
    } catch {
      pickupOverview.value = null;
    }
  }
}, { immediate: true });

async function savePhone() {
  if (!addPhoneForm.phone.trim()) return;
  savingPhone.value = true;
  try {
    await GqlInstance('GuestSetOrderCustomFields', {
      input: { orderCode: code, phone: addPhoneForm.phone.trim() },
    });
    savedPhoneMsgOpen.value = true;
    showAddPhone.value = false;
  } finally {
    savingPhone.value = false;
  }
}

// 游客公开查询兜底：orderByCode 对游客/无效码会返回 FORBIDDEN，改用公开查询接口
async function tryGuestLookup() {
  try {
    const res = await GqlInstance('GuestOrderLookup', { input: { orderCode: code } });
    guestOverview.value = res?.guestOrderLookup ?? null;
    renderError.value = !guestOverview.value;
  } catch {
    guestOverview.value = null;
    renderError.value = true;
  }
}

const transitionalStates = ["AddingItems", "ArrangingPayment"];

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// 仅当订单真实存在且处于过渡态时才轮询；订单一旦不可用立即停止
async function pollOrder(maxAttempts = 20, interval = 2000) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    await refresh();

    if (hasError.value || order.value == null) {
      return false; // 请求失效，立即结束轮询
    }

    const state = order.value?.state;

    if (!state || transitionalStates.includes(state)) {
      await sleep(interval);
      continue;
    }

    return true;
  }

  return false;
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

    orderStore.order = null;

    await router.replace(
      localePath(`/checkout/confirmation/${route.params.code}`),
    );
    return;
  }

  // 订单不可用（游客无权限/无效码/未找到）：不轮询，立即用公开查询兜底，仍失败则快速报错
  if (orderUnavailable.value) {
    guestLoading.value = true;
    await tryGuestLookup();
    guestLoading.value = false;
    return;
  }

  const state = order.value?.state;

  if (!state || transitionalStates.includes(state)) {
    isPending.value = true;
    const resolved = await pollOrder();
    isPending.value = false;

    if (!resolved && orderUnavailable.value) {
      // 轮询期间订单突然不可用（session 失效等），改用公开查询
      guestLoading.value = true;
      await tryGuestLookup();
      guestLoading.value = false;
      return;
    }

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
    v-if="!isMounted || isPending || guestLoading"
    width="sm:w-xs md:w-sm"
  />

  <UError
    v-else-if="renderError"
    :error="notFoundError"
  >
    <template #links>
      <div class="flex flex-wrap gap-3">
        <UButton
          :to="localePath('/order/lookup')"
          :label="t('messages.order.lookupTitle')"
          class="px-7"
        />
        <UButton
          :to="localePath('/')"
          variant="soft"
          :label="t('messages.general.home')"
          class="px-7"
        />
      </div>
    </template>
  </UError>

  <GuestOrderConfirmation
    v-else-if="guestOverview && !order"
    :overview="guestOverview"
  />

  <OrderDetailConfirmation
    v-else-if="order"
    :order="order"
    :refresh="refresh"
  >
    <!-- 自提预约手机号补录（确认场景独有） -->
    <template #phone-record>
      <section
        v-if="isPickupOrder"
        aria-labelledby="pickup-phone-heading"
        class="mb-6"
      >
        <h2 id="pickup-phone-heading" class="text-xl font-semibold underline mb-4">
          {{ t("messages.shop.pickupInfo") }}
        </h2>
        <div v-if="showAddPhone" class="rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
          <p class="text-sm font-medium mb-1">{{ t('messages.order.addPhoneTitle') }}</p>
          <p class="text-xs text-neutral-500 mb-3">{{ t('messages.order.addPhoneHint') }}</p>
          <div class="flex items-center gap-2">
            <UInput v-model="addPhoneForm.phone" type="tel" maxlength="11" :placeholder="t('messages.order.phonePlaceholder')" class="max-w-[16rem]" :disabled="savingPhone" />
            <UButton :loading="savingPhone" :label="t('messages.order.savePhone')" @click="savePhone" />
          </div>
        </div>
        <p v-else-if="savedPhoneMsgOpen" class="mt-4 text-sm font-medium text-success">
          {{ t('messages.order.phoneSaved') }}
        </p>
      </section>
    </template>
  </OrderDetailConfirmation>
</template>

<style lang="css">
@media print {
  nav,
  header,
  footer,
  .no-print {
    display: none !important;
  }
}
</style>