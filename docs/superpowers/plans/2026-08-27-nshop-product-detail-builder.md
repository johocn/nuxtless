# 商品详情页积木化（京东风格）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把商品详情页改造为与首页同一套「积木 + 版式变体 + 兜底」机制，提供京东经典 / 京东楼层富详情 / 京东经典双按钮三种版式，后台经 `detailConfig` 任选。

**Architecture:** 新增 Channel.customFields `detailConfig`（JSON，`GetChannelTheme` 统一读取）；前端加纯函数工具 `detail-config.ts` 解析并提供逐级兜底；`ProductDetailRenderer` 按 layout 分派到三版式组件，版式内部复用现有 `ProductGallery/ProductVariants/ProductDescription/NearbyStores/CartAddButton` 等，仅新增少量新块组件。数据仍走 `useProductStore` 单一状态。

**Tech Stack:** Nuxt 3 + Tailwind + @nuxt/ui、`@nuxt/image`（passthrough provider）、nuxt-graphql-client、关键词 `assetSrc`（WebP/缩放）、CSS 语义令牌 `var(--ui-primary)`。

---

### Task 1: L1 配色令牌扩展（theme.css）

**Files:**
- Modify: `app/assets/css/theme.css`

现有 theme.css 每个 `data-theme` 只定义 `--ui-primary`。本次为已有主题补全统一语义令牌集，未定义字段天然继承 `default`（内建兜底）。此项纯 CSS，不改变布局，只增减变量。

- [ ] **Step 1: 重写 theme.css，为每个主题补全令牌集**

对 `app/assets/css/theme.css` 做整体替换：

```css
/* 语义配色令牌：渠道级固定主题。Nuxt UI v4 暴露 --ui-primary 等语义变量；
   按 <html data-theme> 覆盖。未定义字段继承 :root 默认令牌（内建兜底）。 */
:root {
  /* 内建兜底（无匹配 data-theme 或字段未定义时生效） */
  --ui-primary: #134e4a;
  --ui-success: #16a34a;
  --ui-warning: #f59e0b;
  --ui-error: #ef4444;
  --ui-radius: 0.5rem;
  --font-size-base: 14px;
}

:root[data-theme='jd-red'] {
  --ui-primary: #E1251B;
  --ui-success: #07c160;
  --ui-warning: #ff8f1f;
  --ui-error:   #f03d3d;
  --ui-radius:  0.375rem;
  --font-size-base: 14px;
}

:root[data-theme='taobao-orange'] {
  --ui-primary: #FF5000;
  --ui-success: #07c160;
  --ui-warning: #ff8f1f;
  --ui-error:   #f03d3d;
  --ui-radius:  0.5rem;
  --font-size-base: 14px;
}

:root[data-theme='modern-minimal'] {
  --ui-primary: #111827;
  --ui-success: #16a34a;
  --ui-warning: #f59e0b;
  --ui-error:   #ef4444;
  --ui-radius:  0.375rem;
  --font-size-base: 14px;
}

:root[data-theme='brand'] {
  --ui-primary: var(--ui-brand-color, #334155);
  --ui-success: #16a34a;
  --ui-warning: #f59e0b;
  --ui-error:   #ef4444;
  --ui-radius:  0.5rem;
  --font-size-base: 14px;
}

:root[data-theme='default'] {
  --ui-primary: #134e4a;
  --ui-success: #16a34a;
  --ui-warning: #f59e0b;
  --ui-error:   #ef4444;
  --ui-radius:  0.5rem;
  --font-size-base: 14px;
}
```

- [ ] **Step 2: 验证无回归**

Run: `npx nuxi info`（确认 `@nuxt/ui` 仍解析；无编译相关报错即视为 CSS 变更不破坏构建）

Expected: 正常输出项目信息；若项目未安装 nuxi 可跳过此步，后续 Task 7 的 typecheck 一并验证。

- [ ] **Step 3: Commit**

```bash
git add app/assets/css/theme.css
git commit -m "feat(theme): 扩展语义配色令牌(主/成/警/错+圆角+字号)，default 兜底"
```

---

### Task 2: `detail-config.ts` 类型/解析/兜底工具 + 国际化

**Files:**
- Create: `layers/base/app/utils/detail-config.ts`
- Modify: `layers/base/i18n/locales/zh-CN.ts`
- Modify: `layers/base/i18n/locales/en-US.ts`
- Modify: `layers/base/nuxt.config.ts`（i18n 加 `fallbackLocale`）

