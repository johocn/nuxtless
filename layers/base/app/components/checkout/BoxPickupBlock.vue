<script setup lang="ts">
// 自提单模块（京东版，自提箱专用）：仅渲染 type==='pickup' 的箱，每箱单选自提点（就近默认）。
// 内嵌接收货人/电话子块（CheckoutPickupContactBlock，仅当存在需联系方式的 pickup 箱）。
// 选择即写库（setOrderBoxShippingMethod：承运方式 + 自提点）。
// submitPickup 校验每个自提箱已有承运方式与自提点。
// 组件名经 Nuxt path-prefix 解析为 `CheckoutBoxPickupBlock`（与 BoxDeliveryBlock→CheckoutBoxDeliveryBlock 对应）。
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

const { orderBoxes } = storeToRefs(orderStore);
const boxes = computed<OrderBoxInfo[]>(() =>
  (orderBoxes.value ?? []).filter((b) => b.type === "pickup"),
);

// 存在任意自提箱需联系方式才内嵌收货人/电话子块
const hasPickupContactBox = computed(() =>
  boxes.value.some((b) => b.requiresContact),
);

type PkSel = { methodId: string; pickupId: string };
const sel = reactive<Record<string, PkSel>>({});

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

/** 有定位时按就近取最近自提点，否则取列表首个 */
function nearestPickup(box: OrderBoxInfo): PickupLocation | null {
  const locs = (box.pickupLocations ?? []) as PickupLocation[];
  if (!locs.length) return null;
  if (!locationStore.coords) return locs[0] ?? null;
  return [...locs].sort((a, b) => distanceKm(a) - distanceKm(b))[0] ?? null;
}

function carrierId(box: OrderBoxInfo): string {
  return (
    sel[box.boxKey]?.methodId ||
    String(box.defaultShippingMethodId ?? "") ||
    String(box.availableShippingMethodIds?.[0] ?? "")
  );
}

async function applyBox(box: OrderBoxInfo, s: PkSel, silent = false) {
  if (!s.methodId || !s.pickupId) return;
  orderStore.error = null;
  await orderStore.setOrderBoxShippingMethod(box.boxKey, s.methodId, s.pickupId);
  if (orderStore.error && !silent) {
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
  }
}

function choosePickup(box: OrderBoxInfo, pickupId: string) {
  const cid = carrierId(box);
  if (!cid) {
    toast.add({
      title: t("messages.checkout.needBoxDelivery"),
      description: t("messages.checkout.noShippingMethod"),
      color: "error",
    });
    return;
  }
  sel[box.boxKey] = { methodId: cid, pickupId };
  void applyBox(box, sel[box.boxKey]!);
}

onMounted(() => {
  for (const box of boxes.value) {
    if (sel[box.boxKey]) continue;
    const cid = carrierId(box);
    const nearest = nearestPickup(box);
    if (cid && nearest) {
      sel[box.boxKey] = { methodId: cid, pickupId: String(nearest.id) };
      // 兜底应用：让每箱初始即有承运方式 + 自提点
      void applyBox(box, sel[box.boxKey]!, true);
    }
  }
});

// 提交：确保每个自提箱都有生效承运方式与自提点
flow.submitFns.submitPickup = async () => {
  for (const box of boxes.value) {
    const s = sel[box.boxKey];
    if (!s || !s.methodId || !s.pickupId) {
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
    aria-labelledby="box-pickup-heading"
    class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
  >
    <h3 id="box-pickup-heading" class="mb-4 font-medium text-neutral-900 dark:text-neutral-100">
      {{ t("messages.checkout.storePickup") }}
    </h3>

    <UAlert
      v-if="!boxes.length"
      icon="i-lucide-store"
      color="warning"
      variant="soft"
      :title="t('messages.checkout.noPickup')"
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

        <p class="mb-1 text-xs text-neutral-500">{{ t("messages.checkout.boxPickupOption") }}</p>

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

        <p
          v-if="!(sel[box.boxKey]?.methodId && sel[box.boxKey]?.pickupId)"
          class="mt-2 text-xs text-neutral-400 dark:text-neutral-500"
        >
          {{ t("messages.checkout.needBoxDelivery") }}
        </p>
      </div>

      <!-- 收货人/电话：存在需联系方式的自提单才内嵌，与自提点连成一体 -->
      <CheckoutPickupContactBlock v-if="hasPickupContactBox" />
    </div>
  </section>
</template>

<style lang="css" scoped></style>