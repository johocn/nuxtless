<script setup lang="ts">
// 热门 / 推荐商品共享展示组件：按 layout 三分支渲染
//   A compact：直接交给 JdProductGrid（含标题头 / 过滤条 / 空态），视觉零回归，不重画
//   B sliding：横向滑动；卡片宽度 62%，右侧露出下一张的一部分（暗示可滑）
//   C hero：一大二小（首图大卡占整行 + 两张小卡各占 1/2 宽）
// 城市·配送过滤：B/C 分支在此按 isProductVisible 后置过滤（口径同 JdProductGrid）；
// 无 slug 商品不渲染可点卡片（设计 §3.4），仅 console.warn 一次。
import JdProductGrid from "../jd/JdProductGrid.vue";
import type { SearchResult } from "~~/types/product";
import { assetSrc } from "../../../utils/image";
import { pickDisplayPrice, pickCurrentCents } from "../../../utils/display-price";
import { isProductVisible } from "../../../utils/productVisibility";
import type { ProductLike } from "../../../utils/productVisibility";
import type { GoodsCardLayout } from "../../../utils/shop-content";

type SearchItem = SearchResult[number] & {
  listPriceCents?: number | null;
  customFields?: ProductLike["customFields"];
  deliveryModes?: ProductLike["deliveryModes"];
};

const { t } = useI18n();
const localePath = useTenantLocalePath();
const { taxMode, pricesIncludeTax } = useTaxMode();
const props = defineProps<{
  title: string;
  products: SearchItem[];
  layout: GoodsCardLayout;
  /** 取数层是否已按配送做服务端 facet 过滤；true 时本地只做城市维度判定 */
  deliveryFilteredServer?: boolean;
}>();

// 必须用 storeToRefs 保持响应式：直接 store.cityName 会被 pinia 解包成字符串快照
const { cityName } = storeToRefs(useLocationStore());
const { config } = useHomeFilterConfig();
const filterEnabled = computed(() => config.value.enabled && config.value.modules.goods.enabled);
const defaultDelivery = computed(() => config.value.modules.goods.defaultDelivery ?? config.value.defaultDelivery);
const { current: delivery } = useModuleDelivery("jd-grid", defaultDelivery.value);
const serverFiltered = computed(() => props.deliveryFilteredServer === true);

// B/C 分支的本地过滤（A 分支由 JdProductGrid 内部完成同一口径）
let warnedMissingSlug = false;
const visibleItems = computed(() => {
  const valid = props.products.filter((p) => {
    if (p.slug) return true;
    if (!warnedMissingSlug) {
      warnedMissingSlug = true;
      console.warn("[GoodsCardBlock] 存在无 slug 的商品，已跳过其可点卡片", p);
    }
    return false;
  });
  if (!filterEnabled.value) return valid;
  return valid.filter((p) =>
    isProductVisible(p, {
      city: cityName.value || null,
      delivery: delivery.value,
      deliveryFilteredServer: serverFiltered.value,
    }),
  );
});

// C 版式：首图大卡 + 两张小卡（空数组时首张为 null，由模板 v-if 兜住）
const heroItem = computed<SearchItem | null>(() => visibleItems.value[0] ?? null);
const sideItems = computed<SearchItem[]>(() => visibleItems.value.slice(1, 3));

function format(item?: SearchItem): string {
  const sel = pickDisplayPrice(item, taxMode.value, pricesIncludeTax.value);
  if (!sel) return "";
  if ("min" in sel && "max" in sel) {
    const min = (sel.min / 100).toFixed(2);
    const max = (sel.max / 100).toFixed(2);
    return min === max ? `¥${min}` : `${min}~${max}`;
  }
  return `¥${((sel.value ?? 0) / 100).toFixed(2)}`;
}

// 划线原价：仅当带 listPriceCents 且大于现行价时输出删除线原价，避免倒挂
function listText(item?: SearchItem): string {
  const list = item?.listPriceCents;
  if (typeof list !== "number" || list <= 0) return "";
  const current = pickCurrentCents(item, taxMode.value, pricesIncludeTax.value);
  if (current != null && list <= current) return "";
  return `¥${(list / 100).toFixed(2)}`;
}
</script>

