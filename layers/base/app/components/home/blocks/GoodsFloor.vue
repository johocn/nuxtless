<script setup lang="ts">
// goods 区块：按 layout 渲染三态商品卡；数据来自 SearchProducts（collectionSlug 或自动推荐）
import JdProductGrid from "../jd/JdProductGrid.vue";
import GoodsMasonryGrid from "./GoodsMasonryGrid.vue";
import GoodsSingleList from "./GoodsSingleList.vue";
import { goodsLayout } from "../../../utils/shop-content";
import type { GoodsSection, GoodsLayout } from "../../../utils/shop-content";
import { localizeText } from "../../../utils/detail-config";
import type { SearchResult } from "~~/types/product";

const props = defineProps<{ section: GoodsSection }>();
const { t, locale } = useI18n();

const layout = computed<GoodsLayout>(() => goodsLayout(props.section.layout));
const title = computed(() =>
  // 后台标题优先（LocalizedText 逐级回退），缺省回退 i18n 静态词条
  localizeText(props.section.title, locale.value) ?? t("messages.general.recommendations"),
);
const take = computed(() => (layout.value === "masonry" ? 8 : 10));

// 按 collectionSlug 取 key：同 collection 的多个 goods 区块 SSR 不去重各自查一次（受后台"每风格商品区块 ≤2"约束）
const key = `goods-block-${props.section.collectionId ?? "auto"}`;
const { data } = await useAsyncData(
  key,
  async () => {
    const res = await useAsyncGql("SearchProducts", {
      term: "",
      ...(props.section.collectionId ? { collectionSlug: props.section.collectionId } : {}),
      take: take.value,
      skip: 0,
    });
    return (res.data.value?.search?.items ?? []) as SearchResult;
  },
  { server: true },
);
const products = computed(() => data.value ?? []);
</script>

<template>
  <GoodsMasonryGrid v-if="layout === 'masonry'" :title="title" :products="products" />
  <GoodsSingleList v-else-if="layout === 'single'" :title="title" :products="products" />
  <JdProductGrid v-else :title="title" :products="products" />
</template>