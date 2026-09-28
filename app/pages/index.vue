<script setup lang="ts">
// 首页：京东风格商城首页（PC 全屏 + 窄屏自动降级为移动单列布局）
// 底层逻辑不变，复用 nshop/Vendure 既有功能与数据：
//   - 顶部分类(collection)（GetMenuCollections，已在 app.vue 加载）→ 分类导航/品质专区/PC 侧栏
//   - 首页运营内容 Banner 块（GetHomeContent）→ 轮播 Banner，无则占位
//   - SearchProducts 搜索结果 → 商品楼层
// 顶部 AppHeader（城市选择 + 多语言 + 搜索 + 购物车）保持不变。
import { isHero } from "../../layers/base/app/utils/home-content";
import { enrichWithListPrice, listCentsMap } from "../../layers/base/app/utils/display-price";
import { deliveryFacetFilter } from "../../layers/base/app/utils/delivery-modes";
import type { SearchResult } from "~~/types/product";
import type { TaxMode } from "../../layers/base/app/utils/tax-price";
import type { TopLevelCollection } from "~~/types/collection";
// 显式 import Jd 组件并以其注册名使用，避免字符串组件名被当作 custom element 渲染成空标签
// （SSR 输出 <!---->、客户端输出 <jdcategorynav></jdcategorynav>）——与既有 home 区块修复模式一致。
import JdCategoryNav from "../../layers/base/app/components/home/jd/JdCategoryNav.vue";
import JdBannerCarousel from "../../layers/base/app/components/home/jd/JdBannerCarousel.vue";
import JdPlazaGrid from "../../layers/base/app/components/home/jd/JdPlazaGrid.vue";
import JdProductGrid from "../../layers/base/app/components/home/jd/JdProductGrid.vue";
import JdPcHeader from "../../layers/base/app/components/home/jd/JdPcHeader.vue";
import JdPcCategorySidebar from "../../layers/base/app/components/home/jd/JdPcCategorySidebar.vue";
import HomeBlockRenderer from "../../layers/base/app/components/home/HomeBlockRenderer.vue";

const { t, tm } = useI18n();
const localePath = useTenantLocalePath();

// 1) 顶部分类：SSR 预取菜单集合（useMenuCollections 内置 800ms 护栏，超时/失败由 app.vue
//    的客户端兜底加载填充）——不再依赖 app.vue 的仅客户端加载，首帧即可渲染分类导航
const { collections: menuCollections } = await useMenuCollections();
const topCategories = computed<TopLevelCollection[]>(
  () => (menuCollections.value?.collections?.items ?? []) as TopLevelCollection[],
);

// 2) 轮播 Banner：取首页运营内容里的 Banner 块
const { content } = await useHomeContent();
const bannerSlides = computed(() =>
  (content.value ?? [])
    .map((b) => b.data ?? {})
    .filter((d: any) => isHero(d))
    .map((d: any) => ({
      imageUrl: (d as any).imageUrl,
      link: (d as any).link,
      title: (d as any).title || (d as any).subTitle,
    })),
);

// 3) 装修配置：GetChannelTheme → 骨架合并后的区块编排（useShopContent 内部单个 useAsyncData + 单次 useAsyncGql）
//    resolvedSections 已把「未配置的京东兜底楼层」自动补齐为对应槽位（见 utils/home-skeleton.ts）
const { resolvedSections } = useShopContent();
// 仅当热门/推荐槽位是自动补位时才发兜底商品搜索；运营覆盖后走各自 useCuratedGoods（请求数与改动前一致）
const needFallbackGoods = computed(() =>
  resolvedSections.value.some((r) => r.auto && (r.slotKey === "hot" || r.slotKey === "recommend")),
);

// 4) 商品楼层：仅未配置装修（兜底京东布局）才发一次 SearchProducts(take=20) 并切片；
//    积木配置下由 goods 区块各自取数，这里不发兜底搜索（守请求数红线）。
//    注意：单个 useAsyncData handler 内只 await 一次 useAsyncGql——连续 await 多个
//    useAsyncGql 会丢失 Nuxt 实例上下文（nuxt 4 withAsyncContext 跨 await 限制），
//    导致 SSR 抛 "[nuxt] A composable that requires access to the Nuxt instance..." 错误、数据被移除。
//    GqlGetProductsByIds 为 Nuxt composable，在单个 useAsyncData handler 内再次 await 会丢
//    Nuxt 实例上下文抛 "[nuxt] instance unavailable"，故此处用 setup 顶层绑定的原始 gql client
//    （普通 async 函数）二次取数补齐首页商品卡划线价（listPrice），SSR 安全。
const rawGql = useGql();
const { taxMode } = useTaxMode();