<template>
  <!-- A compact：整块复用京东兜底楼层视觉（标题头 / 过滤条 / 空态均由 JdProductGrid 承载） -->
  <JdProductGrid
    v-if="layout === 'compact'"
    :title="title"
    :products="products"
    :delivery-filtered-server="serverFiltered"
  />

  <!-- B sliding / C hero：本组件自绘标题头 + 版式 -->
  <section v-else class="bg-white">
    <div class="flex items-center justify-between px-3 pb-2 pt-3">
      <h2 class="flex items-center gap-1 text-base font-bold">
        <span class="inline-block h-3.5 w-1 rounded bg-primary" />
        {{ title }}
      </h2>
      <NuxtLink :to="localePath('/')" class="text-xs text-gray-400">{{ t('messages.nav.more') }}</NuxtLink>
    </div>

    <p v-if="!visibleItems.length" class="px-3 pb-3 text-xs text-gray-400">
      {{ t("messages.home.emptyAfterFilter") }}
    </p>

    <!-- B：横滑，卡片 62% 宽 → 右侧露出下一张约 1/3，暗示可滑 -->
    <div v-else-if="layout === 'sliding'" class="flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-3">
      <NuxtLink
        v-for="p in visibleItems"
        :key="p.slug"
        :to="localePath(`/product/${p.slug}`)"
        class="w-[62%] shrink-0 snap-start overflow-hidden rounded-lg border border-gray-100 transition active:scale-[0.98]"
        external
      >
        <NuxtImg
          :src="assetSrc(p.productAsset?.preview || '/images/placeholder.webp', 300)"
          width="300"
          loading="lazy"
          class="aspect-square w-full bg-gray-100 object-cover"
        />
        <div class="p-2">
          <p class="line-clamp-2 min-h-8 text-xs leading-4 text-gray-700">{{ p.productName }}</p>
          <p class="mt-1 text-base font-bold text-primary">
            {{ format(p) }}
            <span v-if="listText(p)" class="ml-1 align-baseline text-xs font-normal text-gray-400 line-through">{{ listText(p) }}</span>
          </p>
        </div>
      </NuxtLink>
    </div>

    <!-- C：一大二小（大卡占整行 + 两张小卡各 1/2 宽） -->
    <div v-else class="px-3 pb-3">
      <NuxtLink
        v-if="heroItem"
        :to="localePath(`/product/${heroItem.slug}`)"
        class="mb-2 block overflow-hidden rounded-lg border border-gray-100 transition active:scale-[0.98]"
        external
      >
        <div class="relative">
          <NuxtImg
            :src="assetSrc(heroItem.productAsset?.preview || '/images/placeholder.webp', 600)"
            width="600"
            loading="lazy"
            class="aspect-[16/9] w-full bg-gray-100 object-cover"
          />
          <span class="absolute bottom-1 left-1 rounded bg-primary px-1 py-0.5 text-[9px] text-white">
            {{ t("messages.shop.popularProducts") }}
          </span>
        </div>
        <div class="p-2">
          <p class="line-clamp-2 text-sm leading-5 text-gray-700">{{ heroItem.productName }}</p>
          <p class="mt-1 text-lg font-bold text-primary">
            {{ format(heroItem) }}
            <span v-if="listText(heroItem)" class="ml-1 align-baseline text-xs font-normal text-gray-400 line-through">{{ listText(heroItem) }}</span>
          </p>
        </div>
      </NuxtLink>
      <div class="grid grid-cols-2 gap-2">
        <NuxtLink
          v-for="p in sideItems"
          :key="p.slug"
          :to="localePath(`/product/${p.slug}`)"
          class="overflow-hidden rounded-lg border border-gray-100 transition active:scale-[0.98]"
          external
        >
          <NuxtImg
            :src="assetSrc(p.productAsset?.preview || '/images/placeholder.webp', 300)"
            width="300"
            loading="lazy"
            class="aspect-square w-full bg-gray-100 object-cover"
          />
          <div class="p-2">
            <p class="line-clamp-2 min-h-8 text-xs leading-4 text-gray-700">{{ p.productName }}</p>
            <p class="mt-1 text-base font-bold text-primary">
              {{ format(p) }}
              <span v-if="listText(p)" class="ml-1 align-baseline text-xs font-normal text-gray-400 line-through">{{ listText(p) }}</span>
            </p>
          </div>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>