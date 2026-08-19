<script setup lang="ts">
import type { MenuCollections, ChildCollection } from "~~/types/collection";
import { isSortKey, toSortParam } from "../../utils/collection-sort";
import type { SortKey } from "../../utils/collection-sort";

const route = useRoute();
const { i18NBaseUrl } = useRuntimeConfig().public;
const colorMode = useColorMode();
const { t, locale } = useI18n();

const ogColorMode = computed<"dark" | "light">(() =>
  colorMode.value === "dark" ? "dark" : "light",
);

const menuCollections = useState<MenuCollections>("menuCollections");
const menuItems = menuCollections.value?.collections.items ?? [];

const slug = useRouteParam("slug");

const currentCollection =
  menuItems.find((top) => top.slug === slug) ??
  menuItems
    .flatMap((top) => top.children ?? [])
    .find((child) => child.slug === slug);

if (!currentCollection) {
  throw new Error(`Collection not found for slug: ${slug}`);
}

const childCollections = computed(() =>
  currentCollection && "children" in currentCollection
    ? (currentCollection.children ?? [])
    : [],
) as ComputedRef<ChildCollection[]>;

const { take, page, skip, to } = usePagination(12);

// 排序状态（持久化到 query）
const sort = ref<SortKey>(
  isSortKey(route.query.sort) ? route.query.sort : "RELEVANCE",
);
const sortParam = computed(() => toSortParam(sort.value));

// 切换排序时回到第一页并持久化到 query
watch(sort, (val) => {
  navigateTo({ path: route.path, query: filterQuery(val, filterParam.value) });
});

// 筛选：筛选值 id 列表持久化到 query（逗号分隔）；映射为 facetValueFilters（各选中值 AND）
const filterDrawerOpen = ref(false);
const filterParam = computed<string[]>(() =>
  route.query.filter && typeof route.query.filter === "string"
    ? route.query.filter.split(",").filter(Boolean)
    : [],
);
const appliedFilters = ref<Record<string, string[]>>({}); // 抽屉当前选中（facetId -> valueIds）
const facetValueFilters = computed<{ and: string }[]>(() =>
  filterParam.value.map((valueId) => ({ and: valueId })),
);

const { data: facetsData } = await useAsyncGql("GetFacets", {
  options: { take: 100 },
});
const facets = computed(() => facetsData.value?.facets?.items ?? []);

// 在初始筛选（query>导出的选中态）与抽屉选中同步
const initialSelected = computed<Record<string, string[]>>(() => {
  const selectedIds = new Set(filterParam.value);
  const map: Record<string, string[]> = {};
  for (const facet of facets.value) {
    const matched = facet.values
      .filter((v) => selectedIds.has(v.id))
      .map((v) => v.id);
    if (matched.length) map[facet.id] = matched;
  }
  return map;
});

// 应用筛选：导航（query 更新→回到第一页重新查询）
function applyFilters(selection: Record<string, string[]>) {
  appliedFilters.value = selection;
  const valueIds = Object.values(selection).flat();
  navigateTo({
    path: route.path,
    query: filterQuery(sort.value, valueIds),
  });
}

// 清空筛选
function clearFilters() {
  appliedFilters.value = {};
  filterDrawerOpen.value = false;
  navigateTo({
    path: route.path,
    query: filterQuery(sort.value, []),
  });
}

// 拼接查询参数对象（排序 + 筛选）
function filterQuery(sortKey: SortKey, valueIds: string[]): Record<string, string> {
  const query: Record<string, string> = {};
  if (sortKey !== "RELEVANCE") query.sort = sortKey;
  if (valueIds.length) query.filter = valueIds.join(",");
  return query;
}

const { data: collectionProducts } = await useAsyncGql(
  "GetCollectionProducts",
  {
    slug,
    skip: skip,
    take: take,
    sort: sortParam,
    facetValueFilters: facetValueFilters,
  },
);

const products = computed(() => collectionProducts.value?.search?.items ?? []);
const total = computed(() => collectionProducts.value?.search?.totalItems ?? 0);
const totalPages = computed(() => Math.ceil(total.value / take));

// 列表页搜索接口返回的 SearchResult 不含 customFields（belongCity/serviceCities），
// 无法直接判断超区。因此拉取当前页商品的 Product（含 customFields），以 productId 关联。
const ids = computed(() =>
  products.value.map((p) => p.productId).filter((id): id is string => !!id),
);
const { data: productDetails } = await useAsyncGql("GetProductsByIds", {
  ids: ids,
});
const serviceInfoBySlug = computed(() => {
  const map: Record<string, { belongCity?: string | null; serviceCities?: Array<string | null> | null }> = {};
  for (const p of productDetails.value?.products?.items ?? []) {
    if (p.slug) {
      map[p.slug] = {
        belongCity: p.customFields?.belongCity ?? null,
        serviceCities: p.customFields?.serviceCities ?? null,
      };
    }
  }
  return map;
});

