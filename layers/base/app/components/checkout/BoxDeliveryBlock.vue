<script setup lang="ts">
// 按配送档案分箱配送块（京东版）：每箱独立选择「物流配送方式」或「自提点」。
// - 每箱数据：availableShippingMethodIds（物流方式，name 由 eligibleShippingMethods 映射）+ pickupLocations（自提点）。
// - 选择即写库（setOrderBoxShippingMethod）；物流传 pickupLocationId=null，自提传承运方式 + 自提点。
// - submitDelivery 校验每箱已有生效配送方式（默认取 defaultShippingMethodId，onMounted 兜底应用）。
import type { PickupLocation } from "~~/.nuxt/gql/default";
import type { OrderBoxInfo } from "~~/types/order";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";
import {
  haversineKm,
  parseCoordinates,
} from "~~/layers/base/app/utils/checkout-config";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();
const locationStore = useLocationStore();

await orderStore.fetchOrderBoxes();
await orderStore.getShippingMethods();

const { orderBoxes, shippingMethods } = storeToRefs(orderStore);
const boxes = computed<OrderBoxInfo[]>(() => orderBoxes.value ?? []);

const shippingMethodList = computed(() => shippingMethods.value ?? []);

type BoxSel = { mode: "logistics" | "pickup"; methodId: string; pickupId: string };
const sel = reactive<Record<string, BoxSel>>({});

/** 每箱独立的自提点搜索关键词 */
const boxSearch = reactive<Record<string, string>>({});

function distanceKm(loc: PickupLocation): number {
  const c = parseCoordinates(loc.coordinates);
  if (!locationStore.coords || !c) return Infinity;
  return haversineKm(locationStore.coords, c);
}

/** 自提点较多时支持按名称/地址就近本地过滤 */
function filteredPickups(box: OrderBoxInfo): PickupLocation[] {
  const locs = (box.pickupLocations ?? []) as PickupLocation[];
  const kw = (boxSearch[box.boxKey] ?? "").trim().toLowerCase();
  if (!kw) return locs;
  return locs.filter((loc) =>
    [loc.name, loc.address, loc.phoneNumber].filter(Boolean).some((s) =>
      String(s).toLowerCase().includes(kw),
    ),
  );
}

/** 有定位时按就近取最近自提点，否则取列表首个（用于仅自提无物流时的默认值） */
function nearestPickup(box: OrderBoxInfo): PickupLocation | null {
  const locs = (box.pickupLocations ?? []) as PickupLocation[];
  if (!locs.length) return null;
  if (!locationStore.coords) return locs[0] ?? null;
  return [...locs].sort((a, b) => distanceKm(a) - distanceKm(b))[0] ?? null;
}

function methodName(id: string): string {
  return shippingMethodList.value.find((m) => m.id === id)?.name ?? id;
}

function initDefaultFor(box: OrderBoxInfo): BoxSel | null {
  const carrierIds = box.availableShippingMethodIds ?? [];
  const pickups = box.pickupLocations ?? [];

  // 仅一个自提点（且至多一个物流方式）：默认选中该自提点（门店自提场景）
  if (pickups.length === 1 && carrierIds.length <= 1) {
    const methodId = String(box.defaultShippingMethodId ?? carrierIds[0] ?? "");
    return { mode: "pickup", methodId, pickupId: String(pickups[0]!.id) };
  }
  if (carrierIds.length) {
    const methodId = String(box.defaultShippingMethodId ?? carrierIds[0] ?? "");
    return { mode: "logistics", methodId, pickupId: "" };
  }
  if (pickups.length) {
    // 仅自提无物流：就近默认选中最近自提点，否则首个
    const nearest = nearestPickup(box);
    const pickupId = nearest ? String(nearest.id) : String(pickups[0]!.id);
    return { mode: "pickup", methodId: "", pickupId };
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

          <!-- 自提点较多时支持搜索 -->
          <UInput
            v-if="(box.pickupLocations ?? []).length > 1"
            v-model="boxSearch[box.boxKey]"
            size="sm"
            :placeholder="t('messages.checkout.searchPickupPlaceholder')"
            class="mb-2 w-full"
            trailing
          >
            <template #trailing>
              <UIcon name="i-heroicons:magnifying-glass" class="size-4 text-neutral-400" />
            </template>
          </UInput>

          <p
            v-if="boxSearch[box.boxKey] && !filteredPickups(box).length"
            class="mb-2 text-sm text-neutral-500"
          >
            {{ t("messages.checkout.noPickup") }}
          </p>

          <label
            v-for="loc in filteredPickups(box)"
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
              <span class="block font-medium">
                {{ loc.name }}
                <span v-if="distanceKm(loc) !== Infinity" class="ml-1 text-xs text-neutral-400">
                  {{ distanceKm(loc) < 1 ? `${Math.round(distanceKm(loc) * 1000)}m` : `${distanceKm(loc).toFixed(1)}km` }}
                </span>
              </span>
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