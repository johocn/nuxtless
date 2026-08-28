<script setup lang="ts">
// 按配送档案分箱配送块（京东版）：每箱独立选择「物流配送方式」或「自提点」。
// - 每箱数据：availableShippingMethodIds（物流方式，name 由 eligibleShippingMethods 映射）+ pickupLocations（自提点）。
// - 选择即写库（setOrderBoxShippingMethod）；物流传 pickupLocationId=null，自提传承运方式 + 自提点。
// - submitDelivery 校验每箱已有生效配送方式（默认取 defaultShippingMethodId，onMounted 兜底应用）。
import type { OrderBoxInfo } from "~~/types/order";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();

await orderStore.fetchOrderBoxes();
await orderStore.getShippingMethods();

const { orderBoxes, shippingMethods } = storeToRefs(orderStore);
const boxes = computed<OrderBoxInfo[]>(() => orderBoxes.value ?? []);

const shippingMethodList = computed(() => shippingMethods.value ?? []);

type BoxSel = { mode: "logistics" | "pickup"; methodId: string; pickupId: string };
const sel = reactive<Record<string, BoxSel>>({});

function methodName(id: string): string {
  return shippingMethodList.value.find((m) => m.id === id)?.name ?? id;
}

function initDefaultFor(box: OrderBoxInfo): BoxSel | null {
  const carrierIds = box.availableShippingMethodIds ?? [];
  if (carrierIds.length) {
    const methodId = String(box.defaultShippingMethodId ?? carrierIds[0] ?? "");
    return { mode: "logistics", methodId, pickupId: "" };
  }
  if ((box.pickupLocations ?? []).length) {
    return { mode: "pickup", methodId: "", pickupId: String(box.pickupLocations[0]!.id) };
  }
  return null;
}

onMounted(() => {
  for (const box of boxes.value) {
    if (sel[box.boxKey]) continue;
    const d = initDefaultFor(box);
    if (d) {
      sel[box.boxKey] = d;
      // 兜底应用：让每箱初始即有生效配送方式
      void applyBox(box, d, true);
    }
  }
});

async function applyBox(box: OrderBoxInfo, s: BoxSel, silent = false) {
  if (!s.methodId) return;
  orderStore.error = null;
  await orderStore.setOrderBoxShippingMethod(box.boxKey, s.methodId, s.pickupId || null);
  if (orderStore.error && !silent) {
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
  }
}

function chooseLogistics(box: OrderBoxInfo, methodId: string) {
  const s = sel[box.boxKey] ?? { mode: "logistics", methodId, pickupId: "" };
  s.mode = "logistics";
  s.methodId = methodId;
  s.pickupId = "";
  sel[box.boxKey] = s;
  void applyBox(box, s);
}

function choosePickup(box: OrderBoxInfo, pickupId: string) {
  const carrierId =
    sel[box.boxKey]?.methodId ||
    String(box.defaultShippingMethodId ?? "") ||
    String(box.availableShippingMethodIds?.[0] ?? "");
  if (!carrierId) {
    toast.add({
      title: t("messages.checkout.needBoxDelivery"),
      description: t("messages.checkout.noShippingMethod"),
      color: "error",
    });
    return;
  }
  const s = sel[box.boxKey] ?? { mode: "pickup", methodId: carrierId, pickupId: "" };
  s.mode = "pickup";
  s.methodId = carrierId;
  s.pickupId = pickupId;
  sel[box.boxKey] = s;
  void applyBox(box, s);
}

// 提交：确保每箱都有生效配送方式（无显式选择时用该箱默认兜底）
flow.submitFns.submitDelivery = async () => {
  for (const box of boxes.value) {
    const s = sel[box.boxKey] ?? initDefaultFor(box);
    if (!s || !s.methodId) {
      orderStore.error = t("messages.checkout.needBoxDelivery");
      toast.add({
        title: t("messages.general.shippingSelect"),
        description: orderStore.error,
        color: "error",
      });
      return false;
    }
    await applyBox(box, s, true);
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
            :model-value="sel[box.boxKey]?.mode === 'logistics' ? sel[box.boxKey]?.methodId ?? '' : ''"
            @update:model-value="(v: string) => chooseLogistics(box, v)"
            indicator="hidden"
            variant="table"
            orientation="horizontal"
            :items="(box.availableShippingMethodIds ?? []).map((id) => ({ label: methodName(String(id)), value: String(id) }))"
            :ui="{ item: 'w-full' }"
            :disabled="orderStore.loading"
          />
        </template>

        <div v-if="(box.pickupLocations ?? []).length" class="mt-3">
          <p class="mb-1 text-xs text-neutral-500">{{ t("messages.checkout.boxPickupOption") }}</p>
          <label
            v-for="loc in box.pickupLocations"
            :key="loc.id"
            class="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 p-3 text-sm transition hover:border-primary-300 dark:border-neutral-800"
            :class="sel[box.boxKey]?.pickupId === String(loc.id) ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : ''"
          >
            <input
              type="radio"
              name="box-pickup"
              :value="String(loc.id)"
              :checked="sel[box.boxKey]?.pickupId === String(loc.id)"
              class="mt-0.5 h-4 w-4 accent-primary-500"
              @change="choosePickup(box, String(loc.id))"
            />
            <span class="flex-1">
              <span class="block font-medium">{{ loc.name }}</span>
              <span class="block text-neutral-500">{{ loc.address }}</span>
              <span v-if="loc.businessHours || loc.phoneNumber" class="block text-xs text-neutral-400">
                {{ loc.businessHours || loc.phoneNumber }}
              </span>
            </span>
          </label>
        </div>

        <p
          v-if="!sel[box.boxKey]?.methodId"
          class="mt-2 text-xs text-neutral-400 dark:text-neutral-500"
        >
          {{ t("messages.checkout.needBoxDelivery") }}
        </p>
      </div>
    </div>
  </section>
</template>

<style lang="css" scoped></style>