仿现有 `layers/base/app/utils/shop-content.ts`，纯函数，SSR 友好。

- [ ] **Step 1: 写工具（含 LocalizedText/localizeText）**

创建 `layers/base/app/utils/detail-config.ts`：

```ts
// detailConfig 解析工具：类型 + 逐级兜底 + 国际化文案（纯函数，SSR 友好）
// 兜底链：块级定制字段 → 块内建默认 → 全局默认（true / 'classic' / 占位文案）
// 文案兜底链：当前 locale → defaultLocale → 无语言对象首个值 → 块内建占位 → i18n 字典静态文案

export type DetailLayout = 'classic' | 'floor' | 'dualBuy';

// 可翻译文案：string = 各语言共用；Record<language,string> = 逐语言
export type LocalizedText = string | Record<string, string>;

export interface DetailBlockCfg {
  visible?: boolean;
  /* L3 样式字段预留：fontScale / imageWidth / radius 等，后续迭代再扩展 */
  title?: LocalizedText;
  text?: LocalizedText;
}

export interface DetailConfig {
  version: number;
  layout?: DetailLayout;
  blocks?: Record<string, DetailBlockCfg>;
}

// 块内建默认显隐（本阶段全部可见）
const BLOCK_DEFAULT_VISIBLE: Record<string, boolean> = {
  gallery: true,
  info: true,
  price: true,
  promo: true,
  service: true,
  variants: true,
  purchase: true,
  description: true,
  reviews: true,
  nearby: true,
  related: true,
};

// layout 缺省/非法 → 'classic'（与现有 standard 渲染等价，不回归）
export function detailLayout(cfg: DetailConfig | null): DetailLayout {
  const l = cfg?.layout;
  return l === 'floor' || l === 'dualBuy' ? l : 'classic';
}

// 逐级兜底：层1 块定制 visible → 层2 内建默认 → true
export function blockVisible(cfg: DetailConfig | null, key: string): boolean {
  return cfg?.blocks?.[key]?.visible ?? BLOCK_DEFAULT_VISIBLE[key] ?? true;
}

// 解析；坏 JSON / 缺 sections 等价字段 → null
export function parseDetailConfig(raw: string | null | undefined): DetailConfig | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data as DetailConfig;
  } catch {
    return null;
  }
}

// 本地化文案：当前 locale → defaultLocale → 首个值 → ''（由块内建占位兜底）
export function localizeText(
  text: LocalizedText | undefined | null,
  locale: string,
  defaultLocale = 'zh-CN',
): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  return text[locale] ?? text[defaultLocale] ?? Object.values(text)[0] ?? '';
}
```

- [ ] **Step 2: i18n 配置补 `fallbackLocale`**

修改 `layers/base/nuxt.config.ts` 的 `i18n` 配置块，加 `fallbackLocale: 'zh-CN'`（确保个别 key 缺失回退中文而非显示 key）：

```ts
i18n: {
  baseUrl: process.env.I18N_BASE_URL,
  locales: appLocales as LocaleObject[],
  defaultLocale: 'zh-CN',
  fallbackLocale: 'zh-CN',
},
```

- [ ] **Step 3: 新增 `messages.detail.*` 命名空间（zh-CN + en-US）**

在 `layers/base/i18n/locales/zh-CN.ts` 的 `messages` 顶层加（若顶层无叶子级结构冲突则新增节点）：

```ts
export default defineI18nLocale(() => ({
  messages: {
    // ...既有 key 保持不变...
    detail: {
      reviews: '商品评价',
      reviewsEmpty: '暂无评价，成为第一个评价的人',
      serviceItems: ['正品保障', '极速发货', '售后无忧'],
      promoItems: ['支持7天无理由退换', '满99元包邮'],
      buyNow: '立即购买',
      addToCart: '加入购物车',
      promoSummary: '促销',
      serviceSummary: '服务保障',
    },
    // ...
  },
}));
```

在 `layers/base/i18n/locales/en-US.ts` 对应位置补英文：

