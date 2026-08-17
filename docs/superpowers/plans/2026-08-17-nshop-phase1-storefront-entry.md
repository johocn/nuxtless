# nshop 阶段 1 商城主入口 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 nshop（nuxtless fork）商城主入口改造成可运营的京东风——首页复用 Vendure 既有 ContentItem 运营位渲染 hero/楼层，分类列表页加排序条与 Facet/分类筛选抽屉。

**Architecture:** 纯前端改造，后端零改动。首页通过 Shop API `publishedContent(position: 'home')`（生产 e.joho.cn 已确认暴露）拉取运营区块，按 `type`/`data` 分发到 Hero/Floor 组件渲染，空数据回退自带 home 组件；楼层商品 id 数组通过 `products(filter: { id: { in } })` 一次批查。列表页扩展 `GetCollectionProducts` 增补 `$sort`/`$facetValueIds`，走 Vendure `search` 能力。

**Tech Stack:** Nuxt 4 (vue-tsc/Tailwind v4/NuxtUI v4)、nuxt-graphql-client 0.2.46、@nuxt/image v2（passthrough provider）、Vendure 3.6（`search` + `operations-plugin` ContentItem）。

---

### Task 0: 刷新 GraphQL schema（前置依赖，含 publishedContent 类型）

本地 `graphql.schema.json` 快照过期，未含 `operations-plugin` 的 `publishedContent` 字段。必须刷新，否则 codegen 无法生成该查询的 TS 类型。

**Files:**
- Modify: `d:\zhao\nshop\.env`（GQL_HOST 已为 `https://e.joho.cn/shop-api`，propsby 已正确）
- Modify: `d:\zhao\nshop\graphql.schema.json`（将被下载覆盖）

- [ ] **Step 1: 用 nuxt-graphql-client 重新生成 schema 与类型**

Run: `pnpm nuxi prepare`
Expected: `.nuxt/` 下 codegen 产物 `.nuxt/graphql-client/default/` 及 `.nuxt/types/` 更新，包含 `publishedContentQuery` / `PublishedContentQuery` 类型；无导出错误。

> 说明：nuxt-graphql-client 在 `nuxt prepare`（即 postinstall 也会跑）时按 `layers/base/nuxt.config.ts#graphql-client` 配置从 `GQL_HOST` 拉取 schema（更新 `graphql.schema.json`）并 codegen 类型。若 `nuxi prepare` 因网络/证书失败，可改用 `node_modules/.bin/gql-generator` 或 check 下方源码是否自动下载；失败则人工用 VSCode GraphQL 插件或 curl 将 schema 拉下覆盖 `graphql.schema.json` 后重跑。

- [ ] **Step 2: 验证 publishedContent 类型已生成**

Grep: `publishedContent` in `d:\zhao\nshop\.nuxt\graphql-client\default\graphql.config.mjs` 或 codegen `.d.ts`（若开启 onlyOperationTypes 则看 gql 文件定义）。
Expected: 找到 `publishedContent` 查询类型。

- [ ] **Step 3: 确认 search 的 sort / facetValueIds 类型可用**

Grep: `SearchResultSortParameter` in `d:\zhao\nshop\graphql.schema.json`
Expected: 存在该枚举，含 `RELEVANCE`/`PRICE_ASC`/`PRICE_DESC`/`NAME_ASC`/`NAME_DESC`/`COLLECTION_POSITION` 等枚举值（用于排序条）。

- [ ] **Step 4: Commit**

```bash
git add .env graphql.schema.json .nuxt
git commit -m "chore(gql): 刷新 graphql schema 纳入 publishedContent/ContentItem 类型"
```

---

### Task 1: GQL 查询定义（运营位 + 商品批查）

**Files:**
- Create: `d:\zhao\nshop\layers\base\gql\queries\operational.gql`
- Modify: `d:\zhao\nshop\layers\base\gql\queries\product.gql`

- [ ] **Step 1: 新增 `operational.gql`**（拉首页运营位）

Create file `d:\zhao\nshop\layers\base\gql\queries\operational.gql`:

```graphql
query GetHomeContent($position: String) {
  publishedContent(position: $position) {
    id
    type
    name
    sort
    data
  }
}
```

> `publishedContent` 返回 `[ContentItemPublic!]!`，含 `data: JSON`。字段 `id/type/name/sort/position/data` 与 `operations.plugin.ts` 中 Shop schema 的 `ContentItemPublic` 定义一致。

- [ ] **Step 2: 新增 `GetProductsByIds`** 到 `product.gql`（楼层商品回查）

