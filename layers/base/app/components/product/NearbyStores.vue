<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { formatNearbyDistance } from "~~/layers/base/app/utils/nearby-stock";
import type { StockInfoDetail } from "~~/layers/base/app/composables/useProductStockInfo";
import type { StockDeliveryMethod } from "~~/layers/base/app/composables/useProductStockInfo";

const props = withDefaults(
  defineProps<{
    /** 附近库存明细（来自 variantStockInfo.stockDetail，已按距离就近排序） */
    stockDetail?: readonly StockInfoDetail[] | null;
    /** 配送方式口径：SELF_PICKUP 时折叠块标题按自提语义显示 */
    mode?: StockDeliveryMethod;
  }>(),
  { mode: "MAIL" },
);

const { t } = useI18n();
const expanded = ref(false);

const stores = computed(() => props.stockDetail ?? []);

/** 全部物理仓可售合计（默认折叠态主数字） */
const totalAvailable = computed(() => stores.value.reduce((sum, s) => sum + s.onHand, 0));

/** 最近距离文案：取有坐标仓库的最小距离，无则返回 null */
const nearestLabel = computed<string | null>(() => {
  const ds = stores.value.map((s) => s.distanceKm).filter((km): km is number => km != null && km < 1e9);
  if (!ds.length) return null;
  return formatNearbyDistance(Math.min(...ds));
});
</script>

<template>
  <section v-if="stores.length" class="nearby-box" aria-labelledby="nearby-stock-heading">
    <div class="summary" role="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <div>
        <p class="summary-kpi">
          {{
            props.mode === "SELF_PICKUP"
              ? t("messages.detail.pickupSummary", { qty: totalAvailable })
              : t("messages.detail.nearbySummary", { qty: totalAvailable })
          }}
        </p>
        <p class="summary-meta">
          {{
            nearestLabel
              ? t("messages.detail.nearbyStoresCount", { n: stores.length, d: nearestLabel })
              : t("messages.detail.nearbyStoresCount", { n: stores.length, d: t("messages.detail.nearbyUnknownDistance") })
          }}
        </p>
      </div>
      <span class="chev" :class="{ open: expanded }">▾</span>
    </div>

    <ul v-show="expanded" class="stock-list">
      <li v-for="s in stores" :key="s.locationId" class="loc-row">
        <div class="loc-head">
          <span class="loc-name">{{ s.name }}</span>
          <span class="loc-qty" :class="{ zero: s.onHand === 0 }">库存 {{ s.onHand }} 件</span>
        </div>
        <p class="loc-meta">
          {{ s.distanceKm == null ? t("messages.detail.nearbyUnknownDistance") : formatNearbyDistance(s.distanceKm) }}
        </p>
      </li>
    </ul>
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
.loc-meta { margin-top: 0.25rem; font-size: 0.75rem; color: var(--color-gray-400, #9ca3af); }
</style>