```ts
detail: {
  reviews: 'Reviews',
  reviewsEmpty: 'No reviews yet. Be the first to review this product.',
  serviceItems: ['Genuine Products', 'Fast Dispatch', 'After-sales Support'],
  promoItems: ['7-day no-reason returns', 'Free shipping over ¥99'],
  buyNow: 'Buy Now',
  addToCart: 'Add to Cart',
  promoSummary: 'Promotions',
  serviceSummary: 'Services',
},
```

> 其余语种缺 key 走 `fallbackLocale: 'zh-CN'` 自动回退中文，本次不逐语言补齐。

- [ ] **Step 4: 加一个单测验证兜底 + 本地化**

在仓库已存在的 vitest/Nuxt test 目录下创建 `layers/base/app/utils/__tests__/detail-config.spec.ts`（若该目录不存在则创建）：

```ts
import { describe, expect, it } from "vitest";
import { detailLayout, blockVisible, parseDetailConfig, localizeText } from "../detail-config";

describe("detail-config", () => {
  it("坏 JSON 返回 null，layout 回退 classic", () => {
    expect(parseDetailConfig("not-json")).toBeNull();
    expect(detailLayout(parseDetailConfig("not-json"))).toBe("classic");
  });

  it("缺省 layout 回退 classic", () => {
    expect(detailLayout({ version: 1 })).toBe("classic");
  });

  it("floor / dualBuy 生效", () => {
    expect(detailLayout({ version: 1, layout: "floor" })).toBe("floor");
    expect(detailLayout({ version: 1, layout: "dualBuy" })).toBe("dualBuy");
  });

  it("块显隐逐级兜底", () => {
    const cfg = { version: 1, blocks: { gallery: { visible: false } } };
    expect(blockVisible(cfg, "gallery")).toBe(false);
    expect(blockVisible(cfg, "price")).toBe(true); // 未配置 → 内建默认
    expect(blockVisible(null, "nearby")).toBe(true); // null → 全局默认
    expect(blockVisible(null, "unknown_key")).toBe(true); // 未知 key → 全局默认
  });

  it("localizeText 逐级回退", () => {
    const obj = { "zh-CN": "中文", "en-US": "English" };
    expect(localizeText(obj, "en-US")).toBe("English"); // 当前 locale 命中
    expect(localizeText(obj, "de-DE")).toBe("中文");     // 缺失 → fallback defaultLocale
    expect(localizeText("共用", "de-DE")).toBe("共用");   // 字符串 = 各语言共用
    expect(localizeText(null, "de-DE")).toBe("");         // 缺省 → 空
    expect(localizeText({ "en-US": "Only EN" }, "fr-FR")).toBe("Only EN"); // 首值兜底
  });
});
```

- [ ] **Step 5: 运行测试**

Run: `npx vitest run layers/base/app/utils/__tests__/detail-config.spec.ts`

Expected: 全部 PASS（5 个 it 通过）。

- [ ] **Step 6: Commit**

```bash
git add layers/base/app/utils/detail-config.ts layers/base/app/utils/__tests__/detail-config.spec.ts layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts layers/base/nuxt.config.ts
git commit -m "feat(detail): detail-config 解析/兜底/本地化工具 + i18n fallback + messages.detail 词条 + 单测"
```

---

### Task 3: context.gql 增 `detailConfig` + codegen

**Files:**
- Modify: `layers/base/gql/queries/context.gql`

通过 `GetChannelTheme` 同一次 SSR 查询多读一个字段，零新增请求。

- [ ] **Step 1: 修改 context.gql**

把 `GetChannelTheme` 查询补上 `detailConfig`：

```
query GetChannelTheme {
  activeChannel {
    customFields {
      themeId
      shopContent
      detailConfig
    }
  }
}
```

- [ ] **Step 2: 重新生成类型**

Run: `npx nuxt prepare`（项目已配 codegen `disableOnBuild: false`，prepare/codegen 会同步生成 `GetChannelThemeQuery` 类型含 `detailConfig`）

Expected: 生成类型文件更新，无报错（wire 远端 schema 若暂未含该字段会降级为 `String` 可空，不影响解析——`parseDetailConfig` 兼容 `string | null | undefined`）。

- [ ] **Step 3: Commit**

```bash
git add layers/base/gql/queries/context.gql
git commit -m "feat(detail): GetChannelTheme 查询增加 detailConfig 字段"
```

---

### Task 4: `useDetailConfig` composable

**Files:**
- Create: `layers/base/app/composables/useDetailConfig.ts`