Append to `d:\zhao\nshop\layers\base\gql\queries\product.gql`:

```graphql
query GetProductsByIds($ids: [ID!]) {
  products(options: { filter: { id: { in: $ids } } }) {
    items {
      ...ProductBaseFragment
    }
  }
}
```

> `ProductBaseFragment` 已在 `layers/base/gql/fragments/product.gql` 定义（id/name/slug/description/featuredAsset/variants.price）。该查询返回 id 数组对应的商品，供楼层卡片渲染。

- [ ] **Step 3: 语法校验**

Run: `pnpm nuxi prepare`
Expected: 无 GraphQL 语法错误；`GetHomeContent`/`GetProductsByIds` 代码生成成功。

- [ ] **Step 4: Commit**

```bash
git add layers/base/gql/
git commit -m "feat(gql): 新增首页运营位 GetHomeContent 与商品批查 GetProductsByIds"
```

---

### Task 2: useHomeContent composable + 运营位类型

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\composables\useHomeContent.ts`
- Create: `d:\zhao\nshop\layers\base\app\utils\home-content.ts`（类型约束 + 分发辅助）

- [ ] **Step 1: 定义运营位数据契约与解析工具**

Create `d:\zhao\nshop\layers\base\app\utils\home-content.ts`:

```ts
export type HomeBlockLayout = "hero_full" | "double_grid" | "triple_grid" | "single_scroll";

export interface HeroBlockData {
  imageUrl: string;
  link?: string;
  title?: string;
  subTitle?: string;
}

export interface FloorBlockData {
  title: string;
  layout: HomeBlockLayout;
  items: number[]; // 商品 id 数组
}

export function isHero(data: unknown): data is HeroBlockData {
  return !!data && typeof data === "object" && !!((data as HeroBlockData).imageUrl);
}

export function isFloor(data: unknown): data is FloorBlockData {
  return (
    !!data &&
    typeof data === "object" &&
    !!((data as FloorBlockData).title) &&
    Array.isArray((data as FloorBlockData).items)
  );
}
```

- [ ] **Step 2: 实现 `useHomeContent` composable**

Create `d:\zhao\nshop\layers\base\app\composables\useHomeContent.ts`:

```ts
import { useAsyncData, useAsyncGql } from "#imports";

export function useHomeContent() {
  const { data: content, status, error } = useAsyncData(
    "home-content",
    async () => {
      const res = await useAsyncGql("GetHomeContent", { position: "home" });
      return res.value?.publishedContent ?? [];
    },
    { server: true },
  );

  return { content, status, error };
}
```

> 说明：`useAsyncData` 包裹 GQL 拉取，保证 SSR 预取 + 错误不抛出（失败返回空数组，由首页兜底）。若 `useAsyncGql` 在 Nuxt 4 需 `directive`/响应式，参照 `layers/base/app/pages/category/[slug].vue` 既有用法（`await useAsyncGql("GetCollectionProducts", { slug, skip, take })`）。

- [ ] **Step 3: 类型校验**

Run: `pnpm typecheck`
Expected: 无新增类型错误。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/composables/useHomeContent.ts layers/base/app/utils/home-content.ts
git commit -m "feat(home): useHomeContent composable + 运营位数据契约与解析工具"
```

---

### Task 3: 运营位渲染组件（Hero / Floor / 占位）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\home\OperationalHero.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\home\OperationalFloor.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\home\FlashSalePlaceholder.vue`

- [ ] **Step 1: `OperationalHero.vue`**

Create file:

```vue
<script setup lang="ts">
import type { HeroBlockData } from "~/utils/home-content";

defineProps<{ block: HeroBlockData }>();
</script>

<template>
  <section class="mb-8 w-full" aria-label="运营横幅">
    <NuxtImg
      format="webp"
      class="h-105 w-full object-cover lg:h-140"
      :src="block.imageUrl"
      :alt="block.title ?? '运营横幅'"
      loading="eager"
      sizes="sm:100vw md:1600px"
      fetchpriority="high"
      placeholder
      placeholder-class="blur-sm"
    />
  </section>
</template>
```

- [ ] **Step 2: `OperationalFloor.vue`**（含商品批查）

Create file:

