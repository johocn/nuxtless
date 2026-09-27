<script setup lang="ts">
// 积木化统一渲染入口：按 section.type 映射组件（显式 import 组件对象，
// 避免字符串组件名被当作 custom element 渲染成空标签——与既有 home 修复模式一致）。
//
// 输入为骨架合并结果 ResolvedSection[]：
//  - auto === true 且 slotKey 为 hot/recommend 的槽位，直接以 GoodsCardBlock 渲染页面注入的
//    home-fallback-search 结果（避免二次 useCuratedGoods 请求，守请求数红线）；
//  - 其余按 section.type 走 componentMap。
import BannerBlock from "./blocks/BannerBlock.vue";
import NoticeBlock from "./blocks/NoticeBlock.vue";
import NavGrid from "./blocks/NavGrid.vue";
import GoodsFloor from "./blocks/GoodsFloor.vue";
import RichTextView from "./blocks/RichTextView.vue";
import HotGoodsBlock from "./blocks/HotGoodsBlock.vue";
import RecommendGoodsBlock from "./blocks/RecommendGoodsBlock.vue";
import BrandFloorBlock from "./blocks/BrandFloorBlock.vue";
import PlazaBlock from "./blocks/PlazaBlock.vue";
import CouponFloorBlock from "./blocks/CouponFloorBlock.vue";
import LatestGoodsBlock from "./blocks/LatestGoodsBlock.vue";
import GoodsCardBlock from "./blocks/GoodsCardBlock.vue";
import type { SearchResult } from "~~/types/product";
import type { ResolvedSection } from "../../utils/home-skeleton";

const props = defineProps<{
  sections: ResolvedSection[];
  /** 自动补位商品槽位的数据：页面单次 home-fallback-search 注入 */
  autoGoods?: { hot: SearchResult; more: SearchResult } | null;
}>();

const { t } = useI18n();

const componentMap: Record<string, any> = {
  banner: BannerBlock,
  notice: NoticeBlock,
  nav: NavGrid,
  goods: GoodsFloor,
  richText: RichTextView,
  hot: HotGoodsBlock,
  recommend: RecommendGoodsBlock,
  brandFloor: BrandFloorBlock,
  plaza: PlazaBlock,
  coupon: CouponFloorBlock,
  latest: LatestGoodsBlock,
};

/** 自动补位的商品槽位：直渲注入数据，不再走 HotGoodsBlock/RecommendGoodsBlock */
function isAutoGoods(r: ResolvedSection): boolean {
  return r.auto && (r.slotKey === "hot" || r.slotKey === "recommend");
}
function autoProducts(r: ResolvedSection): SearchResult {
  return (r.slotKey === "hot" ? props.autoGoods?.hot : props.autoGoods?.more) ?? [];
}
function autoTitle(r: ResolvedSection): string {
  return r.slotKey === "hot" ? t("messages.home.hotGoods") : t("messages.general.recommendations");
}
</script>

<template>
  <template v-for="(item, index) in props.sections" :key="index">
    <GoodsCardBlock
      v-if="isAutoGoods(item)"
      :title="autoTitle(item)"
      :products="autoProducts(item)"
      layout="compact"
    />
    <component
      v-else
      :is="componentMap[item.section.type] ?? null"
      :section="item.section"
    />
  </template>
</template>