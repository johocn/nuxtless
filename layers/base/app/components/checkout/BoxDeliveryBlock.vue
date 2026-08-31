<script setup lang="ts">
// 配送方式块（京东版，物流箱专用）：仅渲染 type==='delivery' 的箱，每个物流箱单选「物流配送方式」。
// 选择即写库（setOrderBoxShippingMethod(…, pickupLocationId=null)）。
// submitDelivery 校验每箱已有生效配送方式（默认取 defaultShippingMethodId，onMounted 兜底应用）。
import type { OrderBoxInfo } from "~~/types/order";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();

await orderStore.fetchOrderBoxes();

const { orderBoxes } = storeToRefs(orderStore);
const boxes = computed<OrderBoxInfo[]>(() =>
  (orderBoxes.value ?? []).filter((b) => b.type === "delivery"),
);

function methodName(id: string): string {
  for (const box of boxes.value) {
    const m = box.availableShippingMethods?.find((s) => s.id === id);
    if (m) return m.name;
  }
  return id;
}

function defaultMethodId(box: OrderBoxInfo): string {
  return String(
    box.defaultShippingMethodId ?? box.availableShippingMethodIds?.[0] ?? "",
  );
}

// 每箱当前选中的物流方式
const methodSel = reactive<Record<string, string>>({});

async function applyBox(box: OrderBoxInfo, methodId: string, silent = false) {
  if (!methodId) return;
  orderStore.error = null;
  await orderStore.setOrderBoxShippingMethod(box.boxKey, methodId, null);
  if (orderStore.error && !silent) {
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
  }
}

function chooseLogistics(box: OrderBoxInfo, methodId: string) {
  methodSel[box.boxKey] = methodId;
  void applyBox(box, methodId);
}

onMounted(() => {
  for (const box of boxes.value) {
    if (methodSel[box.boxKey]) continue;
    const m = defaultMethodId(box);
    if (m) {
      methodSel[box.boxKey] = m;
      // 兜底应用：让每箱初始即有生效配送方式
      void applyBox(box, m, true);
    }
  }
});

// 提交：确保每个物流箱都有生效配送方式
flow.submitFns.submitDelivery = async () => {
  for (const box of boxes.value) {
    const m = methodSel[box.boxKey] ?? defaultMethodId(box);
    if (!m) {
      orderStore.error = t("messages.checkout.needBoxDelivery");
      toast.add({
        title: t("messages.general.shippingSelect"),
        description: orderStore.error,
        color: "error",
      });
      return false;
    }
    await applyBox(box, m, true);
    if (orderStore.error) {
      toast.add({
        title: t("messages.general.shippingSelect"),
        description: orderStore.error,
        color: "error",
      });
      return false;
    }
  }
  return true;
};
</script>

<template>
  <section
    aria-labelledby="box-delivery-heading"
    class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
  >
    <h3 id="box-delivery-heading" class="mb-4 font-medium text-neutral-900 dark:text-neutral-100">
      {{ t("messages.checkout.deliveryMethod") }}
    </h3>

    <UAlert
      v-if="!boxes.length"
      icon="i-lucide-truck"
      color="warning"
      variant="soft"
      :title="t('messages.checkout.noShippingMethod')"
      :description="t('messages.checkout.noShippingMethodDesc')"
    />

    <div v-else class="space-y-4">
      <div
        v-for="(box, idx) in boxes"
        :key="box.boxKey"
        class="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
      >
        <p class="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <span class="h-3.5 w-1 rounded-sm bg-primary-500" />
          {{ t("messages.checkout.boxGroupTitle", { n: idx + 1 }) }}
          <span class="text-xs font-normal text-neutral-400">{{ box.profileName }}</span>
        </p>

        <template v-if="(box.availableShippingMethodIds ?? []).length">
          <p class="mb-1 text-xs text-neutral-500">{{ t("messages.checkout.boxLogisticsOption") }}</p>
          <URadioGroup
            :model-value="methodSel[box.boxKey] ?? ''"
            @update:model-value="(v: string) => chooseLogistics(box, v)"
            indicator="hidden"
            variant="table"
            orientation="horizontal"
            :items="(box.availableShippingMethodIds ?? []).map((id) => ({ label: methodName(String(id)), value: String(id) }))"
            :ui="{ item: 'w-full' }"
            :disabled="orderStore.loading"
          />
        </template>

        <p
          v-if="!methodSel[box.boxKey]"
          class="mt-2 text-xs text-neutral-400 dark:text-neutral-500"
        >
          {{ t("messages.checkout.needBoxDelivery") }}
        </p>
      </div>
    </div>
  </section>
</template>

<style lang="css" scoped></style>