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
import type { ProductLike } from "../../../utils/productVisibility";
import { deliveryFacetFilter } from "../../../utils/delivery-modes";

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

// 与子组件渲染的布局一一对应，从而共用同一份「模块级配送选择」状态（useModuleDelivery 的 useState 按 moduleId 共享）
const moduleId = computed(() =>
  layout.value === "masonry" ? "masonry" : layout.value === "single" ? "single-list" : "jd-grid",
);
const { config: filterConfig } = useHomeFilterConfig();
const filterEnabled = computed(() => filterConfig.value.enabled && filterConfig.value.modules.goods.enabled);
const defaultDelivery = computed(
  () => filterConfig.value.modules.goods.defaultDelivery ?? filterConfig.value.defaultDelivery,
);
const { current: delivery } = useModuleDelivery(moduleId.value, defaultDelivery.value);
const { showDeliveryPicker, facetValueIds } = useChannelDeliveryCapability();

/** 服务端配送筛选入参；不可用（单能力渠道 / facet 未同步 / 未开启过滤）时为 null，退回子组件本地过滤 */
const facetFilter = computed(() =>
  filterEnabled.value && showDeliveryPicker.value
    ? deliveryFacetFilter(facetValueIds.value, delivery.value)
    : null,
);
// 只在「实际生效的筛选」变化时才重查（取字符串避免数组引用变化触发无谓重查）
const facetKey = computed(() => facetFilter.value?.[0]?.or.join(",") ?? "");

/** SSR 期渠道能力与商品查询并行，须在 handler 内独立取一次，保证 SSR 与客户端首帧同一筛选口径 */
async function loadChannelFacet(): Promise<{ dual: boolean; ids: Record<string, string> | null }> {
  try {
    const res = await rawGql("ChannelDeliveryCapability", {});
    const cap = (res as any)?.channelDeliveryCapability;
    return { dual: cap?.bothSupported === true, ids: cap?.facetValueIds ?? null };
  } catch {
    return { dual: false, ids: null };
  }
}

// 按 collectionSlug 取 key：同 collection 的多个 goods 区块 SSR 不去重各自查一次（受后台"每风格商品区块 ≤2"约束）
const key = `goods-block-${props.section.collectionId ?? "auto"}`;
const { data } = await useAsyncData(
  key,
  async () => {
    // 仅双能力渠道走服务端 facet：单能力渠道筛选值恒不变（筛选条也不渲染），
    // 一旦 facet 索引缺失反而会把商品块清空，收益为负。
    const cap = filterEnabled.value ? await loadChannelFacet() : { dual: false, ids: null };
    const filters = cap.dual ? deliveryFacetFilter(cap.ids, delivery.value) : null;
    // 必须用 setup 顶层绑定的原始 gql client：handler 内已 await 过渠道能力查询，
    // 此处再调 useAsyncGql 会丢 Nuxt 实例上下文抛 "[nuxt] instance unavailable"。
    let items: SearchResult = [];
    try {
      const searchRes = await rawGql("SearchProducts", {
        term: "",
        ...(props.section.collectionId ? { collectionSlug: props.section.collectionId } : {}),
        take: take.value,
        skip: 0,
        ...(filters ? { facetValueFilters: filters } : {}),
      });
      items = (searchRes?.search?.items ?? []) as SearchResult;
    } catch {
      /* 搜索失败保持空区块，不阻断首页其它区块 */
    }
    // SearchItem 不带变体 listPrice，二次拉产品主数据补齐「slug → 划线展示价」。
    // 非商品集（无 productId）或查询失败时静默降级为「无划线价」。
    const ids = items.map((i) => i.productId).filter(Boolean);
    if (!ids.length) {
      return { items, listCents: new Map() as Map<string, number | null>, cfMap: new Map() as Map<string, ProductLike["customFields"]> };
    }
    let byIds;
    try {
      byIds = await rawGql("GetProductsByIds", { ids });
    } catch {
      return { items, listCents: new Map() as Map<string, number | null>, cfMap: new Map() as Map<string, ProductLike["customFields"]> };
    }
    const products = byIds?.products?.items ?? [];
    const mode = (taxMode.value ?? "inclusive") as "inclusive" | "zero" | "exclusive";
    const listCents = new Map<string, number | null>();
    // 同步合并商品主数据 customFields（belongCity/serviceCities/deliveryMethods），
    // 供 isProductVisible 做「城市·配送」SSR 后置过滤（SearchItem 本身不带 customFields）。
    const cfMap = new Map<string, ProductLike["customFields"]>();
    for (const p of products) {
      if (p?.slug) {
        listCents.set(p.slug, pickListCents(p.variants ?? null, mode));
        cfMap.set(p.slug, (p as { customFields?: ProductLike["customFields"] }).customFields ?? null);
      }
    }
    return { items, listCents, cfMap };
  },
  // 用户切换「邮寄 / 自提」后重查：SSR 首帧的筛选值即默认配送，客户端仅在真正变化时重查
  { server: true, watch: [facetKey] },
);
const products = computed(() => {
  const d = data.value;
  if (!d) return [] as SearchResult;
  return d.items.map((i) => ({
    ...i,
    listPriceCents: d.listCents.get(i.slug) ?? null,
    customFields: d.cfMap.get(i.slug) ?? null,
  })) as SearchResult;
});
</script>

<template>
  <!-- 商品「城市·配送」过滤、切换条与空态统一由各布局子组件（JdProductGrid/GoodsMasonryGrid/GoodsSingleList）承接（单一过滤层，避免双层过滤导致切「自提」时自提-only 商品被上层 MAIL 预筛掉） -->
  <GoodsMasonryGrid v-if="layout === 'masonry'" :title="title" :products="products" />
  <GoodsSingleList v-else-if="layout === 'single'" :title="title" :products="products" />
  <JdProductGrid v-else :title="title" :products="products" />
</template>