<script setup lang="ts">
import { useProductStockInfo, type StockDeliveryMethod } from "../../composables/useProductStockInfo";

const props = withDefaults(
  defineProps<{
    variantId?: string | null;
    /** 当前配送方式口径：MAIL=邮寄（可发仓+虚拟），SELF_PICKUP=自提（可自提点合计） */
    deliveryMethod?: StockDeliveryMethod;
  }>(),
  { deliveryMethod: "MAIL" },
);

const { t } = useI18n();
const { loading, info, refresh } = useProductStockInfo();
const { cityName } = storeToRefs(useLocationStore());

const saleable = computed(() => info.value?.saleableStock ?? 0);
const inStock = computed(() => saleable.value > 0);
const showNearby = computed(() =>
  Boolean(info.value?.physicalStockEnabled && info.value?.stockDetail?.length),
);
// 自提口径：租户未开启物理库存时无自提点可统计，仅保留可达性提示
const pickupUnavailable = computed(
  () => props.deliveryMethod === "SELF_PICKUP" && !info.value?.physicalStockEnabled,
);

function currentCity(): string | null {
  return (cityName.value as string | undefined)?.trim() || null;
}

async function load() {
  if (!props.variantId) {
    return;
  }
  await refresh(props.variantId, null, null, currentCity(), props.deliveryMethod);
}

onMounted(load);
// 变体切换（swatch）/ 城市变更 / 配送方式切换后重新刷新
watch(
  () => [props.variantId, cityName.value, props.deliveryMethod],
  () => {
    load();
  },
);
</script>

<template>
  <div class="stock-info">
    <div class="flex items-center gap-1.5 text-sm">
      <UIcon name="i-lucide-boxes" class="size-3.5 text-gray-400" />
      <span class="text-gray-500">
        <template v-if="pickupUnavailable">
          {{ t("messages.detail.deliveryNoStock") }}
        </template>
        <template v-else-if="props.deliveryMethod === 'SELF_PICKUP'">
          {{ t("messages.detail.deliveryPickup") }} {{ t("messages.detail.stockCount", { n: saleable }) }}
        </template>
        <template v-else>
          {{
            inStock
              ? t("messages.detail.stockCount", { n: saleable })
              : loading
                ? t("messages.detail.nearbyLoading")
                : t("messages.detail.outOfStock")
          }}
        </template>
      </span>
    </div>
    <ProductNearbyStores
      v-if="showNearby"
      :stock-detail="info?.stockDetail"
      :mode="props.deliveryMethod"
      class="mt-2"
    />
  </div>
</template>
