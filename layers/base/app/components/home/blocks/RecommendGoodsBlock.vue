<script setup lang="ts">
// 「推荐商品」装修积木：解析本节配置（缺省走兜底）→ useCuratedGoods 取数 → GoodsCardBlock 渲染
// 标题：LocalizedText 回退链（当前 locale → defaultLocale → 首个值）→ 未配置时走 i18n 字典默认标题
// 去重：dedupe 默认 true，排除同页「热门商品」区块已展示的 productId（见 useCuratedGoods）
import GoodsCardBlock from "./GoodsCardBlock.vue";
import { localizeText } from "../../../utils/detail-config";
import type { RecommendGoodsSection } from "../../../utils/shop-content";

const props = defineProps<{ section: RecommendGoodsSection }>();
const { t, locale } = useI18n();

const title = computed(
  () => localizeText(props.section?.title, locale.value) || t("messages.home.recommendGoods"),
);
const { products, layout, ready, serverFiltered } = await useCuratedGoods(props.section);
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