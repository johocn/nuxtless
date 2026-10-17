<script setup lang="ts">
// 「限量精选」楼层（usemall 签名楼层，跨端积木补齐 2026-10-17）：
// 按后台 collectionSlug 取集合商品，归一化为 CuratedGoodsSection（sliding 大卡横滑），
// 复用 useCuratedGoods + GoodsCardBlock 全套能力（城市配送过滤 / 划线价 / 税价口径）。
// collectionSlug 缺省退全站自动推荐；取数失败 / 为空整层隐藏（与 hot/recommend 容错一致）。
// 归一化用 type:'recommend' + dedupe:false：独立楼层不参与同页去重，
// 且 useAsyncData key 含 slug+limit，取数结果与真实 recommend 区块天然隔离。
import GoodsCardBlock from "./GoodsCardBlock.vue";
import { localizeText } from "../../../utils/detail-config";
import { floorCount, type CuratedGoodsSection, type LimitGoodsSection } from "../../../utils/shop-content";

const props = defineProps<{ section: LimitGoodsSection }>();
const { t, locale } = useI18n();

const title = computed(
  () => localizeText(props.section?.title, locale.value) || t("messages.home.limitFloor"),
);

const slug = props.section?.collectionSlug?.trim() || undefined;
const normalized = {
  type: "recommend",
  source: slug ? "collection" : "auto",
  collectionId: slug,
  slugs: [],
  limit: floorCount(props.section?.limit, 6),
  layout: "sliding",
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
