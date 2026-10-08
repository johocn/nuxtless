<script setup lang="ts">
// JD 风格商品楼层：标题 + 2 列紧凑商品卡（图 / 标题 / 京东价 / 销量标签）
// 数据来源：复用 SearchProducts 商品搜索结果（与 ProductCard 同源 Vendure 数据）
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

const { t } = useI18n();
const props = defineProps<{
  title: string;
  products: SearchItem[];
  /** 父层是否真的按配送做了服务端 facet 过滤；false（含 facet 命中 0 条的降级重查）时本地按能力精确过滤 */
  deliveryFilteredServer?: boolean;
}>();
const localePath = useTenantLocalePath();
const { taxMode, pricesIncludeTax } = useTaxMode();

// 城市·配送过滤：城市来自 locationStore（SSR 期 cookie 已同步）；配送为模块级独立状态
// 受五级风格配置（useHomeFilterConfig）控制：开关/默认配送/过滤条样式
// 必须用 storeToRefs 保持响应式：直接 store.cityName 会被 pinia 解包成字符串快照，.value 恒为 undefined → 城市过滤失效
const { cityName } = storeToRefs(useLocationStore());
const { config } = useHomeFilterConfig();
const filterEnabled = computed(() => config.value.enabled && config.value.modules.goods.enabled);
const defaultDelivery = computed(() => config.value.modules.goods.defaultDelivery ?? config.value.defaultDelivery);
const { current: delivery, setDelivery } = useModuleDelivery("jd-grid", defaultDelivery.value);
// 渠道单能力时不渲染选择框，直接锁定该唯一方式（避免无意义选择）
const { showDeliveryPicker, lockedMode } = useChannelDeliveryCapability();
watch(lockedMode, (m) => { if (m) setDelivery(m); }, { immediate: true });
// 父层（GoodsFloor）已按配送维度做服务端 facet 过滤时，本地只保留城市维度判定
const serverFiltered = computed(() => props.deliveryFilteredServer === true);
// 无 slug 的商品不可路由（路由为 /product/[slug]）：归一化阶段过滤，避免渲染出 href="/product" 的
// 死链卡片；仅告警一次，便于运营发现数据问题（不静默、也不阻塞其余商品展示）。
let warnedMissingSlug = false;
const validProducts = computed(() =>
  props.products.filter((p) => {
    if (p.slug) return true;
    if (!warnedMissingSlug) {
      warnedMissingSlug = true;
      console.warn("[JdProductGrid] 存在无 slug 的商品，已跳过其可点卡片", p);
    }
    return false;
  }),
);
const visibleItems = computed(() =>
  filterEnabled.value
    ? validProducts.value.filter((p) =>
        isProductVisible(p, {
          city: cityName.value || null,
          delivery: delivery.value,
          deliveryFilteredServer: serverFiltered.value,
        }),
      )
    : validProducts.value,
);

function format(item?: SearchItem, currencyCode?: string | null) {
  const sel = pickDisplayPrice(item, taxMode.value, pricesIncludeTax.value);
  if (!sel) return "";
  const cur = currencyCode ?? "CNY";
  if ("min" in sel && "max" in sel) {
    const min = centsToFixed(sel.min);
    const max = centsToFixed(sel.max);
    return min === max ? formatCents(sel.min) : `${min}~${max}`;
  }
  return formatCents(sel.value);
}

// 划线原价（分→文本）：仅当带 listPriceCents 且大于现行价时输出删除线原价，避免倒挂
function listText(item?: SearchItem, currencyCode?: string | null) {
  const list = (item as any)?.listPriceCents;
  if (typeof list !== "number" || list <= 0) return "";
  const current = pickCurrentCents(item, taxMode.value, pricesIncludeTax.value);
  if (current != null && list <= current) return "";
  return formatCents(list);
}
</script>

<template>
  <section class="bg-white">
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
        <NuxtLink :to="localePath('/')" class="text-xs text-gray-400">{{ t('messages.nav.more') }}</NuxtLink>
      </div>
    </div>
    <p v-if="!visibleItems.length" class="px-3 pb-3 text-xs text-gray-400">
      {{ t("messages.home.emptyAfterFilter") }}
    </p>
    <div v-else class="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 xl:gap-3">
      <NuxtLink
        v-for="p in visibleItems"
        :key="p.slug"
        :to="localePath(`/product/${p.slug}`)"
        class="group overflow-hidden rounded-lg border border-gray-100 transition active:scale-[0.98]"
        external
      >
        <div class="relative">
          <NuxtImg
            :src="assetSrc(p.productAsset?.preview || '/images/placeholder.webp', 300)"
            width="300"
            loading="lazy"
            class="aspect-square w-full bg-gray-100 object-cover"
          />
          <span class="absolute bottom-1 left-1 rounded bg-primary px-1 py-0.5 text-[9px] text-white">
            {{ t("messages.shop.popularProducts") }}
          </span>
        </div>
        <div class="p-2">
          <p class="line-clamp-2 min-h-8 text-xs leading-4 text-gray-700">{{ p.productName }}</p>
          <p class="mt-1 text-base font-bold text-primary">
            {{ format(p, p.currencyCode) }}
            <span
              v-if="listText(p, p.currencyCode)"
              class="ml-1 align-baseline text-xs font-normal text-gray-400 line-through"
            >{{ listText(p, p.currencyCode) }}</span>
          </p>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>