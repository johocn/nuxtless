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
      <PromoBlock v-if="visible('promo')" />
      <ServiceBlock v-if="visible('service')" />
      <ProductVariants v-if="visible('variants')" />
      <section v-if="visible('purchase')">
        <UAlert
          v-if="!productServiceable"
          color="warning"
          variant="subtle"
          icon="i-lucide-map-pin-off"
          class="mb-3"
          title="该商品暂不支持配送至当前城市"
          description="可切换上方城市后查看，或浏览其他商品。"
        />
        <CartAddButton :disabled="!productServiceable" />
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

  <ReviewsSection v-if="visible('reviews')" class="mb-8" />

  <section v-if="visible('related')" aria-labelledby="related-products-heading">
    <h2 id="related-products-heading" class="mb-4 text-2xl font-semibold">
      {{ t("messages.shop.popularProducts") }}
    </h2>
    <HomeFeaturedProducts />
  </section>
</template>