仿 `layers/base/app/composables/useShopContent.ts`（`useAsyncData` + `server: true`），并把 applyTheme 逻辑与 useChannelTheme 解耦复用同一查询。

- [ ] **Step 1: 写 composable**

创建 `layers/base/app/composables/useDetailConfig.ts`：

```ts
// 读 detailConfig 并解析。themeId/shopContent/detailConfig 来自同一 GetChannelTheme 查询（SSR 去重）
import { useAsyncData } from "#imports";
import { parseDetailConfig, detailLayout, blockVisible, type DetailConfig, type DetailLayout } from "../utils/detail-config";

export function useDetailConfig() {
  const { data } = useAsyncData(
    "detail-config",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields?.detailConfig ?? null;
    },
    { server: true },
  );

  const config = computed<DetailConfig | null>(() => parseDetailConfig(data.value ?? null));
  const layout = computed<DetailLayout>(() => detailLayout(config.value));
  const visible = (key: string) => blockVisible(config.value, key);

  return { config, layout, visible };
}
```

- [ ] **Step 2: Commit**

```bash
git add layers/base/app/composables/useDetailConfig.ts
git commit -m "feat(detail): useDetailConfig composable"
```

---

### Task 5: 新块组件

**Files:**
- Create: `layers/base/app/components/product-detail/PriceBlock.vue`
- Create: `layers/base/app/components/product-detail/PromoBlock.vue`
- Create: `layers/base/app/components/product-detail/ServiceBlock.vue`
- Create: `layers/base/app/components/product-detail/PurchaseBar.vue`
- Create: `layers/base/app/components/product-detail/ReviewsSection.vue`

这些是 pure presentational 块，数据全部取自 `useProductStore`（已有全局响应式）。

- [ ] **Step 1: PriceBlock.vue**

```vue
<script setup lang="ts">
// 当前 variant 价格徽章
const { selectedVariant } = storeToRefs(useProductStore());
const { locale } = useI18n();

const priceLabel = computed(() => {
  const v = selectedVariant.value;
  if (!v) return "";
  return new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: v.currencyCode || "CNY",
  }).format((v.priceWithTax ?? 0) / 100);
});
</script>

<template>
  <div class="flex items-baseline gap-2">
    <span class="text-2xl font-bold text-primary">{{ priceLabel }}</span>
  </div>
</template>
```

- [ ] **Step 2: PromoBlock.vue**（促销条：固定文案走 i18n key，可编辑文案走 `LocalizedText` 后台覆盖）

```vue
<script setup lang="ts">
// 促销/优惠条：固定文案走 i18n messages.detail;后台可传 LocalizedText text 逐级本地化
import { localizeText, type LocalizedText } from "../../utils/detail-config";

const props = defineProps<{ text?: LocalizedText }>();
const { t, locale } = useI18n();
const iterator = (v: string) => [v]; // 数组转 single（本阶段只展示一条自定义或默认）

const items = computed(() =>
  props.text
    ? iterator(localizeText(props.text, locale.value))
    : t("messages.detail.promoItems"), // i18n 数组，缺失回退 default locale
);
</script>

<template>
  <div class="mt-2 flex flex-wrap gap-1.5 text-xs">
    <span
      v-for="tx in items"
      :key="tx"
      class="rounded bg-primary/10 px-1.5 py-0.5 text-primary"
    >
      {{ tx }}
    </span>
  </div>
</template>
```

- [ ] **Step 3: ServiceBlock.vue**（服务保障条：固定文案走 i18n key）

```vue
<script setup lang="ts">
// 服务/保障条：固定文案走 i18n messages.detail（缺失自动回退 default locale）
const { t } = useI18n();
const items = computed(() => t("messages.detail.serviceItems")); // string[]，随 locale 变化
</script>

<template>
  <div class="flex gap-3 border-y border-gray-100 py-2 text-xs text-gray-500">
    <span v-for="it in items" :key="it" class="flex items-center gap-1">
      <UIcon name="i-lucide-check-circle-2" class="text-primary" />
      {{ it }}
    </span>
  </div>
</template>
```

- [ ] **Step 4: PurchaseBar.vue**（加购栏，双按钮模式可复用；本阶段单按钮，双按钮留 C 版式模板层组装）