```vue
<script setup lang="ts">
import type { FloorBlockData } from "~/utils/home-content";

const props = defineProps<{ block: FloorBlockData }>();

const { data: productsData } = await useAsyncData(
  `home-floor-${props.block.title}`,
  async () => {
    const ids = props.block.items.map(String);
    if (!ids.length) return { items: [] };
    const res = await useAsyncGql("GetProductsByIds", { ids });
    return res.value?.products ?? { items: [] };
  },
);
const products = computed(() => productsData.value?.items ?? []);
</script>

<template>
  <section class="mb-12" aria-label="楼层">
    <h2 class="mb-4 text-2xl font-semibold">{{ block.title }}</h2>
    <p v-if="!products.length" class="text-sm text-neutral-500">敬请期待</p>
    <div
      v-else
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      <ProductCard
        v-for="(product, index) in products"
        :key="product.id"
        :product="product"
        :eager="index < 4"
      />
    </div>
  </section>
</template>
```

> 注意：ProductCard 的 prop 类型是 `SearchResult[number]`（含 `productName/slug/priceWithTax/productAsset`），而 `GetProductsByIds` 返回的是 `Product`（`ProductBaseFragment`：`name/featuredAsset/variants.price`）。此处需在 Task 3 Step 3 统一：要么给楼层写一个基于 Product 的卡片（轻量展示放 `OperationalFloor` 内联模板），要么在 composable 侧把 Product 映射为 card 所需形状。**推荐后者**：在 `useHomeContent` 或此处新建映射函数，保持复用 ProductCard。见 Step 3。

- [ ] **Step 3: 统一 ProductCard 数据形状**

因 `ProductCard.vue` 期望 `SearchResult` 形状（类型来自 `types/product.ts` 的 `SearchResult = SearchProductsQuery["search"]["items"]`，元素为 `ProductSearchFragment`：`productName/slug/productAsset{id,preview}/priceWithTax(union)/currencyCode`），而 `GetProductsByIds` 返回的是 `Product`（`ProductBaseFragment`：`name/slug/featuredAsset{id,preview}/variants{currencyCode,price}`）。两者字段名与价格语义不同，须映射。

在 `d:\zhao\nshop\layers\base\app\utils\home-content.ts` 追加映射（把 Product 商品展平为 ProductCard 兼容的 `SearchResult` 单元素形态；价格用 `variants[0].price / 100`，currencyCode 取 `variants[0].currencyCode ?? "CNY"`）：

```ts
import type { GetProductsByIdsQuery } from "~~/.nuxt/gql/default";

type ProductCardCompatible = {
  productName: string;
  slug: string;
  productAsset: { id: string; preview: string } | null;
  priceWithTax: { value: number } | { min: number; max: number };
  currencyCode?: string;
};

export function toSearchResultCard(p: NonNullable<GetProductsByIdsQuery["products"]>["items"][number]): ProductCardCompatible {
  const price = (p.variants?.[0]?.price ?? 0) / 100;
  return {
    productName: p.name,
    slug: p.slug,
    productAsset: p.featuredAsset ? { id: p.featuredAsset.id, preview: p.featuredAsset.preview } : null,
    priceWithTax: { value: price },
    currencyCode: p.variants?.[0]?.currencyCode ?? "CNY",
  };
}
```

并将 `OperationalFloor.vue` 中传给 `ProductCard` 的商品改为 `computed(() => productsData.value?.items.map(toSearchResultCard))`。`GetProductsByIds` 的 `$ids` 为字符串数组（`props.block.items.map(String)`）。

> 说明：`ProductBaseFragment` 的 `variants.price` 是不含税基础价；此处楼层卡片价格用基础价除以 100 展示，与详情页完整语义有差异但对楼层概览可接受。若需精确 `priceWithTax`，可将 `GetProductsByIds` 的 fragment 扩充为含 `variants { priceWithTax { value } currencyCode }`，Plan 内默认用基础价，最小改动。

- [ ] **Step 4: `FlashSalePlaceholder.vue`**（本期占位）

Create file:

```vue
<template>
  <section class="mb-12 rounded-lg bg-brand-50 p-6">
    <h2 class="text-xl font-semibold text-brand-600">限时秒杀</h2>
    <p class="mt-1 text-sm text-neutral-500">敬请期待，即将上线</p>
  </section>
</template>
```

> `bg-brand-50`/`text-brand-600` 依赖阶段 0 已定义的京东红 `--color-brand` 主题变量（NuxtUI v4 色板）。若名称不同，替换为已有色板类。

- [ ] **Step 5: 类型与渲染校验**

Run: `pnpm typecheck && pnpm dev`
Expected: 无类型错误；本地渲染页面无明显报错。

- [ ] **Step 6: Commit**

