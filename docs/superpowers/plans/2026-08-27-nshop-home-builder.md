# nshop 首页积木式装修 + 主题风格跟随 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 nshop 首页支持**按风格分套的积木式装修**——每个风格（京东/淘宝/极简）各自一套可独立增删排序的首页区块配置，前台按当前租户 `themeId` 渲染对应套；每区块可选样式（金刚区圆形/方形、商品卡紧凑/瀑布流/单列）；主色统一跟随 `data-theme` token。

**Architecture:** 数据存 `Channel.customFields.shopContent`（新增 `byTheme` 结构兼容老数据），前端按主题取套渲染。`themeId` 与 `shopContent` 在同一次 `activeChannel` 查询返回（扩展 `GetChannelTheme`），不新增请求。新增 `useShopContent()` 解析 + `HomeBlockRenderer.vue` 统一映射，复用现有 Jd 组件（banner/nav/compact goods），新增 masonry/single 商品卡走代码分割。渲染不改变数据依赖，SSR 请求数与现状持平（商品搜索 ≤2 次）。

**Tech Stack:** Nuxt 3（SSR + useAsyncData）、@nuxt/gql（自动生成类型）、Tailwind CSS + Nuxt UI v4（`--ui-primary` token）、Vendure 自定义字段（后端零改动）、vshop web-admin（Vue 3 + HBuilder X，用户手动构建）。

---

## 前置约定（执行者必读）

1. **验证方式**：nshop 无单元测试框架（package.json 仅 dev/build/typecheck）。每个任务用「`pnpm typecheck` + `pnpm dev` 本地可视化验证 + `pnpm build`」验证；M3 vshop 部分由**用户 HBuilder X 手动构建**，我只提供代码改动。
2. **组件引入纪律**：新组件一律**显式 `import` 组件对象**后再用（index.vue 顶部已有注释说明：字符串组件名会被 Nuxt 当 custom element 渲染成空标签，SSR 输出 `<!---->`）。`HomeBlockRenderer` 用 `<component :is="对象">`。
3. **git 纪律**：`d:\zhao\nshop` 工作区存在未跟踪临时产物（`.superpowers/`、`_dev.html`、`_mobile_check.png`、`_shots/`）及上轮未提交改动（logo-top.svg / AppFooter.vue / nuxt.config.ts 等）。**禁止 `git add -A`**，每个 commit 只 `git add` 本任务涉及的具体文件。
4. **主题 id 清单**（theme.css 已定义）：`default` / `jd-red` / `taobao-orange` / `modern-minimal` / `brand`。风格默认值只对前四个有意义（brand 回退 default）。
5. **部署铁律**：绝不在服务器构建。nshop 本地 `node scripts/deploy.mjs`（本地 build → scp .output → pm2 restart）。vshop 由用户构建。
6. **性能红线**（设计 §5.3，M2 必须守住）：首页 SSR 商品搜索总次数 ≤2；商品卡统一 NuxtImg `format=webp` + 固定尺寸（masonry 600×600 / compact 300×300）；首屏外图片 `loading="lazy"`；banner 首图 `fetchpriority="high"`。

**文件职责总览**（本次新增/修改）：

| 文件 | 职责 | 动作 |
|---|---|---|
| `layers/base/gql/queries/context.gql` | 扩展 `GetChannelTheme` 同时返回 themeId + shopContent | Modify |
| `layers/base/app/utils/shop-content.ts` | 类型定义 + 风格默认常量 + 解析/取套 | Create |
| `layers/base/app/composables/useShopContent.ts` | 按主题取套 + 老数据兼容 | Create |
| `layers/base/app/components/home/HomeBlockRenderer.vue` | 统一积木渲染入口（type→组件映射） | Create |
| `layers/base/app/components/home/blocks/BannerBlock.vue` | banner 适配（images→slides） | Create |
| `layers/base/app/components/home/blocks/NoticeBlock.vue` | notice 适配 | Create |
| `layers/base/app/components/home/blocks/NavGrid.vue` | nav 适配（shape/layout/items → JdFunctionGrid） | Create |
| `layers/base/app/components/home/blocks/GoodsFloor.vue` | goods 数据获取 + 三态布局切换 | Create |
| `layers/base/app/components/home/blocks/GoodsMasonryGrid.vue` | 淘宝双列大图瀑布流卡 | Create |
| `layers/base/app/components/home/blocks/GoodsSingleList.vue` | 极简单列横卡 | Create |
| `layers/base/app/components/home/blocks/RichTextView.vue` | richText v-html | Create |
| `layers/base/app/components/home/jd/JdFunctionGrid.vue` | 新增 shape/layout/items props | Modify |
| `app/pages/index.vue` | 移动端积木化 + 空配置兜底 + 配色 token 化 | Modify |

---

## M1 · nshop 数据打通

### Task 1: 扩展 GetChannelTheme query（themeId + shopContent 同查）

**Files:**
- Modify: `layers/base/gql/queries/context.gql:15-21`

- [ ] **Step 1: 修改 query**

`layers/base/gql/queries/context.gql` 的 `GetChannelTheme` 增加 `shopContent` 字段：

```graphql
query GetChannelTheme {
  activeChannel {
    customFields {
      themeId
      shopContent
    }
  }
}
```

- [ ] **Step 2: 触发类型重新生成并验证**

@nuxt/gql 在 dev/build 时自动生成 `.nuxt/gql/default.d.ts` 类型。运行：

```bash
pnpm dev
```