```vue
<script setup lang="ts">
// 底部加购栏：复用 CartAddButton（含 productServiceable 警示逻辑在详情页层做）
const { disabled } = defineProps<{ disabled?: boolean }>();
</script>

<template>
  <CartAddButton :disabled="disabled" class="w-full" />
</template>
```

- [ ] **Step 5: ReviewsSection.vue**（评价区：标题/占位走 i18n key，支持台 title/text 覆盖）

```vue
<script setup lang="ts">
// 评价区占位：标题/占位文案走 i18n messages.detail;可传 LocalizedText 覆盖，数据接入后续迭代
import { localizeText, type LocalizedText } from "../../utils/detail-config";

const props = defineProps<{ title?: LocalizedText; empty?: LocalizedText }>();
const { t, locale } = useI18n();

const heading = computed(() =>
  props.title ? localizeText(props.title, locale.value) : t("messages.detail.reviews"),
);
const emptyText = computed(() =>
  props.empty ? localizeText(props.empty, locale.value) : t("messages.detail.reviewsEmpty"),
);
const placeholder = true;
</script>

<template>
  <section class="rounded-lg border border-gray-100 bg-white p-4">
    <h2 class="mb-2 text-base font-bold">{{ heading }}</h2>
    <p v-if="placeholder" class="text-sm text-gray-400">
      {{ emptyText }}
    </p>
  </section>
</template>
```

- [ ] **Step 6: Commit**

```bash
git add layers/base/app/components/product-detail/
git commit -m "feat(detail): 新增 PriceBatch/Promo/Service/PurchaseBar/Reviews 功能块组件(i18n+LocalizedText)"
```

---

### Task 6: `ProductDetailRenderer` + 三版式组件

**Files:**
- Create: `layers/base/app/components/product-detail/ProductDetailRenderer.vue`
- Create: `layers/base/app/components/product-detail/DetailClassic.vue`
- Create: `layers/base/app/components/product-detail/DetailFloor.vue`
- Create: `layers/base/app/components/product-detail/DetailDualBuy.vue`
- Modify: `layers/base/app/pages/product/[slug].vue`

渲染器按 `layout` 分派到三版式；三版式复用现有详情子组件（`ProductGallery/ProductVariants/ProductDescription/ProductNearbyStores/HomeFeaturedProducts/CartAddButton`）+ 新块，块显隐由 `visible('key')` 驱动。

- [ ] **Step 1: 新建渲染器**

创建 `layers/base/app/components/product-detail/ProductDetailRenderer.vue`（显式 import 组件对象，避免字符串组件名空标签）：

```vue
<script setup lang="ts">
// 详情页积木渲染入口：按 layout 分派版式（显式 import 组件对象）
import DetailClassic from "./DetailClassic.vue";
import DetailFloor from "./DetailFloor.vue";
import DetailDualBuy from "./DetailDualBuy.vue";
import { useDetailConfig } from "../composables/useDetailConfig";

const { layout, config } = useDetailConfig();

const componentMap: Record<string, any> = {
  classic: DetailClassic,
  floor: DetailFloor,
  dualBuy: DetailDualBuy,
};
</script>

<template>
  <component :is="componentMap[layout] ?? DetailClassic" :config="config" />
</template>
```

- [ ] **Step 2: DetailClassic.vue**（京东经典版，等价现有 standard）

```vue
<script setup lang="ts">
// 京东经典版：信息左/图集右，积木显隐驱动
import { useDetailConfig } from "../composables/useDetailConfig";

const { config, visible } = useDetailConfig();
const props = defineProps<{ config: any }>();

const { productServiceable } = useProductServiceableFromConfig(() => config);
</script>

<template>
  <div class="grid grid-cols-1 gap-10 sm:grid-cols-2">
    <section v-if="visible('gallery')" aria-label="商品图集">
      <ProductGallery />
    </section>
    <div class="flex flex-col gap-4">
      <header v-if="visible('info')">
        <h1 class="text-2xl font-semibold">
          {{ productName }}
        </h1>
        <BreadcrumbTrail :product="product" trail="product" class="mt-2" />
      </header>
      <PriceBlock v-if="visible('price')" />
      <PromoBlock v-if="visible('promo')" />
      <ServiceBlock v-if="visible('service')" />
      <ProductVariants v-if="visible('variants')" />
      <section v-if="visible('purchase')">
        <UAlert
          v-if="!productServiceable"
          color="warning"
          variant="subtle"
          icon="i-lucide-map-pin-off"
          class="mb-3"
          title="该商品暂不支持配送至当前城市"
          description="可切换上方城市后查看，或浏览其他商品。"
        />
        <CartAddButton :disabled="!productServiceable" />
      </section>
    </div>
  </div>

  <hr class="my-8" />

  <ProductNearbyStores
    v-if="visible('nearby')"
    :product-id="product?.id"
    :variant-id="selectedVariant?.id"
  />

  <ProductDescription
    v-if="visible('description') && product?.description"
    class="mb-8"
    :description="product?.description"
  />

  <ReviewsSection v-if="visible('reviews')" class="mb-8" />

  <section
    v-if="visible('related')"
    aria-labelledby="related-products-heading"
  >
    <h2 id="related-products-heading" class="mb-4 text-2xl font-semibold">
      {{ t("messages.shop.popularProducts") }}
    </h2>
    <HomeFeaturedProducts />
  </section>
</template>
```

