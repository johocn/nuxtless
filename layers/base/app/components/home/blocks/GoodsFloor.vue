<script setup lang="ts">
// goods 区块：按 layout 渲染三态商品卡；数据来自 SearchProducts（collectionSlug 或自动推荐）
import JdProductGrid from "../jd/JdProductGrid.vue";
import GoodsMasonryGrid from "./GoodsMasonryGrid.vue";
import GoodsSingleList from "./GoodsSingleList.vue";
import type { SearchResult } from "~~/types/product";
import { goodsLayout } from "../../../utils/shop-content";
import type { GoodsSection, GoodsLayout } from "../../../utils/shop-content";
import { localizeText } from "../../../utils/detail-config";
import { pickListCents } from "../../../utils/display-price";

const props = defineProps<{ section: GoodsSection }>();
const { t, locale } = useI18n();
const { taxMode } = useTaxMode();
// 单个 useAsyncData handler 内二次 await GqlGetProductsByIds/useAsyncGql 会丢 Nuxt 实例上下文
// （底层 useGql() 依赖 useNuxtApp()），在此 setup 顶层绑定原始 gql client（普通函数）SSR 安全。
const rawGql = useGql();

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
    const items = (res.data.value?.search?.items ?? []) as SearchResult;
    // SearchItem 不带变体 listPrice，二次拉产品主数据补齐「slug → 划线展示价」。
    // 非商品集（无 productId）或查询失败时静默降级为「无划线价」。
    const ids = items.map((i) => i.productId).filter(Boolean);
    if (!ids.length) {
      return { items, listCents: new Map() as Map<string, number | null> };
    }
    let byIds;
    try {
      byIds = await rawGql("GetProductsByIds", { ids });
    } catch {
      return { items, listCents: new Map() as Map<string, number | null> };
    }
    const products = byIds?.products?.items ?? [];
    const mode = (taxMode.value ?? "inclusive") as "inclusive" | "zero" | "exclusive";
    const listCents = new Map<string, number | null>();
    for (const p of products) {
      if (p?.slug) listCents.set(p.slug, pickListCents(p.variants ?? null, mode));
    }
    return { items, listCents };
  },
  { server: true },
);
const products = computed(() => {
  const d = data.value;
  if (!d) return [] as SearchResult;
  return d.items.map((i) => ({ ...i, listPriceCents: d.listCents.get(i.slug) ?? null })) as SearchResult;
});
</script>

<template>
  <GoodsMasonryGrid v-if="layout === 'masonry'" :title="title" :products="products" />
  <GoodsSingleList v-else-if="layout === 'single'" :title="title" :products="products" />
  <JdProductGrid v-else :title="title" :products="products" />
</template>