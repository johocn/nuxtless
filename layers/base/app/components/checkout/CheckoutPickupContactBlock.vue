<script setup lang="ts">
// 到店领取联系块：需联系方式（requiresContact）的档案展示；登录用户复用地址本/默认/新增，未登录手填。
import type { AddressRecord } from "~~/types/address";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();
const { isAuthenticated } = storeToRefs(useAuthStore());
const { addresses, fetchAddresses, createAddress } = useAddressBook();
const { countryCodeDefault } = useAppConfig();

const contactName = ref("");
const contactPhone = ref("");
const contactRemark = ref("");
const selectedContactId = ref<string | null>(null);
const saving = ref(false);

const PHONE_RE = /^1\d{10}$/;

// 存在自提箱且需联系方式才自显（父组件已按同条件门控，这里兜底）
const needShow = computed(() =>
  (orderStore.orderBoxes ?? []).some(
    (b) => b.type === "pickup" && b.requiresContact,
  ),
);

function applyContact(rec: AddressRecord | null) {
  selectedContactId.value = rec?.id ?? null;
  contactName.value = rec?.fullName ?? "";
  contactPhone.value = rec?.phoneNumber ?? "";
}

// 联系人下拉：登录 + 地址本非空时交互；选中项即回填，选「新增」则清空
const contactOptions = computed(() => {
  const opts = addresses.value.map((a) => ({
    value: a.id,
    label: [a.fullName, a.phoneNumber].filter(Boolean).join(" · "),
  }));
  return [{ value: "__new__", label: t("messages.checkout.newContact") }, ...opts];
});

function onChangeContact(id: string) {
  if (id === "__new__" || id === "") {
    applyContact(null);
    return;
  }
  const rec = addresses.value.find((a) => a.id === id) ?? null;
  applyContact(rec);
}

onMounted(async () => {
  if (!isAuthenticated.value) return;
  await fetchAddresses();
  if (addresses.value.length) applyContact(addresses.value[0]); // 默认联系人
});

// 需联系方式时把新联系人持久化进地址本（仅登录且为新联系人）
async function persistIfNewContact(): Promise<boolean> {
  if (!isAuthenticated.value) return true;
  if (selectedContactId.value) return true; // 已选自地址本的联系人
  if (!PHONE_RE.test(contactPhone.value.trim())) return false;
  saving.value = true;
  try {
    const ok = await createAddress({
      fullName: contactName.value.trim(),
      streetLine1: "",
      streetLine2: "",
      province: "",
      city: "",
      postalCode: "",
      countryCode: countryCodeDefault,
      phoneNumber: contactPhone.value.trim(),
      isDefault: false,
    });
    return ok;
  } finally {
    saving.value = false;
  }
}

flow.submitFns.submitContact = async () => {
  if (!contactName.value.trim() || !PHONE_RE.test(contactPhone.value.trim())) {
    orderStore.error = t("messages.checkout.pickupContactRequired");
    toast.add({
      title: t("messages.checkout.invalidPhone"),
      description: orderStore.error,
      color: "error",
    });
    return false;
  }
  if (saving.value) return false;
  const persisted = await persistIfNewContact();
  if (!persisted) {
    orderStore.error = t("messages.checkout.pickupContactRequired");
    toast.add({
      title: t("messages.checkout.pickupContactRequired"),
      description: orderStore.error,
      color: "error",
    });
    return false;
  }
  orderStore.error = null;
  const res = await GqlSetOrderCustomFields({
    input: {
      customFields: {
        contactName: contactName.value.trim(),
        contactPhone: contactPhone.value.trim(),
        remark: contactRemark.value.trim() || null,
      },
    },
  });
  const outcome = useOrderMutation(orderStore.order, res.setOrderCustomFields);
  orderStore.error = outcome.status === "success" ? null : outcome.message ?? null;
  if (outcome.status !== "success") {
    toast.add({
      title: t("messages.checkout.invalidPhone"),
      description: orderStore.error ?? undefined,
      color: "error",
    });
  }
  return outcome.status === "success";
};
</script>

<template>
  <section
    v-if="needShow"
    aria-labelledby="pickup-contact-heading"
    class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
  >
    <div class="mb-3 flex items-center justify-between">
      <h3 id="pickup-contact-heading" class="font-medium">
        {{ t("messages.checkout.pickupContactTitle") }}
      </h3>
    </div>

    <!-- 登录 + 已有联系人：下拉选择/新增 -->
    <div
      v-if="isAuthenticated && contactOptions.length"
      class="mb-3 flex flex-col gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/40"
    >
      <label class="text-sm text-neutral-500">
        {{ t("messages.checkout.pickContactPerson") }}
      </label>
      <select
        class="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        :value="selectedContactId ?? '__new__'"
        @change="onChangeContact(($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="opt in contactOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div class="space-y-3">
      <view class="field">
        <label class="label" :for="`pickup-name`">
          {{ t("messages.checkout.pickupContactName") }}
        </label>
        <input
          id="pickup-name"
          v-model="contactName"
          class="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          :placeholder="t('messages.checkout.pickupContactName')"
        />
      </view>
      <view class="field">
        <label class="label" :for="`pickup-phone`">
          {{ t("messages.checkout.pickupContactPhone") }}
        </label>
        <input
          id="pickup-phone"
          v-model="contactPhone"
          type="tel"
          inputmode="numeric"
          class="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          :placeholder="t('messages.checkout.pickupContactPhone')"
        />
      </view>
      <view class="field">
        <label class="label" :for="`pickup-remark`">
          {{ t("messages.checkout.pickupRemark") }}
        </label>
        <input
          id="pickup-remark"
          v-model="contactRemark"
          class="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          :placeholder="t('messages.checkout.pickupRemark')"
        />
      </view>
    </div>
  </section>
</template>

<style lang="css" scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.label {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--ui-color-neutral-500, #737373);
}
</style>