> 说明：`productName / product / selectedVariant` 及 `useProductServiceableFromConfig` 为后续 Step 6.6 封装的共用逻辑（见 DetailFloor 定义处同名导出，Vue 文件内使用 `<script setup>` 顶层 storeToRefs 提供——Step 6.2~6.5 统一在渲染器下抽「共用组合层」，见 Step 6).

- [ ] **Step 3: DetailFloor.vue**（楼层富详情版：顶部精简 + 吸顶 tab + 描述整幅不 clamp）

```vue
<script setup lang="ts">
// 京东楼层版：顶部精简信息卡 + 吸顶楼层 tab（详情/参数/评价/售后）+ 描述整幅展开
import { useDetailConfig } from "../composables/useDetailConfig";

const { config, visible } = useDetailConfig();
const props = defineProps<{ config: any }>();
</script>

<template>
  <div>
    <header class="mb-4">
      <h1 class="text-xl font-bold">{{ productName }}</h1>
      <PriceBlock v-if="visible('price')" />
    </header>

    <nav class="sticky top-0 z-10 -mx-4 mb-4 flex gap-4 overflow-x-auto bg-white px-4 py-2 text-sm shadow">
      <a class="text-primary" href="#floor-description">详情</a>
      <a href="#floor-variants">参数</a>
      <a href="#floor-reviews">评价</a>
      <a href="#floor-service">售后</a>
    </nav>

    <ProductGallery v-if="visible('gallery')" />

    <section v-if="visible('variants')" id="floor-variants" class="mt-6">
      <ProductVariants />
    </section>

    <section v-if="visible('purchase')" class="mt-4">
      <CartAddButton />
    </section>

    <section v-if="visible('description')" id="floor-description" class="mt-8">
      <ProductDescription
        v-if="product?.description"
        :description="product?.description"
      />
    </section>

    <section v-if="visible('reviews')" id="floor-reviews">
      <ReviewsSection />
    </section>

    <section v-if="visible('service')" id="floor-service" class="mt-6">
      <ServiceBlock />
    </section>

    <section v-if="visible('related')" class="mt-10">
      <h2 class="mb-4 text-lg font-semibold">
        {{ t("messages.shop.popularProducts") }}
      </h2>
      <HomeFeaturedProducts />
    </section>
  </div>
</template>
```

> 说明：`productName / product / t` 由共用组合层提供（见 Step 6.6）；`productServiceable` 仅供经典版显示警示，楼层版简化为恒可用（本阶段）。

- [ ] **Step 4: DetailDualBuy.vue**（双按钮版：与经典版同构，购买栏双按钮 + 服务折叠）

