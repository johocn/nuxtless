<script setup lang="ts">
import { useDetailConfig } from "../../composables/useDetailConfig";
import { useProductDetailView } from "../../composables/useProductDetailView";

const { visible } = useDetailConfig();
const { product, selectedVariant, productName, productServiceable } = useProductDetailView();
const { canBuy, loading, addToCartHandler, buyNowHandler } = useBuyActions();
const { t } = useI18n();
</script>

<template>
  <div class="grid grid-cols-1 gap-10 sm:grid-cols-2">
    <section v-if="visible('gallery')" aria-label="商品图集">
      <ProductGallery />
    </section>
    <div class="flex flex-col gap-4">
      <header v-if="visible('info')">
        <h1 class="text-2xl font-semibold">{{ productName }}</h1>
        <BreadcrumbTrail :product="product" trail="product" class="mt-2" />
      </header>
      <ProductDetailPriceBlock v-if="visible('price')" />
      <details v-if="visible('promo')" class="group">
        <summary class="cursor-pointer text-sm text-gray-600">促销 ▾</summary>
        <div><ProductDetailPromoBlock /></div>
      </details>
      <details v-if="visible('service')" class="group">
        <summary class="cursor-pointer text-sm text-gray-600">服务保障 ▾</summary>
        <div><ProductDetailServiceBlock /></div>
      </details>
      <ProductVariants v-if="visible('variants')" />
    </div>
  </div>

  <div
    v-if="visible('purchase')"
    class="sticky bottom-0 z-10 mt-4 flex items-center gap-3 border-t border-gray-100 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:justify-end sm:bg-white/70 sm:pb-3 sm:shadow-none sm:border-0"
  >
    <UButton
      class="flex-1 justify-center text-base sm:min-w-32 sm:flex-none"
      color="secondary"
      variant="solid"
      icon="i-lucide-shopping-cart"
      :loading="loading"
      :disabled="!productServiceable || !canBuy"
      @click="addToCartHandler"
    >{{ t("messages.detail.addToCart") }}</UButton>
    <UButton
      class="flex-1 justify-center text-base sm:min-w-40 sm:flex-none"
      color="primary"
      icon="i-lucide-zap"
      :loading="loading"
      :disabled="!productServiceable || !canBuy"
      @click="buyNowHandler"
    >{{ t("messages.detail.buyNow") }}</UButton>
  </div>
  <ProductDetailServiceableCityPanel v-if="visible('purchase')" :product="product" />

  <ProductDescription
    v-if="visible('description') && product?.description"
    class="mb-8"
    :description="product?.description"
  />
  <ProductDetailReviewsSection v-if="visible('reviews')" class="mb-8" />
  <ProductNearbyStores
    v-if="visible('nearby')"
    :product-id="product?.id"
    :variant-id="selectedVariant?.id"
  />
</template>