等出现 `✔ Nitro server built` / 编译完成后，验证生成的类型已含 `shopContent`：

```bash
Select-String .nuxt/gql/default.d.ts -Pattern "shopContent"
```

Expected: 命中（`customFields` 类型里出现 `shopContent?: Maybe<Scalars['String']['output']>`）。若未命中，重启 dev 一次再查。

- [ ] **Step 3: 提交**

```bash
git add layers/base/gql/queries/context.gql
git commit -m "feat(nshop): GetChannelTheme 同查 themeId + shopContent（零新增请求）"
```

---

### Task 2: 新增 shopContent 工具层（类型 + 风格默认 + 解析）

**Files:**
- Create: `layers/base/app/utils/shop-content.ts`

- [ ] **Step 1: 创建工具文件**

仿照既有 `layers/base/app/utils/home-content.ts` 的纯函数风格，创建 `layers/base/app/utils/shop-content.ts`：

```ts
// shopContent 解析工具：类型 + 风格默认值 + 按主题取套（纯函数，SSR 友好）

export type NavShape = 'round' | 'square';
export type NavLayout = 'grid5x2' | 'grid4x2' | 'row';
export type GoodsLayout = 'compact' | 'masonry' | 'single';

export interface BannerSection { type: 'banner'; images: { image: string; link?: string }[]; }
export interface NoticeSection { type: 'notice'; text: string; }
export interface NavSection {
  type: 'nav';
  items: { label: string; image?: string; link?: string }[];
  shape?: NavShape;
  layout?: NavLayout;
}
export interface GoodsSection {
  type: 'goods';
  collectionId?: string;
  layout?: GoodsLayout;
  title?: string;
}
export interface RichTextSection { type: 'richText'; html: string; }

export type ShopSection = BannerSection | NoticeSection | NavSection | GoodsSection | RichTextSection;
export type ThemeSections = { sections: ShopSection[] };

export type ShopContent =
  | { version: 1; byTheme: Record<string, ThemeSections> } // 新版：按风格分套
  | { version: 1; sections: ShopSection[] };               // 老数据：视为 default 风格

export interface ThemeStyleDefaults {
  nav: { shape: NavShape; layout: NavLayout };
  goods: GoodsLayout;
}

// 风格默认样式（前端常量，不落库）：新建区块预填 + 渲染兜底
export const THEME_STYLE_DEFAULTS: Record<string, ThemeStyleDefaults> = {
  default: { nav: { shape: 'square', layout: 'grid5x2' }, goods: 'compact' },
  'jd-red': { nav: { shape: 'square', layout: 'grid5x2' }, goods: 'compact' },
  'taobao-orange': { nav: { shape: 'round', layout: 'grid4x2' }, goods: 'masonry' },
  'modern-minimal': { nav: { shape: 'round', layout: 'row' }, goods: 'single' },
};

export function themeDefaultsFor(themeId: string): ThemeStyleDefaults {
  return THEME_STYLE_DEFAULTS[themeId] ?? THEME_STYLE_DEFAULTS.default;
}

export function parseShopContent(raw: string | null | undefined): ShopContent | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    // 新版 byTheme / 老版 sections 均可
    if (data.byTheme && typeof data.byTheme === 'object') return data as ShopContent;
    if (Array.isArray(data.sections)) return data as ShopContent;
    return null;
  } catch {
    return null;
  }
}

export function getThemeSections(content: ShopContent | null, themeId: string): ShopSection[] {
  if (!content) return [];
  if ('byTheme' in content) {
    return content.byTheme[themeId]?.sections ?? content.byTheme.default?.sections ?? [];
  }
  return content.sections ?? [];
}
```

- [ ] **Step 2: typecheck 验证**

```bash
pnpm typecheck
```

Expected: 通过（无 `shopContent` / `byTheme` 相关类型错误）。

- [ ] **Step 3: 提交**

```bash
git add layers/base/app/utils/shop-content.ts
git commit -m "feat(nshop): shopContent 工具层（按风格分套类型+风格默认+解析）"
```

---

### Task 3: 新增 useShopContent composable

**Files:**
- Create: `layers/base/app/composables/useShopContent.ts`

- [ ] **Step 1: 创建 composable**

`useShopContent` 读 channel 的 `shopContent`（与 `useChannelTheme` 同用 `GetChannelTheme`，@nuxt/gql 按操作名自动去重，SSR 只发一次请求），按当前 `themeId` 返回对应套 + 风格默认：

```ts
// 按当前主题取装修套 + 风格默认。themeId 与 shopContent 来自同一 GetChannelTheme 查询（SSR 去重，不新增请求）
import { useAsyncData } from "#imports";
import { parseShopContent, getThemeSections, themeDefaultsFor } from "../utils/shop-content";

export function useShopContent() {
  const { config: themeId } = useChannelTheme();

  const { data } = useAsyncData(
    "shop-content",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields?.shopContent ?? null;
    },
    { server: true },
  );

  const shopContent = computed(() => getThemeSections(parseShopContent(data.value), themeId.value));
  const themeDefaults = computed(() => themeDefaultsFor(themeId.value));

  return { shopContent, themeDefaults };
}
```

- [ ] **Step 2: typecheck 验证**

```bash
pnpm typecheck
```

Expected: 通过（确认 `useChannelTheme` 返回的 `config` 是 `Ref<string>`，computed 可正常读取）。

- [ ] **Step 3: 提交**

```bash
git add layers/base/app/composables/useShopContent.ts
git commit -m "feat(nshop): useShopContent 按主题取装修套 + 风格默认兜底"
```