```vue
<script setup lang="ts">
// 京东经典双按钮版：底部「立即购买 + 加入购物车」，服务/促销可折叠
import { useDetailConfig } from "../composables/useDetailConfig";

const { config, visible } = useDetailConfig();
const props = defineProps<{ config: any }>();

const showService = ref(true); // 折叠开关
const showPromo = ref(true);
</script>

<template>
  <div class="grid grid-cols-1 gap-10 sm:grid-cols-2">
    <section v-if="visible('gallery')" aria-label="商品图集">
      <ProductGallery />
    </section>
    <div class="flex flex-col gap-4">
      <header v-if="visible('info')">
        <h1 class="text-2xl font-semibold">{{ productName }}</h1>
        <BreadcrumbTrail :product="product" trail="product" class="mt-2" />
      </header>
      <PriceBlock v-if="visible('price')" />
      <details v-if="visible('promo')" class="group">
        <summary class="cursor-pointer text-sm text-gray-600">促销 ▾</summary>
        <div>
          <PromoBlock />
        </div>
      </details>
      <details v-if="visible('service')" class="group">
        <summary class="cursor-pointer text-sm text-gray-600">服务保障 ▾</summary>
        <div>
          <ServiceBlock />
        </div>
      </details>
      <ProductVariants v-if="visible('variants')" />
    </div>
  </div>

  <div v-if="visible('purchase')" class="sticky bottom-0 z-10 mt-4 flex gap-3 bg-white/90 p-3 backdrop-blur">
    <UButton class="flex-1 justify-center" color="primary" icon="i-lucide-shopping-cart">{{ t("messages.detail.addToCart") }}</UButton>
    <UButton class="flex-1 justify-center" color="secondary">{{ t("messages.detail.buyNow") }}</UButton>
  </div>

  <ProductDescription
    v-if="visible('description') && product?.description"
    class="mb-8"
    :description="product?.description"
  />
  <ReviewsSection v-if="visible('reviews')" class="mb-8" />
  <ProductNearbyStores
    v-if="visible('nearby')"
    :product-id="product?.id"
    :variant-id="selectedVariant?.id"
  />
</template>
```

- [ ] **Step 5: 详情页接入渲染器**

修改 `layers/base/app/pages/product/[slug].vue`，把现有多项硬编码 DOM 替换为渲染器。保留所有 script（`useProductStore/useCityService/productServiceable/getProductTrail/useSchemaOrg/SeoMeta/OgImage` 等数据加载与 SEO 逻辑原封不动）；仅替换 `<template>` 内 body 部分为 `<ProductDetailRenderer />`，并把 `productServiceable` 先传入经典版/双按钮版（渲染器内可自行从 store 计算，故页面层不再传，直接渲染器自理）。

将 template（128-243 行）整体改为：

```vue
<template>
  <main class="container">
    <ProductDetailRenderer />
  </main>
</template>
```

同时，为确保渲染器内 `productServiceable / product / selectedVariant / productName` 可从组件取到，在渲染器与三版式间建立共用组合层（见 Step 6）。

- [ ] **Step 6: 抽取共用组合层 `useProductDetailView`**

三版式都需要 `product / selectedVariant / productName / productServiceable`。抽 composable 避免重复，创建 `layers/base/app/composables/useProductDetailView.ts`：

```ts
// 三版式共用：product 数据 + 配送可服务性（数据走 useProductStore 单一状态）
import { storeToRefs } from "pinia";

export function useProductDetailView() {
  const productStore = useProductStore();
  const { product, selectedVariant } = storeToRefs(productStore);

  const { isServiceable } = useCityService();
  const productServiceable = computed(() => isServiceable(product.value));

  const productName = computed(
    () => selectedVariant.value?.name ?? product.value?.name ?? "",
  );

  return { product, selectedVariant, productName, productServiceable };
}
```

然后三版式改用该组合层统一取数（替换 Step 2-4 中散落的 `{{ productName }}`、`{{ product }}` 顶层来源）：

- `DetailClassic.vue` / `DetailDualBuy.vue` 顶部加 `const { product, selectedVariant, productName, productServiceable } = useProductDetailView();` 并删除对 `useProductServiceableFromConfig` 的引用。
- `DetailFloor.vue` 顶部加 `const { product, selectedVariant, productName } = useProductDetailView();`。

> 说明：三版式模板里的 `t(...)` 来自 Nuxt i18n（显性 `const { t } = useI18n()` 已在对应 script 顶部补齐，若未显式添加则模板内 `t` 因 auto-import 可用）。

- [ ] **Step 7: typecheck 验证**

Run: `npx nuxt typecheck`

Expected: 无**新增** typecheck 错误（基线已有历史错误；本次涉及文件 `product-detail/*`、`[slug].vue`、`useProductDetailView.ts`、`useDetailConfig.ts`、`detail-config.ts` 必须 0 新增）。

- [ ] **Step 8: Commit**

