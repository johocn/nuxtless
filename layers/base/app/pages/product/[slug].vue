<script setup lang="ts">
import { stripHtmlToText } from '../../utils/html-share';

const { i18NBaseUrl } = useRuntimeConfig().public;
const { locale } = useI18n();
const siteName = useSiteName();

const productStore = useProductStore();
const { selectedVariant } = storeToRefs(productStore);

const slug = useRouteParam("slug");

const { data } = await useAsyncGql("GetProductDetail", {
  slug,
});

const product = computed(() => data.value.product);

// Display template (custom field). `standard` keeps the default layout;
// `galleryFirst` / `rich` switch the DOM order/visibility (light switch only).
// displayTemplate comes from the generated GraphQL types (Product.customFields).
const displayTemplate = computed(
  () => product.value?.customFields?.displayTemplate ?? "standard",
);
const displayLayout = computed(() =>
  displayTemplate.value === "galleryFirst" || displayTemplate.value === "rich"
    ? displayTemplate.value
    : "standard",
);

watch(
  product,
  (p) => {
    if (p) productStore.init(p);
  },
  { immediate: true, flush: "post" },
);

// 实时库存：三种版式共用。切换 SKU 时刷新（含 quick/即时首刷），失败回退静态快照
watch(
  () => selectedVariant.value?.id,
  () => {
    productStore.refreshStock();
  },
  { immediate: true },
);

// 分享/SEO 描述：剥离 HTML 标签，保证微信 og:description 纯净（实测曾带 <p> 标签）
const shareDesc = computed(() => stripHtmlToText(product.value?.description ?? ""));

// 渠道级分享配置：Channel.customFields（shareImageUrl/shopName/shopIntro），复用 GetChannelTheme，
// 与 WechatShare 组件同 useAsyncData key → SSR 去重不新增请求
const { data: channelShareData } = useAsyncData(
  "channel-share-image",
  async () => {
    const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
    return (res.data.value as any)?.activeChannel?.customFields ?? {};
  },
  { server: true },
);
const channelShareImage = computed(() => (channelShareData.value as any)?.shareImageUrl ?? "");

// og 分享主图兜底链：商品图 → 渠道 shareImageUrl → 域名 logo 兜底图（与 WechatShare 的
// JS-SDK imgUrl 兜底链一致，保证无图商品分享卡左侧也有图）。
// 关键回归修复：此处必须返回「无查询参数」的绝对 URL。微信对带 query 的 og:image/imgUrl
// （?format=jpg&w=400&q=70）解析不稳定，会抓不到图而回退默认 logo（今 8:00 提交 95a6049
// 正是因「微信对 query 解析不稳定」去掉了 query 才恢复商品图显示；后续为压体积又加回
// ?w=400&q=70 导致再次回退 logo——需回退）。商品 preview URL 每商品唯一
// （media-xxx__preview.jpeg）、CDN 直发，微信按 URL 缓存图片，新商品 URL 天然破缓存。
const ogImageSrc = computed(() => {
  const raw =
    product.value?.featuredAsset?.preview ??
    product.value?.assets?.[0]?.preview ??
    channelShareImage.value ??
    "";
  if (!raw) return `${i18NBaseUrl}/share-logo.jpg`;
  return new URL(raw, i18NBaseUrl).toString();
});

// JS-SDK 分享卡专用压缩图：商品图（featuredAsset → assets[0] → 渠道 shareImageUrl）压到
// ?w=240&q=50（微信缩略图体积上限 iOS≈128KB / Android≈300KB，商品原图如 0__preview.png
// 可达 3MB 必超限）。商品/渠道都无图时回退域名 logo（share-logo.jpg），保证分享卡恒有图。
// 该值经下方 SSR 烘焙进 meta[name="share:image"]，客户端读静态 HTML 即时可得，不依赖
// 客户端运行时 featuredAsset（微信端 hydration 拿不到，见知识库）。
const shareCardSrc = computed(() => {
  const raw =
    product.value?.featuredAsset?.preview ??
    product.value?.assets?.[0]?.preview ??
    channelShareImage.value ??
    "";
  if (!raw) return `${i18NBaseUrl}/share-logo.jpg`;
  const u = new URL(raw, i18NBaseUrl);
  u.searchParams.set("w", "240");
  u.searchParams.set("q", "50");
  return u.toString();
});

