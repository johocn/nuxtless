<script setup lang="ts">
// 收货地址块（京东新版"配送至"卡）：默认加载默认地址，支持新增/切换；自提时整块隐藏
import type { ComponentPublicInstance } from "vue";
import type { AddressRecord } from "~~/types/address";
import type { CheckoutState } from "~~/types/general";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();

const { countryCodeDefault } = useAppConfig();
const { isAuthenticated } = storeToRefs(useAuthStore());
const { addresses, fetchAddresses } = useAddressBook();

const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.addressForm;

const appliedAddressId = ref<string | null>(null);
const editing = ref(false);

function applyAddress(record: AddressRecord) {
  appliedAddressId.value = record.id;
  const [firstName = "", ...rest] = (record.fullName ?? "").trim().split(/\s+/);
  state.firstName = firstName;
  state.lastName = rest.join(" ") ?? "";
  state.streetLine1 = record.streetLine1 ?? "";
  state.streetLine2 = record.streetLine2 ?? "";
  state.city = record.city ?? "";
  state.postalCode = record.postalCode ?? "";
  state.countryCode = record.countryCode ?? countryCodeDefault;
  editing.value = false;
}

const appliedPhone = computed<string>(() => {
  const rec = addresses.value.find((a) => a.id === appliedAddressId.value);
  return rec?.phoneNumber ?? "";
});

// CheckoutAddressForm 的 isSubmitted 绑定（成功提交置 true）
const addressSubmitted = ref(false);

// 京东式顶部摘要：收货人 电话 城市 街道
const addressSummary = computed(() => {
  const fullName = `${state.firstName} ${state.lastName}`.trim();
  const street = [state.streetLine1, state.streetLine2].filter(Boolean).join(" ");
  return {
    fullName,
    phone: appliedPhone.value,
    crude: [state.city].filter(Boolean).join(" "),
    street,
    has: !!(street && fullName),
  };
});

// 默认加载默认地址（地址簿第一条，isDefault 由后端排序保证）
onMounted(() => {
  if (isAuthenticated.value) {
    void fetchAddresses().then((list) => {
      if (!appliedAddressId.value && list.length) {
        const first = list[0];
        if (first) applyAddress(first);
      }
    });
  }
});

// 注册提交：非自提时写入客户 + 收货地址
flow.submitFns.submitAddress = async () => {
  if (!addressSummary.value.has) {
    orderStore.error = t("messages.general.shippingAddress");
    toast.add({
      title: t("messages.checkout.invalidAddress"),
      description: orderStore.error,
      color: "error",
    });
    return false;
  }
  orderStore.error = null;
  const fullName = addressSummary.value.fullName;
  if (!isAuthenticated.value) {
    if (!state.emailAddress) {
      orderStore.error = t("messages.billing.email");
      return false;
    }
    await orderStore.setCustomerForOrder({
      firstName: state.firstName,
      lastName: state.lastName,
      emailAddress: state.emailAddress,
    });
    if (orderStore.error) return false;
  }
  await orderStore.setOrderShippingAddress({
    fullName,
    streetLine1: state.streetLine1,
    streetLine2: state.streetLine2,
    city: state.city,
    postalCode: state.postalCode,
    countryCode: state.countryCode,
  });
  return !orderStore.error;
};

// 编辑面板完成后提交（复用 CheckoutAddressForm 已注册的 submitAddress）
const editFormRef = useTemplateRef<ComponentPublicInstance & { submitAddress: () => void }>("editForm");
function onSaveEdited() {
  const form = editFormRef.value;
  if (!form) return;
  form.submitAddress?.();
  if (!orderStore.error) editing.value = false;
}

// 默认地址空值时引导新增
const showCreate = computed(() => {
  if (isAuthenticated.value && addresses.value.length) return false;
  return !addressSummary.value.has;
});
</script>

<template>
  <section
    aria-labelledby="address-block-heading"
    class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
  >
    <div class="mb-3 flex items-center justify-between">
      <h3 id="address-block-heading" class="font-medium">
        {{ t("messages.checkout.deliveryTo") }}
      </h3>
      <div v-if="addressSummary.has" class="flex gap-2 text-sm">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :label="t('messages.checkout.switchAddress')"
          @click="editing = !editing"
        />
      </div>
    </div>

    <!-- 空地址：引导新增 -->
    <div v-if="showCreate" class="text-sm text-neutral-500">
      {{ t("messages.checkout.needAddress") }}
      <UButton
        color="primary"
        variant="soft"
        size="sm"
        :label="t('messages.checkout.addAddress')"
        class="ml-2"
        @click="editing = true"
      />
    </div>

    <!-- JD 摘要卡 -->
    <div
      v-else-if="addressSummary.has && !editing"
      class="flex flex-col gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/40"
    >
      <div class="flex items-center gap-2">
        <span class="font-medium">{{ addressSummary.fullName }}</span>
        <span v-if="addressSummary.phone" class="text-sm text-neutral-500">
          {{ addressSummary.phone }}
        </span>
      </div>
      <p class="text-sm text-neutral-600">
        {{ addressSummary.crude }} {{ addressSummary.street }}
      </p>
    </div>

    <!-- 新增 / 切换：地址簿选择 + 内嵌可编辑表单 -->
    <div v-if="editing" class="mt-2 space-y-4">
      <AddressPicker
        v-if="isAuthenticated && addresses.length"
        :addresses="addresses"
        :default-id="appliedAddressId"
        @select="applyAddress"
      />

      <CheckoutAddressForm
        ref="editForm"
        v-model="addressSubmitted"
        aria-labelledby="address-block-heading"
        novalidate
      />

      <div class="flex justify-end">
        <UButton
          color="primary"
          :label="t('messages.checkout.saveAddress')"
          @click="onSaveEdited"
        />
      </div>
    </div>
  </section>
</template>

<style lang="css" scoped></style>