<script setup lang="ts">
import type { ActiveOrderDetail } from "~~/types/order";
import type { CheckoutState } from "~~/types/general";
import type { AddressRecord } from "~~/types/address";
import { isActiveOrderDetail } from "~~/types/guard";
import CheckoutRenderer from "~~/layers/base/app/components/checkout/CheckoutRenderer.vue";
import {
  checkoutConfig,
} from "~~/layers/base/app/utils/checkout-config";

const layout = checkoutConfig.layout;

const router = useRouter();
const { t } = useI18n();
const { countryCodeDefault } = useAppConfig();
const localePath = useLocalePath();
const toast = useToast();
const orderStore = useOrderStore();
const { order } = storeToRefs(orderStore);
const isMounted = ref(false);

// 京东版式：全页联动单一事实源（deliveryMode + 各功能块提交函数）
const flow = provideCheckoutFlow();

if (!isActiveOrderDetail(order.value)) {
  await orderStore.fetchOrder("detail");
}

// fetchOrder("detail") 后 order 应为 ActiveOrderDetail；守卫类型化，模板用可选链保持 null 安全。
const activeOrder = computed<ActiveOrderDetail | null>(() =>
  isActiveOrderDetail(order.value) ? order.value : null,
);

watch(activeOrder, async (newOrder, oldOrder) => {
  if (newOrder?.totalWithTax !== oldOrder?.totalWithTax) {
    await orderStore.fetchOrder("detail");
  }
});

const addressForm = useTemplateRef("addressForm");
const shippingForm = useTemplateRef("shippingForm");
const paymentForm = useTemplateRef("paymentForm");

// 地址簿选择/回填（仅登录态）
const { isAuthenticated } = storeToRefs(useAuthStore());
const { addresses, fetchAddresses } = useAddressBook();
const activeAddressId = ref<string>();

function applyAddress(record: AddressRecord) {
  activeAddressId.value = record.id;
  const checkout = useState<CheckoutState>("checkoutState");
  const form = checkout.value.addressForm;
  form.fullName = record.fullName ?? "";
  form.streetLine1 = record.streetLine1 ?? "";
  form.streetLine2 = record.streetLine2 ?? "";
  form.city = record.city ?? "";
  form.province = record.province ?? "";
  form.postalCode = record.postalCode ?? "";
  form.countryCode = record.countryCode ?? countryCodeDefault;
}

useState<CheckoutState>("checkoutState", () => ({
  addressForm: {
    fullName: "",
    emailAddress: "",
    streetLine1: "",
    streetLine2: "",
    province: "",
    city: "",
    district: "",
    street: "",
    postalCode: "",
    countryCode: countryCodeDefault,
    phoneNumber: "",
    isDefault: false,
    billingSameAsShipping: true,
  },
  shippingForm: {
    shippingMethodId: "",
  },
  paymentForm: {
    code: "",
  },
}));

const isSubmitted = shallowReactive({
  address: false,
  shipping: false,
  payment: false,
});

// watchEffect(() => {
//   console.log(orderStore.error);
//   console.log(isSubmitted);
// });

function successRedirect() {
  orderStore.error = null;
  const checkout = useState<CheckoutState>("checkoutState").value;
  // 拆单结算后活动订单已置空，用 checkoutSplitted 首单 code；单订单回退用活动订单 code
  const orderCode = checkout.placedOrderCode || activeOrder.value?.code;
  if (!orderCode) return;
  checkout.placedOrderCode = "";
  void router.push(localePath(`/checkout/confirmation/${orderCode}`));
  order.value = null;
  toast.add({
    title: "Order Successful",
    description: "Thank you for your order.",
    color: "success",
  });
}

// 京东版式：按箱型门闩式推进——(物流箱)地址 → 配送方式 → (自提单)承运+自提点 → (需联系方式)联系人 → 支付(拆单结算)
async function submitJd() {
  const hasDeliveryBox = (orderStore.orderBoxes ?? []).some(
    (b) => b.type === "delivery",
  );
  const hasPickupBox = (orderStore.orderBoxes ?? []).some(
    (b) => b.type === "pickup",
  );
  const hasPickupContactBox = (orderStore.orderBoxes ?? []).some(
    (b) => b.type === "pickup" && b.requiresContact,
  );
  if (hasDeliveryBox) {
    const okAddress = (await flow.submitFns.submitAddress?.()) ?? false;
    if (!okAddress) return;
    const okDelivery = (await flow.submitFns.submitDelivery?.()) ?? false;
    if (!okDelivery) return;
  }
  if (hasPickupBox) {
    const okPickup = (await flow.submitFns.submitPickup?.()) ?? false;
    if (!okPickup) return;
  }
  if (hasPickupContactBox) {
    const okContact = (await flow.submitFns.submitContact?.()) ?? false;
    if (!okContact) return;
  }
  const okPayment = (await flow.submitFns.submitPayment?.()) ?? false;
  if (!okPayment) return;
  successRedirect();
}

