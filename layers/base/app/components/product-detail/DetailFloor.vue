<script setup lang="ts">
import { useDetailConfig } from "../../composables/useDetailConfig";
import { useProductDetailView } from "../../composables/useProductDetailView";

const { visible } = useDetailConfig();
const { product, selectedVariant, productName } = useProductDetailView();
const { t } = useI18n();
</script>

<template>
  <div>
    <header class="mb-4">
      <h1 class="text-xl font-bold">{{ productName }}</h1>
      <PriceBlock v-if="visible('price')" />
    </header>

    <nav class="sticky top-0 z-10 -mx-4 mb-4 flex gap-4 overflow-x-auto bg-white px-4 py-2 text-sm shadow">
      <a class="text-primary" href="#floor-description">详情</a>
      <a href="#floor-variants">参数</a>
      <a href="#floor-reviews">评价</a>
      <a href="#floor-service">售后</a>
    </nav>

    <ProductGallery v-if="visible('gallery')" />

    <section v-if="visible('variants')" id="floor-variants" class="mt-6">
      <ProductVariants />
    </section>

    <section v-if="visible('purchase')" class="mt-4">
      <CartAddButton />
    </section>

    <section v-if="visible('description')" id="floor-description" class="mt-8">
      <ProductDescription
        v-if="product?.description"
        :description="product?.description"
      />
    </section>

    <section v-if="visible('reviews')" id="floor-reviews">
      <ReviewsSection />
    </section>

    <section v-if="visible('service')" id="floor-service" class="mt-6">
      <ServiceBlock />
    </section>

    <section v-if="visible('related')" class="mt-10">
      <h2 class="mb-4 text-lg font-semibold">
        {{ t("messages.shop.popularProducts") }}
      </h2>
      <HomeFeaturedProducts />
    </section>
  </div>
</template>