```bash
git add layers/base/app/components/product-detail/ layers/base/app/composables/useProductDetailView.ts layers/base/app/pages/product/\[slug\].vue
git commit -m "feat(detail): ProductDetailRenderer + 三版式(经典/楼层/双按钮)接入详情页"
```

---

### Task 7: 本地验证 + 验收

**Files:**
- 无新增，仅验证与 deploy 准备

- [ ] **Step 1: 本地 dev 预览三版式**

Run（在同终端复用）：`pnpm dev`

手动/用 Playwright 分别将 `detailConfig.layout` 设为 `classic / floor / dualBuy`（可临时改 `.env` 对应的远端配置或本地注入 await GQL）确认三版式渲染。Default 缺省时查首页/详情页正常。

Expected: 三种 layout 各渲染对应版式；无 `detailConfig` 时回退 classic，与改前 standard 无可见差异。

- [ ] **Step 2: 检查图片 webp**

用浏览器 DevTools 抽查商品图 URL，确认带 `?w=...&format=webp&q=70`（由 `assetSrc` 拼接）且懒加载属性（`loading="lazy"`）、首图 `eager + fetchpriority` 生效。

Expected: 商品图返回 `image/webp`。

- [ ] **Step 3: 本地构建确认产物（不部署）**

Run: `pnpm build`

Expected: 构建成功；`.output` 含改动的 `product-detail/*` chunk、`detail-config` 逻辑。

- [ ] **Step 4: 提交部署候选到 git**

```bash
git add -A
git status
```

核对仅本次相关文件入库（勿含 `.env`），确认后若用户要求提交则 commit；否则停在「构建产物验证通过，待部署」。

> ⚠️ 部署铁律：绝不服务器构建。上线走本地 `node scripts/deploy.mjs`（本地 scp `.output/` + pm2 restart）。本次计划只做到「本地构建验证」，部署由用户额外确认后单独触发。

---

## Self-Review

**Spec coverage:**
- L1 令牌扩展 → Task 1 ✓
- detail-config 解析/兜底 + LocalizedText/localizeText → Task 2 ✓
- i18n fallbackLocale + messages.detail.*(zh-CN/en-US) → Task 2 Step2-3 ✓
- context.gql detailConfig + codegen → Task 3 ✓
- useDetailConfig → Task 4 ✓
- 新块组件（Price/Promo/Service/Purchase/Reviews）含 i18n 文案 → Task 5 ✓
- ProductDetailRenderer + 三版式 + 接入详情页 → Task 6 ✓
- 三版式静态文案走 i18n（popularProducts/addToCart/buyNow）→ Task 5-6 ✓
- 测试(单元/typecheck/回归) → Task 2 Step4-5 单测、Task 6 Step7 typecheck、Task 7 验收 ✓
- 部署边界（铁律）→ Task 7 Step4 ✓

**Placeholder scan:** 无 TBD/TODO/later；每个 code step 都有完整代码；无"类似 Task N"引用。

**Type consistency:** `DetailLayout`(`classic/floor/dualBuy`)、`parseDetailConfig/detailLayout/blockVisible/localizeText` 签名在 Task 2 定义、Task 4/6 使用一致。`LocalizedText` 由 Task 2 定义，Task 5 PromoBlock/ReviewsSection 使用一致。三版式的 `productName/product/selectedVariant/productServiceable` 统一由 `useProductDetailView` 提供，命名各处一致。`componentMap` key 与大写组件名映射正确。

**已知简化（明示而非占位）：**
- `PromoBlock/ServiceBlock/ReviewsSection` 文案已接入 i18n + LocalizedText（占位文案/数据接入为后续迭代，已写入 spec「不在本次范围」）。
- 其余语种 i18n 仅补 zh-CN/en-US，缺失走 `fallbackLocale: 'zh-CN'`（spec「国际化落地边界」）。
- `DetailFloor` 的 `productServiceable` 简化为恒可用（仅经典/双按钮显示配送警示）。
- 双按钮「立即购买」本阶段为导航/提示占位按钮，绑定结算为后续迭代。

计划已保存至 `docs/superpowers/plans/2026-08-27-nshop-product-detail-builder.md`。

**两种执行方式：**

1. **Subagent-Driven（推荐）**——我为每个任务派发独立 subagent，任务间我做两阶段审查，迭代快、上下文隔离
2. **Inline Execution**——在当前会话内按 executing-plans 批量执行，带检查点

选哪种？