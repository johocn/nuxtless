<script setup lang="ts">
import { useDetailConfig } from "../../composables/useDetailConfig";
import { useProductDetailView } from "../../composables/useProductDetailView";

const { visible } = useDetailConfig();
const { product, selectedVariant, productName, productServiceable } = useProductDetailView();
const { t } = useI18n();
const { canBuy, loading, addToCartHandler, buyNowHandler } = useBuyActions();

const inStock = computed(
  () => selectedVariant.value?.stockLevel === "IN_STOCK" || selectedVariant.value?.stockLevel === "LOW_STOCK",
);
</script>

<template>
  <div class="grid grid-cols-1 gap-10 sm:grid-cols-2">
    <section v-if="visible('gallery')" aria-label="商品图集">
      <ProductGallery />
    </section>

    <!-- 信息区卡片化 -->
    <div class="flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      <header v-if="visible('info')">
        <h1 class="text-2xl font-semibold">{{ productName }}</h1>
        <BreadcrumbTrail :product="product" trail="product" class="mt-2" />
      </header>

      <!-- 价格区强化：价格 + 库存现货徽章 + SKU -->
      <section
        v-if="visible('price')"
        class="flex items-end justify-between gap-3 rounded-lg bg-primary/5 px-3 py-2.5"
      >
        <ProductDetailPriceBlock />
        <div class="flex flex-col items-end gap-1">
          <span class="text-xs font-semibold text-primary">{{ t(`messages.detail.${inStock ? "inStock" : "outOfStock"}`) }}</span>
          <span v-if="selectedVariant?.sku" class="text-[11px] text-gray-400">{{ t('messages.detail.sku', { code: selectedVariant!.sku }) }}</span>
        </div>
      </section>

      <!-- 促销视觉化 -->
      <section v-if="visible('promo')" class="rounded-lg border border-primary/15 bg-primary/5 p-3">
        <div class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
          <UIcon name="i-lucide-gift" class="size-3.5" />
          {{ t("messages.detail.promoSummary") }}
        </div>
        <ProductDetailPromoBlock />
      </section>

      <!-- 服务保障视觉化 -->
      <section v-if="visible('service')" class="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
        <div class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <UIcon name="i-lucide-shield-check" class="size-3.5" />
          {{ t("messages.detail.serviceSummary") }}
        </div>
        <ProductDetailServiceBlock />
      </section>

      <ProductVariants v-if="visible('variants')" />

      <!-- 双按钮购买栏：加入购物车(功能) + 立即购买(主红) -->
      <section v-if="visible('purchase')" class="mt-1">
        <UAlert
          v-if="!productServiceable"
          color="warning"
          variant="subtle"
          icon="i-lucide-map-pin-off"
          class="mb-3"
          title="该商品暂不支持配送至当前城市"
          description="可切换上方城市后查看，或浏览其他商品。"
        />
        <div class="flex flex-col-reverse gap-3 sm:flex-row">
          <UButton
            class="flex-1 justify-center"
            color="secondary"
            size="xl"
            icon="i-lucide-shopping-cart"
            :loading="loading"
            :disabled="!productServiceable || !canBuy"
            @click="addToCartHandler"
          >{{ t("messages.detail.addToCart") }}</UButton>
          <UButton
            class="flex-1 justify-center"
            color="primary"
            size="xl"
            icon="i-lucide-zap"
            :loading="loading"
            :disabled="!productServiceable || !canBuy"
            @click="buyNowHandler"
          >{{ t("messages.detail.buyNow") }}</UButton>
        </div>
        <ProductDetailServiceableCityPanel :product="product" />
      </section>
    </div>
  </div>

  <hr class="my-8" />

  <ProductNearbyStores
    v-if="visible('nearby')"
    :product-id="product?.id"
    :variant-id="selectedVariant?.id"
  />

  <ProductDescription
    v-if="visible('description') && product?.description"
    class="mb-8"
    :description="product?.description"
  />

  <ProductDetailReviewsSection v-if="visible('reviews')" class="mb-8" />

  <section v-if="visible('related')" aria-labelledby="related-products-heading">
    <h2 id="related-products-heading" class="mb-4 text-2xl font-semibold">
      {{ t("messages.shop.popularProducts") }}
    </h2>
    <HomeFeaturedProducts />
  </section>
</template>