---

### Task 4: HomeBlockRenderer + 区块适配组件（骨架）

**Files:**
- Create: `layers/base/app/components/home/HomeBlockRenderer.vue`
- Create: `layers/base/app/components/home/blocks/BannerBlock.vue`
- Create: `layers/base/app/components/home/blocks/NoticeBlock.vue`
- Create: `layers/base/app/components/home/blocks/NavGrid.vue`
- Create: `layers/base/app/components/home/blocks/RichTextView.vue`
- (goods → Task 7 创建 GoodsFloor)

- [ ] **Step 1: 创建 HomeBlockRenderer.vue**

统一渲染入口，按 `section.type` 映射组件对象（显式 import，规避字符串组件名问题）。goods 组件在 Task 7 创建，这里先放占位指向待建文件——**先完成本任务文件，goods 相关在 Task 7 补齐**：

```vue
<script setup lang="ts">
// 积木化统一渲染入口：按 section.type 映射组件（显式 import 组件对象，
// 避免字符串组件名被当作 custom element 渲染成空标签——与既有 home 修复模式一致）
import BannerBlock from "./blocks/BannerBlock.vue";
import NoticeBlock from "./blocks/NoticeBlock.vue";
import NavGrid from "./blocks/NavGrid.vue";
import GoodsFloor from "./blocks/GoodsFloor.vue";
import RichTextView from "./blocks/RichTextView.vue";
import type { ShopSection, ThemeStyleDefaults } from "../../utils/shop-content";

const props = defineProps<{
  sections: ShopSection[];
  themeDefaults: ThemeStyleDefaults;
}>();

const componentMap: Record<string, any> = {
  banner: BannerBlock,
  notice: NoticeBlock,
  nav: NavGrid,
  goods: GoodsFloor,
  richText: RichTextView,
};
</script>

<template>
  <component
    v-for="(section, index) in props.sections"
    :key="index"
    :is="componentMap[section.type] ?? null"
    :section="section"
    :theme-defaults="props.themeDefaults"
  />
</template>
```

- [ ] **Step 2: 创建 BannerBlock.vue**（banner images → JdBannerCarousel slides）

```vue
<script setup lang="ts">
// banner 区块适配：shopContent 的 images → JdBannerCarousel slides
import JdBannerCarousel from "../jd/JdBannerCarousel.vue";
import type { BannerSection } from "../../utils/shop-content";

const props = defineProps<{ section: BannerSection }>();

const slides = computed(() =>
  props.section.images.map((im, i) => ({
    imageUrl: im.image,
    link: im.link,
    title: `slide-${i}`,
  })),
);
</script>

<template>
  <JdBannerCarousel :slides="slides" />
</template>
```

- [ ] **Step 3: 创建 NoticeBlock.vue**（notice 文本 → 现有 NoticeBar）

```vue
<script setup lang="ts">
// notice 区块适配：text → NoticeBar
import NoticeBar from "./NoticeBar.vue";
import type { NoticeSection } from "../../utils/shop-content";

const props = defineProps<{ section: NoticeSection }>();
</script>

<template>
  <NoticeBar :text="props.section.text" />
</template>
```

> 先读 `layers/base/app/components/home/blocks/NoticeBar.vue`，若它只接受 `block.data` 形态（`{ id, data: { text } }`），则改为同时支持 `text` prop：`defineProps<{ block?: any; text?: string }>()`，`const text = computed(() => props.text ?? props.block?.data?.text ?? "")`，保证既有的 ContentItem 消费方不受影响。

- [ ] **Step 4: 创建 NavGrid.vue**（nav 区块 → JdFunctionGrid，透传 shape/layout/items）

```vue
<script setup lang="ts">
// nav 区块适配：section.items + 风格默认 shape/layout → JdFunctionGrid
import JdFunctionGrid from "../jd/JdFunctionGrid.vue";
import type { NavSection, ThemeStyleDefaults } from "../../utils/shop-content";

const props = defineProps<{
  section: NavSection;
  themeDefaults: ThemeStyleDefaults;
}>();

const shape = computed(() => props.section.shape ?? props.themeDefaults.nav.shape);
const layout = computed(() => props.section.layout ?? props.themeDefaults.nav.layout);
// 装修配置的 items 转成 JdFunctionGrid 的 GridItem 形态（有图用图，无图 emoji 兜底）
const items = computed(() =>
  props.section.items.map((it) => ({
    label: it.label,
    img: it.image || undefined,
    emoji: it.image ? undefined : "🏷️",
    path: it.link || undefined,
  })),
);
</script>

<template>
  <JdFunctionGrid :shape="shape" :layout="layout" :items="items" />
</template>
```

- [ ] **Step 5: 创建 RichTextView.vue**（richText → v-html）

```vue
<script setup lang="ts">
// richText 区块：渲染运营粘贴的 HTML 片段
import type { RichTextSection } from "../../utils/shop-content";

const props = defineProps<{ section: RichTextSection }>();
</script>

<template>
  <!-- 运营上传内容，v-html 为既有能力；样式由贴入片段自带 -->
  <section class="mx-2 mt-2 overflow-hidden rounded-lg bg-white" v-html="props.section.html" />
</template>
```

- [ ] **Step 6: 临时创建 GoodsFloor.vue 占位**（Task 7 会完整实现）

先建最小占位，保证 `componentMap` 引用不报错（Task 5 接入页面后可先验证其余区块，goods 后续补全）：

