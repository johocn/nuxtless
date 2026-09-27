<script setup lang="ts">
import DetailClassic from "./DetailClassic.vue";
import DetailFloor from "./DetailFloor.vue";
import DetailDualBuy from "./DetailDualBuy.vue";
import DetailHotel from "./DetailHotel.vue";
import DetailMall from "./DetailMall.vue";
import { useDetailConfig } from "../../composables/useDetailConfig";
import { resolveDetailLayout } from "../../utils/detail-config";

const { config, visible } = useDetailConfig();
const productStore = useProductStore();

const componentMap: Record<string, any> = {
  classic: DetailClassic,
  floor: DetailFloor,
  dualBuy: DetailDualBuy,
  hotel: DetailHotel,
  mall: DetailMall,
};

// 版式自动命中：后台显式覆盖为非 hotel 版式（floor/dualBuy/mall）时以配置为准；
// 否则该商品任一变体含 hotelRoomConfig → hotel 版式；再否则按配置（默认 classic）。
// 判定基于变体集合而非「当前选中变体」，SSR 与 CSR 一致，避免 hydration mismatch。
const layout = computed(() => resolveDetailLayout(config.value, productStore.product?.variants));
</script>

<template>
  <div>
    <!-- hotel 版式：商品任一变体配置了 hotelRoomConfig 时渲染酒店块；无房型时回退经典版式（DetailHotel v-else 槽位） -->
    <DetailHotel v-if="layout === 'hotel'" :config="config">
      <DetailClassic :config="config" />
    </DetailHotel>
    <component v-else :is="componentMap[layout] ?? DetailClassic" :config="config" />
    <!-- 统一吸底操作栏：三版式共用，移动端常驻；内容区已在 default 布局预留底部留白防遮挡 -->
    <ProductDetailBottomBar v-if="visible('purchase')" />
  </div>
</template>