<script setup lang="ts">
// 首页：京东风格商城首页（PC 全屏 + 窄屏自动降级为移动单列布局）
// 底层逻辑不变，复用 nshop/Vendure 既有功能与数据：
//   - 顶部分类(collection)（GetMenuCollections，已在 app.vue 加载）→ 分类导航/品质专区/PC 侧栏
//   - 首页运营内容 Banner 块（GetHomeContent）→ 轮播 Banner，无则占位
//   - SearchProducts 搜索结果 → 商品楼层
// 顶部 AppHeader（城市选择 + 多语言 + 搜索 + 购物车）保持不变。
import { isHero } from "../../layers/base/app/utils/home-content";
import type { MenuCollections, TopLevelCollection } from "~~/types/collection";
// 显式 import Jd 组件并以其注册名使用，避免字符串组件名被当作 custom element 渲染成空标签
// （SSR 输出 <!---->、客户端输出 <jdcategorynav></jdcategorynav>）——与既有 home 区块修复模式一致。
import JdCategoryNav from "../../layers/base/app/components/home/jd/JdCategoryNav.vue";
import JdBannerCarousel from "../../layers/base/app/components/home/jd/JdBannerCarousel.vue";
import JdPlazaGrid from "../../layers/base/app/components/home/jd/JdPlazaGrid.vue";
import JdProductGrid from "../../layers/base/app/components/home/jd/JdProductGrid.vue";
import JdPcHeader from "../../layers/base/app/components/home/jd/JdPcHeader.vue";
import JdPcCategorySidebar from "../../layers/base/app/components/home/jd/JdPcCategorySidebar.vue";
import JdFunctionGrid from "../../layers/base/app/components/home/jd/JdFunctionGrid.vue";
import JdBrandFloor from "../../layers/base/app/components/home/jd/JdBrandFloor.vue";
import JdTabBar from "../../layers/base/app/components/home/jd/JdTabBar.vue";
import JdAllCategoryDrawer from "../../layers/base/app/components/home/jd/JdAllCategoryDrawer.vue";
import HomeBlockRenderer from "../../layers/base/app/components/home/HomeBlockRenderer.vue";

const { t } = useI18n();
const localePath = useLocalePath();

// 1) 顶部分类：菜单集合（含 featuredAsset / children）
const menuCollections = useState<MenuCollections>("menuCollections");
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

// 3) 装修配置：GetChannelTheme → sections（useShopContent 内部单个 useAsyncData + 单次 useAsyncGql）
const { sections: shopSections } = useShopContent();
const hasBlocks = computed(() => shopSections.value.length > 0);

// 4) 商品楼层：仅未配置装修（兜底京东布局）才发一次 SearchProducts(take=20) 并切片；
//    积木配置下由 goods 区块各自取数，这里不发兜底搜索（守请求数红线）。
//    注意：单个 useAsyncData handler 内只 await 一次 useAsyncGql——连续 await 多个
//    useAsyncGql 会丢失 Nuxt 实例上下文（nuxt 4 withAsyncContext 跨 await 限制），
//    导致 SSR 抛 "[nuxt] A composable that requires access to the Nuxt instance..." 错误、数据被移除。
const { data: fallbackSearch } = await useAsyncData(
  "home-fallback-search",
  async () => {
    if (hasBlocks.value) return { hot: [], more: [] };
    const r = await useAsyncGql("SearchProducts", { term: "", take: 20, skip: 0 });
    const items = r.data.value?.search?.items ?? [];
    return { hot: items.slice(0, 10), more: items.slice(10, 20) };
  },
  { server: true },
);

const hotProducts = computed(() => fallbackSearch.value?.hot ?? []);
const moreProducts = computed(() => fallbackSearch.value?.more ?? []);

// 4) PC 右栏静态数据：快讯 + 小广告
const news = [
  "全场自营商品满 99 元包邮",
  "新用户首单立减 20 元",
  "数码家电以旧换新进行中",
  "今日秒杀 20:00 开启",
  "售后服务 7 天无理由退换",
];
const ads = [
  { src: "https://picsum.photos/seed/jp-ad-1/240/180", link: "/" },
  { src: "https://picsum.photos/seed/jp-ad-2/240/180", link: "/" },
];

// 5) PC 快捷入口
const entries = [
  { label: "手机数码", icon: "i-lucide-smartphone", link: "/" },
  { label: "家用电器", icon: "i-lucide-tv", link: "/" },
  { label: "居家百货", icon: "i-lucide-home", link: "/" },
  { label: "服饰鞋包", icon: "i-lucide-shirt", link: "/" },
  { label: "美妆个护", icon: "i-lucide-sparkles", link: "/" },
  { label: "食品生鲜", icon: "i-lucide-coffee", link: "/" },
  { label: "运动户外", icon: "i-lucide-headphones", link: "/" },
  { label: "礼品定制", icon: "i-lucide-gift", link: "/" },
  { label: "全部商品", icon: "i-lucide-shopping-bag", link: "/" },
];
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
              <h3 class="text-sm font-bold text-primary">京东快讯</h3>
              <span class="text-xs text-gray-400">更多 ›</span>
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
          <div class="grid grid-cols-2 gap-3">
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
                alt="活动广告"
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

      <!-- 商品楼层 -->
      <div class="mt-3 space-y-3 pb-8">
        <JdProductGrid
          v-if="hotProducts.length"
          :title="t('messages.shop.popularProducts')"
          :products="hotProducts"
        />
        <JdProductGrid v-if="moreProducts.length" title="为你推荐" :products="moreProducts" />
      </div>
    </div>
  </main>

  <!-- ═══ 移动端降级版（<1024px 显示）：有积木配置则动态渲染，否则兜底京东布局 ═══ -->
  <main class="mx-auto max-w-md bg-[#f5f5f5] pb-20 lg:hidden" data-layout="mobile">
    <HomeBlockRenderer v-if="hasBlocks" :sections="shopSections" />
    <template v-else>
      <!-- 分类导航（横向可滚动条） -->
      <JdCategoryNav :categories="topCategories" />
      <!-- 轮播 Banner -->
      <JdBannerCarousel :slides="bannerSlides" />
      <!-- 功能宫格（十宫格，用已有功能） -->
      <JdFunctionGrid />
      <!-- 品牌闪购（横向品牌墙，复用分类封面图） -->
      <JdBrandFloor />
      <!-- 品质专区 -->
      <div class="mt-2">
        <JdPlazaGrid v-if="topCategories.length" :categories="topCategories" />
      </div>
      <!-- 商品楼层 -->
      <div class="mt-2">
        <JdProductGrid
          v-if="hotProducts.length"
          :title="t('messages.shop.popularProducts')"
          :products="hotProducts"
        />
        <JdProductGrid v-if="moreProducts.length" title="为你推荐" :products="moreProducts" />
      </div>
    </template>
  </main>

  <!-- ═══ 移动端底部固定导航 + 全部分类抽屉（仅移动端）═══ -->
  <JdTabBar />
  <JdAllCategoryDrawer />
</template>

<style lang="css" scoped></style>