```vue
<script setup lang="ts">
// goods 区块占位：完整三态实现见 Task 7
import type { GoodsSection, ThemeStyleDefaults } from "../../utils/shop-content";

defineProps<{ section: GoodsSection; themeDefaults: ThemeStyleDefaults }>();
</script>

<template>
  <!-- Task 7 实现：compact / masonry / single 三态 -->
  <section class="mx-2 mt-2 rounded-lg bg-white p-2 text-center text-xs text-gray-400">
    商品区块（待实现）
  </section>
</template>
```

- [ ] **Step 7: typecheck + dev 冒烟验证**

```bash
pnpm typecheck
pnpm dev
```

Expected: typecheck 通过；首页无编译错误（此刻 index.vue 尚未接入，页面仍走老布局，仅确认组件可编译）。

- [ ] **Step 8: 提交**

```bash
git add layers/base/app/components/home/HomeBlockRenderer.vue layers/base/app/components/home/blocks/BannerBlock.vue layers/base/app/components/home/blocks/NoticeBlock.vue layers/base/app/components/home/blocks/NavGrid.vue layers/base/app/components/home/blocks/RichTextView.vue layers/base/app/components/home/blocks/GoodsFloor.vue
git commit -m "feat(nshop): HomeBlockRenderer 积木渲染入口 + banner/notice/nav/richText 区块适配"
```

---

### Task 5: index.vue 移动端积木化 + 空配置兜底

**Files:**
- Modify: `app/pages/index.vue:170-193`（移动端 main）

- [ ] **Step 1: 接入 useShopContent，兜底搜索仅空配置时执行**

在 `<script setup>` 顶部引入并调用：

```ts
import HomeBlockRenderer from "../../layers/base/app/components/home/HomeBlockRenderer.vue";
import { useShopContent } from "../../layers/base/app/composables/useShopContent";
```

将第 33 行之后的商品搜索改为**条件执行**（积木配置存在时不发兜底搜索，守住请求数红线）：

```ts
// 2) 轮播 Banner：装修有 banner 区块时由积木渲染；空配置兜底用运营内容
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

// 3) 商品楼层：仅当未配置装修（兜底京东布局）时才发热门/为你推荐搜索，积木配置下由 goods 区块各自取数
const { shopContent, themeDefaults } = useShopContent();
const hasBlocks = computed(() => shopContent.value.length > 0);
const { data: fallbackSearch } = await useAsyncData(
  "home-fallback-search",
  async () => {
    if (hasBlocks.value) return { hot: [], more: [] };
    const h = await useAsyncGql("SearchProducts", { term: "", take: 10, skip: 0 });
    const m = await useAsyncGql("SearchProducts", { term: "", take: 10, skip: 10 });
    return {
      hot: h.data.value?.search?.items ?? [],
      more: m.data.value?.search?.items ?? [],
    };
  },
  { server: true },
);
const hotProducts = computed(() => fallbackSearch.value?.hot ?? []);
const moreProducts = computed(() => fallbackSearch.value?.more ?? []);
```

- [ ] **Step 2: 移动端 main 改为积木渲染 + 兜底**

替换移动端 `main`（当前第 171-193 行）为：

```vue
<!-- ═══ 移动端降级版（<1024px 显示）═══ -->
<main class="mx-auto max-w-md bg-[#f5f5f5] pb-20 lg:hidden" data-layout="mobile">
  <!-- 积木化：按当前风格套渲染（京东有金刚区/淘宝无金刚区等） -->
  <HomeBlockRenderer v-if="hasBlocks" :sections="shopContent" :theme-defaults="themeDefaults" />

  <!-- 未配置装修：兜底现有京东布局（与之前完全一致） -->
  <template v-else>
    <JdCategoryNav :categories="topCategories" />
    <JdBannerCarousel :slides="bannerSlides" />
    <JdFunctionGrid />
    <JdBrandFloor />
    <div class="mt-2">
      <JdPlazaGrid v-if="topCategories.length" :categories="topCategories" />
    </div>
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
```

> PC 版（`lg:block`）本次保持不变，仅移动端积木化。

- [ ] **Step 3: typecheck + dev 验证**

```bash
pnpm typecheck
pnpm dev
```

Expected:
- 未配置装修的渠道：移动端首页与改造前完全一致（兜底生效，无配置时 2 次商品搜索不变）。
- 手动在浏览器控制台临时注入 `shopContent` 配置后可看到积木渲染（或按 Task 9 在 vshop 后台配置后验证）：
  - 用 `localStorage`/DevTools 改 channel customFields 不方便时，可先在 `useShopContent` 里临时 `console.log(parsed)` 确认解析正常，再删除调试日志。

- [ ] **Step 4: 提交**

```bash
git add app/pages/index.vue
git commit -m "feat(nshop): 首页移动端积木化渲染 + 空配置京东兜底（搜索按需触发）"
```

---

## M2 · 风格默认与主题化渲染

### Task 6: 金刚区 shape/layout/items props（JdFunctionGrid 扩展）

**Files:**
- Modify: `layers/base/app/components/home/jd/JdFunctionGrid.vue`

- [ ] **Step 1: 扩展 props 与排布**

`JdFunctionGrid.vue` 改为支持 `shape` / `layout` / `items`，默认值保持现状（round + grid5x2 + 自动 items），积木场景由 NavGrid 显式传入：

