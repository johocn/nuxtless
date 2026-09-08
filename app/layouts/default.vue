<script setup lang="ts">
import JdTabBar from "../../layers/base/app/components/home/jd/JdTabBar.vue";
import JdAllCategoryDrawer from "../../layers/base/app/components/home/jd/JdAllCategoryDrawer.vue";

const route = useRoute();
const { t, locale } = useI18n();
const siteName = useSiteName();
const head = useLocaleHead();
const title = computed(() =>
  route.meta.title ? t(route.meta.title) : siteName.value,
);
const description = computed(() =>
  t(route.meta.description || "messages.site.description"),
);

// 功能路径前缀：多租户(:tenantCode)与多语言(/en)前缀会改变 route.path，
// 不能直接用 path.startsWith 判断，须先剥离前缀段再匹配，否则 /t2/checkout、/en/t2/checkout
// 会误判为「普通内容页」而常驻显示底部导航，遮挡结算栏。
const JDTAB_HIDE_PREFIXES = [
  "/product/",
  "/checkout",
  "/order/",
];
function stripRoutePrefixes(path: string): string {
  const segs = path.split("/").filter(Boolean);
  if (!segs.length) return "/";
  let i = 0;
  // 语言前缀段（prefix_except_default：仅非默认 locale 带，如 /en）
  if (segs[i]?.toLowerCase() === (locale.value ?? "").toLowerCase()) i++;
  // 租户前缀段（可选 :tenantCode，由路由 params 解析）
  const tenant = route.params.tenantCode as string | undefined;
  if (tenant && segs[i] === tenant) i++;
  return "/" + segs.slice(i).join("/");
}
const cleanPath = computed(() => stripRoutePrefixes(route.path));
const isPdp = computed(() => cleanPath.value.startsWith("/product/"));

// 底部常驻导航（移动端）是否显示：商品详情/结算等自带吸底操作栏的流程页不显示，
// 避免双底条重叠；其余普通内容页（首页/分类/券包/消息/订单等）统一显示，保证客户随时回首页。
const showJdTabBar = computed(
  () => !JDTAB_HIDE_PREFIXES.some((p) => cleanPath.value.startsWith(p)),
);
// 移动端需为底部导航条预留内容高度，避免被 fixed 底条遮挡
const needsBottomPadding = computed(() => isPdp.value || showJdTabBar.value);

useSeoMeta({
  title: title,
  description: description,
  ogTitle: title,
  ogDescription: description,
  twitterTitle: title,
  twitterDescription: description,
  twitterCard: "summary_large_image",
});
</script>

<template>
  <div>
    <Html :lang="head.htmlAttrs.lang" :dir="head.htmlAttrs.dir">
      <Head>
        <Title>{{ title }}</Title>
        <template v-for="link in head.link" :key="link.hid">
          <Link
            :id="link.hid"
            :rel="link.rel"
            :href="link.href"
            :hreflang="link.hreflang"
          />
        </template>
        <template v-for="meta in head.meta" :key="meta.hid">
          <Meta
            :id="meta.hid"
            :property="meta.property"
            :content="meta.content"
          />
        </template>
      </Head>
      <Body>
        <div
          :class="{ 'pb-18 sm:pb-0': needsBottomPadding }"
          class="flex min-h-svh flex-col"
        >
          <AppHeader />
          <div class="flex-1">
            <slot />
          </div>
          <AppFooter />
          <JdTabBar v-if="showJdTabBar" />
          <JdAllCategoryDrawer />
        </div>
      </Body>
    </Html>
  </div>
</template>
