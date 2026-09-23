<script setup lang="ts">
// mall 版式：usemall 风格（移动优先、卡片化、圆角、双列推荐）
// 复用既有积木块，仅调整容器结构；各块显隐仍走五级配置（visible）。
import { ref, watchEffect, computed } from "vue";
import { useDetailConfig } from "../../composables/useDetailConfig";
import { useProductDetailView } from "../../composables/useProductDetailView";

const { visible } = useDetailConfig();
const { product, selectedVariant, productName, skuLabel, productServiceable } = useProductDetailView();
const { canBuy, loading, addToCartHandler, buyNowHandler } = useBuyActions();
const { t } = useI18n();

// 配送方式切换（复用首页过滤条组件），与 floor 版式同口径
const delivery = ref<'MAIL' | 'SELF_PICKUP'>('MAIL');
const productDeliveryMethods = computed<('MAIL' | 'SELF_PICKUP')[]>(() => {
  const cf = (product.value as any)?.customFields ?? {};
  const raw: unknown[] = Array.isArray(cf.deliveryMethods) ? cf.deliveryMethods : [];
  return raw.filter((m): m is 'MAIL' | 'SELF_PICKUP' => m === 'MAIL' || m === 'SELF_PICKUP');
});
const showDeliverySwitch = computed(() => productDeliveryMethods.value.length !== 1);
watchEffect(() => {
  const m = productDeliveryMethods.value;
  if (m.length === 1) delivery.value = m[0]!;
});
</script>

<template>
  <div class="pb-24">
    <!-- 首屏大图 -->
    <ProductGallery v-if="visible('gallery')" />

    <!-- 信息主卡：价格 + 标题 + 配送/库存 -->
    <div class="rounded-2xl bg-white shadow-sm" style="margin: -14px 12px 0; position: relative; z-index: 1">
      <div class="px-4 pb-4 pt-3">
        <div v-if="visible('price')" class="flex items-end justify-between gap-3">
          <ProductDetailPriceBlock />
          <span v-if="skuLabel" class="text-[11px] text-gray-400">
            <template v-if="skuLabel.type === 'sku'">
              {{ t('messages.detail.sku', { code: skuLabel.text }) }}
            </template>
            <template v-else>
              {{ t('messages.detail.spec', { name: skuLabel.text || t('messages.detail.specDefault') }) }}
            </template>
          </span>
        </div>

        <h1 v-if="visible('info')" class="mt-2 text-lg font-semibold leading-snug">{{ productName }}</h1>

        <div v-if="showDeliverySwitch" class="mt-3">
          <HomeBlocksDeliveryFilterBar v-model="delivery" variant="segmented" />
        </div>
        <ProductStockInfoBlock
          v-if="visible('nearby')"
          :variant-id="selectedVariant?.id"
          :delivery-method="delivery"
          class="mt-3"
        />
      </div>
    </div>

    <!-- 辅助信息卡组 -->
    <div class="mx-3 mt-3 space-y-3">
      <section v-if="visible('promo')" class="rounded-xl bg-white p-3 shadow-sm">
        <ProductDetailPromoBlock />
      </section>

      <section v-if="visible('coupon')">
        <ProductDetailProductCouponBlock />
      </section>

      <section v-if="visible('service')" class="rounded-xl bg-white p-3 shadow-sm">
        <ProductDetailServiceBlock />
      </section>

      <section v-if="visible('variants')" class="rounded-xl bg-white p-3 shadow-sm">
        <ProductVariants />
      </section>
    </div>

    <!-- 购买操作（移动端由统一吸底操作栏接管，仅 PC 展示） -->
    <section v-if="visible('purchase')" class="hidden fixed bottom-0 left-0 right-0 z-20 items-center gap-3 border-t border-gray-100 bg-white/95 px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:flex">
      <UButton
        class="flex-1 justify-center text-base"
        color="secondary"
        icon="i-lucide-shopping-cart"
        :loading="loading"
        :disabled="!productServiceable || !canBuy"
        @click="addToCartHandler"
      >{{ t("messages.detail.addToCart") }}</UButton>
      <UButton
        class="flex-1 justify-center text-base"
        color="primary"
        icon="i-lucide-zap"
        :loading="loading"
        :disabled="!productServiceable || !canBuy"
        @click="buyNowHandler"
      >{{ t("messages.detail.buyNow") }}</UButton>
    </section>
    <UAlert
      v-if="visible('purchase') && !productServiceable"
      color="warning"
      variant="subtle"
      icon="i-lucide-map-pin-off"
      class="mx-3 mt-3"
      title="该商品暂不支持配送至当前城市"
      description="可切换上方城市后查看，或浏览其他商品。"
    />
    <ProductDetailServiceableCityPanel v-if="visible('purchase')" :product="product" />

    <!-- 图文详情 / 评价 -->
    <ProductDescription
      v-if="visible('description') && product?.description"
      class="mx-3 mt-4"
      :description="product?.description"
    />
    <ProductDetailReviewsSection v-if="visible('reviews')" class="mx-3 mt-4" />

    <!-- 相关推荐（双列卡片，usemall 风格） -->
    <section v-if="visible('related')" class="mx-3 mt-5">
      <h2 class="mb-3 text-center text-sm font-semibold text-gray-500">
        — {{ t("messages.shop.popularProducts") }} —
      </h2>
      <HomeFeaturedProducts />
    </section>
  </div>
</template>