```ts
import type { NavShape, NavLayout } from "../../../utils/shop-content";

interface GridItem {
  label: string;
  img?: string;
  emoji?: string;
  path?: string;
  cart?: boolean;
  drawer?: boolean;
}

const props = withDefaults(
  defineProps<{
    shape?: NavShape;
    layout?: NavLayout;
    items?: GridItem[];
  }>(),
  {
    shape: "round",     // 兜底（无装修）保持现状圆形；积木场景由 NavGrid 按风格默认传入
    layout: "grid5x2",
    items: () => [],
  },
);
```

- [ ] **Step 2: gridItems 改为「配置优先，自动兜底」**

```ts
const autoItems = computed<GridItem[]>(() => {
  const top = cats.value.slice(0, 4).map((c) => ({
    label: c.name,
    img: c.featuredAsset?.preview,
    emoji: "🏷️",
    path: linkFor(c.slug),
  }));
  return [...top, ...fixedItems];
});

const gridItems = computed<GridItem[]>(() =>
  props.items.length ? props.items : autoItems.value,
);
```

> `fixedItems` 的 `path`/`cart`/`drawer` 字段类型对齐 `GridItem`（现有代码已含这些字段，类型推断即可）。

- [ ] **Step 3: 模板按 layout 排布、按 shape 定形**

替换模板网格部分：

```vue
<template>
  <section class="mx-2 mt-2 rounded-lg bg-white p-2">
    <!-- row：极简单行横向滚动；其余：宫格 -->
    <div
      v-if="layout === 'row'"
      class="flex gap-3 overflow-x-auto px-1 py-1.5"
    >
      <NuxtLink
        v-for="(item, i) in gridItems"
        :key="i"
        :to="item.path ? localePath(item.path) : undefined"
        class="flex shrink-0 flex-col items-center gap-1 py-1"
        @click="onClick(item)"
      >
        <span
          :class="[
            'flex h-11 w-11 items-center justify-center overflow-hidden bg-primary/10 text-lg',
            shape === 'square' ? 'rounded-lg' : 'rounded-full',
          ]"
        >
          <NuxtImg
            v-if="item.img"
            :src="item.img"
            format="webp"
            class="h-full w-full object-cover"
            alt=""
          />
          <template v-else>{{ item.emoji }}</template>
        </span>
        <span class="max-w-[4.5rem] truncate text-xs text-gray-700">{{ item.label }}</span>
      </NuxtLink>
    </div>

    <div
      v-else
      :class="layout === 'grid4x2' ? 'grid grid-cols-4 gap-y-2' : 'grid grid-cols-5 gap-y-2'"
    >
      <NuxtLink
        v-for="(item, i) in gridItems"
        :key="i"
        :to="item.path ? localePath(item.path) : undefined"
        class="flex flex-col items-center gap-1 py-1.5"
        @click="onClick(item)"
      >
        <span
          :class="[
            'flex h-11 w-11 items-center justify-center overflow-hidden bg-primary/10 text-lg',
            shape === 'square' ? 'rounded-lg' : 'rounded-full',
          ]"
        >
          <NuxtImg
            v-if="item.img"
            :src="item.img"
            format="webp"
            class="h-full w-full object-cover"
            alt=""
          />
          <template v-else>{{ item.emoji }}</template>
        </span>
        <span class="max-w-[4.5rem] truncate text-xs text-gray-700">{{ item.label }}</span>
      </NuxtLink>
    </div>
  </section>
</template>
```

- [ ] **Step 4: typecheck + dev 验证**

```bash
pnpm typecheck
pnpm dev
```

Expected: 未装修兜底首页金刚区视觉不变（round + 十宫格）；临时在 NavGrid 传入 `shape='square'` 后可看到方形。

- [ ] **Step 5: 提交**

```bash
git add layers/base/app/components/home/jd/JdFunctionGrid.vue
git commit -m "feat(nshop): 金刚区 shape/layout/items props（京东方形/淘宝圆形/极简横向）"
```

---

### Task 7: goods 三态卡片（compact 复用 / masonry 新增 / single 新增）

**Files:**
- Modify: `layers/base/app/components/home/blocks/GoodsFloor.vue`（补全占位）
- Create: `layers/base/app/components/home/blocks/GoodsMasonryGrid.vue`
- Create: `layers/base/app/components/home/blocks/GoodsSingleList.vue`

- [ ] **Step 1: 完整实现 GoodsFloor.vue**

```vue
<script setup lang="ts">
// goods 区块：按 layout 渲染三态商品卡；数据来自 SearchProducts（collectionId 或自动推荐）
import JdProductGrid from "../jd/JdProductGrid.vue";
import GoodsMasonryGrid from "./GoodsMasonryGrid.vue";
import GoodsSingleList from "./GoodsSingleList.vue";
import type { GoodsSection, GoodsLayout, ThemeStyleDefaults } from "../../utils/shop-content";
import type { SearchResult } from "~~/types/product";

const props = defineProps<{
  section: GoodsSection;
  themeDefaults: ThemeStyleDefaults;
}>();

const layout = computed<GoodsLayout>(() => props.section.layout ?? props.themeDefaults.goods);
const title = computed(() => props.section.title ?? "为你推荐");
const take = computed(() => (layout.value === "masonry" ? 8 : 10));

// 按 collectionId 取 key：同 collection 的多个 goods 区块 SSR 去重只查一次（请求数红线）
const key = `goods-block-${props.section.collectionId ?? "auto"}`;
const { data } = await useAsyncData(
  key,
  async () => {
    const res = await useAsyncGql("SearchProducts", {
      term: "",
      ...(props.section.collectionId ? { collectionSlug: props.section.collectionId } : {}),
      take: take.value,
      skip: 0,
    });
    return (res.data.value?.search?.items ?? []) as SearchResult;
  },
  { server: true },
);
const products = computed(() => data.value ?? []);
</script>

<template>
  <GoodsMasonryGrid v-if="layout === 'masonry'" :title="title" :products="products" />
  <GoodsSingleList v-else-if="layout === 'single'" :title="title" :products="products" />
  <JdProductGrid v-else :title="title" :products="products" />
</template>
```

