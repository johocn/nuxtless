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
      <!-- 库存区：默认虚拟可售数；开启物理租户 + 物理驱动变体显示附近库存折叠 -->
      <ProductStockInfoBlock
        v-if="visible('nearby')"
        :variant-id="selectedVariant?.id"
      />
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
    class="mt-4 hidden items-center gap-3 border-t border-gray-100 bg-white/95 p-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] lg:flex"
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
</template>