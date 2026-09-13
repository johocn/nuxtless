<script setup lang="ts">
import type {
  NearStockLocation,
  NearbyResult,
} from "~~/layers/base/app/composables/useNearbyStock";
import {
  formatNearbyDistance,
  serviceCityLabel,
} from "~~/layers/base/app/utils/nearby-stock";

const props = defineProps<{
  /** 商品 ID（必填） */
  productId?: string | null;
  /** 当前选中的 SKU ID（可选，传了则按该 SKU 过滤展示） */
  variantId?: string | null;
}>();

const { t } = useI18n();
const locationStore = useLocationStore();
const { loading, error, fetchNearbyStock } = useNearbyStock();

const result = ref<NearbyResult | null>(null);
const expanded = ref(false);

/** 全部仓库可售合计（默认折叠态主数字） */
const totalAvailable = computed(() =>
  result.value?.state === 'ok'
    ? result.value.items.reduce(
        (sum, loc) => sum + loc.variants.reduce((s, v) => s + v.stockAvailable, 0),
        0,
      )
    : 0,
);

/** 门店数（含 0 件仓） */
const storeCount = computed(() => (result.value?.state === 'ok' ? result.value.items.length : 0));

/** 最近距离文案：取有坐标仓库的最小距离，无则返回 null */
const nearestLabel = computed<string | null>(() => {
  if (result.value?.state !== 'ok') return null;
  const ds = result.value.items
    .map((loc) => loc.distanceKm)
    .filter((km): km is number => km != null && km < 1e9);
  if (!ds.length) return null;
  return formatNearbyDistance(Math.min(...ds));
});

/** 汇总该仓所有 SKU 的在库库存 */
function totalOnHand(loc: NearStockLocation): number {
  return loc.variants.reduce((sum, v) => sum + v.stockOnHand, 0);
}

async function loadStock() {
  if (!props.productId) {
    result.value = { state: "no-stock", items: [], message: null };
    return;
  }
  if (!locationStore.coords && !locationStore.city) {
    result.value = { state: "no-coords", items: [], message: null };
    return;
  }
  // 无定位但有城市时按城市兜底查询（coords 传 null，后端按 city 匹配）
  result.value = await fetchNearbyStock({
    productId: props.productId,
    variantId: props.variantId,
    coords: locationStore.coords,
    city: locationStore.city?.name ?? null,
  });
}

onMounted(loadStock);

// 定位 / 城市切换后刷新
watch(() => locationStore.coords, loadStock);
watch(() => locationStore.city, loadStock);
// SKU 切换后刷新（如单仓库存明细随 SKU 变化）
watch(() => props.variantId, loadStock);
</script>

<template>
  <section aria-labelledby="nearby-stock-heading">
    <h2 id="nearby-stock-heading" class="mb-4 text-2xl font-semibold">
      {{ t("messages.detail.nearbyTitle") }}
    </h2>

    <p v-if="loading" class="text-sm text-neutral-500">
      {{ t("messages.detail.nearbyLoading") }}
    </p>
    <p
      v-else-if="result?.state === 'no-coords'"
      class="text-sm text-neutral-500"
    >
      {{ t("messages.detail.nearbyNoCoords") }}
    </p>
    <p v-else-if="result?.state === 'error'" class="text-sm text-neutral-500">
      {{ t("messages.detail.nearbyError") }}
    </p>
    <p v-else-if="result?.state === 'no-stock'" class="text-sm text-neutral-500">
      {{ t("messages.detail.nearbyNoStock") }}
    </p>

    <div v-else-if="result?.state === 'ok'" class="nearby-box">
      <div class="summary" role="button" :aria-expanded="expanded" @click="expanded = !expanded">
        <div>
          <p class="summary-kpi">
            {{ t("messages.detail.nearbySummary", { qty: totalAvailable }) }}
          </p>
          <p class="summary-meta">
            {{
              nearestLabel
                ? t("messages.detail.nearbyStoresCount", { n: storeCount, d: nearestLabel })
                : t("messages.detail.nearbyStoresCount", { n: storeCount, d: t("messages.detail.nearbyUnknownDistance") })
            }}
          </p>
        </div>
        <span class="chev" :class="{ open: expanded }">▾</span>
      </div>

      <ul v-show="expanded" class="stock-list">
        <li
          v-for="loc in result.items"
          :key="loc.location.id"
          class="loc-row"
        >
          <div class="loc-head">
            <span class="loc-name">{{ loc.location.name }}</span>
            <UBadge color="primary" variant="soft" size="sm">
              {{ formatNearbyDistance(loc.distanceKm) }}
            </UBadge>
            <span class="loc-qty" :class="{ zero: totalOnHand(loc) === 0 }">
              {{ loc.variants.reduce((s, v) => s + v.stockAvailable, 0) }} 件可售
            </span>
          </div>
          <p v-if="loc.location.description" class="loc-desc">{{ loc.location.description }}</p>
          <div class="loc-meta">
            <span class="truncate">服务城市：{{ serviceCityLabel(loc.location.serviceCities) }}</span>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.nearby-box { border: 1px solid var(--color-border-200, #e5e7eb); border-radius: 0.75rem; overflow: hidden; }
.summary {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.875rem 1rem; cursor: pointer;
}
.summary-kpi { font-weight: 600; color: var(--color-gray-900, #111827); }
.summary-meta { margin-top: 0.125rem; font-size: 0.75rem; color: var(--color-gray-500, #6b7280); }
.chev { color: var(--color-gray-400, #9ca3af); transition: transform 0.15s ease; }
.chev.open { transform: rotate(180deg); }
.stock-list { border-top: 1px solid var(--color-border-200, #e5e7eb); }
.loc-row { padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border-100, #f3f4f6); }
.loc-row:last-child { border-bottom: none; }
.loc-head { display: flex; align-items: center; gap: 0.5rem; }
.loc-name { font-weight: 500; flex: 1; min-width: 0; }
.loc-qty { font-size: 0.75rem; color: var(--color-gray-600, #4b5563); white-space: nowrap; }
.loc-qty.zero { color: var(--color-gray-400, #9ca3af); }
.loc-desc { margin-top: 0.25rem; font-size: 0.75rem; color: var(--color-gray-500, #6b7280); }
.loc-meta { margin-top: 0.25rem; font-size: 0.75rem; color: var(--color-gray-400, #9ca3af); }
</style>