> `SearchProducts` 的 `$term` 为必填 String，传 `""`；`$take`/`$skip` 有默认值。布局切换由 style 默认驱动（淘宝→masonry、极简→single、京东→compact）。

- [ ] **Step 2: 创建 GoodsMasonryGrid.vue（淘宝双列大图瀑布流）**

大图 + 价格 + 标题 + 底部标签行。图片统一 NuxtImg `format="webp"`，首屏外 `loading="lazy"`：

```vue
<script setup lang="ts">
// 淘宝风商品瀑布流：双列大图卡（大图 + 价格 + 标题 + 底行）
import type { SearchResult } from "~~/types/product";

type SearchItem = SearchResult[number];

const props = defineProps<{
  title: string;
  products: SearchItem[];
}>();
const localePath = useLocalePath();

function price(p?: SearchItem["priceWithTax"], cur?: string | null) {
  if (!p) return "";
  const c = cur ?? "CNY";
  if ("min" in p && "max" in p) {
    const min = (p.min / 100).toFixed(2);
    const max = (p.max / 100).toFixed(2);
    return min === max ? `¥${min}` : `${min}~${max}`;
  }
  return `¥${(p.value / 100).toFixed(2)}`;
}
</script>

<template>
  <section class="mx-2 mt-2 bg-white">
    <div class="flex items-center justify-between px-3 pb-2 pt-3">
      <h2 class="flex items-center gap-1 text-base font-bold">
        <span class="inline-block h-3.5 w-1 rounded bg-primary" />
        {{ title }}
      </h2>
      <NuxtLink :to="localePath('/')" class="text-xs text-gray-400">更多 ›</NuxtLink>
    </div>
    <div class="grid grid-cols-2 gap-2 px-2 pb-3">
      <NuxtLink
        v-for="p in products"
        :key="p.slug"
        :to="localePath(`/product/${p.slug}`)"
        class="overflow-hidden rounded-lg border border-gray-100 bg-white transition active:scale-[0.98]"
      >
        <NuxtImg
          :src="p.productAsset?.preview || '/images/placeholder.webp'"
          format="webp"
          width="600"
          loading="lazy"
          class="aspect-square w-full bg-gray-100 object-cover"
          alt=""
        />
        <div class="p-2">
          <p class="text-base font-bold text-primary">{{ price(p.priceWithTax, p.currencyCode) }}</p>
          <p class="line-clamp-2 mt-1 min-h-8 text-xs leading-4 text-gray-700">{{ p.productName }}</p>
          <div class="mt-1.5 flex items-center justify-between text-[10px] text-gray-400">
            <span class="rounded bg-primary/10 px-1 py-0.5 text-primary">自营</span>
            <span>nshop</span>
          </div>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>
```

> 说明：Vendure 核心 `SearchResult` 无「销量/店铺」字段（fragment 仅 productName/slug/productAsset/priceWithTax/currencyCode），底行以「自营 + 站点名」呈现；若运营需要真实销量/店铺，需另扩 query（列后续项，不在本计划范围）。

- [ ] **Step 3: 创建 GoodsSingleList.vue（极简单列大图横卡）**

```vue
<script setup lang="ts">
// 极简风商品单列：大图横卡（图左 + 价格/标题/按钮右）
import type { SearchResult } from "~~/types/product";

type SearchItem = SearchResult[number];

const props = defineProps<{
  title: string;
  products: SearchItem[];
}>();
const localePath = useLocalePath();

function price(p?: SearchItem["priceWithTax"], cur?: string | null) {
  if (!p) return "";
  const c = cur ?? "CNY";
  if ("min" in p && "max" in p) {
    const min = (p.min / 100).toFixed(2);
    const max = (p.max / 100).toFixed(2);
    return min === max ? `¥${min}` : `${min}~${max}`;
  }
  return `¥${(p.value / 100).toFixed(2)}`;
}
</script>

<template>
  <section class="mx-2 mt-2 bg-white">
    <div class="flex items-center justify-between px-3 pb-2 pt-3">
      <h2 class="flex items-center gap-1 text-base font-bold">
        <span class="inline-block h-3.5 w-1 rounded bg-primary" />
        {{ title }}
      </h2>
    </div>
    <div class="space-y-2 px-3 pb-3">
      <NuxtLink
        v-for="p in products"
        :key="p.slug"
        :to="localePath(`/product/${p.slug}`)"
        class="flex items-center gap-3 rounded-lg border border-gray-100 p-2 transition active:scale-[0.99]"
      >
        <NuxtImg
          :src="p.productAsset?.preview || '/images/placeholder.webp'"
          format="webp"
          loading="lazy"
          class="h-20 w-20 shrink-0 rounded bg-gray-100 object-cover"
          alt=""
        />
        <div class="min-w-0 flex-1">
          <p class="line-clamp-2 text-sm leading-5 text-gray-700">{{ p.productName }}</p>
          <div class="mt-1 flex items-center gap-2">
            <span class="text-lg font-bold text-primary">{{ price(p.priceWithTax, p.currencyCode) }}</span>
            <span class="rounded bg-primary/10 px-1 text-[10px] text-primary">自营</span>
          </div>
        </div>
        <span class="shrink-0 rounded bg-primary px-3 py-1.5 text-xs text-white">去购买</span>
      </NuxtLink>
    </div>
  </section>
</template>
```

