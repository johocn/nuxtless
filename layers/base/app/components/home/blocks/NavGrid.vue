<script setup lang="ts">
// nav 区块适配：section.items + 京东默认 shape/layout → JdFunctionGrid
import JdFunctionGrid from "../jd/JdFunctionGrid.vue";
import { navDefaults } from "../../../utils/shop-content";
import type { NavSection } from "../../../utils/shop-content";

const props = defineProps<{ section: NavSection }>();

const shape = computed(() => navDefaults(props.section.shape, props.section.layout).shape);
const layout = computed(() => navDefaults(props.section.shape, props.section.layout).layout);
// 装修配置的 items 转成 JdFunctionGrid 的 GridItem 形态（有图用图，无图 emoji 兜底）
const items = computed(() =>
  props.section.items.map((it) => ({
    label: it.label,
    img: it.image || undefined,
    emoji: it.image ? undefined : "🏷️",
    path: it.link || undefined,
  })),
);
</script>

<template>
  <JdFunctionGrid :shape="shape" :layout="layout" :items="items" />
</template>