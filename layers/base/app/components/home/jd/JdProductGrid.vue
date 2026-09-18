<script setup lang="ts">
// JD 风格商品楼层：标题 + 2 列紧凑商品卡（图 / 标题 / 京东价 / 销量标签）
// 数据来源：复用 SearchProducts 商品搜索结果（与 ProductCard 同源 Vendure 数据）
import type { SearchResult } from "~~/types/product";
import { assetSrc } from "../../../utils/image";
import { pickDisplayPrice, pickCurrentCents } from "../../../utils/display-price";
import { isProductVisible } from "../../../utils/productVisibility";

type SearchItem = SearchResult[number];

const { t } = useI18n();
const props = defineProps<{
  title: string;
  products: SearchItem[];
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
const visibleItems = computed(() =>
  filterEnabled.value
    ? props.products.filter((p) =>
        isProductVisible(p, { city: cityName.value || null, delivery: delivery.value }),
      )
    : props.products,
);

function format(item?: SearchItem, currencyCode?: string | null) {
  const sel = pickDisplayPrice(item, taxMode.value, pricesIncludeTax.value);
  if (!sel) return "";
  const cur = currencyCode ?? "CNY";
  if ("min" in sel && "max" in sel) {
    const min = (sel.min / 100).toFixed(2);
    const max = (sel.max / 100).toFixed(2);
    return min === max ? `¥${min}` : `${min}~${max}`;
  }
  return `¥${(sel.value / 100).toFixed(2)}`;
}

// 划线原价（分→文本）：仅当带 listPriceCents 且大于现行价时输出删除线原价，避免倒挂
function listText(item?: SearchItem, currencyCode?: string | null) {
  const list = (item as any)?.listPriceCents;
  if (typeof list !== "number" || list <= 0) return "";
  const current = pickCurrentCents(item, taxMode.value, pricesIncludeTax.value);
  if (current != null && list <= current) return "";
  return `¥${(list / 100).toFixed(2)}`;
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
          v-if="filterEnabled && config.bar.visible"
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