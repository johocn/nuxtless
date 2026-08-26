<script setup lang="ts">
import { ShippingForm } from "~~/layers/base/validators/shippingForm";

import type { CheckoutState } from "~~/types/general";

const isSubmitted = defineModel<boolean>({ default: false });

const { t } = useI18n();
const toast = useToast();
const shippingForm = useTemplateRef("shippingForm");
const isPickup = useIsPickup();
const submitShipping = () => shippingForm.value?.submit();
defineExpose({ submitShipping });

const orderStore = useOrderStore();
await orderStore.getShippingMethods();
const { shippingMethods: shippingMethodsData } = storeToRefs(useOrderStore());

const shippingMethods = computed(
  () =>
    shippingMethodsData.value?.map((m) => ({
      label: m.name,
      value: m.id,
    })) ?? [],
);

const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.shippingForm as ShippingForm;
const lastAppliedId = ref(shippingMethods.value[0]?.value ?? "");
state.shippingMethodId = lastAppliedId.value;
await orderStore.setShippingMethod(lastAppliedId.value);

// 切换配送方式 → 立即 setShippingMethod；失败回退 UI 并提示
async function onMethodChange(id: string) {
  if (!id || id === lastAppliedId.value) return;
  orderStore.error = null;
  await orderStore.setShippingMethod(id);
  if (orderStore.error) {
    state.shippingMethodId = lastAppliedId.value;
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
    return;
  }
  lastAppliedId.value = id;
}

async function onSubmit() {
  if (isPickup.value) {
    isSubmitted.value = true;
    return;
  }
  if (!state.shippingMethodId) {
    orderStore.error = "请选择配送方式，或切换为门店自提";
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
    return;
  }
  orderStore.error = null;
  await orderStore.setShippingMethod(state.shippingMethodId);
  if (orderStore.error) return;
  isSubmitted.value = true;
}

async function onError() {
  isSubmitted.value = false;
}
</script>

<template>
  <UForm
    ref="shippingForm"
    :schema="ShippingForm"
    :state="state"
    class="mt-4 space-y-4"
    @submit="onSubmit"
    @error="onError"
  >
    <div v-if="isPickup" class="text-sm text-primary">
      你已选择门店自提，本单无需配送方式。
    </div>

    <template v-else-if="shippingMethods.length === 0">
      <UAlert
        icon="i-lucide-truck"
        color="warning"
        variant="soft"
        title="暂无可配送方式"
        description="当前收货地址暂无可配送方式，可尝试上方「门店自提 / 自提点」，或填写其他收货地址。"
      />
    </template>

    <UFormField
      v-else
      :label="t('messages.general.shippingSelect')"
      class="text-md"
      name="shippingMethodId"
    >
      <URadioGroup
        v-model="state.shippingMethodId"
        :update:model-value="onMethodChange"
        indicator="hidden"
        variant="table"
        orientation="vertical"
        size="xl"
        :items="shippingMethods"
        :ui="{ item: 'w-full' }"
        :disabled="orderStore.loading"
        class="block lg:hidden"
      />
      <URadioGroup
        v-model="state.shippingMethodId"
        :update:model-value="onMethodChange"
        indicator="hidden"
        variant="table"
        orientation="horizontal"
        :items="shippingMethods"
        :ui="{ item: 'w-full' }"
        :disabled="orderStore.loading"
        class="hidden lg:block"
      />
    </UFormField>
  </UForm>
</template>

<style lang="css" scoped></style>