```bash
git add layers/base/app/components/home/
git commit -m "feat(home): OperationalHero/Floor/FlashSalePlaceholder 运营位渲染组件"
```

---

### Task 4: 首页接入运营位（index.vue）

**Files:**
- Modify: `d:\zhao\nshop\app\pages\index.vue`

- [ ] **Step 1: 改造首页逻辑，移除 Unsplash 随机 hero**

替换 `d:\zhao\nshop\app\pages\index.vue` 的 `<script setup>` 与 `<template>`：移除 Unsplash `useFetch`/`imgUrl`，改为拉 `useHomeContent()`，遍历区块按 `type` 分发 Hero/Floor；空数据回退原 `HomeCategoryCarousel`/`HomeShopFeatures`/`HomeFeaturedProducts`（保留现有降级）。

```vue
<script setup lang="ts">
import { isHero, isFloor } from "~/utils/home-content";

const { t } = useI18n();
const { content } = await useHomeContent();
const blocks = computed(() => content.value ?? []);
const hasOperational = computed(() => blocks.value.length > 0);
const banners = computed(() =>
  blocks.value.filter((b) => isHero(b.data)).map((b) => b.data as any),
);
const floors = computed(() =>
  blocks.value.filter((b) => isFloor(b.data)).map((b) => b.data as any),
);
</script>

<template>
  <main>
    <h1 class="sr-only">{{ t("messages.site.tagline") }}</h1>

    <template v-if="hasOperational">
      <OperationalHero v-for="(b, i) in banners" :key="i" :block="b" />
      <OperationalFloor v-for="(f, i) in floors" :key="i" :block="f" />
    </template>
    <template v-else>
      <!-- 兜底：保留原 Unsplash 已移除后改用 /hero.avif 或运营位空态 -->
      <section class="mb-14">
        <NuxtImg
          format="webp"
          class="h-105 w-full object-cover lg:h-140"
          src="/hero.avif"
          alt="Hero image"
          loading="eager"
          sizes="sm:100vw md:1600px"
          fetchpriority="high"
        />
      </section>
      <div class="container">
        <section class="mb-14">
          <h2 class="mb-4 text-2xl font-semibold">{{ t("messages.shop.shopByCategory") }}</h2>
          <HomeCategoryCarousel />
        </section>
        <section class="mt-20 mb-14"><HomeShopFeatures /></section>
        <section class="mb-14">
          <h2 class="mb-4 text-2xl font-semibold">{{ t("messages.shop.popularProducts") }}</h2>
          <HomeFeaturedProducts />
        </section>
      </div>
    </template>
  </main>
</template>
```

> 移除对 `unsplashApiKey` 的引用；若 `app.config` 中仍留 `unsplashApiKey` 也无碍（可择机清理，非本阶段必需）。

- [ ] **Step 2: 空态/降级验证**

Run: `pnpm dev`
Expected: 当生产 `publishedContent(position:'home')` 有数据时渲染 Hero/Floor；无数据时回退 `/hero.avif` + 自带组件，不白屏、不报错。

- [ ] **Step 3: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat(home): 首页接入运营位渲染，移除 Unsplash 随机 hero"
```

---

### Task 5: GetCollectionProducts 增补 sort / facetValueIds

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\collection.gql`

- [ ] **Step 1: 扩展查询参数**

Replace in `d:\zhao\nshop\layers\base\gql\queries\collection.gql`, the `GetCollectionProducts` query:

```graphql
query GetCollectionProducts($slug: String!, $skip: Int, $take: Int, $sort: SearchResultSortParameter, $facetValueIds: [ID!]) {
  search(
    input: {
      collectionSlug: $slug
      groupByProduct: true
      skip: $skip
      take: $take
      sort: $sort
      facetValueIds: $facetValueIds
    }
  ) {
    totalItems
    items {
      ...ProductSearchFragment
    }
  }
}
```

> **重要（已从 schema 核实）**：`$sort` 的类型 `SearchResultSortParameter` 是 INPUT_OBJECT（非枚举），字段仅 `name`/`price`，各需 `SortOrder` 枚举（`ASC`/`DESC`）。因此调用时排序写法是 `{ price: ASC }`、`{ price: DESC }`（价格升降）、`{ name: ASC }`、`{ name: DESC }`（名称/新品）；「综合」传 `null`（默认相关度）。`facetValueIds` 类型 `[ID!]` 已确认存在于 `SearchInput`。若后续想在 productName 相关度排序，以实际 schema 为准。

- [ ] **Step 2: codegen**