- [ ] **Step 4: typecheck + dev 验证三态**

```bash
pnpm typecheck
pnpm dev
```

Expected: 手动将 `themeId` 切到 `taobao-orange`（DevTools 改 `<html data-theme>` 不影响取套，需在 channel 配置真正生效或临时在 useShopContent 打印确认），goods 区块按 masonry 双列大图渲染；切 `modern-minimal` 单列横卡；`jd-red` 紧凑卡复用 JdProductGrid。图片全部 webp + 固定尺寸。

- [ ] **Step 5: 提交**

```bash
git add layers/base/app/components/home/blocks/GoodsFloor.vue layers/base/app/components/home/blocks/GoodsMasonryGrid.vue layers/base/app/components/home/blocks/GoodsSingleList.vue
git commit -m "feat(nshop): goods 三态卡片（紧凑复用/淘宝瀑布流/极简单列）"
```

---

### Task 8: 配色 token 化（替换硬编码红）

**Files:**
- Modify: `app/pages/index.vue`（PC 右栏快讯 + 快捷入口）

- [ ] **Step 1: 替换硬编码 `#e6162d` 为 token**

`app/pages/index.vue` 中 PC 版（`lg:block`）仍保留，但把硬编码红替换为主题 token（`text-primary` / `bg-primary`），使配色跟随 `data-theme`：

| 行 | 现状 | 改为 |
|---|---|---|
| L101 | `text-[#e6162d]` | `text-primary` |
| L110 | `bg-[#e6162d]` | `bg-primary` |
| L113 | `bg-[#e6162d]` | `bg-primary` |
| L144 | `hover:text-[#e6162d]` | `hover:text-primary` |
| L146 | `bg-[#fdeaea] text-[#e6162d]` | `bg-primary/10 text-primary` |

> 改完后 `Grep` 确认 `app/` 下已无 `e6162d` 残留。

- [ ] **Step 2: 验证**

```bash
Grep: pattern "e6162d" path "d:\zhao\nshop\app"
pnpm typecheck
pnpm dev
```

Expected: `app/` 下无 `e6162d` 命中；切 `taobao-orange` 主题后 PC 快讯/快捷入口主色变为橙色。

- [ ] **Step 3: 提交**

```bash
git add app/pages/index.vue
git commit -m "refactor(nshop): 首页硬编码红色替换为主题 token（配色随 data-theme）"
```

---

## M3 · vshop 装修页 UI 扩展（用户 HBuilder X 手动构建）

> **执行者注意**：vshop 属 HBuilder X 环境，**禁止我执行构建/装依赖**。本里程碑我仅产出代码改动，由用户用 HBuilder X 编译验证。

### Task 9: 装修页风格切换 + nav/goods 样式控件

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\templates\shared\schema.ts`
- Modify: `d:\zhao\vshop\src\templates\shared\schema.ts`（C 端副本，同结构）
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\home\index.vue`

- [ ] **Step 1: schema 支持 byTheme + 新区块字段**

`web-admin\src\templates\shared\schema.ts` 与 `src\templates\shared\schema.ts` 同步修改：

```ts
export type NavShape = 'round' | 'square';
export type NavLayout = 'grid5x2' | 'grid4x2' | 'row';
export type GoodsLayout = 'compact' | 'masonry' | 'single';

export interface NavItem { label: string; icon?: string; image?: string; link?: string; }
export interface NavSection { type: 'nav'; items: NavItem[]; shape?: NavShape; layout?: NavLayout; }
export interface GoodsSection { type: 'goods'; title?: string; collectionId?: string; layout?: GoodsLayout; }
export interface ShopContent { version: number; theme?: ShopTheme; sections?: ShopSection[]; byTheme?: Record<string, { sections: ShopSection[] }>; }

export function isValidShopContent(data: any): data is ShopContent {
  if (!data || typeof data !== 'object') return false;
  if (data.version !== 1) return false;
  // 新老结构都合法
  if (data.byTheme && typeof data.byTheme === 'object') {
    for (const theme of Object.values(data.byTheme)) {
      if (!theme || !Array.isArray(theme.sections)) return false;
      for (const sec of theme.sections) {
        if (!isValidSection(sec)) return false;
      }
    }
    return true;
  }
  if (!Array.isArray(data.sections)) return false;
  for (const sec of data.sections) {
    if (!isValidSection(sec)) return false;
  }
  return true;
}

function isValidSection(sec: any): boolean {
  if (!sec || typeof sec !== 'object') return false;
  if (!VALID_TYPES.includes(sec.type)) return false;
  if (sec.type === 'banner' && (!Array.isArray(sec.images) || sec.images.length === 0)) return false;
  if (sec.type === 'notice' && typeof sec.text !== 'string') return false;
  if (sec.type === 'nav' && (!Array.isArray(sec.items) || sec.items.length === 0)) return false;
  if (sec.type === 'goods' && sec.collectionId != null && typeof sec.collectionId !== 'string') return false;
  if (sec.type === 'richText' && typeof sec.html !== 'string') return false;
  return true;
}
```

