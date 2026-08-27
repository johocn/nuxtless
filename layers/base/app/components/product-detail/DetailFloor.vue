<script setup lang="ts">
import { useDetailConfig } from "../../composables/useDetailConfig";
import { useProductDetailView } from "../../composables/useProductDetailView";

const { visible } = useDetailConfig();
const { product, selectedVariant, productName, productServiceable } = useProductDetailView();
const { t } = useI18n();
const toast = useToast();
const { loading } = storeToRefs(useOrderStore());
const { addItemToOrder } = useOrderStore();

const inStock = computed(
  () => selectedVariant.value?.stockLevel === "IN_STOCK" || selectedVariant.value?.stockLevel === "LOW_STOCK",
);

async function addToCart() {
  const id = selectedVariant.value?.id;
  if (!id || !productServiceable.value) return;
  const res = await addItemToOrder(id, 1);
  if (res?.status === "partial") {
    toast.add({
      title: t("messages.shop.addToCart"),
      description: `库存不足，已加入 ${res.quantityAvailable ?? 0} 件`,
      color: "warning",
    });
  }
}

// 吸顶楼层 tab（跟随滚动高亮）
const FLOOR_TABS = [
  { id: "floor-variants", key: "floorSpecs", block: "variants" },
  { id: "floor-description", key: "floorDescription", block: "description" },
  { id: "floor-reviews", key: "floorReviews", block: "reviews" },
  { id: "floor-service", key: "floorService", block: "service" },
] as const;
const floorTabs = computed(() =>
  FLOOR_TABS.map((x) => ({ ...x, label: t(`messages.detail.${x.key}`) })).filter((x) => visible(x.block)),
);

// 京东式楼层标题编号（01/02/03…）
const floorNo: Record<string, string> = {
  variants: "01",
  description: "02",
  reviews: "03",
  service: "04",
};

// 吸顶 tab 跟随滚动高亮（确定性：最后一个顶部越过吸顶线的楼层为当前）
const activeId = ref("");
const NAV_OFFSET = 96; // 吸顶 tab 高度偏移
function updateActiveTab() {
  const y = window.scrollY + NAV_OFFSET;
  let cur = "";
  for (const x of FLOOR_TABS) {
    if (!visible(x.block)) continue;
    const el = document.getElementById(x.id);
    if (!el) continue;
    if (el.getBoundingClientRect().top + window.scrollY <= y) cur = x.id;
  }
  // 滚动到底部时落到最后一个可见楼层
  const last = [...FLOOR_TABS].filter((x) => visible(x.block)).pop();
  if (last && window.innerHeight + Math.round(window.scrollY) >= document.body.scrollHeight - 4) cur = last.id;
  activeId.value = cur || "";
}
let ticking = false;
function onScroll() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(() => {
      updateActiveTab();
      ticking = false;
    });
  }
}
onMounted(() => {
  window.addEventListener("scroll", onScroll, { passive: true });
  updateActiveTab();
});
onBeforeUnmount(() => window.removeEventListener("scroll", onScroll));
</script>

<template>
  <div class="pb-24">
    <!-- 首屏商品大图 -->
    <ProductGallery v-if="visible('gallery')" />

    <!-- 价格区强化 + 服务区入口 -->
    <header class="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <h1 class="text-xl font-bold">{{ productName }}</h1>
      <div class="mt-2 flex items-end justify-between gap-3">
        <ProductDetailPriceBlock v-if="visible('price')" />
        <div v-if="selectedVariant" class="flex flex-col items-end gap-1">
          <span class="text-xs font-semibold text-primary">
            {{ t(`messages.detail.${inStock ? "inStock" : "outOfStock"}`) }}
          </span>
          <span v-if="selectedVariant.sku" class="text-[11px] text-gray-400">SKU: {{ selectedVariant.sku }}</span>
        </div>
      </div>
    </header>

    <!-- 吸顶楼层 tab（美化：下划线指示器跟随滚动） -->
    <nav class="sticky top-0 z-20 -mx-4 mb-4 mt-4 flex gap-6 overflow-x-auto border-b border-gray-100 bg-white/95 px-4 py-2 text-sm backdrop-blur">
      <a
        v-for="x in floorTabs"
        :key="x.id"
        :href="`#${x.id}`"
        class="cursor-pointer whitespace-nowrap border-b-2 pb-1.5 transition"
        :class="
          activeId === x.id
            ? 'border-primary font-semibold text-primary'
            : 'border-transparent text-gray-500 hover:text-primary'
        "
      >{{ x.label }}</a>
    </nav>

    <!-- 双按钮吸底 -->
    <section v-if="visible('purchase')" class="sticky bottom-0 z-20 -mx-4 mt-4 flex items-center gap-3 border-t border-gray-100 bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur">
      <UButton
        class="flex-1 justify-center text-base"
        color="secondary"
        icon="i-lucide-shopping-cart"
        :loading="loading"
        :disabled="!productServiceable"
        @click="addToCart"
      >{{ t("messages.detail.addToCart") }}</UButton>
      <UButton class="flex-1 justify-center text-base" color="primary" icon="i-lucide-zap">
        {{ t("messages.detail.buyNow") }}
      </UButton>
    </section>
    <UAlert
      v-if="visible('purchase') && !productServiceable"
      color="warning"
      variant="subtle"
      icon="i-lucide-map-pin-off"
      class="mt-3"
      title="该商品暂不支持配送至当前城市"
      description="可切换上方城市后查看，或浏览其他商品。"
    />

    <!-- 参数（楼层） -->
    <section v-if="visible('variants')" id="floor-variants" class="mt-8 scroll-mt-16">
      <ProductDetailFloorHeading :no="floorNo.variants" :label="t('messages.detail.floorSpecs')" />
      <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <ProductVariants />
      </div>
    </section>

    <!-- 详情（楼层） -->
    <section v-if="visible('description')" id="floor-description" class="mt-8 scroll-mt-16">
      <ProductDetailFloorHeading :no="floorNo.description" :label="t('messages.detail.floorDescription')" />
      <ProductDescription v-if="product?.description" :description="product?.description" />
    </section>

    <!-- 评价（楼层） -->
    <section v-if="visible('reviews')" id="floor-reviews" class="mt-8 scroll-mt-16">
      <ProductDetailFloorHeading :no="floorNo.reviews" :label="t('messages.detail.floorReviews')" />
      <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <ProductDetailReviewsSection />
      </div>
    </section>

    <!-- 售后（楼层） -->
    <section v-if="visible('service')" id="floor-service" class="mt-8 scroll-mt-16">
      <ProductDetailFloorHeading :no="floorNo.service" :label="t('messages.detail.floorService')" />
      <div class="rounded-xl border border-gray-100 bg-gray-50/60 p-4 shadow-sm">
        <ProductDetailServiceBlock />
      </div>
    </section>

    <!-- 相关推荐（楼层） -->
    <section v-if="visible('related')" class="mt-10">
      <ProductDetailFloorHeading :label="t('messages.shop.popularProducts')" />
      <HomeFeaturedProducts />
    </section>
  </div>
</template>