const nextUrl = computed(() =>
  page.value < totalPages.value ? `?page=${page.value + 1}` : null,
);

const prevUrl = computed(() =>
  page.value > 1 ? `?page=${page.value - 1}` : null,
);

watch(page, () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Head Props
useHead(() => ({
  link: [
    ...(prevUrl.value
      ? [{ rel: "prev", href: `${i18NBaseUrl}${route.path}${prevUrl.value}` }]
      : []),
    ...(nextUrl.value
      ? [{ rel: "next", href: `${i18NBaseUrl}${route.path}${nextUrl.value}` }]
      : []),
  ],
}));

// SEO Meta
useSeoMeta({
  title: currentCollection?.name,
  // description: currentCollection?.description,
  ogTitle: currentCollection?.name,
  // ogDescription: currentCollection?.description,
  twitterTitle: currentCollection?.name,
  // twitterDescription: currentCollection?.description,
});

// OgImage
defineOgImage("BlogPost.satori", {
  colorMode: ogColorMode,
  title: currentCollection?.name,
  category: t("messages.site.title"),
  backgroundImage: currentCollection?.featuredAsset?.preview,
});

// SchemaOrg
useSchemaOrg([
  defineWebPage({
    "@type": "CollectionPage",
    name: currentCollection.name,
    // description: currentCollection.description,
    inLanguage: locale.value,
    url: `${i18NBaseUrl}${route.path}`,
    nextItem: nextUrl.value
      ? `${i18NBaseUrl}${route.path}${nextUrl.value}`
      : undefined,
    previousItem: prevUrl.value
      ? `${i18NBaseUrl}${route.path}${prevUrl.value}`
      : undefined,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: products.value.map((p, i) => ({
        "@type": "ListItem",
        position: skip.value + i + 1,
        name: p.productName,
        url: `${i18NBaseUrl}/products/${p.slug}`,
      })),
      numberOfItems: total.value,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
    },
  }),

  defineBreadcrumb({
    itemListElement: getCategoryTrail().map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: `${i18NBaseUrl}${c.to}`,
    })),
  }),
]);
</script>

<template>
  <main class="container">
    <header class="mt-14">
      <h1 class="text-2xl font-semibold">{{ currentCollection?.name }}</h1>
      <BreadcrumbTrail trail="category" class="mt-2 mb-14" />
    </header>

    <!-- Child Collections -->
    <section
      v-if="childCollections.length"
      class="mb-14"
      aria-labelledby="child-collections-heading"
    >
      <h2 id="child-collections-heading" class="mb-4 text-xl font-semibold">
        <!-- Second argument is '2' because we always need plural here -->
        {{ t("messages.shop.category", 2) }}
      </h2>
      <div
        class="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-6"
      >
        <CategoryCard
          v-for="collection in childCollections"
          :key="collection.id"
          :collection="collection"
          :eager="true"
        />
      </div>
    </section>

    <!-- Collection Products -->
    <section class="mb-8" aria-labelledby="category-products-heading">
      <h2 id="category-products-heading" class="sr-only">Products</h2>
      <div class="mb-4 flex items-center justify-between gap-2">
        <SortBar v-model="sort" />
        <UButton
          variant="outline"
          color="neutral"
          :icon="filterParam.length ? 'i-lucide-filter' : 'i-lucide-filter'"
          @click="filterDrawerOpen = true"
        >
          {{ t("messages.shop.filters") }}
          <span
            v-if="filterParam.length"
            class="ml-1 rounded-full bg-brand-600 px-1.5 text-xs text-white"
            >{{ filterParam.length }}</span
          >
        </UButton>
      </div>
      <div
        v-if="products.length"
        class="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4"
      >
        <ProductCard
          v-for="(product, index) in products"
          :key="product.slug"
          :product="product"
          :service-info="serviceInfoBySlug[product.slug]"
          :eager="index < 4"
        />
      </div>
      <div
        v-else
        class="py-10 text-center text-neutral-500"
      >
        <p>{{ t("messages.shop.noProductsFound.title") }}</p>
        <UButton
          v-if="filterParam.length"
          variant="link"
          class="mt-2"
          @click="clearFilters"
        >
          {{ t("messages.shop.clearFilters") }}
        </UButton>
      </div>
    </section>

    <FilterDrawer
      v-model:open="filterDrawerOpen"
      :facets="facets"
      :initial-selection="initialSelected"
      @apply="applyFilters"
      @clear="clearFilters"
    />

    <nav
      v-if="total > take"
      class="mb-14 flex justify-center"
      role="navigation"
      aria-label="Pagination Navigation"
    >
      <UPagination
        :page="page"
        :total="total"
        :items-per-page="take"
        :to="to"
      />
    </nav>
  </main>
</template>

<style lang="css" scoped></style>
