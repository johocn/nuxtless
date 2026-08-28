<script setup lang="ts">
// 配送方式区（京东红版）：folded 默认四入口平级 + 物流子项默认展开；flat 分组平铺。
// 四入口显隐由数据驱动：物流看 eligibleShippingMethods，三自提看对应类型是否有自提点。
import { deliveryConfig, type DeliveryLayout } from "~~/layers/base/app/utils/checkout-delivery";
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

const layout = ref<DeliveryLayout>(deliveryLayout(deliveryConfig.layout));

await orderStore.getShippingMethods();
const { shippingMethods } = storeToRefs(orderStore);
const shippingMethodList = computed(() => shippingMethods.value ?? []);

// —— 数据驱动的入口显隐 ——
const shippingAvailable = computed(() => shippingMethodList.value.length > 0);
const pickupAvailable = reactive({ store: false, employee: false, point: false });
const pickupProbing = ref(false);

const PICKUP_TYPES = ["store", "employee", "point"] as const;

async function probePickup() {
  if (pickupProbing.value) return;
  pickupProbing.value = true;
  try {
    await Promise.all(
      PICKUP_TYPES.map(async (type) => {
        try {
          const { pickupLocations: list } = await GqlGetPickupLocations({ type, lat: null, lng: null });
          pickupAvailable[type] = (list ?? []).length > 0;
        } catch (e) {
          pickupAvailable[type] = false;
          console.warn("[DeliveryModeBlock] probe pickup failed", type, e);
        }
      }),
    );
  } finally {
    pickupProbing.value = false;
  }
}
onMounted(() => {
  void probePickup();
  if (mode.value === "shipping") {
    const first = shippingMethodList.value[0];
    if (first) void applyShipping(first.id);
  }
});

// 可见入口列表（按常用度排序：物流 → 门店 → 自提点 → 职工）
const visibleModes = computed<CheckoutDeliveryMode[]>(() => {
  const list: CheckoutDeliveryMode[] = [];
  if (shippingAvailable.value) list.push("shipping");
  if (pickupAvailable.store) list.push("store");
  if (pickupAvailable.point) list.push("point");
  if (pickupAvailable.employee) list.push("employee");
  return list;
});

const modeLabel: Record<CheckoutDeliveryMode, string> = {
  shipping: t("messages.checkout.deliveryLogistic"),
  store: t("messages.checkout.storePickup"),
  employee: t("messages.checkout.employeePickup"),
  point: t("messages.checkout.pointPickup"),
};

// 物流预选与提交
const appliedId = ref<string | null>(null);
const selectedShippingModel = computed(() =>
  isShippingMode(mode.value) ? appliedId.value || shippingMethodList.value[0]?.id || "" : "",
);
async function applyShipping(id: string) {
  if (!id || id === appliedId.value) return;
  orderStore.error = null;
  await orderStore.setShippingMethod(id);
  if (orderStore.error) {
    toast.add({ title: t("messages.general.shippingSelect"), description: orderStore.error, color: "error" });
    return;
  }
  appliedId.value = id;
}

function onChooseShipping(id: string) {
  flow.setMode("shipping");
  void applyShipping(id);
}
function loadShipping() {
  flow.setMode("shipping");
  const first = shippingMethodList.value[0];
  if (first) void applyShipping(first.id);
}
function onChoosePickup(key: Exclude<CheckoutDeliveryMode, "shipping">) {
  flow.setMode(key);
}

// folded 版式：物流子项默认展开，标题可折叠
const foldedExpanded = ref(true);

flow.submitFns.submitDelivery = async () => {
  if (!isShippingMode(mode.value)) return true;
  const list = shippingMethodList.value;
  if (!list.length) {
    orderStore.error = t("messages.checkout.noShippingMethod");
    toast.add({ title: t("messages.general.shippingSelect"), description: orderStore.error, color: "error" });
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
    class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
  >
    <h3 id="delivery-mode-heading" class="mb-4 font-medium text-neutral-900 dark:text-neutral-100">
      {{ t("messages.checkout.deliveryMethod") }}
    </h3>

    <UAlert
      v-if="!visibleModes.length"
      icon="i-lucide-truck"
      color="warning"
      variant="soft"
      :title="t('messages.checkout.noShippingMethod')"
      :description="t('messages.checkout.noShippingMethodDesc')"
    />

    <!-- ===== folded（默认）：四入口平级 + 物流子项默认展开 ===== -->
    <template v-else-if="layout === 'folded'">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="m in visibleModes"
          :key="m"
          type="button"
          :class="[
            'rounded-md border px-4 py-2 text-sm transition',
            mode === m
              ? 'border-primary-500 bg-primary-50 font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
              : 'border-neutral-200 text-neutral-700 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-300',
          ]"
          @click="m === 'shipping' ? loadShipping() : onChoosePickup(m)"
        >
          {{ modeLabel[m] }}
          <span v-if="m === 'shipping' && shippingMethodList.length" class="ml-1 text-xs text-neutral-400 dark:text-neutral-500">
            {{ shippingMethodList.length }}
          </span>
        </button>
      </div>

      <!-- 物流子项区：虚线分隔，默认展开，标题可折叠 -->
      <div class="mt-3">
        <button
          type="button"
          class="flex w-full items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400"
          @click="foldedExpanded = !foldedExpanded"
        >
          <span :class="['transition-transform', foldedExpanded ? '' : '-rotate-90']">&#9662;</span>
          {{ t("messages.checkout.chooseCarrier") }}
        </button>
        <div v-if="foldedExpanded" class="mt-2 space-y-2">
          <template v-if="shippingMethodList.length === 0">
            <UAlert
              icon="i-lucide-truck"
              color="warning"
              variant="soft"
              :title="t('messages.checkout.noShippingMethod')"
              :description="t('messages.checkout.noShippingMethodDesc')"
            />
          </template>
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
        <p v-if="!isShippingMode(mode)" class="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
          {{ t("messages.checkout.pickupFillFromLocation") }}
        </p>
      </div>
    </template>

    <!-- ===== flat（备选）：物流 / 自提两组分组平铺 ===== -->
    <template v-else>
      <div v-if="shippingMethodList.length" class="mb-4">
        <p class="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <span class="h-3.5 w-1 rounded-sm bg-primary-500" />
          {{ t("messages.checkout.chooseCarrier") }}
        </p>
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
      </div>

      <div v-if="visibleModes.some((m) => m !== 'shipping')">
        <p class="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <span class="h-3.5 w-1 rounded-sm bg-primary-500" />
          {{ t("messages.checkout.pickupMethod") }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="m in visibleModes.filter((x) => x !== 'shipping')"
            :key="m"
            type="button"
            :class="[
              'rounded-md border px-4 py-2 text-sm transition',
              mode === m
                ? 'border-primary-500 bg-primary-50 font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                : 'border-neutral-200 text-neutral-700 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-300',
            ]"
            @click="onChoosePickup(m)"
          >
            {{ modeLabel[m] }}
          </button>
        </div>
        <p v-if="!isShippingMode(mode)" class="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
          {{ t("messages.checkout.pickupFillFromLocation") }}
        </p>
      </div>
    </template>
  </section>
</template>

<style lang="css" scoped></style>