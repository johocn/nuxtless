<script setup lang="ts">
import { stripHtmlToText } from '../../utils/html-share';

const { i18NBaseUrl } = useRuntimeConfig().public;
const colorMode = useColorMode();
const { locale } = useI18n();
const siteName = useSiteName();

const productStore = useProductStore();
const { selectedVariant } = storeToRefs(productStore);
const { taxMode, pricesIncludeTax } = useTaxMode();

const ogColorMode = computed<"dark" | "light">(() =>
  colorMode.value === "dark" ? "dark" : "light",
);

const formatPrice = (amount: number) =>
  new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: selectedVariant.value?.currencyCode || "EUR",
  }).format(amount / 100);

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
// 转 JPEG 并缩放到 ≤400px 宽，压体积（微信分享缩略图 ~300KB 软上限）。
const ogImageSrc = computed(() => {
  const raw =
    product.value?.featuredAsset?.preview ??
    product.value?.assets?.[0]?.preview ??
    channelShareImage.value ??
    "";
  if (!raw) return `${i18NBaseUrl}/share-default.jpg`;
  try {
    const u = new URL(raw, i18NBaseUrl);
    u.searchParams.set("format", "jpg");
    u.searchParams.set("w", "600");
    u.searchParams.set("q", "70");
    return u.toString();
  } catch {
    return raw;
  }
});

// 分享卡版本常量：内容改版时递增，强制微信对新的 og:image URL 重新抓取，绕开旧卡缓存
const OG_SHARE_VERSION = "v4";

// 中文字体：satori 默认只捆绑 Inter（无 CJK 字形），中文会渲染成 NOGLYPH 乱码。
// 通过 defineOgImage fonts 注入自托管 SimHei（public/fonts/simhei.ttf），
// 运行时经同源 /fonts/simhei.ttf 拉取（node binding 的 fetch-origin 机制，与 Inter 兜底同路）。
const OG_CJK_FONT = { name: "SimHei", weight: 400, path: "/fonts/simhei.ttf" };

// 分享卡价格须与页面价签同口径（按渠道 taxMode/pricesIncludeTax 换算展示价），
// 避免分享卡显示净价(¥88.50)而页面显示含税价(¥100.00)的不一致
const ogPriceCents = computed(() => {
  const v = selectedVariant.value;
  if (!v) return 0;
  const mode = (taxMode.value ?? "inclusive") as "inclusive" | "zero" | "exclusive";
  const useWithTax = mode === "exclusive" || !!pricesIncludeTax.value;
  return Math.round(useWithTax ? (v.priceWithTax ?? 0) : (v.price ?? 0));
});

// og:image —— 用 ProductCard.satori 渲染含商品图的分享卡。
// 该 _og 路由线上返回 200 且域名正确（www.youshop.cn），微信可直接拉取。
// 不直接塞 raw 商品图：useSeoMeta ogImage 会被 app.vue 全局 defineOgImage(BlogPost)覆盖，
// defineOgImage({ url: 外部图 }) 的 _og/d 外部代理线上返回 500。
// 体积控制：image 传 CDN 缩放 jpg(≤800w)，大幅降低卡片产物体积（PNG 输出，服务器无 sharp 不可用 jpeg）。
// version 常量拼入 URL，内容改版时强制微信重新抓取，绕开旧卡缓存。
// fonts 必须放顶层 options（第 3 参）：satori renderer 读 options.fonts 作 fontDefs，
// 放在 props 里只会进 options.props.fonts，自定义字体永远不加载（中文 NOGLYPH）。
defineOgImage(
  "ProductCard.satori",
  {
    colorMode: ogColorMode,
    productName: product.value?.name,
    price: formatPrice(ogPriceCents.value),
    image: ogImageSrc, // 传 computed：SSR 渲染时读到异步兜底后的最终值
    brand: siteName.value,
    version: OG_SHARE_VERSION,
  },
  {
    width: 800,
    height: 400,
    fonts: [OG_CJK_FONT],
  }
);

useSeoMeta({
  title: product.value?.name,
  description: shareDesc.value,
  ogTitle: product.value?.name,
  ogDescription: shareDesc.value,
  twitterTitle: product.value?.name,
  twitterDescription: shareDesc.value,
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
