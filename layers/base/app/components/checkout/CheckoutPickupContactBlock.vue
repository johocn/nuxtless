<script setup lang="ts">
// 到店领取联系块：需联系方式（requiresContact）的档案展示；登录用户复用地址本/默认/新增，未登录手填。
import type { AddressRecord } from "~~/types/address";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const { order: activeOrderRef } = storeToRefs(orderStore);
const flow = useCheckoutFlow();
const { isAuthenticated } = storeToRefs(useAuthStore());
const { addresses, fetchAddresses, createAddress } = useAddressBook();
const { pickupSamples } = useSampleAddressBook();
const { countryCodeDefault } = useAppConfig();

const contactName = ref("");
const contactPhone = ref("");
const contactRemark = ref("");
const selectedContactId = ref<string | null>(null);
const saving = ref(false);

const PHONE_RE = /^1\d{10}$/;

// 地址簿为空时展示示例联系人池，便于演示「切换自提联系人」；有真实联系人则优先真实
const contactSource = computed(() =>
  addresses.value.length ? addresses.value : pickupSamples,
);

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

onMounted(async () => {
  if (!isAuthenticated.value) return;
  await fetchAddresses();
  if (contactSource.value.length) applyContact(contactSource.value[0] ?? null); // 默认联系人
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
  const outcome = useOrderMutation(activeOrderRef, res.setOrderCustomFields);
  orderStore.error =
    outcome.status === "success" ? null : ("message" in outcome ? outcome.message : null);
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

    <!-- 联系人切换：chips 直接可见（非折叠下拉），高亮当前，点选即回填；含「新增」 -->
    <div
      v-if="isAuthenticated && contactSource.length"
      class="mb-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/40"
    >
      <p class="mb-2 text-sm text-neutral-500">
        {{ t("messages.checkout.switchContact") }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="c in contactSource"
          :key="c.id"
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition"
          :class="selectedContactId === c.id
            ? 'border-primary-500 bg-primary-500 font-medium text-white dark:border-primary-500 dark:bg-primary-600'
            : 'border-neutral-200 bg-white text-neutral-700 hover:border-primary-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200'"
          @click="applyContact(c)"
        >
          <UIcon v-if="selectedContactId === c.id" name="i-lucide:check" class="size-3.5" />
          <span class="font-medium">{{ c.fullName }}</span>
          <span :class="selectedContactId === c.id ? 'text-white/80' : 'text-neutral-400'">
            {{ c.phoneNumber }}
          </span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-3 py-1 text-sm text-neutral-500 transition hover:border-primary-300 hover:text-primary-500 dark:border-neutral-600"
          @click="applyContact(null)"
        >
          <UIcon name="i-lucide:plus" class="size-3.5" />
          {{ t("messages.checkout.newContact") }}
        </button>
      </div>
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