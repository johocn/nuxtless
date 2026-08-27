<script setup lang="ts">
import { useDetailConfig } from "../../composables/useDetailConfig";
import { useProductDetailView } from "../../composables/useProductDetailView";

const { visible } = useDetailConfig();
const { product, selectedVariant, productName, productServiceable } = useProductDetailView();
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
      <PriceBlock v-if="visible('price')" />
      <details v-if="visible('promo')" class="group">
        <summary class="cursor-pointer text-sm text-gray-600">促销 ▾</summary>
        <div><PromoBlock /></div>
      </details>
      <details v-if="visible('service')" class="group">
        <summary class="cursor-pointer text-sm text-gray-600">服务保障 ▾</summary>
        <div><ServiceBlock /></div>
      </details>
      <ProductVariants v-if="visible('variants')" />
    </div>
  </div>

  <div v-if="visible('purchase')" class="sticky bottom-0 z-10 mt-4 flex gap-3 bg-white/90 p-3 backdrop-blur">
    <UButton class="flex-1 justify-center" color="primary" icon="i-lucide-shopping-cart">{{ t("messages.detail.addToCart") }}</UButton>
    <UButton class="flex-1 justify-center" color="secondary">{{ t("messages.detail.buyNow") }}</UButton>
  </div>

  <ProductDescription
    v-if="visible('description') && product?.description"
    class="mb-8"
    :description="product?.description"
  />
  <ReviewsSection v-if="visible('reviews')" class="mb-8" />
  <ProductNearbyStores
    v-if="visible('nearby')"
    :product-id="product?.id"
    :variant-id="selectedVariant?.id"
  />
</template>