<script setup lang="ts">
import DetailClassic from "./DetailClassic.vue";
import DetailFloor from "./DetailFloor.vue";
import DetailDualBuy from "./DetailDualBuy.vue";
import { useDetailConfig } from "../../composables/useDetailConfig";

const { layout, config, visible } = useDetailConfig();

const componentMap: Record<string, any> = {
  classic: DetailClassic,
  floor: DetailFloor,
  dualBuy: DetailDualBuy,
};
</script>

<template>
  <div>
    <component :is="componentMap[layout] ?? DetailClassic" :config="config" />
    <!-- 统一吸底操作栏：三版式共用，移动端常驻；内容区已在 default 布局预留底部留白防遮挡 -->
    <ProductDetailBottomBar v-if="visible('purchase')" />
  </div>
</template>