Run: `pnpm nuxi prepare`
Expected: `GetCollectionProductsQuery` 签名更新，含 `$sort`/`$facetValueIds` 参数，无类型错误。

- [ ] **Step 3: Commit**

```bash
git add layers/base/gql/queries/collection.gql
git commit -m "feat(gql): GetCollectionProducts 增补 sort/facetValueIds 参数"
```

---

### Task 6: 分类页排序条

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\category\[slug].vue`
- Create: `d:\zhao\nshop\layers\base\app\components\category\SortBar.vue`

- [ ] **Step 1: `SortBar.vue` 组件**

Create `d:\zhao\nshop\layers\base\app\components\category\SortBar.vue`:

```vue
<script setup lang="ts">
import type { SortOrder } from "~~/.nuxt/gql/default";

export type SortKey = "RELEVANCE" | "NAME_ASC" | "PRICE_ASC" | "PRICE_DESC";

const props = defineProps<{ modelValue: SortKey }>();
const emit = defineEmits<{ (e: "update:modelValue", v: SortKey): void }>();

const options: { label: string; value: SortKey }[] = [
  { label: "综合", value: "RELEVANCE" },
  { label: "新品", value: "NAME_ASC" },
  { label: "价格↑", value: "PRICE_ASC" },
  { label: "价格↓", value: "PRICE_DESC" },
];

// 把 SortKey 映射为 search 的 sort 参数（SearchResultSortParameter 输入对象）
export function toSortParam(key: SortKey): { price?: SortOrder } | { name?: SortOrder } | null {
  switch (key) {
    case "PRICE_ASC": return { price: "ASC" };
    case "PRICE_DESC": return { price: "DESC" };
    case "NAME_ASC": return { name: "ASC" };
    default: return null; // 综合 → null（默认相关度）
  }
}
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center gap-2">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="rounded-full px-3 py-1 text-sm"
      :class="modelValue === opt.value ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-700'"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
```

> **重要（已从 schema 核实）**：排序键不是 sythem 的字符串枚举，页面状态用 `SortKey`（RELEVANCE/NAME_ASC/PRICE_ASC/PRICE_DESC），传给 GQL 时用 `toSortParam(key)` 映射成 `SearchResultSortParameter` 输入对象（综合→null，价格升→`{price:'ASC'}`，价格降→`{price:'DESC'}`，名称→`{name:'ASC'}`）。`bg-brand-600` 若不存在换成现有色板类。

- [ ] **Step 2: 分类页接入排序**

Modify `d:\zhao\nshop\layers\base\app\pages\category\[slug].vue`:
- 引入 `SortBar` 与 `toSortParam`；`const sort = ref<SortKey>("RELEVANCE")`。
- 把 `sortValue = computed(() => toSortParam(sort.value))` 传入 `useAsyncGql("GetCollectionProducts", { slug, skip, take, sort: sortValue.value })`（注意 `useAsyncGql` 参数需传递 `{ price: 'ASC' }` 这类对象字面量，GQL input 对象直接透传）。
- `watch(sort, () => { page.value = 1; })`（重置到第一页）。
- 在 `<template>` 商品 `<section>` 上方插入 `<SortBar v-model="sort" />`。

> 提示：`useAsyncGql` 传入 input 对象时，graphql-request 需把对象值作为变量。若 `.value` 是 `null`，Vendure search 会忽略 sort 用默认相关度，符合「综合」语义。若 `useAsyncGql` 无法接受 computed 的 `.value`（明确值而非 Ref），直接传 `sortValue.value` 即可。

- [ ] **Step 3: 验证**

Run: `pnpm dev` → 访问 `http://localhost:3000/category/{slug}？任意真实 slug`
Expected: 排序条显示；点「价格↑」等时商品顺序变化且回到第一页；无类型错误。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/components/category/SortBar.vue "layers/base/app/pages/category/[slug].vue"
git commit -m "feat(category): 分类页排序条"
```

---

### Task 7: 分类页 Facet / 分类筛选抽屉

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\category\[slug].vue`
- Create: `d:\zhao\nshop\layers\base\app\components\category\FilterDrawer.vue`
- Create: `d:\zhao\nshop\layers\base\gql\queries\facets.gql`

- [ ] **Step 1: 新增 facets 查询**

Create `d:\zhao\nshop\layers\base\gql\queries\facets.gql`:

```graphql
query GetFacets {
  facets(options: { take: 100 }) {
    items {
      id
      name
      values {
        id
        name
      }
    }
  }
}
```

