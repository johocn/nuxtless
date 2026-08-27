<script setup lang="ts">
// 自提块（京东新版）：门店 / 职工单位 / 自提点，随 deliveryMode 联动加载对应类型，就近预选最近点
import type { PickupLocation } from "~~/.nuxt/gql/default";
import {
  DELIVERY_MODE_TO_PICKUP_TYPE,
  haversineKm,
  parseCoordinates,
} from "~~/layers/base/app/utils/checkout-config";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const locationStore = useLocationStore();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();
const { mode } = flow;

const loading = ref(false);
const locations = ref<PickupLocation[]>([]);
const selectedId = ref<string | null>(null);
const preselectedByNearest = ref(false);

const currentType = computed<"store" | "employee" | "point" | null>(() => {
  if (mode.value === "shipping") return null;
  return DELIVERY_MODE_TO_PICKUP_TYPE[mode.value] ?? null;
});

const typeLabel: Record<"store" | "employee" | "point", string> = {
  store: t("messages.checkout.storePickup"),
  employee: t("messages.checkout.employeePickup"),
  point: t("messages.checkout.pointPickup"),
};

function distanceKm(loc: PickupLocation): number {
  const c = parseCoordinates(loc.coordinates);
  if (!locationStore.coords || !c) return Infinity;
  return haversineKm(locationStore.coords, c);
}

async function load() {
  const type = currentType.value;
  if (!type) return;
  loading.value = true;
  try {
    const { pickupLocations: list } = await GqlGetPickupLocations({
      type,
      lat: locationStore.coords?.lat ?? null,
      lng: locationStore.coords?.lng ?? null,
    });
    locations.value = (list ?? []) as PickupLocation[];
    await preselect();
  } catch (e) {
    toast.add({
      title: t("messages.error.general"),
      description: e instanceof Error ? e.message : String(e),
      color: "error",
    });
  } finally {
    loading.value = false;
  }
}

async function select(id: string, silent = false) {
  const loc = locations.value.find((x) => x.id === id);
  if (!loc) return;
  const prev = selectedId.value;
  selectedId.value = id;
  await orderStore.setPickupLocation(id, loc.type ?? "store");
  if (orderStore.error) {
    if (!silent) {
      toast.add({
        title: t("messages.error.general"),
        description: orderStore.error,
        color: "error",
      });
    }
    selectedId.value = prev;
  }
}

async function preselect() {
  const list = locations.value;
  if (!list.length) {
    selectedId.value = null;
    return;
  }
  const hasCoords = !!locationStore.coords;
  const pick = hasCoords
    ? [...list].sort((a, b) => distanceKm(a) - distanceKm(b))[0]
    : list[0];
  preselectedByNearest.value = hasCoords;
  if (pick) await select(pick.id, true);
}

onMounted(load);
// 切换自提类型 → 重新加载对应类型点
watch(currentType, (n, o) => {
  if (n !== o) {
    selectedId.value = null;
    locations.value = [];
    load();
  }
});
// 定位变化 → 按就近重新预选
watch(() => locationStore.coords, load);
</script>

<template>
  <section
    aria-labelledby="pickup-block-heading"
    class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
  >
    <div class="mb-3 flex items-center justify-between">
      <h3 id="pickup-block-heading" class="font-medium">
        {{ typeLabel[currentType ?? "store"] ?? t("messages.checkout.choosePickup") }}
      </h3>
      <span
        v-if="preselectedByNearest && selectedId"
        class="text-xs text-primary-600 dark:text-primary-400"
      >
        {{ t("messages.checkout.nearestHint") }}
      </span>
    </div>

    <p v-if="!locationStore.coords" class="mb-2 text-xs text-neutral-400">
      {{ t("messages.checkout.locateHint") }}
    </p>
    <p v-if="loading" class="text-sm text-neutral-500">{{ t("messages.general.loading") }}</p>
    <p v-else-if="!locations.length" class="text-sm text-neutral-500">
      {{ t("messages.checkout.noPickup") }}
    </p>

    <div v-else class="space-y-2">
      <label
        v-for="loc in locations"
        :key="loc.id"
        class="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 p-3 transition hover:border-primary-300 dark:border-neutral-800"
        :class="selectedId === loc.id ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : ''"
      >
        <input
          type="radio"
          name="pickupLocation"
          :value="loc.id"
          :checked="selectedId === loc.id"
          class="mt-0.5 h-4 w-4 accent-primary-500"
          @change="select(loc.id)"
        />
        <span class="flex-1">
          <span class="block font-medium">
            {{ loc.name }}
            <span v-if="distanceKm(loc) !== Infinity" class="ml-1 text-xs text-neutral-400">
              {{ distanceKm(loc) < 1 ? `${Math.round(distanceKm(loc) * 1000)}m` : `${distanceKm(loc).toFixed(1)}km` }}
            </span>
          </span>
          <span class="block text-sm text-neutral-500">{{ loc.address }}</span>
          <span class="block text-xs text-neutral-400">
            {{ loc.businessHours || loc.phoneNumber }}
          </span>
        </span>
      </label>
    </div>
  </section>
</template>

<style lang="css" scoped></style>