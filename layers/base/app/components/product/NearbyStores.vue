<script setup lang="ts">
import type { NearStockLocation } from "~~/layers/base/app/composables/useNearbyStock";

const props = defineProps<{
  /** 商品 ID（必填） */
  productId?: string | null;
  /** 当前选中的 SKU ID（可选，传了则按该 SKU 过滤展示） */
  variantId?: string | null;
}>();

const locationStore = useLocationStore();
const { loading, error, fetchNearbyStock } = useNearbyStock();

const stockList = ref<NearStockLocation[]>([]);

function formatDistance(km: number | null): string {
  if (km == null) return "距离未知";
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

/** 汇总该仓所有 SKU 的在库库存 */
function totalOnHand(loc: NearStockLocation): number {
  return loc.variants.reduce((sum, v) => sum + v.stockOnHand, 0);
}

/** 汇总该仓所有 SKU 的已分配（占用）库存 */
function totalAllocated(loc: NearStockLocation): number {
  return loc.variants.reduce((sum, v) => sum + v.stockAllocated, 0);
}

async function loadStock() {
  if (!props.productId) return;
  if (!locationStore.coords) return;
  stockList.value = await fetchNearbyStock({
    productId: props.productId,
    variantId: props.variantId,
    coords: locationStore.coords,
    city: locationStore.city?.name ?? null,
  });
}

onMounted(loadStock);

// 定位 / 城市切换后刷新
watch(() => locationStore.coords, loadStock);
// SKU 切换后刷新（如单仓库存明细随 SKU 变化）
watch(() => props.variantId, loadStock);
</script>

<template>
  <section v-if="locationStore.coords" aria-labelledby="nearby-stock-heading">
    <h2 id="nearby-stock-heading" class="mb-4 text-2xl font-semibold">
      就近库存
    </h2>

    <p v-if="loading" class="text-sm text-neutral-500">正在加载库存…</p>
    <p v-else-if="error" class="text-sm text-red-500">{{ error }}</p>
    <p v-else-if="!stockList.length" class="text-sm text-neutral-500">
      当前定位附近暂无可查询的库存。
    </p>

    <ul v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <li
        v-for="loc in stockList"
        :key="loc.location.id"
        class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="font-medium">{{ loc.location.name }}</p>
          <UBadge color="primary" variant="soft" size="sm">
            {{ formatDistance(loc.distanceKm) }}
          </UBadge>
        </div>
        <p v-if="loc.location.description" class="mt-1 text-sm text-neutral-500">
          {{ loc.location.description }}
        </p>

        <!-- 逐仓库存明细 -->
        <div class="mt-2 space-y-1.5">
          <template v-if="variantId">
            <div
              v-for="v in loc.variants.filter((x) => x.variantId === variantId)"
              :key="v.variantId"
              class="flex items-center justify-between text-sm"
            >
              <span class="text-neutral-600 dark:text-neutral-400">
                {{ v.variantName }}
              </span>
              <span class="font-medium">{{ v.stockAvailable }} 件可售</span>
            </div>
          </template>
          <template v-else>
            <div
              v-for="v in loc.variants"
              :key="v.variantId"
              class="flex items-center justify-between text-sm"
            >
              <span class="text-neutral-600 dark:text-neutral-400">
                {{ v.variantName }}
              </span>
              <span class="font-medium">{{ v.stockAvailable }} 件可售</span>
            </div>
          </template>
        </div>

        <!-- 汇总行：在库 / 占用 -->
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
          <span>在库 {{ totalOnHand(loc) }} 件</span>
          <span>已占用 {{ totalAllocated(loc) }} 件</span>
          <span v-if="loc.location.serviceCities?.length" class="truncate">
            服务城市：{{ loc.location.serviceCities.join("、") }}
          </span>
        </div>
      </li>
    </ul>
  </section>
</template>
