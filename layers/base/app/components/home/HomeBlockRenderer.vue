<script setup lang="ts">
// 积木化统一渲染入口：按 section.type 映射组件（显式 import 组件对象，
// 避免字符串组件名被当作 custom element 渲染成空标签——与既有 home 修复模式一致）
import BannerBlock from "./blocks/BannerBlock.vue";
import NoticeBlock from "./blocks/NoticeBlock.vue";
import NavGrid from "./blocks/NavGrid.vue";
import GoodsFloor from "./blocks/GoodsFloor.vue";
import RichTextView from "./blocks/RichTextView.vue";
import type { ShopSection } from "../../utils/shop-content";

const props = defineProps<{ sections: ShopSection[] }>();

const componentMap: Record<string, any> = {
  banner: BannerBlock,
  notice: NoticeBlock,
  nav: NavGrid,
  goods: GoodsFloor,
  richText: RichTextView,
};
</script>

<template>
  <component
    v-for="(section, index) in props.sections"
    :key="index"
    :is="componentMap[section.type] ?? null"
    :section="section"
  />
</template>