// 分享图 meta（meta[name="share:image"]）：SSR 首帧烘焙当前商品图（payload 里 featuredAsset
// 必然存在，不依赖客户端 hydration）。关键：只用「SSR 端 useHead」烘焙，客户端不要再注册
// useHead 接管该标签——否则微信端客户端因拿不到 featuredAsset，会把 SSR 已烘焙好的商品图
// meta 覆盖成空/logo 导致商品图消失（回归）。SPA 切换商品时，仅在拿到新商品具体图后
// 直接 setAttribute 更新既有 meta；无具体图不更新（保留 SSR 值）。
if (import.meta.server) {
  const baked = shareCardSrc.value;
  if (baked) {
    useHead({
      meta: [{ name: "share:image", content: baked }],
    });
  }
}
if (import.meta.client) {
  watch(product, (p) => {
    const concrete =
      p?.featuredAsset?.preview ??
      p?.assets?.[0]?.preview ??
      channelShareImage.value;
    if (!concrete) return;
    const u = new URL(concrete, i18NBaseUrl);
    u.searchParams.set("w", "240");
    u.searchParams.set("q", "50");
    const el = document.querySelector('meta[name="share:image"]');
    if (el) el.setAttribute("content", u.toString());
  });
}

// og:image —— 商品自己的图（featuredAsset → assets[0] → 渠道 shareImageUrl → 域名 logo 兜底图）。
// 微信按 URL 缓存图片：每商品 CDN 图 URL 唯一（media-xxx__preview.jpeg），天然破缓存；
// 无图商品回退 share-logo.jpg（新文件名，内容可替换，改内容须换名破微信缓存）。
useSeoMeta({
  title: product.value?.name,
  description: shareDesc.value,
  ogTitle: product.value?.name,
  ogDescription: shareDesc.value,
  ogImage: ogImageSrc.value,
  twitterTitle: product.value?.name,
  twitterDescription: shareDesc.value,
  twitterImage: ogImageSrc.value,
});

// SchemaOrg
if (product.value && selectedVariant.value) {
  const images = product.value.assets?.map((a) => a.preview) ?? [];

  useSchemaOrg([
    defineProduct({
      name: selectedVariant.value.name,
      description: product.value.description,
      sku: selectedVariant.value.sku,
      // brand: {
      //   "@type": "Brand",
      //   name: product.value.facetValues.brand,
      // },
      image: images,
      inLanguage: locale.value,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${i18NBaseUrl}/products/${product.value.slug}`,
      },

      // Offers
      offers: {
        "@type": "Offer",
        url: `${i18NBaseUrl}/products/${product.value.slug}`,
        price: (selectedVariant.value.priceWithTax ?? 0) / 100,
        priceCurrency: selectedVariant.value.currencyCode ?? "EUR",
        availability:
          selectedVariant.value.stockLevel === "IN_STOCK"
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: {
          "@type": "Organization",
          name: siteName.value,
        },
      },
    }),
    defineBreadcrumb({
      itemListElement: [
        ...getProductTrail(product.value).map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.label,
          item: `${i18NBaseUrl}${c.to}`,
        })),
        {
          "@type": "ListItem",
          position: (getProductTrail(product.value).length ?? 0) + 1,
          name: product.value.name,
          item: `${i18NBaseUrl}/products/${product.value.slug}`,
        },
      ],
    }),
  ]);
}
</script>

<template>
  <main class="container">
    <ProductDetailRenderer />
    <WechatInviteLoginBar />
    <WechatShare
      :title="product?.name"
      :description="stripHtmlToText(product?.description ?? '')"
      :image-url="shareCardSrc.value"
    />
  </main>
</template>

<style lang="css" scoped></style>
