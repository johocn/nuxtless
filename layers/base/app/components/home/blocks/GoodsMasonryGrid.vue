<script setup lang="ts">
// 淘宝风商品瀑布流：双列大图卡（大图 + 价格 + 标题 + 底行）
import type { SearchResult } from "~~/types/product";
import { assetSrc } from "../../../utils/image";
import { pickDisplayPrice, pickCurrentCents } from "../../../utils/display-price";
import { isProductVisible } from "../../../utils/productVisibility";
import type { ProductLike } from "../../../utils/productVisibility";

// GoodsFloor 在搜索项之上补了划线价与商品主数据 customFields（城市维度过滤用）
// deliveryModes 为「服务端未过滤」时的本地判据（父层按 facet 派生注入）
type SearchItem = SearchResult[number] & {
  listPriceCents?: number | null;
  customFields?: ProductLike["customFields"];
  deliveryModes?: ProductLike["deliveryModes"];
};

const props = defineProps<{
  title: string;
  products: SearchItem[];
  /** 父层是否真的按配送做了服务端 facet 过滤；false（含 facet 命中 0 条的降级重查）时本地按能力精确过滤 */
  deliveryFilteredServer?: boolean;
}>();
const { t } = useI18n();
const localePath = useTenantLocalePath();
const { taxMode, pricesIncludeTax } = useTaxMode();

// 城市·配送过滤：城市来自 locationStore（SSR 期 cookie 已同步）；配送为模块级独立状态
// 受五级风格配置（useHomeFilterConfig）控制：开关/默认配送/过滤条样式
// 必须用 storeToRefs 保持响应式：直接 store.cityName 会被 pinia 解包成字符串快照，.value 恒为 undefined → 城市过滤失效
const { cityName } = storeToRefs(useLocationStore());
const { config } = useHomeFilterConfig();
const filterEnabled = computed(() => config.value.enabled && config.value.modules.goods.enabled);
const defaultDelivery = computed(() => config.value.modules.goods.defaultDelivery ?? config.value.defaultDelivery);
const { current: delivery, setDelivery } = useModuleDelivery("masonry", defaultDelivery.value);
// 渠道单能力时不渲染选择框，直接锁定该唯一方式（避免无意义选择）
const { showDeliveryPicker, lockedMode } = useChannelDeliveryCapability();
watch(lockedMode, (m) => { if (m) setDelivery(m); }, { immediate: true });
// 父层（GoodsFloor）已按配送维度做服务端 facet 过滤时，本地只保留城市维度判定
const serverFiltered = computed(() => props.deliveryFilteredServer === true);
const visibleItems = computed(() =>
  filterEnabled.value
    ? props.products.filter((p) =>
        isProductVisible(p, {
          city: cityName.value || null,
          delivery: delivery.value,
          deliveryFilteredServer: serverFiltered.value,
        }),
      )
    : props.products,
);

function price(p?: SearchItem, cur?: string | null) {
  const sel = pickDisplayPrice(p, taxMode.value, pricesIncludeTax.value);
  if (!sel) return "";
  const c = cur ?? "CNY";
  if ("min" in sel && "max" in sel) {
    const min = (sel.min / 100).toFixed(2);
    const max = (sel.max / 100).toFixed(2);
    return min === max ? `¥${min}` : `${min}~${max}`;
  }
  return `¥${(sel.value / 100).toFixed(2)}`;
}

// 划线原价（分→文本）：仅当带 listPriceCents 且大于现行价时输出删除线原价，避免倒挂
function listText(p?: SearchItem, cur?: string | null) {
  const list = (p as any)?.listPriceCents;
  if (typeof list !== "number" || list <= 0) return "";
  const current = pickCurrentCents(p, taxMode.value, pricesIncludeTax.value);
  if (current != null && list <= current) return "";
  return `¥${(list / 100).toFixed(2)}`;
}
</script>

<template>
  <section class="mx-2 mt-2 bg-white">
    <div class="flex items-center justify-between px-3 pb-2 pt-3">
      <h2 class="flex items-center gap-1 text-base font-bold">
        <span class="inline-block h-3.5 w-1 rounded bg-primary" />
        {{ title }}
      </h2>
      <div class="flex items-center gap-2">
        <HomeBlocksDeliveryFilterBar
          v-if="filterEnabled && config.bar.visible && showDeliveryPicker"
          :variant="config.bar.variant"
          :model-value="delivery"
          @update:model-value="setDelivery"
        />
        <NuxtLink :to="localePath('/')" class="text-xs text-gray-400">更多 ›</NuxtLink>
      </div>
    </div>
    <p v-if="!visibleItems.length" class="px-3 pb-3 text-xs text-gray-400">
      {{ t("messages.home.emptyAfterFilter") }}
    </p>
    <div v-else class="grid grid-cols-2 gap-2 px-2 pb-3">
      <NuxtLink
        v-for="p in visibleItems"
        :key="p.slug"
        :to="localePath(`/product/${p.slug}`)"
        class="overflow-hidden rounded-lg border border-gray-100 bg-white transition active:scale-[0.98]"
        external
      >
        <NuxtImg
          :src="assetSrc(p.productAsset?.preview || '/images/placeholder.webp', 600)"
          width="600"
          loading="lazy"
          class="aspect-square w-full bg-gray-100 object-cover"
          alt=""
        />
        <div class="p-2">
          <p class="flex items-baseline gap-1">
            <span class="text-base font-bold text-primary">{{ price(p, p.currencyCode) }}</span>
            <span
              v-if="listText(p, p.currencyCode)"
              class="text-xs text-gray-400 line-through"
            >{{ listText(p, p.currencyCode) }}</span>
          </p>
          <p class="line-clamp-2 mt-1 min-h-8 text-xs leading-4 text-gray-700">{{ p.productName }}</p>
          <div class="mt-1.5 flex items-center justify-between text-[10px] text-gray-400">
            <span class="rounded bg-primary/10 px-1 py-0.5 text-primary">自营</span>
            <span>nshop</span>
          </div>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>