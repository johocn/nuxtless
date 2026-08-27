<script setup lang="ts">
// 配送方式区（京东新版，置顶）：物流配送单选 + 自提类型联动
import {
  isShippingMode,
  type CheckoutDeliveryMode,
} from "~~/layers/base/app/utils/checkout-config";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();
const { mode } = flow;

await orderStore.getShippingMethods();
const { shippingMethods } = storeToRefs(orderStore);
const shippingMethodList = computed(() => shippingMethods.value ?? []);

// 默认 / 唯一物流方式直接预选第一项并写入后端
const appliedId = ref<string | null>(null);
const selectedShippingModel = computed(() =>
  isShippingMode(mode.value)
    ? appliedId.value || shippingMethodList.value[0]?.id || ""
    : "",
);
async function applyShipping(id: string) {
  if (!id || id === appliedId.value) return;
  orderStore.error = null;
  await orderStore.setShippingMethod(id);
  if (orderStore.error) {
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
    return;
  }
  appliedId.value = id;
}

onMounted(() => {
  if (mode.value === "shipping") {
    const first = shippingMethodList.value[0];
    if (first) void applyShipping(first.id);
  }
});

const pickupOptions: { key: Exclude<CheckoutDeliveryMode, "shipping">; label: string }[] = [
  { key: "store", label: t("messages.checkout.storePickup") },
  { key: "employee", label: t("messages.checkout.employeePickup") },
  { key: "point", label: t("messages.checkout.pointPickup") },
];

// 选中物流配送 → 切配送模式并应用对应方式
function onChooseShipping(id: string) {
  flow.setMode("shipping");
  void applyShipping(id);
}

// 选中自提类型 → 切自提模式（对应自提点列表由 PickupBlock 联动加载）
function onChoosePickup(key: Exclude<CheckoutDeliveryMode, "shipping">) {
  flow.setMode(key);
}

// 注册提交：配送模式且有必要时应用物流方式；自提模式直接通过
flow.submitFns.submitDelivery = async () => {
  if (!isShippingMode(mode.value)) return true;
  const list = shippingMethodList.value;
  if (!list.length) {
    orderStore.error = t("messages.checkout.noShippingMethod");
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
    return false;
  }
  const id = appliedId.value || list[0]?.id || "";
  if (!id) return false;
  await applyShipping(id);
  return !orderStore.error && !!appliedId.value;
};
</script>

<template>
  <section
    aria-labelledby="delivery-mode-heading"
    class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
  >
    <h3 id="delivery-mode-heading" class="mb-3 font-medium">
      {{ t("messages.checkout.deliveryMethod") }}
    </h3>

    <div class="space-y-4">
      <!-- 物流配送 -->
      <div>
        <UAlert
          v-if="shippingMethodList.length === 0"
          icon="i-lucide-truck"
          color="warning"
          variant="soft"
          :title="t('messages.checkout.noShippingMethod')"
          :description="t('messages.checkout.noShippingMethodDesc')"
        />
        <template v-else>
          <URadioGroup
            :model-value="selectedShippingModel"
            @update:model-value="onChooseShipping"
            indicator="hidden"
            variant="table"
            orientation="horizontal"
            :items="shippingMethodList.map((m) => ({ label: m.name, value: m.id }))"
            :ui="{ item: 'w-full' }"
            :disabled="orderStore.loading"
          />
        </template>
      </div>

      <!-- 自提类型 -->
      <div>
        <p class="mb-2 text-sm text-neutral-500">
          {{ t("messages.checkout.pickupMethod") }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="opt in pickupOptions"
            :key="opt.key"
            type="button"
            :class="[
              'rounded-md border px-4 py-2 text-sm transition',
              mode === opt.key
                ? 'border-primary-400 bg-primary-50 text-primary-600 dark:bg-primary-900/30'
                : 'border-neutral-200 text-neutral-700 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-300',
            ]"
            @click="onChoosePickup(opt.key)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style lang="css" scoped></style>