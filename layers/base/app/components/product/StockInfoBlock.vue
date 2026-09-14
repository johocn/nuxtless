<script setup lang="ts">
import { useProductStockInfo } from "../../composables/useProductStockInfo";

const props = defineProps<{
  variantId?: string | null;
}>();

const { t } = useI18n();
const { loading, info, refresh } = useProductStockInfo();

const saleable = computed(() => info.value?.saleableStock ?? 0);
const inStock = computed(() => saleable.value > 0);
const showNearby = computed(() =>
  Boolean(info.value?.physicalStockEnabled && info.value?.stockDetail?.length),
);

async function load() {
  if (!props.variantId) {
    return;
  }
  await refresh(props.variantId);
}

onMounted(load);
// 变体切换（swatch）后重新刷新
watch(() => props.variantId, load);
</script>

<template>
  <div class="stock-info">
    <div class="flex items-center gap-1.5 text-sm">
      <UIcon name="i-lucide-boxes" class="size-3.5 text-gray-400" />
      <span class="text-gray-500">
        {{
          inStock
            ? t("messages.detail.stockCount", { n: saleable })
            : loading
              ? t("messages.detail.nearbyLoading")
              : t("messages.detail.outOfStock")
        }}
      </span>
    </div>
    <ProductNearbyStores v-if="showNearby" :stock-detail="info?.stockDetail" class="mt-2" />
  </div>
</template>
