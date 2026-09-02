<script setup lang="ts">
// 中国本地化版式：收货人 + 手机号一体卡片（省市区三级 + 详细地址）。
// 仅物流箱（hasDeliveryBox）渲染；地址只与物流模块绑定，不与自提模块相连。
// 未登录：直接内嵌填写（复用 CheckoutAddressForm 的提交逻辑，由本组件自持）。
// 登录态：顶部收货人/电话摘要卡 + 地址簿切换入口。
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

const addressSubmitted = ref(false);
const editFormRef = useTemplateRef<ComponentPublicInstance & { submitAddress: () => void }>("editForm");

function applyAddress(record: AddressRecord) {
  appliedAddressId.value = record.id;
  state.fullName = record.fullName ?? "";
  state.streetLine1 = record.streetLine1 ?? "";
  state.streetLine2 = record.streetLine2 ?? "";
  state.city = record.city ?? "";
  state.province = record.province ?? "";
  state.postalCode = record.postalCode ?? "";
  state.countryCode = record.countryCode ?? countryCodeDefault;
  state.phoneNumber = record.phoneNumber ?? "";
  editing.value = false;
}

const addressSummary = computed(() => {
  const street = [state.streetLine1, state.streetLine2].filter(Boolean).join(" ");
  const fullName = state.fullName;
  const appliedPhone = addresses.value.find((a) => a.id === appliedAddressId.value)?.phoneNumber ?? "";
  const phone = state.phoneNumber || appliedPhone;
  const crude = [state.province, state.city, state.district].filter(Boolean).join(" ");
  return {
    fullName,
    phone,
    crude,
    street,
    has: !!(street && fullName),
  };
});

const showCreate = computed(() => {
  if (isAuthenticated.value && addresses.value.length) return false;
  return !addressSummary.value.has;
});

// 自持地址提交写入（与 AddressBlock 同数据流，写 customer + shippingAddress）
flow.submitFns.submitAddress = async () => {
  if (!addressSummary.value.has) {
    orderStore.error = t("messages.general.shippingAddress");
    toast.add({ title: t("messages.checkout.invalidAddress"), description: orderStore.error, color: "error" });
    return false;
  }
  orderStore.error = null;
  const fullName = addressSummary.value.fullName;
  if (!isAuthenticated.value) {
    await orderStore.setCustomerForOrder({
      firstName: state.fullName,
      lastName: "",
      emailAddress: state.emailAddress,
    });
    if (orderStore.error) return false;
  }
  await orderStore.setOrderShippingAddress({
    fullName,
    streetLine1: state.streetLine1,
    streetLine2: state.streetLine2,
    city: state.city,
    province: state.province ?? "",
    postalCode: state.postalCode,
    countryCode: state.countryCode,
    phoneNumber: state.phoneNumber,
  });
  return !orderStore.error;
};

function onSaveEdited() {
  const form = editFormRef.value;
  if (!form) return;
  form.submitAddress?.();
  if (!orderStore.error) editing.value = false;
}

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
</script>

<template>
  <!-- 仅物流箱渲染；由 CheckoutLayoutCn v-if 控制，本组件内部不做二次判断 -->
  <section
    aria-labelledby="cn-contact-heading"
    class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
  >
    <div class="mb-3 flex items-center justify-between">
      <h3 id="cn-contact-heading" class="flex items-center gap-2 text-base font-medium">
        <span class="h-3.5 w-1 rounded-sm bg-primary-500" />
        {{ t("messages.checkout.cnContactTitle") }}
      </h3>
      <UButton
        v-if="addressSummary.has"
        color="neutral"
        variant="ghost"
        size="sm"
        :label="t('messages.checkout.switchAddress')"
        @click="editing = !editing"
      />
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

    <!-- 一体卡：收货人 + 电话 + 省市区 + 街道 -->
    <div
      v-else-if="addressSummary.has && !editing"
      class="flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/40"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-base font-medium">{{ addressSummary.fullName }}</span>
          <span v-if="addressSummary.phone" class="text-sm text-neutral-500">{{ addressSummary.phone }}</span>
        </div>
        <span class="h-5 shrink-0 rounded-sm bg-primary-100 px-1.5 text-xs leading-5 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
          {{ t("messages.general.to") }}
        </span>
      </div>
      <p v-if="addressSummary.street" class="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
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
        aria-labelledby="cn-contact-heading"
        novalidate
      />
      <div class="flex justify-end">
        <UButton color="primary" :label="t('messages.checkout.saveAddress')" @click="onSaveEdited" />
      </div>
    </div>
  </section>
</template>