<script setup lang="ts">
const { i18NBaseUrl } = useRuntimeConfig().public;
const colorMode = useColorMode();
const { t, locale } = useI18n();

const ogColorMode = computed<"dark" | "light">(() =>
  colorMode.value === "dark" ? "dark" : "light",
);

const productStore = useProductStore();
const { hasOptions, selectedVariant } = storeToRefs(productStore);

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

const formatPrice = (amount: number) =>
  new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: selectedVariant.value?.currencyCode || "EUR",
  }).format(amount / 100);

// SEO Meta
useSeoMeta({
  title: product.value?.name,
  description: product.value?.description,
  ogTitle: product.value?.name,
  ogDescription: product.value?.description,
  twitterTitle: product.value?.name,
  twitterDescription: product.value?.description,
});

// OgImage
defineOgImage("ProductCard.satori", {
  colorMode: ogColorMode,
  productName: product.value?.name,
  price: formatPrice(selectedVariant.value?.price),
  // description: product.value?.description,
  image: product.value?.featuredAsset?.preview,
  brand: t("messages.site.title"),
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
          name: t("messages.site.title"),
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
  </main>
</template>

<style lang="css" scoped></style>
