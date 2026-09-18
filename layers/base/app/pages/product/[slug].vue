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

// 渠道级分享主图兜底：Channel.customFields.shareImageUrl（复用 GetChannelTheme，
// 与 WechatShare 组件同 useAsyncData key → SSR 去重不新增请求）
const { data: channelShareImage } = useAsyncData(
  "channel-share-image",
  async () => {
    const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
    return (res.data.value as any)?.activeChannel?.customFields?.shareImageUrl ?? "";
  },
  { server: true },
);

// og 分享主图兜底链：商品图 → 渠道 shareImageUrl → 内建默认图（与 WechatShare 的
// JS-SDK imgUrl 兜底链一致，保证无图商品分享卡左侧也有图）。
// 返回「无查询参数」的绝对 URL：微信对带 query 的 og:image（?format=jpg&w=500&q=70）
// 解析不稳定；纯净 preview URL 每商品唯一（media-xxx__preview.jpeg）、CDN 直发秒回，
// 微信按 URL 缓存图片——新商品 URL 天然破缓存，微信必抓新图。
const ogImageSrc = computed(() => {
  const raw =
    product.value?.featuredAsset?.preview ??
    product.value?.assets?.[0]?.preview ??
    channelShareImage.value ??
    "";
  if (!raw) return `${i18NBaseUrl}/share-product.jpg`;
  return new URL(raw, i18NBaseUrl).toString();
});

// og:image —— 商品自己的图（featuredAsset → assets[0] → 渠道 shareImageUrl → 默认分享图）。
// 微信按 URL 缓存图片：每商品 CDN 图 URL 唯一（media-xxx__preview.jpeg），天然破缓存；
// 无图商品回退 share-product.jpg（新文件名，内容可替换，改内容须换名破微信缓存）。
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
      :image-url="ogImageSrc.value"
    />
  </main>
</template>

<style lang="css" scoped></style>
