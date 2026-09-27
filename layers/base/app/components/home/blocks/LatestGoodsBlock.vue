<script setup lang="ts">
// 最新商品区块：固定用「新品集合」出楼（collectionSlug = section.collectionId），复用 goods 楼层取数/渲染。
// 注意：Vendure SearchResultSortParameter 只有 name/price，无 createdAt 排序，故「最新」由运营维护集合表达。
// 未选择集合 → 整层隐藏（同 goods 的空集合行为）。
import GoodsFloor from "./GoodsFloor.vue";
import type { GoodsSection, LatestSection } from "../../../utils/shop-content";

const props = defineProps<{ section: LatestSection }>();

const goodsSection = computed<GoodsSection | null>(() => {
  const cid = (props.section?.collectionId ?? "").trim();
  if (!cid) return null;
  return {
    type: "goods",
    collectionId: cid,
    title: props.section.title,
    layout: props.section.layout,
    limit: props.section.limit,
  };
});
</script>

<template>
  <GoodsFloor v-if="goodsSection" :section="goodsSection" />
</template>