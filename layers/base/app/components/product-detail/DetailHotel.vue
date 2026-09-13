<script setup lang="ts">
// hotel 版式：DateBar → Gallery → RoomList → PricePreview → Policy → Service → Reviews → Purchase
// 块显隐走 blockVisible 兜底链（L2 配置 → 内建默认 → true）
import { computed } from "vue";
import { useDetailConfig } from "../../composables/useDetailConfig";
import { blockVisible } from "../../utils/detail-config";
const { config } = useDetailConfig();
const productStore = useProductStore();
const parseHotel = (raw: unknown) => { if (typeof raw !== 'string') return raw ?? null; try { return JSON.parse(raw); } catch { return null; } };
const hotelRaw = computed(() => parseHotel(productStore.product?.customFields?.hotelRoomConfig));
const isHotel = computed(() => !!hotelRaw.value);
const v = (k: string) => blockVisible(config.value, k);
</script>

<template>
  <div v-if="isHotel" class="pb-2">
    <ProductDetailDateBar v-if="v('datebar')" />
    <ProductGallery v-if="v('gallery')" />
    <ProductDetailRoomList v-if="v('roomList')" />
    <ProductDetailPricePreview v-if="v('pricePreview')" />
    <ProductDetailPolicy v-if="v('policy')" />
    <ProductDetailServiceBlock v-if="v('service')" />
    <ProductDetailReviewsSection v-if="v('reviews')" />
    <!-- 购买区：移动端由统一吸底操作栏（Renderer 挂载）接管，此栏仅 PC 展示，避免双吸底重叠 -->
    <div v-if="v('purchase')" class="hidden lg:block">
      <ProductDetailPurchaseBar />
    </div>
  </div>
  <div v-else>
    <slot />
  </div>
</template>