// 旧版式：原有分步提交流程
async function submitLegacy() {
  await addressForm.value?.submitAddress();
  const isPickup = (order.value?.customFields?.deliveryType ?? "") === "pickup";
  if (isPickup) {
    isSubmitted.shipping = true;
  } else {
    await shippingForm.value?.submitShipping();
  }
  if (!(isSubmitted.address && isSubmitted.shipping)) return;
  // 到店需联系方式则校验联系人
  if (isPickup && flow.submitFns.submitContact) {
    const okContact = (await flow.submitFns.submitContact()) ?? false;
    if (!okContact) return;
  }
  await paymentForm.value?.submitPayment();

  if (isSubmitted.address && isSubmitted.shipping && isSubmitted.payment) {
    isSubmitted.address = false;
    isSubmitted.shipping = false;
    isSubmitted.payment = false;
    successRedirect();
  }
}

async function onSubmit() {
  if (layout === "jd") {
    await submitJd();
    return;
  }
  await submitLegacy();
}

onMounted(() => {
  isMounted.value = true;
  const checkout = useCheckout(); // recalc shipping under certain condtitions
  checkout.syncOrderLocation(); // 写入定位字段（lat/lng/city/deliveryType）

  if (isAuthenticated.value) {
    void fetchAddresses();
  }
});
</script>

<template>
  <BaseLoader v-if="!isMounted" width="sm:w-xs md:w-sm" />
  <main
    v-else
    class="container my-14 flex flex-col md:flex-row"
    aria-labelledby="checkout-title"
  >
    <h1 id="checkout-title" class="sr-only">Checkout</h1>

    <div v-if="(activeOrder?.lines.length ?? 0) < 1">
      <section aria-labelledby="cart-empty-title">
        <h2 id="cart-empty-title" class="sr-only">
          {{ t("messages.shop.cartEmpty") }}
        </h2>
        <CartEmpty />
      </section>

      <section aria-labelledby="home-products-heading">
        <h2
          id="home-products-heading"
          class="mt-14 mb-4 text-2xl font-semibold"
        >
          {{ t("messages.shop.popularProducts") }}
        </h2>
        <HomeFeaturedProducts />
      </section>
    </div>

    <div v-else class="flex w-full flex-col gap-12 md:flex-row md:gap-12">
      <div class="w-full md:w-1/2 lg:w-2/3">
        <!-- 京东新版版式（积木式，默认） -->
        <CheckoutRenderer v-if="layout === 'jd'" />

        <!-- 旧版式回退 -->
        <template v-else>
          <section id="address" aria-labelledby="address-heading">
            <h2 id="address-heading" class="mb-4 text-2xl font-semibold">
              {{ t("messages.general.shippingDetails") }}
            </h2>

            <AddressPicker
              v-if="isAuthenticated && addresses.length"
              :addresses="addresses"
              :default-id="activeAddressId"
              class="mb-4"
              @select="applyAddress"
            />

            <div id="address-errors" role="status" aria-live="polite" />

            <CheckoutAddressForm
              ref="addressForm"
              v-model="isSubmitted.address"
              aria-labelledby="address-heading"
              aria-describedby="address-errors"
              novalidate
            />
          </section>

          <!-- Shipment -->
          <section id="shipping" aria-labelledby="shipping-heading">
            <h2 id="shipping-heading" class="sr-only">Shipping</h2>

            <div id="shipping-errors" role="status" aria-live="polite" />

            <CheckoutShippingForm
              ref="shippingForm"
              v-model="isSubmitted.shipping"
              aria-labelledby="shipping-heading"
              aria-describedby="shipping-errors"
              novalidate
            />

            <!-- Pickup Location (门店自提) -->
            <PickupLocationSelect class="mt-4" />
          </section>

          <!-- Payment -->
          <section id="payment" aria-labelledby="payment-heading">
            <h2 id="payment-heading" class="sr-only">
              {{ t("messages.general.paymentMethod") }}
            </h2>

            <div id="payment-errors" role="status" aria-live="polite" />

            <CheckoutPaymentForm
              ref="paymentForm"
              v-model="isSubmitted.payment"
              aria-labelledby="payment-heading"
              aria-describedby="payment-errors"
              novalidate
            />
          </section>
        </template>
      </div>

      <aside
        role="complementary"
        aria-labelledby="order-summary-heading"
        class="sticky top-30 h-fit w-full md:w-2/3 lg:w-1/3"
      >
        <h2 id="order-summary-heading" class="mb-4 text-2xl font-semibold">
          {{ t("messages.shop.orderSummary") }}
        </h2>
        <CheckoutOrderSummary :on-submit="onSubmit" />
      </aside>
    </div>
  </main>
</template>

<style lang="css" scoped></style>