> Vendure `facets` 查询可返回可用 Facet（品牌等）。若 schema 中 `facets` 需不同参数，按实际为准。

- [ ] **Step 2: `FilterDrawer.vue`**

Create `d:\zhao\nshop\layers\base\app\components\category\FilterDrawer.vue`：

```vue
<script setup lang="ts">
import { useI18n } from "#imports";

const props = defineProps<{
  modelValue: boolean;
  facets: { id: string; name: string; values: { id: string; name: string }[] }[];
}>();
const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "update:selected", v: { facetId: string; valueId: string }[]): void;
}>();

const selected = defineModel<{ facetId: string; valueId: string }[]>("selected", { default: () => [] });

function toggle(facetId: string, valueId: string) {
  const exists = selected.value.find((s) => s.facetId === facetId && s.valueId === valueId);
  if (exists) {
    selected.value = selected.value.filter((s) => s.facetId !== facetId || s.valueId !== valueId);
  } else {
    selected.value = [...selected.value, { facetId, valueId }];
  }
}
</script>

<template>
  <UModal v-model="props.modelValue">
    <template #body>
      <div v-for="facet in props.facets" :key="facet.id" class="mb-4">
        <h3 class="mb-2 font-semibold">{{ facet.name }}</h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="val in facet.values"
            :key="val.id"
            type="button"
            class="rounded px-2 py-1 text-sm"
            :class="selected.some((s) => s.facetId === facet.id && s.valueId === val.id) ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-700'"
            @click="toggle(facet.id, val.id)"
          >
            {{ val.name }}
          </button>
        </div>
      </div>
      <div v-if="!facets.length" class="text-sm text-neutral-500">暂无筛选条件</div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 3: 分类页接入筛选**

Modify `category/[slug].vue`:
- 拉取 `GetFacets`（`useAsyncGql`），得到 `facets`。
- 维护 `selectedFacets` 数组 + `drawerOpen` 布尔。
- 把选中 facet value id 列表（`selectedFacets.map(d => d.valueId)`）作为 `facetValueIds` 传入 `GetCollectionProducts`。
- 顶部加「筛选」按钮打开抽屉；抽屉确认后关闭并重置 `page=1`。
- 无结果时显示空态 + 「清空筛选」按钮（清空 `selectedFacets`）。

- [ ] **Step 4: 验证**

Run: `pnpm dev`
Expected: 点「筛选」弹抽屉，选品牌后商品过滤且回第一页；清空恢复全部；无类型错误。

- [ ] **Step 5: Commit**

```bash
git add layers/base/gql/queries/facets.gql layers/base/app/components/category/FilterDrawer.vue "layers/base/app/pages/category/[slug].vue"
git commit -m "feat(category): Facet/分类筛选抽屉"
```

---

### Task 8: 本地联调 + 部署验证（遵守部署铁律）

**Files:**
- Review: `d:\zhao\nshop\scripts\deploy.mjs`
- Verify on server: pm2 进程

- [ ] **Step 1: 本地全量构建**

Run: `pnpm build`
Expected: 构建成功，`.output/` 产物生成；无 `Cannot find module`；含 `publishedContent` 相关 chunk。

- [ ] **Step 2: 后端无改动确认**

Run: `git status` in `d:\zhao\vendure`
Expected: 无改动（后端零改动验证）。

- [ ] **Step 3: 部署到服务器**

Run: `pnpm deploy`（等价 `node scripts/deploy.mjs`：本地 build → scp `.output/` 到 `REMOTE_DIR` → pm2 restart `nshop`）
Expected: 部署脚本输出上传与重启成功；遵守铁律（服务器不 install/build）。

- [] **Step 4: 线上验证**

```bash
# 入口 200
ssh qing "curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/"
# publishedContent 实际返回
curl -s -X POST https://e.joho.cn/shop-api \
  -H 'content-type: application/json' -H 'vendure-channel-token: abc123xyz' \
  -d '{"query":"{ publishedContent(position: \"home\") { id type data } }"}'
```
Expected: 首页 200；`publishedContent` 返回 200 且含数组（空数组也 OK——前端走兜底）；无 500。

- [ ] **Step 5: 回归**

访问线上 `www.youshop.cn` 首页、任一分类页、商品详情、购物车/结算/认证 → 功能正常，无回归。

- [ ] **Step 6: Commit（若部署脚本或产物有改动）**

```bash
git add .output scripts/ 2>/dev/null
git commit -m "chore(deploy): 阶段1部署产物"
```
（无改动则跳过本步。）