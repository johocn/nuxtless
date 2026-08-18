<script setup lang="ts">
import type { PickupLocation } from "~~/.nuxt/gql/default";

const locationStore = useLocationStore();
const orderStore = useOrderStore();

const { t } = useI18n();
const toast = useToast();

const loading = ref(false);
const error = ref<string | null>(null);
const pickupLocations = ref<PickupLocation[]>([]);
const selectedId = ref<string>("");

/** 是否已进入自提模式（用户选择了自提点） */
const isPickup = computed(
  () =>
    (orderStore.order?.customFields?.deliveryType ?? "") === "pickup" ||
    !!selectedId.value,
);

const typeLabel: Record<string, string> = {
  store: "门店",
  point: "自提点",
  employee: "渠道点",
};

async function loadPickupLocations() {
  loading.value = true;
  error.value = null;
  try {
    const { pickupLocations: list } = await GqlGetPickupLocations({
      type: null,
      lat: locationStore.coords?.lat ?? null,
      lng: locationStore.coords?.lng ?? null,
    });
    pickupLocations.value = (list ?? []) as PickupLocation[];
  } catch (e) {
    error.value = e instanceof Error ? e.message : "获取自提点失败";
  } finally {
    loading.value = false;
  }
}

async function onSelect(id: string) {
  const loc = pickupLocations.value.find((x) => x.id === id);
  if (!loc) {
    selectedId.value = "";
    return;
  }
  selectedId.value = id;
  await orderStore.setPickupLocation(id, loc.type ?? "store");
  if (orderStore.error) {
    toast.add({
      title: t("messages.error.general"),
      description: orderStore.error,
      color: "error",
    });
    selectedId.value = "";
  } else {
    // 自提订单默认配送方式：写入 deliveryType=pickup
    try {
      await orderStore.setOrderShippingAddress({
        fullName: orderStore.order?.customer
          ? `${orderStore.order.customer.firstName} ${orderStore.order.customer.lastName}`.trim()
          : "自提用户",
        streetLine1: loc.address,
        city: locationStore.city?.name,
        countryCode: "CN",
      });
    } catch {
      /* 地址已在 setOrderPickupLocation 内同步，此兜底可不做 */
    }
  }
}

onMounted(loadPickupLocations);
// 定位变化后刷新自提点列表
watch(() => locationStore.coords, loadPickupLocations);
</script>

<template>
  <div class="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="font-medium">自提点 / 门店</h3>
      <UBadge v-if="isPickup" color="primary" variant="soft" size="sm">
        门店自提
      </UBadge>
    </div>

    <p v-if="loading" class="text-sm text-neutral-500">正在加载自提点…</p>
    <p v-else-if="error" class="text-sm text-red-500">{{ error }}</p>
    <p v-else-if="!pickupLocations.length" class="text-sm text-neutral-500">
      当前定位附近暂无可选自提点，可使用配送到家。
    </p>

    <div v-else class="space-y-2">
      <label
        v-for="loc in pickupLocations"
        :key="loc.id"
        class="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 p-3 hover:border-primary-300 dark:border-neutral-800"
        :class="selectedId === loc.id ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : ''"
      >
        <input
          type="radio"
          name="pickupLocation"
          :value="loc.id"
          :checked="selectedId === loc.id"
          class="mt-0.5 h-4 w-4"
          @change="onSelect(loc.id)"
        />
        <span class="flex-1">
          <span class="block font-medium">
            {{ loc.name }}
            <span class="ml-1 text-xs text-neutral-400">
              {{ typeLabel[loc.type] ?? loc.type }}
            </span>
          </span>
          <span class="block text-sm text-neutral-500">{{ loc.address }}</span>
          <span class="block text-xs text-neutral-400">
            {{ loc.businessHours || loc.phoneNumber }}
          </span>
        </span>
      </label>
    </div>
  </div>
</template>