> 注意：`goods.collectionId` 从必填改为可选（`自动推荐`），校验放宽。

- [ ] **Step 2: 装修页顶部加风格切换**

`web-admin\src\pages\decorate\home\index.vue`：
- 新增状态 `activeTheme = ref<'default'|'jd-red'|'taobao-orange'|'modern-minimal'>('default')` 与顶部风格 Tab（京东/淘宝/极简）。
- 读取时：`parseShopContent(raw)` 后若为 `byTheme` 结构，`sections.value = byTheme[activeTheme]?.sections ?? []`；切换 Tab 时切换对应套（互不干扰，空套可新建）。
- 保存时（`updateChannelCustomFields(id, { shopContent })`）写 `{ version: 1, byTheme: { [activeTheme]: { sections } } }`，并保留老 `sections` 原样（零迁移）。

- [ ] **Step 3: nav / goods 区块加样式控件**

- nav 区块编辑区新增两行：
  - 图标形状：两个按钮「圆形 / 方形」→ `sec.shape`
  - 宫格排布：三个按钮「十宫格 / 八宫格 / 单行」→ `sec.layout`
  - 新建 nav 时按当前风格默认预填（京东 square/grid5x2、淘宝 round/grid4x2、极简 round/row）。
- goods 区块编辑区新增：
  - 卡片布局：三个按钮「紧凑 / 瀑布流 / 单列」→ `sec.layout`
  - 商品集合 ID 改为可留空（自动推荐）。
  - 每风格 goods 区块 ≤2 的 UI 提示（性能红线）。

- [ ] **Step 4: 用户 HBuilder X 编译验证**

由用户在 HBuilder X 打开 `web-admin` 工程编译运行，验证：切换风格 Tab 各自维护区块、保存后 `shopContent` 为 `byTheme` 结构、nav/goods 样式控件生效。（**我绝不执行构建**）

---

## M4 · 部署与性能验证

### Task 10: 本地构建 + 部署 + 性能前后对比

**Files:**
- nshop 全量改动（M1-M2 已提交）

- [ ] **Step 1: 全量构建验证**

```bash
pnpm build
```

Expected: 构建通过。用 `Select-String .output/server/chunks -Pattern "shop-content|GoodsMasonryGrid"`（或在 `.output` 产物里搜关键词）确认新逻辑已进产物。

- [ ] **Step 2: 部署（本地构建 → scp → pm2 restart，遵守部署铁律）**

```bash
node scripts/deploy.mjs
```

Expected: 本地 build → 上传 `.output/` → 服务器 `pm2 restart nshop`。部署后 `pm2 logs` 确认启动正常（服务器无任何构建命令）。

- [ ] **Step 3: 前台验证**

- 未配置装修的线上渠道首页与部署前一致（兜底生效）。
- 用户在 vshop 后台配置「京东/淘宝」两套区块（含金刚区形状、goods 布局）并保存后，线上 nshop 按当前 `themeId` 渲染对应套；切 `taobao-orange` 整套切换（金刚区圆形双排、为你推荐双列大图瀑布流）。

- [ ] **Step 4: 性能对比（设计 §5.2）**

Lighthouse 移动端改造前后各跑一次并记录：
- TTFB 增量 ≤30ms
- FCP / LCP 增量 ≤5%
- 首页请求数不增（channel 1 次 + 商品 ≤2 次）
- 首屏 HTML 增量 <10KB（shopContent 注入）
- 图片全部 webp + 固定尺寸，首屏外 lazy

超出阈值即回查（优先检查是否误新增商品查询 / 图片尺寸未裁剪）。

- [ ] **Step 5: 提交**

```bash
git add .output .nuxt  # 仅当仓库约定纳入构建产物；否则只提交源码改动（已在前序 Task 提交）
git commit -m "chore(nshop): 部署积木式装修（本地构建产物）"
```

> 提交前确认 `.gitignore` 规则（设计文档与既有约定：dist/.output 纳入跟踪，临时产物 `.superpowers/`/`_shots/` 不提交）。

---

## 验收清单（对照设计 §验收）

- [ ] 后台（vshop 装修页）能按风格（京东/淘宝/极简）分别加减区块、为金刚区/为你推荐选择样式并保存。
- [ ] 切 `themeId=taobao-orange`：整套切换为淘宝配置（金刚区默认圆形 + 双排宫格、为你推荐双列大图瀑布流）；若淘宝套未配金刚区则无金刚区。
- [ ] 京东风格金刚区默认方形；淘宝默认圆形；区块级选择可覆盖。
- [ ] 老数据（仅 sections）正常显示为京东风格（零迁移）。
- [ ] 未配置装修的租户首页与现在完全一致（兜底生效）。
- [ ] 首页 SSR 性能无感知下降（§5.2 阈值达标）。
- [ ] 图片全部 webp + 固定尺寸裁剪，首屏外懒加载，每风格 goods 区块 ≤2。
- [ ] nshop 本地构建通过并部署；vshop 由用户构建。

## 风险与开放项（延续设计文档）

- `SearchResult` 无销量/店铺字段，masonry 卡底行暂用「自营 + 站点名」；如需真实销量/店铺需另扩 query（后续项）。
- 风格切换驱动取套的 `themeId` 来自 channel customFields；DevTools 手改 `<html data-theme>` 只改配色不改取套（取套看 channel 配置，天然同源不错配）。
- vshop C 端是否也消费 `byTheme` 结构不在本计划（仅 nshop 消费；C 端 schema 已兼容新字段，零影响）。