// 商品楼层的「城市·配送」过滤：过滤条由 JdProductGrid 渲染，配送维度在此做服务端 facet 筛选。
// moduleId 必须与子组件一致（'jd-grid'）才能共用同一份模块级配送选择状态。
const { config: filterConfig } = useHomeFilterConfig();
const filterEnabled = computed(() => filterConfig.value.enabled && filterConfig.value.modules.goods.enabled);
const defaultDelivery = computed(
  () => filterConfig.value.modules.goods.defaultDelivery ?? filterConfig.value.defaultDelivery,
);
const { current: delivery } = useModuleDelivery("jd-grid", defaultDelivery.value);
const { showDeliveryPicker, facetValueIds } = useChannelDeliveryCapability();
/** 当前生效的服务端筛选入参（不可用时为 null，退回子组件本地城市维度过滤） */
const facetFilter = computed(() =>
  filterEnabled.value && showDeliveryPicker.value ? deliveryFacetFilter(facetValueIds.value, delivery.value) : null,
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

const { data: fallbackSearch } = await useAsyncData(
  "home-fallback-search",
  async () => {
    // 运营已覆盖 hot/recommend 时不发兜底搜索（沿用各自 useCuratedGoods）；骨架自动补位时复用这一次结果
    if (!needFallbackGoods.value) return { hot: [], more: [] };
    // 仅双能力渠道走服务端 facet：单能力渠道筛选值恒不变（筛选条也不渲染），
    // 一旦 facet 索引缺失反而会把商品楼层清空，收益为负。
    const cap = filterEnabled.value ? await loadChannelFacet() : { dual: false, ids: null };
    const filters = cap.dual ? deliveryFacetFilter(cap.ids, delivery.value) : null;
    // 必须用 setup 顶层绑定的原始 gql client：handler 内已 await 过渠道能力查询，
    // 此处再调 useAsyncGql 会丢 Nuxt 实例上下文抛 "[nuxt] instance unavailable"。
    let items: SearchResult = [];
    try {
      const searchRes = await rawGql("SearchProducts", {
        term: "",
        take: 20,
        skip: 0,
        ...(filters ? { facetValueFilters: filters } : {}),
      });
      items = (searchRes?.search?.items ?? []) as SearchResult;
    } catch {
      /* 搜索失败保持空楼层，不阻断首页其它区块 */
    }
    // 补齐首页商品卡划线价：SearchItem 不带变体 listPrice，按 productId 拉主数据并注入 listPriceCents。
    // 失败/无商品时静默降级为「无划线价」，不影响现价展示。
    const mode = (taxMode.value ?? "inclusive") as TaxMode;
    let enriched: SearchResult = items;
    try {
      const ids = items.map((i) => i.productId).filter(Boolean);
      if (ids.length) {
        const res = await rawGql("GetProductsByIds", { ids });
        const listCents = listCentsMap(res?.products?.items ?? [], mode);
        // 同步合并商品主数据 customFields（belongCity/serviceCities/deliveryMethods），
        // 供 isProductVisible 做「城市·配送」SSR 后置过滤（SearchItem 本身不带 customFields）。
        const cfMap = new Map<string, unknown>();
        for (const p of res?.products?.items ?? []) {
          if (p?.slug) cfMap.set(p.slug, (p as { customFields?: unknown }).customFields ?? null);
        }
        enriched = enrichWithListPrice(items, listCents).map((i) => ({
          ...i,
          customFields: cfMap.get(i.slug) ?? null,
        })) as SearchResult;
      }
    } catch {
      /* 划线价补拉失败时保留原结果 */
    }
    return { hot: enriched.slice(0, 10), more: enriched.slice(10, 20) };
  },
  // 用户切换「邮寄 / 自提」后重查：SSR 首帧的筛选值即默认配送，客户端仅在真正变化时重查
  { server: true, watch: [facetKey] },
);

const hotProducts = computed(() => fallbackSearch.value?.hot ?? []);
const moreProducts = computed(() => fallbackSearch.value?.more ?? []);
/** 注入给渲染器的自动补位商品数据（与兜底楼层同源、单次请求） */
const autoGoods = computed(() => ({ hot: hotProducts.value, more: moreProducts.value }));

// 4) PC 右栏静态数据：快讯 + 小广告（文案走 i18n，缺失回退中文）
const news = computed<string[]>(() => tm("messages.home.news") as string[]);
// 小广告原为硬编码外域占位图（picsum），已移除；无后台配置时不渲染该栏。
const ads: Array<{ src: string; link: string }> = [];

// 5) PC 快捷入口（图标/链接固定，标签走 i18n 数组，逐语言本地化）
const entryMeta = [
  { icon: "i-lucide-smartphone", link: "/" },
  { icon: "i-lucide-tv", link: "/" },
  { icon: "i-lucide-home", link: "/" },
  { icon: "i-lucide-shirt", link: "/" },
  { icon: "i-lucide-sparkles", link: "/" },
  { icon: "i-lucide-coffee", link: "/" },
  { icon: "i-lucide-headphones", link: "/" },
  { icon: "i-lucide-gift", link: "/" },
  { icon: "i-lucide-shopping-bag", link: "/" },
];
const entryLabels = computed<string[]>(() => tm("messages.home.entryLabels") as string[]);
const entries = computed(() =>
  (entryLabels.value ?? []).map((label, i) => ({ label, ...(entryMeta[i] ?? { icon: "i-lucide-shop", link: "/" }) })),
);
</script>

<template>
  <h1 class="sr-only">{{ t("messages.site.tagline") }}</h1>

  <!-- ═══ PC 京东全屏版（≥1024px 显示）═══ -->
  <main class="hidden bg-[#f5f5f5] lg:block" data-layout="pc">
    <JdPcHeader :categories="topCategories" />

    <div class="mx-auto max-w-[1240px] px-4 pt-3">
      <!-- 首屏：分类侧栏 + 大轮播 + 右侧快讯/广告 -->
      <div class="grid grid-cols-[210px_minmax(0,1fr)_230px] gap-3">
        <JdPcCategorySidebar
          v-if="topCategories.length"
          class="self-start"
          :categories="topCategories"
        />

        <JdBannerCarousel :slides="bannerSlides" />

        <!-- 右侧栏 -->
        <div class="space-y-3">
          <!-- 京东快讯 -->
          <div class="bg-white shadow-sm">
            <div class="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <h3 class="text-sm font-bold text-primary">{{ t("messages.home.newsTitle") }}</h3>
              <span class="text-xs text-gray-400">{{ t("messages.nav.more") }}</span>
            </div>
            <ul class="px-3 py-1 text-xs text-gray-600">
              <li
                v-for="(n, i) in news"
                :key="i"
                class="flex items-center gap-2 border-b border-dashed border-gray-100 py-1.5 last:border-0"
              >
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span class="truncate">{{ n }}</span>
                <template v-if="i === 1">
                  <span class="ml-auto shrink-0 rounded bg-primary px-1 text-[10px] text-white">NEW</span>
                </template>
              </li>
            </ul>
          </div>

          <!-- 小广告 -->
          <div v-if="ads.length" class="grid grid-cols-2 gap-3">
            <NuxtLink
              v-for="a in ads"
              :key="a.src"
              :to="localePath(a.link)"
              class="overflow-hidden rounded bg-white shadow-sm"
            >
              <NuxtImg
                :src="a.src"
                format="webp"
                class="aspect-[4/3] w-full object-cover"
                :alt="t('messages.home.adsAlt')"
              />
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="mt-3 grid grid-cols-9 gap-2 rounded bg-white p-3 shadow-sm">
        <NuxtLink
          v-for="e in entries"
          :key="e.label"
          :to="localePath(e.link)"
          class="flex flex-col items-center gap-1 text-xs text-gray-700 transition hover:text-primary"
        >
          <span class="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UIcon :name="e.icon" class="h-5 w-5" />
          </span>
          <span class="truncate">{{ e.label }}</span>
        </NuxtLink>
      </div>

      <!-- 品质专区（品牌/分类卡片） -->
      <div class="mt-3">
        <JdPlazaGrid v-if="topCategories.length" :categories="topCategories" />
      </div>

      <!-- 商品楼层（「城市·配送」过滤/切换条/空态由 JdProductGrid 模块头部承载） -->
      <div class="mt-3 space-y-3 pb-8">
        <JdProductGrid
          v-if="hotProducts.length"
          :title="t('messages.shop.popularProducts')"
          :products="hotProducts"
        />
        <JdProductGrid v-if="moreProducts.length" :title="t('messages.general.recommendations')" :products="moreProducts" />
      </div>
    </div>
  </main>

  <!-- ═══ 移动端降级版（<1024px 显示）：分类导航常驻 + 骨架自动补位渲染 ═══ -->
  <main class="mx-auto max-w-md bg-[#f5f5f5] pb-20 lg:hidden" data-layout="mobile">
    <!-- 分类导航（常驻顶栏，不进骨架、不参与覆盖/补位；有分类数据即渲染） -->
    <JdCategoryNav v-if="topCategories.length" :categories="topCategories" />
    <HomeBlockRenderer :sections="resolvedSections" :auto-goods="autoGoods" />
  </main>

  <!-- 微信分享 + 邀请登录引导（固定定位，PC/移动统一生效） -->
  <WechatInviteLoginBar />
  <!-- 分享标题/描述/默认图按租户配置：组件内部优先 Channel.customFields 的 shopName/shopIntro/shareImageUrl，
       未设置才回退 i18n 站点名与内置域名 logo（share-logo.jpg） -->
  <WechatShare />
</template>

<style lang="css" scoped></style>