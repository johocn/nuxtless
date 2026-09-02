<script lang="ts">
import { reactive } from "vue";
// 模块级共享选择状态：CheckoutPerBoxList 按租户分区渲染会产生多个块实例，
// 每箱自提点/承运方式选择必须跨实例共享（提交校验按全箱遍历读取）。
const sel = reactive<Record<string, { methodId: string; pickupId: string }>>({});
// 每箱独立的自提点搜索关键词（跨实例共享，boxKey 全局唯一）
const boxSearch = reactive<Record<string, string>>({});
</script>

<script setup lang="ts">
// 自提单模块（自提箱专用）：渲染 type==='pickup' 的箱，每箱单选自提点（就近默认）。
// 内嵌接收货人/电话子块（CheckoutPickupContactBlock，仅当存在需联系方式的 pickup 箱）。
// 选择即写库（setOrderBoxShippingMethod：承运方式 + 自提点）。
// submitPickup 校验每个自提箱已有承运方式与自提点。
// 支持 :boxes 限定渲染范围（CheckoutPerBoxList 按租户分区传入）；:bare 去掉外层 section 标题容器（卡片版式）；
// :render-contact 控制是否内嵌收货人/电话子块（卡片版式由 CheckoutPerBoxList 统一渲染一次，避免多实例重复）。
import type { PickupLocation } from "~~/.nuxt/gql/default";
import type { OrderBoxInfo } from "~~/types/order";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";
import {
  haversineKm,
  parseCoordinates,
} from "~~/layers/base/app/utils/checkout-config";

const props = withDefaults(
  defineProps<{ boxes?: OrderBoxInfo[]; bare?: boolean; renderContact?: boolean }>(),
  { boxes: undefined, bare: false, renderContact: true },
);

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();
const locationStore = useLocationStore();

const { orderBoxes } = storeToRefs(orderStore);
const allPickupBoxes = computed<OrderBoxInfo[]>(() =>
  (orderBoxes.value ?? []).filter((b) => b.type === "pickup"),
);
// 渲染范围：传入 boxes 时用传入的（租户分区），否则全部自提箱（legacy 整块）
const boxes = computed<OrderBoxInfo[]>(() => props.boxes ?? allPickupBoxes.value);

// 行级/整箱选择状态（与自提点 sel 相互独立；模块单例，与 BoxLines 及其它汇总共享）
const lineSel = usePerBoxSelection();

/** 该箱「被选行」lineTotal 求和（未选行不计入箱小计） */
function boxSubtotal(box: OrderBoxInfo): number {
  let sum = 0;
  for (const l of box.lines ?? []) {
    if ((lineSel.selection[box.boxKey]?.[l.orderLineId] ?? 0) > 0) sum += l.lineTotal;
  }
  return sum;
}

// 存在任意自提箱需联系方式才内嵌收货人/电话子块
const hasPickupContactBox = computed(() =>
  allPickupBoxes.value.some((b) => b.requiresContact),
);

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

async function applyBox(box: OrderBoxInfo, s: { methodId: string; pickupId: string }, silent = false) {
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
  // 兜底应用：让每箱初始即有承运方式 + 自提点（按全箱遍历，跨实例幂等）
  for (const box of allPickupBoxes.value) {
    if (sel[box.boxKey]) continue;
    const cid = carrierId(box);
    const nearest = nearestPickup(box);
    if (cid && nearest) {
      sel[box.boxKey] = { methodId: cid, pickupId: String(nearest.id) };
      void applyBox(box, sel[box.boxKey]!, true);
    }
  }
});

// 提交：确保每个自提箱都有生效承运方式与自提点（全箱遍历，与渲染分区无关）
flow.submitFns.submitPickup = async () => {
  for (const box of allPickupBoxes.value) {
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
    :aria-labelledby="bare ? undefined : 'box-pickup-heading'"
    :class="bare ? '' : 'rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900'"
  >
    <h3
      v-if="!bare"
      id="box-pickup-heading"
      class="mb-4 font-medium text-neutral-900 dark:text-neutral-100"
    >
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
        v-for="box in boxes"
        :key="box.boxKey"
        class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p class="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            :checked="lineSel.isBoxChecked(box.boxKey)"
            class="h-4 w-4 shrink-0 accent-primary-500"
            @change="lineSel.toggleBox(box.boxKey, ($event.target as HTMLInputElement).checked)"
          />
          <span class="h-3.5 w-1 rounded-sm bg-primary-500" />
          <span>{{ box.profileName }}</span>
          <span class="rounded-sm bg-primary-50 px-1.5 py-0.5 text-[11px] font-normal text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
            {{ t("messages.checkout.storePickup") }}
          </span>
          <span class="text-xs font-normal text-neutral-400">{{ box.tenantName }}</span>
        </p>

        <!-- 该箱商品明细（可勾选/步进/删除，行级选择由 CheckoutBoxLines 复用 usePerBoxSelection） -->
        <ul
          v-if="(box.lines ?? []).length"
          class="-mx-4 mb-3 border-b border-dashed border-neutral-200 dark:border-neutral-800"
        >
          <CheckoutBoxLines :box="box" />
        </ul>

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

        <!-- 该箱运费与小计（含税口径，与分账金额一致） -->
        <dl class="mt-3 space-y-1 border-t border-dashed border-neutral-200 pt-2 text-xs text-neutral-500 dark:border-neutral-800">
          <div v-if="(box.shippingCost ?? 0) > 0" class="flex items-center justify-between">
            <dt>{{ t("messages.checkout.shipping") }}</dt>
            <dd class="text-neutral-700 dark:text-neutral-300">
              <template v-if="(box.shippingDiscount ?? 0) > 0">
                <s class="text-neutral-400">¥{{ ((box.shippingCost + box.shippingDiscount) / 100).toFixed(2) }}</s>
                <span class="ml-1 text-red-500">-¥{{ (box.shippingDiscount / 100).toFixed(2) }}</span>
                <span class="ml-1">= ¥{{ (box.shippingCost / 100).toFixed(2) }}</span>
              </template>
              <template v-else>¥{{ (box.shippingCost / 100).toFixed(2) }}</template>
            </dd>
          </div>
          <div class="flex items-center justify-between font-medium text-neutral-700 dark:text-neutral-300">
            <dt>{{ t("messages.checkout.subtotal") }}</dt>
            <dd>¥{{ (boxSubtotal(box) / 100).toFixed(2) }}</dd>
          </div>
        </dl>

        <!-- 该箱优惠券行（整单一券，入口抽屉） -->
        <div class="mt-2 border-t border-dashed border-neutral-200 pt-1 dark:border-neutral-800">
          <CheckoutBoxCouponSelect :box="box" />
        </div>
      </div>

      <!-- 收货人/电话：存在需联系方式的自提单才内嵌，与自提点连成一体（卡片版式由 CheckoutPerBoxList 统一渲染一次） -->
      <CheckoutPickupContactBlock v-if="renderContact && hasPickupContactBox" />
    </div>
  </section>
</template>

<style lang="css" scoped></style>
