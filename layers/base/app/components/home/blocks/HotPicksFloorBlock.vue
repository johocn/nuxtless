<script setup lang="ts">
// 「热门推荐」楼层（usemall 签名楼层，跨端积木补齐 2026-10-17）：
// 按后台 collectionSlug 取集合商品，归一化为 CuratedGoodsSection（compact 京东双列网格），
// 复用 useCuratedGoods + GoodsCardBlock 全套能力（城市配送过滤 / 划线价 / 税价口径）。
// collectionSlug 缺省退全站自动推荐；取数失败 / 为空整层隐藏。
// 注：vshop 本楼层带触底分页（uni.$on home-reach-bottom）；nshop 首页为 SSR 楼层流，
// 无楼层级触底机制，故按 pageSize 首屏静态展示（缺省 10，1-20）。
import GoodsCardBlock from "./GoodsCardBlock.vue";
import { localizeText } from "../../../utils/detail-config";
import { floorCount, type CuratedGoodsSection, type HotPicksSection } from "../../../utils/shop-content";

const props = defineProps<{ section: HotPicksSection }>();
const { t, locale } = useI18n();

const title = computed(
  () => localizeText(props.section?.title, locale.value) || t("messages.home.hotPicksFloor"),
);

const slug = props.section?.collectionSlug?.trim() || undefined;
const normalized = {
  type: "recommend",
  source: slug ? "collection" : "auto",
  collectionId: slug,
  slugs: [],
  limit: floorCount(props.section?.pageSize, 10),
  layout: "compact",
  dedupe: false,
} as CuratedGoodsSection;

const { products, layout, ready, serverFiltered } = await useCuratedGoods(normalized);
</script>

<template>
  <GoodsCardBlock
    v-if="ready"
    :title="title"
    :products="products"
    :layout="layout"
    :delivery-filtered-server="serverFiltered"
  />
</template>
