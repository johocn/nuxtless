# 商品详情页六项修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 nshop C 端商品详情页 6 个问题（多图显示不全、促销方案后台配置、就近库存无城市兜底、营销标签角标、面包屑分类层级错误、底部导航栏变形），不改变现有风格/颜色/组件模块，仅调整数据链路与文字布局。

**Architecture:** 前端（nshop Nuxt 层 `layers/base`）负责画廊缩略图横滑、`n/m` 角标、营销标签角标、促销/服务「商品→频道→i18n」回退链、就近库存城市兜底、面包屑取首个顶级分类、底栏精简；后端（vendure）在 `Product` 与 `Channel` customFields 注册促销/服务字段（方案库走 Channel，商品只存 code 数组）；web-admin（vshop/web-admin，uni-app）提供频道方案库编辑与商品多选。三版式渲染器（classic/floor/dualBuy）与 DetailConfig 结构不动。

**Tech Stack:** Nuxt 3 + Vue 3 + Pinia + Nuxt UI + nuxt-graphql-client（nshop）；Vendure（后端 customFields）；uni-app Vue 3 + GraphQL（web-admin）；vitest（单测）；Playwright（手机视口回归截图 390×844 dpr=2）。

**关键约束（先读再动手）：**
- gql 文件改动后需触发 nuxt-graphql-client 重新生成类型：跑一次 `pnpm dev`（或 `pnpm build`），`.nuxt/gql/default` 类型随之更新；不重新生成则 `product.customFields.promos` 等类型不可用、build 报错。
- 项目存在 **12 个**语言包（`bg-BG de-DE en-US es-ES fa-IR fr-FR it-IT ja-JP ko-KR pt-BR ru-RU zh-CN`），新增词条必须全部同步补充，禁止只写单一语言。
- `messages.nav.back` 不存在（现有 `back` 在 `messages.general.back`），必须新增到 `messages.nav`。
- i18n 数组文案（promoItems/serviceItems/marketingTags）必须用 `tm()` 取，`t()` 对数组返回原 key。
- 前端 locale 与 Vendure `LanguageCode` 枚举不同名（`zh-CN` ↔ `zh_Hans`），方案库文案解析必须走 `VENDURE_LOCALE_MAP` 映射，否则多语言回退英文。
- 部署铁律：本地构建，服务器只解压 / `pm2 restart`，绝不在服务器构建。vendure 走 `git pull` + `pm2 restart`；nshop 走 `pnpm deploy`（= `node scripts/deploy.mjs`）；web-admin 本地 `pnpm build:h5` 后上传 `dist/build/h5`。

---

## 文件结构（本次改动总览）

**nshop（C 端）：**
- Modify `layers/base/app/components/product/ProductGallery.vue` — 缩略图条可横滑 + `n/m` 角标 + 营销标签角标
- Modify `layers/base/app/components/product/NearbyStores.vue` — 无坐标有城市时按城市兜底查询
- Modify `layers/base/app/components/product-detail/PromoBlock.vue` — 促销回退链（商品→频道→i18n）
- Modify `layers/base/app/components/product-detail/ServiceBlock.vue` — 服务回退链（商品→频道→i18n）
- Modify `layers/base/app/components/product-detail/ProductDetailBottomBar.vue` — 底栏精简为 返回/首页 + 双按钮
- Modify `layers/base/app/composables/useDetailConfig.ts` — 扩展返回 promoSchemes/serviceSchemes
- Modify `layers/base/app/composables/useProductLightbox.ts` — 灯箱 caption 同步营销标签
- Modify `layers/base/app/utils/getProductTrail.ts` — 面包屑取首个顶级分类
- Create `layers/base/app/utils/schemes.ts` — 方案库解析/本地化纯函数（SSR 友好）
- Create `layers/base/app/utils/marketing-tags.ts` — 营销标签 code→文案纯函数
- Create `layers/base/app/utils/__tests__/getProductTrail.spec.ts`
- Create `layers/base/app/utils/__tests__/schemes.spec.ts`
- Create `layers/base/app/utils/__tests__/marketing-tags.spec.ts`
- Modify `layers/base/gql/fragments/product.gql` — ProductBaseFragment.customFields 补 `marketingTags promos services`
- Modify `layers/base/gql/queries/context.gql` — GetChannelTheme.customFields 补 `promoSchemes serviceSchemes`
- Modify `layers/base/i18n/locales/*.ts`（12 个语言包）— `messages.nav.back` + `messages.detail.marketingTags`
- Create `tmp/verify-product-images.py` — 商品图片关联数核对脚本
- Create `tmp/verify-final.py` — 六项修复手机视口回归脚本

**vendure（后端）：**
- Modify `packages/marketplace-plugin/src/custom-fields.ts` — Product 段追加 `promos` / `services`（public，JSON 字符串数组）
- Modify `packages/dev-server/dev-config.ts` — Channel 段追加 `promoSchemes` / `serviceSchemes`（public，方案库 JSON）

**web-admin（运营端）：**
- Modify `src/apis/channel.ts` — ChannelCustomFields + fetchActiveChannel 补 promoSchemes/serviceSchemes
- Modify `src/apis/product.ts` — ProductSaveInput/ProductFull/hydrate/applyBrandAndMarketing 读写 promos/services
- Modify `src/composables/useVariantMatrix.ts` — BrandMarketingState/defaultBrandMarketing/hydrateEditState 补 promos/services
- Modify `src/components/ProductForm.vue` — 图片区「已关联 N 张」；ProductDraft + submit() 汇入 promos/services
- Modify `src/components/product-tabs/ProductBrandMarketingTab.vue` — 促销方案/服务保障多选（选项来自频道方案库）
- Modify `src/pages/decorate/shop-info/index.vue` — 促销方案库/服务保障库编辑并保存

---

## Task 1: 商品图片（缩略图横滑 + n/m 角标 + web-admin 已关联数）

**Files:**
- Create: `tmp/verify-product-images.py`
- Modify: `layers/base/app/components/product/ProductGallery.vue`
- Modify: `d:\zhao\vshop\web-admin\src\components\ProductForm.vue`

- [ ] **Step 1: 新建核对脚本 `tmp/verify-product-images.py`**

```python
# -*- coding: utf-8 -*-
"""核对：商品图片关联数（shop-api assets 数 = web-admin「已关联 N 张」应显示值）"""
import json, urllib.request
from urllib.parse import quote

BASE = "https://www.youshop.cn/shop-api"
CHANNEL = "cnx87ezvmjx8nn3bth6c"  # t2 租户 channel token

def gql(q, variables=None):
    body = json.dumps({"query": q, "variables": variables or {}}).encode()
    headers = {"Content-Type": "application/json", "vendure-channel-token": CHANNEL}
    req = urllib.request.Request(BASE, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def main():
    for slug in ["国信南山温泉节假日房间", "温泉门票"]:
        q = """query($slug:String!){
          product(slug:$slug) {
            id name
            assets { id preview }
            featuredAsset { id preview }
            variants { id name assets { id preview } featuredAsset { id preview } }
          }
        }"""
        d = gql(q, {"slug": slug})
        p = d.get("data", {}).get("product") or {}
        n_assets = len(p.get("assets", []))
        print(f"===== {slug}")
        print(f"  商品级 assets: {n_assets} 张（web-admin 应显示「已关联 {n_assets} 张」）")
        for v in p.get("variants", []):
            print(f"  变体 {v['name']}: assets={len(v.get('assets', []))} featured={bool(v.get('featuredAsset'))}")
        print(f"  featuredAsset: {bool(p.get('featuredAsset'))}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行核对脚本，记录线上图片关联现状**

Run: `python tmp/verify-product-images.py`（cwd `d:\zhao\nshop`）
Expected: 输出两个商品的商品级 assets 数 / 各变体 assets 数；该数字即 web-admin 商品表单应显示的「已关联 N 张」。

- [ ] **Step 3: ProductGallery.vue — 缩略图条改为可横滑 + 大图 `n/m` 角标**

将 `ProductGallery.vue` 模板中 52-75 行（`<UCarousel>` 块）替换为带 `n/m` 角标的 relative 容器：

```vue
    <div class="relative w-full">
      <UCarousel
        v-else
        ref="carousel"
        v-slot="{ item }"
        :items="galleryAssets"
        :prev="{ onClick: onClickPrev }"
        :next="{ onClick: onClickNext }"
        class="mx-auto w-full"
        @select="onSelect"
      >
        <NuxtImg
          class="mx-auto h-62.5 cursor-pointer rounded-lg object-contain transition-transform hover:opacity-90 sm:h-87.5 sm:object-cover"
          :src="assetSrc(item.preview, 700)"
          :alt="`${selectedVariant?.name || product?.name || 'Product image'} – Slide ${activeIndex + 1}`"
          :loading="activeIndex === 0 ? 'eager' : 'lazy'"
          :preload="activeIndex === 0"
          sizes="350px sm:40vw"
          placeholder
          placeholder-class="blur-xl"
          role="button"
          tabindex="0"
          @click="() => openPhotoSwipe(activeIndex)"
        />
      </UCarousel>
      <span
        v-if="!firstIsVideo && galleryAssets.length > 1"
        class="absolute left-2 top-2 z-10 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white"
        >{{ activeIndex + 1 }}/{{ galleryAssets.length }}</span
      >
    </div>
```

将模板中 77-110 行（缩略图条容器）替换为可横滑版本（根因：原 `max-w-xs` 固定宽 + `justify-center` + 无 `overflow`，图多时被裁切且无法滑动）：

```vue
    <!-- 缩略图条：可横滑，图多时完整滑动查看（去掉 max-w-xs 固定宽与居中） -->
    <div class="no-scrollbar mx-auto flex w-full items-center gap-3 overflow-x-auto px-4 pt-4 snap-x">
      <div v-if="firstIsVideo" class="relative shrink-0 snap-start">
        <video
          :src="videoSrc"
          class="h-11.25 w-11.25 rounded-lg object-cover"
          muted
          preload="metadata"
        />
        <span
          class="absolute bottom-0 right-0 cursor-pointer rounded bg-black/60 px-0.5 text-[9px] text-white"
          title="回到视频"
          @click="scrollVideoTop"
          >▶</span
        >
      </div>
      <div
        v-for="(item, index) in galleryAssets"
        :key="item.id"
        class="shrink-0 snap-start opacity-25 transition-opacity hover:opacity-100"
        :class="{ 'opacity-100': activeIndex === index }"
        @click="select(index)"
      >
        <NuxtImg
          class="h-11.25 w-11.25 rounded-lg object-cover"
          :src="assetSrc(item.preview, 90)"
          :alt="`${selectedVariant?.name || product?.name || 'Product image'} – Thumb ${index + 1}`"
          loading="eager"
          preload
          sizes="45px"
          placeholder
          placeholder-class="blur-xl"
        />
      </div>
    </div>
```

将文件末尾 `<style lang="css" scoped></style>` 替换为：

```css
<style lang="css" scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
```

- [ ] **Step 4: web-admin `ProductForm.vue` — 图片区显示已关联数量**

将 `d:\zhao\vshop\web-admin\src\components\ProductForm.vue` 第 91-94 行的图片 card 替换为：

```vue
      <view class="card">
        <view class="img-title">商品图片<text v-if="d.assetIds.length" class="img-count">（已关联 {{ d.assetIds.length }} 张）</text></view>
        <ImagePicker :max="9" :value="d.assetIds" @change="onImg" />
      </view>
```

在 `<style lang="scss" scoped>` 内（`.img-title` 规则之后）补充：

```scss
.img-count { font-size: 24rpx; color: $wa-muted; margin-left: 12rpx; }
```

- [ ] **Step 5: 本地验证（触发 gql 生成 + 手机视口截图）**

Run: `pnpm dev`（cwd `d:\zhao\nshop`，后台运行），随后运行既有回归脚本 `python tmp/verify-gallery.py`（cwd `d:\zhao\nshop`）
Expected: 缩略图条不再裁切、可横滑；大图角标显示 `n/m`；截图存入 `tmp-shots/gallery-*.png`。

- [ ] **Step 6: Commit**

```bash
git add tmp/verify-product-images.py layers/base/app/components/product/ProductGallery.vue
git commit -m "fix(detail): 缩略图条可横滑完整查看 + 大图 n/m 角标"
git -C d:/zhao/vshop add web-admin/src/components/ProductForm.vue
git -C d:/zhao/vshop commit -m "fix(admin): 商品图片区显示已关联张数"
```

---

## Task 2: 促销方案 / 服务保障（频道默认 + 商品覆盖）

**Files:**
- Modify: `d:\zhao\vendure\packages\marketplace-plugin\src\custom-fields.ts`
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts`
- Modify: `layers/base/gql/fragments/product.gql`
- Modify: `layers/base/gql/queries/context.gql`
- Create: `layers/base/app/utils/schemes.ts`
- Create: `layers/base/app/utils/__tests__/schemes.spec.ts`
- Modify: `layers/base/app/composables/useDetailConfig.ts`
- Modify: `layers/base/app/components/product-detail/PromoBlock.vue`
- Modify: `layers/base/app/components/product-detail/ServiceBlock.vue`
- Modify: `d:\zhao\vshop\web-admin\src\apis\channel.ts`
- Modify: `d:\zhao\vshop\web-admin\src\apis\product.ts`
- Modify: `d:\zhao\vshop\web-admin\src\composables\useVariantMatrix.ts`
- Modify: `d:\zhao\vshop\web-admin\src\components\ProductForm.vue`
- Modify: `d:\zhao\vshop\web-admin\src\components\product-tabs\ProductBrandMarketingTab.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\shop-info\index.vue`

- [ ] **Step 1: 写失败的单测 `layers/base/app/utils/__tests__/schemes.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  parseSchemeList,
  localizeSchemeText,
  resolveSchemeText,
  resolveSchemeTexts,
} from "../schemes";

describe("schemes", () => {
  const schemes = [
    { code: "freeShip99", text: { zh_Hans: "满99元包邮", en: "Free ship over 99" } },
    { code: "refund7", text: { zh_Hans: "支持7天无理由退换", en: "7-day return" } },
  ];

  it("坏 JSON / 非数组 → null", () => {
    expect(parseSchemeList("not-json")).toBeNull();
    expect(parseSchemeList("{}")).toBeNull();
    expect(parseSchemeList(null)).toBeNull();
  });

  it("合法 JSON 数组 → 过滤非法项", () => {
    const r = parseSchemeList(JSON.stringify([{ code: "a", text: { zh_Hans: "A" } }, { no: "code" }]));
    expect(r?.length).toBe(1);
  });

  it("localizeSchemeText 前端 locale → Vendure 语言码映射", () => {
    const text = { zh_Hans: "满99元包邮", en: "Free ship over 99" };
    expect(localizeSchemeText(text, "zh-CN")).toBe("满99元包邮");
    expect(localizeSchemeText(text, "en-US")).toBe("Free ship over 99");
    expect(localizeSchemeText(text, "de-DE")).toBe("满99元包邮"); // 缺失 → defaultLocale
  });

  it("resolveSchemeText 命中/未命中", () => {
    expect(resolveSchemeText(schemes, "refund7", "zh-CN")).toBe("支持7天无理由退换");
    expect(resolveSchemeText(schemes, "unknown", "zh-CN")).toBe("");
  });

  it("商品覆盖：按 codes 过滤；未配置（空）→ 频道默认全部", () => {
    expect(resolveSchemeTexts(schemes, ["refund7"], "zh-CN")).toEqual(["支持7天无理由退换"]);
    expect(resolveSchemeTexts(schemes, ["nope", "refund7"], "zh-CN")).toEqual(["支持7天无理由退换"]);
    expect(resolveSchemeTexts(schemes, [], "zh-CN")).toEqual(["满99元包邮", "支持7天无理由退换"]);
    expect(resolveSchemeTexts(null, [], "zh-CN")).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run layers/base/app/utils/__tests__/schemes.spec.ts`（cwd `d:\zhao\nshop`）
Expected: FAIL，`../schemes` 模块不存在。

- [ ] **Step 3: 创建 `layers/base/app/utils/schemes.ts`**

```ts
// 促销方案/服务保障解析：code 列表 ↔ 频道方案库（[{code,text:{zh_Hans,en}}]）纯函数（SSR 友好）
export interface Scheme {
  code: string;
  text?: string | Record<string, string>;
}

export const VENDURE_LOCALE_MAP: Record<string, string> = {
  "zh-CN": "zh_Hans",
  "en-US": "en",
};

export function parseSchemeList(raw: string | null | undefined): Scheme[] | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data
      .filter((s) => s && typeof s.code === "string")
      .map((s) => ({ code: s.code, text: s.text }));
  } catch {
    return null;
  }
}

export function localizeSchemeText(
  text: Scheme["text"] | undefined,
  locale: string,
  defaultLocale = "zh-CN",
): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  const lk = VENDURE_LOCALE_MAP[locale] ?? locale;
  return text[lk] ?? text[VENDURE_LOCALE_MAP[defaultLocale] ?? defaultLocale] ?? Object.values(text)[0] ?? "";
}

export function resolveSchemeText(
  schemes: Scheme[] | null,
  code: string,
  locale: string,
): string {
  const hit = schemes?.find((s) => s.code === code);
  return hit ? localizeSchemeText(hit.text, locale) : "";
}

// 商品覆盖：codes 非空时按 codes 过滤显示；codes 为空 → 频道默认（方案库全部启用项）
export function resolveSchemeTexts(
  schemes: Scheme[] | null,
  codes: string[],
  locale: string,
): string[] {
  if (!codes.length) {
    return (schemes ?? []).map((s) => localizeSchemeText(s.text, locale)).filter(Boolean);
  }
  return codes.map((c) => resolveSchemeText(schemes, c, locale)).filter(Boolean);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run layers/base/app/utils/__tests__/schemes.spec.ts`（cwd `d:\zhao\nshop`）
Expected: PASS（5 个 it 全绿）。

- [ ] **Step 5: vendure Product customFields 新增 promos / services**

在 `d:\zhao\vendure\packages\marketplace-plugin\src\custom-fields.ts` 的 Product 数组内、`marketingTags` 字段之后追加：

```ts
        {
            name: 'promos',
            type: 'text',
            nullable: true,
            public: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '促销方案（JSON 数组）' }],
            description: [{ languageCode: LanguageCode.zh_Hans, value: '存 JSON 字符串数组，如 ["freeShip99","refund7"]；code 对应频道方案库 promoSchemes' }],
        },
        {
            name: 'services',
            type: 'text',
            nullable: true,
            public: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '服务保障（JSON 数组）' }],
            description: [{ languageCode: LanguageCode.zh_Hans, value: '存 JSON 字符串数组，如 ["genuine","fastShip"]；code 对应频道方案库 serviceSchemes' }],
        },
```

- [ ] **Step 6: vendure Channel customFields 新增 promoSchemes / serviceSchemes**

在 `d:\zhao\vendure\packages\dev-server\dev-config.ts` 的 `customFields.Channel` 数组内、`orderListConfig` 之后追加：

```ts
            // promoSchemes/serviceSchemes 存频道促销/服务方案库 JSON（[{code,text:{zh_Hans,en}}]，勾选启用即入列）
            { name: 'promoSchemes', type: 'text', public: true },
            { name: 'serviceSchemes', type: 'text', public: true },
```

> 若服务器生产配置使用独立 config 文件而非 dev-config.ts，需同步在对应 Channel customFields 追加同名字段（本地验证以 dev-config 为准）。

- [ ] **Step 7: nshop gql 补字段（product.gql + context.gql）**

`layers/base/gql/fragments/product.gql` 的 `ProductBaseFragment.customFields` 改为：

```graphql
  customFields {
    belongCity
    serviceCities
    displayTemplate
    videoUrl
    marketingTags
    promos
    services
  }
```

`layers/base/gql/queries/context.gql` 的 `GetChannelTheme.customFields` 改为：

```graphql
    customFields {
      themeId
      shopContent
      detailConfig
      orderDetailConfig
      orderListConfig
      taxMode
      promoSchemes
      serviceSchemes
    }
```

- [ ] **Step 8: `useDetailConfig.ts` 扩展返回 promoSchemes / serviceSchemes**

将 `layers/base/app/composables/useDetailConfig.ts` 整体替换为：

```ts
// 读 detailConfig 并解析。themeId/shopContent/detailConfig/promoSchemes 等来自同一 GetChannelTheme 查询（SSR 去重，key="detail-config"）
import { useAsyncData } from "#imports";
import { parseDetailConfig, detailLayout, blockVisible, type DetailConfig, type DetailLayout } from "../utils/detail-config";
import { parseSchemeList, type Scheme } from "../utils/schemes";

export function useDetailConfig() {
  const { data } = useAsyncData(
    "detail-config",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields ?? null;
    },
    { server: true },
  );

  const cfs = computed(() => data.value ?? null);
  const config = computed<DetailConfig | null>(() => parseDetailConfig(cfs.value?.detailConfig ?? null));
  const layout = computed<DetailLayout>(() => detailLayout(config.value));
  const visible = (key: string) => blockVisible(config.value, key);
  const promoSchemes = computed<Scheme[] | null>(() => parseSchemeList(cfs.value?.promoSchemes ?? null));
  const serviceSchemes = computed<Scheme[] | null>(() => parseSchemeList(cfs.value?.serviceSchemes ?? null));

  return { config, layout, visible, promoSchemes, serviceSchemes };
}
```

- [ ] **Step 9: PromoBlock.vue 渲染回退链（商品 → 频道 → i18n）**

将 `layers/base/app/components/product-detail/PromoBlock.vue` 的 `<script setup>` 整体替换为：

```ts
<script setup lang="ts">
// 促销/优惠条：回退链 = text prop（版式层显式传入）→ 商品 promos（code）→ 频道方案库 promoSchemes → i18n messages.detail.promoItems
import { localizeText, type LocalizedText } from "../../utils/detail-config";
import { resolveSchemeTexts } from "../../utils/schemes";

const props = defineProps<{ text?: LocalizedText }>();
const { tm, locale } = useI18n();
const { promoSchemes } = useDetailConfig();
const productStore = useProductStore();
const promoCodes = computed(() => productStore.product?.customFields?.promos ?? []);

const items = computed(() => {
  if (props.text) return [localizeText(props.text, locale.value)];
  const schemeTexts = resolveSchemeTexts(promoSchemes.value, promoCodes.value, locale.value);
  if (schemeTexts.length) return schemeTexts;
  return tm("messages.detail.promoItems") as string[]; // i18n 数组用 tm() 取（t() 对数组会返回原 key）
});
</script>
```

模板不变（`v-for="tx in items"`）。

- [ ] **Step 10: ServiceBlock.vue 渲染回退链**

将 `layers/base/app/components/product-detail/ServiceBlock.vue` 的 `<script setup>` 整体替换为：

```ts
<script setup lang="ts">
// 服务/保障条：回退链 = 商品 services（code）→ 频道方案库 serviceSchemes → i18n messages.detail.serviceItems
import { resolveSchemeTexts } from "../../utils/schemes";

const { tm, locale } = useI18n();
const { serviceSchemes } = useDetailConfig();
const productStore = useProductStore();
const serviceCodes = computed(() => productStore.product?.customFields?.services ?? []);

const items = computed(() => {
  const schemeTexts = resolveSchemeTexts(serviceSchemes.value, serviceCodes.value, locale.value);
  if (schemeTexts.length) return schemeTexts;
  return tm("messages.detail.serviceItems") as string[]; // 数组用 tm()，随 locale 变化
});
</script>
```

模板不变。

- [ ] **Step 11: 跑 nshop 全量单测 + 构建验证（触发 gql 类型重新生成）**

Run: `pnpm test`（cwd `d:\zhao\nshop`）
Expected: 全部 PASS（含新 schemes.spec）。

Run: `pnpm build`（cwd `d:\zhao\nshop`）
Expected: 构建成功，无类型错误（gql 已重新生成，`product.customFields.promos/services` 类型可用）。

- [ ] **Step 12: web-admin channel.ts 补字段**

`d:\zhao\vshop\web-admin\src\apis\channel.ts` 的 `ChannelCustomFields` 接口（`detailConfig` 之后）追加：

```ts
  // 促销/服务方案库 JSON 字符串（[{code,text:{zh_Hans,en}}]）
  promoSchemes?: string;
  serviceSchemes?: string;
```

`fetchActiveChannel` 的 gql（`customFields { ... }` 内）追加 `promoSchemes serviceSchemes`：

```graphql
        customFields { displayTemplate themeId shopName shopLogo shopIntro servicePhone shopContent multilingualEnabled taxMode detailConfig promoSchemes serviceSchemes }
```

- [ ] **Step 13: web-admin shop-info 页新增方案库编辑**

`d:\zhao\vshop\web-admin\src\pages\decorate\shop-info\index.vue`：

1. `<script setup>` 中（`rawDetailConfig` 声明旁）追加：

```ts
const promoSchemes = ref<Array<{ code: string; zh: string; en: string }>>([]);
const serviceSchemes = ref<Array<{ code: string; zh: string; en: string }>>([]);

function loadSchemeList(raw: string | undefined): Array<{ code: string; zh: string; en: string }> {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((s: any) => ({
      code: s.code ?? '',
      zh: s.text?.zh_Hans ?? '',
      en: s.text?.en ?? '',
    }));
  } catch {
    return [];
  }
}
function toSchemePayload(list: Array<{ code: string; zh: string; en: string }>): string {
  return JSON.stringify(
    list
      .filter((s) => s.code.trim())
      .map((s) => ({ code: s.code.trim(), text: { zh_Hans: s.zh.trim(), en: s.en.trim() } })),
  );
}
```

2. `onMounted` 中（`rawDetailConfig = cf.detailConfig ?? '';` 之后）追加：

```ts
  promoSchemes.value = loadSchemeList(cf.promoSchemes);
  serviceSchemes.value = loadSchemeList(cf.serviceSchemes);
```

3. `save()` 的 `payload` 中（`payload.detailConfig = ...` 之后）追加：

```ts
  payload.promoSchemes = toSchemePayload(promoSchemes.value);
  payload.serviceSchemes = toSchemePayload(serviceSchemes.value);
```

4. 模板 `<button class="save">` 之前追加两个 card：

```vue
    <view class="card">
      <view class="img-title">促销方案库（频道默认；商品可覆盖）</view>
      <view class="scheme-row" v-for="(s, i) in promoSchemes" :key="i">
        <input class="inp" v-model="s.code" placeholder="code，如 freeShip99" />
        <input class="inp" v-model="s.zh" placeholder="中文文案" />
        <input class="inp" v-model="s.en" placeholder="English" />
        <button class="del" @tap="promoSchemes.splice(i, 1)">删</button>
      </view>
      <button class="add" @tap="promoSchemes.push({ code: '', zh: '', en: '' })">+ 添加方案</button>
    </view>

    <view class="card">
      <view class="img-title">服务保障库（频道默认；商品可覆盖）</view>
      <view class="scheme-row" v-for="(s, i) in serviceSchemes" :key="i">
        <input class="inp" v-model="s.code" placeholder="code，如 genuine" />
        <input class="inp" v-model="s.zh" placeholder="中文文案" />
        <input class="inp" v-model="s.en" placeholder="English" />
        <button class="del" @tap="serviceSchemes.splice(i, 1)">删</button>
      </view>
      <button class="add" @tap="serviceSchemes.push({ code: '', zh: '', en: '' })">+ 添加方案</button>
    </view>
```

5. `<style lang="scss" scoped>` 内追加：

```scss
  .scheme-row { display: flex; gap: 12rpx; padding: 12rpx 0; align-items: center;
    .inp { flex: 1; min-width: 0; background: $wa-bg; border-radius: 8rpx; padding: 12rpx; font-size: 26rpx; }
    .del { color: #e6162d; font-size: 26rpx; }
  }
  .add { margin: 16rpx 0 24rpx; color: $wa-accent; font-size: 28rpx; }
```

- [ ] **Step 14: web-admin product.ts 读写 promos/services**

`d:\zhao\vshop\web-admin\src\apis\product.ts`：

1. `ProductSaveInput` 接口（`marketingTags` 声明之后）追加：

```ts
  promos?: string[];   // 促销方案 code 数组（customFields.promos JSON）
  services?: string[]; // 服务保障 code 数组（customFields.services JSON）
```

2. `ProductFull` 的 `productCustomFields` 类型（当前为 `{ marketingTags?: string[] | null; sellingPoint?: string | null; tenantCategoryRef?: string | null }`）追加：

```ts
    promos?: string[] | null;
    services?: string[] | null;
```

3. `fetchProductFull` 的 gql `customFields { marketingTags sellingPoint tenantCategoryRef videoAssetId }` 改为：

```graphql
        customFields { marketingTags sellingPoint tenantCategoryRef videoAssetId promos services }
```

4. `fetchProductFull` 的 hydrate 处（`marketingTags` 解析 try/catch 之后）追加 promos/services 解析：

```ts
  let promos: string[] = [];
  try {
    promos = product.customFields?.promos ? JSON.parse(product.customFields.promos) : [];
    if (!Array.isArray(promos)) promos = [];
  } catch {
    promos = [];
  }
  let services: string[] = [];
  try {
    services = product.customFields?.services ? JSON.parse(product.customFields.services) : [];
    if (!Array.isArray(services)) services = [];
  } catch {
    services = [];
  }
```

并在返回对象的 `productCustomFields` 中追加 `promos: promos, services: services`。

5. `applyBrandAndMarketing`（早退条件当前为 `if (!input.brandFacetValueId && !input.marketingTags?.length && !input.sellingPoint && input.tenantCategoryRef == null && input.videoAssetId == null) return;`）改为：

```ts
  if (!input.brandFacetValueId && !input.marketingTags?.length && !input.sellingPoint && input.tenantCategoryRef == null && input.videoAssetId == null && !input.promos?.length && !input.services?.length) return;
```

并在 `customFields` 写入处（`videoAssetId` 赋值之后）追加：

```ts
  if (input.promos?.length) customFields.promos = JSON.stringify(input.promos);
  if (input.services?.length) customFields.services = JSON.stringify(input.services);
```

- [ ] **Step 15: useVariantMatrix.ts 与 ProductForm.vue 汇入 promos/services**

`d:\zhao\vshop\web-admin\src\composables\useVariantMatrix.ts`：

1. `BrandMarketingState` 接口追加 `promos: string[]; services: string[];`
2. `defaultBrandMarketing()` 返回对象追加 `promos: [], services: [],`
3. `hydrateEditState` 中（`sellingPoint` 解析之后）追加：

```ts
  const promos = parseTags(product.productCustomFields?.promos ?? '');
  const services = parseTags(product.productCustomFields?.services ?? '');
```

并在返回的 `brandMarketing` 对象中追加 `promos, services`。

`d:\zhao\vshop\web-admin\src\components\ProductForm.vue`：

1. `ProductDraft` 接口（`marketingTags` 声明之后）追加 `promos?: string[]; services?: string[];`
2. `submit()` 中（`out.sellingPoint = ...` 之后）追加：

```ts
  out.promos = brandMarketing.value.promos;
  out.services = brandMarketing.value.services;
```

> create/edit 页直接把 `d`（ProductDraft）传给 `createProductFull/updateProductFull`（入参 `ProductSaveInput`），两端类型都加了 promos/services，无需改页面。

- [ ] **Step 16: web-admin ProductBrandMarketingTab.vue 商品级多选**

`d:\zhao\vshop\web-admin\src\components\product-tabs\ProductBrandMarketingTab.vue`：

1. `BrandMarketingValue` 接口追加 `promos: string[]; services: string[];`
2. `<script setup>` 中追加（`reloadBrands` 之后）：

```ts
const promoOptions = ref<Array<{ code: string; label: string }>>([]);
const serviceOptions = ref<Array<{ code: string; label: string }>>([]);

function parseWebSchemes(raw?: string): Array<{ code: string; label: string }> {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((s: any) => ({
      code: s.code ?? '',
      label: s.text?.zh_Hans || s.text?.en || s.code || '',
    }));
  } catch {
    return [];
  }
}
async function loadSchemes() {
  try {
    const { fetchActiveChannel } = await import('../../apis/channel');
    const ch = await fetchActiveChannel();
    const cfs = (ch.customFields ?? {}) as any;
    promoOptions.value = parseWebSchemes(cfs.promoSchemes);
    serviceOptions.value = parseWebSchemes(cfs.serviceSchemes);
  } catch { /* 方案库拉取失败则仅显示 i18n 兜底，不阻塞保存 */ }
}
function onPromos(e: any) {
  emit('update:value', { ...props.value, promos: (e.detail.value || []) as string[] });
}
function onServices(e: any) {
  emit('update:value', { ...props.value, services: (e.detail.value || []) as string[] });
}
```

3. `onMounted(reloadBrands)` 改为 `onMounted(() => { reloadBrands(); loadSchemes(); });`
4. 模板在「卖点」card 之前插入两个 card：

```vue
    <view class="card">
      <view class="img-title">促销方案</view>
      <checkbox-group class="tags" @change="onPromos">
        <label class="tag" v-for="s in promoOptions" :key="s.code">
          <checkbox :value="s.code" :checked="value.promos.includes(s.code)" />
          <text>{{ s.label }}</text>
        </label>
        <view v-if="!promoOptions.length" class="tip">频道方案库为空，请先在「店铺信息-促销方案库」配置</view>
      </checkbox-group>
    </view>

    <view class="card">
      <view class="img-title">服务保障</view>
      <checkbox-group class="tags" @change="onServices">
        <label class="tag" v-for="s in serviceOptions" :key="s.code">
          <checkbox :value="s.code" :checked="value.services.includes(s.code)" />
          <text>{{ s.label }}</text>
        </label>
        <view v-if="!serviceOptions.length" class="tip">频道方案库为空，请先在「店铺信息-服务保障库」配置</view>
      </checkbox-group>
    </view>
```

- [ ] **Step 17: web-admin 构建验证**

Run: `pnpm build:h5`（cwd `d:\zhao\vshop\web-admin`）
Expected: 构建成功，无类型错误。

- [ ] **Step 18: Commit**

```bash
git -C d:/zhao/vendure add packages/marketplace-plugin/src/custom-fields.ts packages/dev-server/dev-config.ts
git -C d:/zhao/vendure commit -m "feat(custom-fields): Product 促销/服务 + Channel 方案库字段"
git add layers/base/gql/fragments/product.gql layers/base/gql/queries/context.gql layers/base/app/utils/schemes.ts layers/base/app/utils/__tests__/schemes.spec.ts layers/base/app/composables/useDetailConfig.ts layers/base/app/components/product-detail/PromoBlock.vue layers/base/app/components/product-detail/ServiceBlock.vue
git commit -m "feat(detail): 促销方案/服务保障 商品→频道→i18n 回退链"
git -C d:/zhao/vshop add web-admin/src/apis/channel.ts web-admin/src/apis/product.ts web-admin/src/composables/useVariantMatrix.ts web-admin/src/components/ProductForm.vue web-admin/src/components/product-tabs/ProductBrandMarketingTab.vue web-admin/src/pages/decorate/shop-info/index.vue
git -C d:/zhao/vshop commit -m "feat(admin): 频道促销/服务方案库编辑 + 商品多选"
```

---

## Task 3: 就近库存（无定位有城市 → 按城市兜底）

**Files:**
- Modify: `layers/base/app/components/product/NearbyStores.vue`

- [ ] **Step 1: NearbyStores.vue 兜底逻辑**

将 `NearbyStores.vue` 的 `loadStock` 函数与 watch 部分（当前 35-57 行）替换为：

```ts
async function loadStock() {
  if (!props.productId) {
    result.value = { state: "no-stock", items: [], message: null };
    return;
  }
  const hasCity = !!locationStore.city?.name;
  if (!locationStore.coords && !hasCity) {
    result.value = { state: "no-coords", items: [], message: null };
    return;
  }
  result.value = await fetchNearbyStock({
    productId: props.productId,
    variantId: props.variantId,
    coords: locationStore.coords,
    city: locationStore.city?.name ?? null,
  });
}

onMounted(loadStock);

// 定位 / 城市切换后刷新
watch(() => locationStore.coords, loadStock);
watch(() => locationStore.city?.name, loadStock);
// SKU 切换后刷新（如单仓库存明细随 SKU 变化）
watch(() => props.variantId, loadStock);
```

> `fetchNearbyStock` 已支持 `city` 参数（`useNearbyStock.ts` 内映射到 `variantNearbyStock` 的 `city` 入参）；`locationStore.city?.name` 取自 `useLocationStore`（`CityInfo` 结构，城市持久化）。

- [ ] **Step 2: 验证**

Run: `pnpm dev`（cwd `d:\zhao\nshop`）后运行 `python tmp/verify-gallery.py`（cwd `d:\zhao\nshop`）
Expected: 就近库存区域：无定位但已选城市时不再显示「开启定位可查看就近库存」，而是按城市返回门店库存（`nearby: ok` 或 `no-stock`）。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/components/product/NearbyStores.vue
git commit -m "fix(detail): 就近库存无定位但有城市时按城市兜底查询"
```

---

## Task 4: 营销标签角标（主图 + 灯箱 + 12 语言包）

**Files:**
- Create: `layers/base/app/utils/marketing-tags.ts`
- Create: `layers/base/app/utils/__tests__/marketing-tags.spec.ts`
- Modify: `layers/base/app/components/product/ProductGallery.vue`
- Modify: `layers/base/app/composables/useProductLightbox.ts`
- Modify: `layers/base/i18n/locales/bg-BG.ts`、`de-DE.ts`、`en-US.ts`、`es-ES.ts`、`fa-IR.ts`、`fr-FR.ts`、`it-IT.ts`、`ja-JP.ts`、`ko-KR.ts`、`pt-BR.ts`、`ru-RU.ts`、`zh-CN.ts`

> `marketingTags` gql 字段已在 Task 2 Step 7 补充，本任务无需重复。

- [ ] **Step 1: 写失败的单测 `__tests__/marketing-tags.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { resolveMarketingTags } from "../marketing-tags";

describe("marketing-tags", () => {
  const dict = { new: "新品", hot: "热卖", special: "特价" };

  it("code → 文案，未知 code 跳过（不回退英文）", () => {
    expect(resolveMarketingTags(["new", "unknown", "hot"], dict)).toEqual(["新品", "热卖"]);
  });

  it("空/无标签 → 空数组", () => {
    expect(resolveMarketingTags([], dict)).toEqual([]);
    expect(resolveMarketingTags(null, dict)).toEqual([]);
    expect(resolveMarketingTags(undefined, dict)).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run layers/base/app/utils/__tests__/marketing-tags.spec.ts`（cwd `d:\zhao\nshop`）
Expected: FAIL，模块不存在。

- [ ] **Step 3: 创建 `layers/base/app/utils/marketing-tags.ts`**

```ts
// 营销标签：code 数组 → i18n 文案（未知 code 跳过，不回退英文）
export function resolveMarketingTags(
  codes: string[] | null | undefined,
  dict: Record<string, string> | null | undefined,
): string[] {
  if (!codes?.length) return [];
  return codes.map((c) => dict?.[c]).filter((x): x is string => !!x);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run layers/base/app/utils/__tests__/marketing-tags.spec.ts`（cwd `d:\zhao\nshop`）
Expected: PASS。

- [ ] **Step 5: 12 个语言包补 marketingTags 字典 + nav.back**

每个语言包两处改动（结构一致，值不同）：
- `messages.detail` 内追加 `marketingTags`（8 个 code；code 与 web-admin `TAG_LIST` 一致：new/hot/special/sale/freeShip/cut/clearance/instock）
- `messages.nav` 内追加 `back`

各语言包值如下（`marketingTags` 8 词按 new/hot/special/sale/freeShip/cut/clearance/instock 顺序，`nav.back` 单独给出）：

| 文件 | new | hot | special | sale | freeShip | cut | clearance | instock | nav.back |
|---|---|---|---|---|---|---|---|---|---|
| zh-CN | 新品 | 热卖 | 特价 | 限时折扣 | 包邮 | 满减 | 清仓 | 有货 | 返回 |
| en-US | New | Hot | Special | Flash Sale | Free Ship | Discount | Clearance | In Stock | Back |
| ja-JP | 新作 | 人気 | 特価 | 期間限定 | 送料無料 | 値引き | 在庫処分 | 在庫あり | 戻る |
| ko-KR | 신상 | 인기 | 특가 | 한정 할인 | 무료배송 | 할인 | 재고정리 | 재고있음 | 뒤로 |
| ru-RU | Новинка | Хит | Спеццена | Скидка | Бесплатная доставка | Скидка | Распродажа | В наличии | Назад |
| pt-BR | Novo | Popular | Especial | Oferta relâmpago | Frete grátis | Desconto | Liquidação | Em estoque | Voltar |
| fr-FR | Nouveau | Populaire | Spécial | Vente flash | Livraison gratuite | Réduction | Déstockage | En stock | Retour |
| de-DE | Neu | Beliebt | Sonderangebot | Zeitangebot | Kostenloser Versand | Rabatt | Räumungsverkauf | Auf Lager | Zurück |
| es-ES | Nuevo | Popular | Especial | Oferta relámpago | Envío gratis | Descuento | Liquidación | En stock | Atrás |
| it-IT | Nuovo | Popolare | Speciale | Offerta lampo | Spedizione gratuita | Sconto | Liquidazione | Disponibile | Indietro |
| fa-IR | نئ | داغ | ویژه | تخفیف ویژه | ارسال رایگان | تخفیف | فروش ویژه | موجود | بازگشت |
| bg-BG | Нов | Топ | Специално | Ограничено време | Безплатна доставка | Отстъпка | Разпродажба | Наличност | Назад |

zh-CN 具体写法示例（其余语言包同结构替换值）：

```ts
      marketingTags: {
        new: '新品',
        hot: '热卖',
        special: '特价',
        sale: '限时折扣',
        freeShip: '包邮',
        cut: '满减',
        clearance: '清仓',
        instock: '有货',
      },
```

`messages.nav` 内追加（zh-CN 示例）：

```ts
      back: '返回',
```

- [ ] **Step 6: ProductGallery.vue 主图角标（营销标签叠层）**

在 Task 1 Step 3 的 relative 容器内、`n/m` 角标（`top-2`）之下追加营销标签角标：

```vue
      <div
        v-if="!firstIsVideo && marketingTags.length"
        class="absolute left-2 top-9 z-10 flex flex-col items-start gap-1"
      >
        <span
          v-for="tag in marketingTags"
          :key="tag"
          class="marketing-tag rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-white"
          >{{ tag }}</span
        >
      </div>
```

`<script setup>` 中追加（import 区加 `import { resolveMarketingTags } from "../../utils/marketing-tags";`）：

```ts
const { tm } = useI18n();
const marketingTags = computed(() =>
  resolveMarketingTags(
    product.value?.customFields?.marketingTags ?? [],
    tm("messages.detail.marketingTags") as Record<string, string>,
  ),
);
```

- [ ] **Step 7: useProductLightbox.ts 灯箱 caption 同步角标**

将 `layers/base/app/composables/useProductLightbox.ts` 整体替换为：

```ts
import "photoswipe/style.css";
import { resolveMarketingTags } from "../utils/marketing-tags";

export function useProductLightbox({
  select,
}: {
  select: (i: number) => void;
}) {
  const { product, selectedVariant, galleryAssets } =
    storeToRefs(useProductStore());
  const { tm } = useI18n();

  const marketingTagsDict = computed(
    () => tm("messages.detail.marketingTags") as Record<string, string>,
  );
  const tagsForIndex = (idx: number) =>
    resolveMarketingTags(product.value?.customFields?.marketingTags ?? [], marketingTagsDict.value);

  async function createDataSource() {
    const altBase =
      selectedVariant.value?.name || product.value?.name || "Product image";

    const assets = galleryAssets.value;

    const promises = assets.map(async (item, idx) => {
      const img = new window.Image();
      img.src = item.preview;
      await new Promise((resolve) => {
        if (img.complete) return resolve(null);
        img.onload = resolve;
        img.onerror = resolve;
      });

      return {
        src: item.preview,
        width: img.naturalWidth,
        height: img.naturalHeight,
        alt: `${altBase} – Slide ${idx + 1}`,
        title: `${altBase} – Slide ${idx + 1}`,
      };
    });

    return Promise.all(promises);
  }

  const openPhotoSwipe = async (startIndex = 0) => {
    const PhotoSwipe = (await import("photoswipe")).default;
    const dataSource = await createDataSource();

    const pswp = new PhotoSwipe({
      dataSource,
      index: startIndex,
      showHideAnimationType: "none",
    });

    // 灯箱角标：切换时把 caption 替换为标签 pill（无标签恢复默认 alt）
    pswp.on("change", () => {
      const tags = tagsForIndex(pswp.currIndex);
      const el = pswp.element?.querySelector(".pswp__caption__center");
      if (!el) return;
      el.innerHTML = tags.length
        ? tags.map((t) => `<span class="pswp-tag">${t}</span>`).join("")
        : pswp.currIndex < dataSource.length
          ? dataSource[pswp.currIndex].alt
          : "";
    });

    pswp.on("close", () => {
      select(pswp.currIndex);
    });

    pswp.init();
  };

  return { openPhotoSwipe };
}
```

在 `ProductGallery.vue` 的 `<style>` 中追加全局样式（photoswipe 样式是全局引入，须用 `:global`）：

```css
:global(.pswp__caption__center) { text-align: left; }
:global(.pswp-tag) {
  display: inline-block;
  margin-right: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--ui-primary, #e6162d);
  color: #fff;
  font-size: 12px;
}
```

- [ ] **Step 8: 验证 + Commit**

Run: `pnpm test`（cwd `d:\zhao\nshop`）→ 全绿
Run: `pnpm build`（cwd `d:\zhao\nshop`）→ 构建成功

```bash
git add layers/base/app/utils/marketing-tags.ts layers/base/app/utils/__tests__/marketing-tags.spec.ts layers/base/app/components/product/ProductGallery.vue layers/base/app/composables/useProductLightbox.ts layers/base/i18n/locales/
git commit -m "feat(detail): 营销标签主图角标 + 灯箱同步 + 12 语言包词条"
```

---

## Task 5: 面包屑（取首个顶级分类，避免同级分类伪层级）

**Files:**
- Modify: `layers/base/app/utils/getProductTrail.ts`
- Create: `layers/base/app/utils/__tests__/getProductTrail.spec.ts`

- [ ] **Step 1: 写失败的单测 `__tests__/getProductTrail.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { pickTopCollection } from "../getProductTrail";

const leisure = { id: "1", name: "休闲娱乐", slug: "休闲娱乐" };
const feature = { id: "2", name: "特色", slug: "特色" };

describe("pickTopCollection", () => {
  it("多个同级顶级 → 按返回顺序取首个", () => {
    expect(pickTopCollection([leisure, feature])).toEqual(leisure);
    expect(pickTopCollection([feature, leisure])?.slug).toBe("特色");
  });

  it("菜单树命中优先于返回顺序", () => {
    const r = pickTopCollection([leisure, feature], [{ slug: "特色" }]);
    expect(r?.slug).toBe("特色");
  });

  it("二级分类（parent 非 root）→ 归位到 parent 顶级", () => {
    const sub = { id: "3", name: "温泉", slug: "温泉", parent: leisure };
    const r = pickTopCollection([sub]);
    expect(r?.slug).toBe("休闲娱乐");
  });

  it("空 / 仅 root → null", () => {
    expect(pickTopCollection([])).toBeNull();
    expect(pickTopCollection([{ id: "r", name: "__root_collection__", slug: "__root_collection__" }])).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run layers/base/app/utils/__tests__/getProductTrail.spec.ts`（cwd `d:\zhao\nshop`）
Expected: FAIL，`pickTopCollection` 未导出。

- [ ] **Step 3: 重写 `layers/base/app/utils/getProductTrail.ts`**

```ts
import type { BreadcrumbItem } from "@nuxt/ui";
import type { ProductDetail } from "~~/types/product";
import type { MenuCollections } from "~~/types/collection";

const ROOT_SLUG = "__root_collection__";

export interface TrailCollection {
  id: string;
  name: string;
  slug: string;
  parent?: { id: string; name: string; slug: string } | null;
}

// 纯函数（SSR 友好）：从商品所属分类中挑出唯一应展示的顶级分类。
// 优先级：菜单树顺序命中（顶级或其一级子级）→ 商品返回顺序首个顶级 → 首个有 parent 的分类取其 parent。
// 同级多顶级只返回一个，杜绝「休闲娱乐 > 特色」伪层级。
export function pickTopCollection(
  collections: TrailCollection[],
  menuTops: Array<{ slug: string }> = [],
): TrailCollection | null {
  const items = collections.filter((c) => c.slug !== ROOT_SLUG);
  if (!items.length) return null;

  const topOf = (c: TrailCollection): TrailCollection | null => {
    if (!c.parent || c.parent.slug === ROOT_SLUG) return c;
    return c.parent as TrailCollection;
  };

  for (const top of menuTops) {
    const hit = items.find((c) => c.slug === top.slug || c.parent?.slug === top.slug);
    if (hit) return topOf(hit);
  }
  const rootChild = items.find((c) => !c.parent || c.parent.slug === ROOT_SLUG);
  if (rootChild) return rootChild;
  const withParent = items.find((c) => c.parent);
  if (withParent?.parent) return withParent.parent as TrailCollection;
  return items[0] ?? null;
}

export function getProductTrail(product: ProductDetail): BreadcrumbItem[] {
  const menuCollections = useState<MenuCollections>("menuCollections");
  const top = pickTopCollection(
    product?.collections ?? [],
    menuCollections.value?.collections?.items ?? [],
  );
  if (!top) return [];
  return [{ label: top.name, to: `/category/${top.slug}` }];
}
```

> 消费方不变：`BreadcrumbTrail.vue` 在结果前拼「首页」，`[slug].vue` 的 SEO defineBreadcrumb 追加商品本身——单元素返回即可形成 `首页 > 顶级分类 > 商品名`。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run layers/base/app/utils/__tests__/getProductTrail.spec.ts`（cwd `d:\zhao\nshop`）
Expected: PASS。

- [ ] **Step 5: 全量单测 + Commit**

Run: `pnpm test`（cwd `d:\zhao\nshop`）→ 全绿

```bash
git add layers/base/app/utils/getProductTrail.ts layers/base/app/utils/__tests__/getProductTrail.spec.ts
git commit -m "fix(detail): 面包屑取首个顶级分类，同级分类不再渲染伪层级"
```

---

## Task 6: 底部导航栏（仅文字布局调整，风格颜色模块不变）

**Files:**
- Modify: `layers/base/app/components/product-detail/ProductDetailBottomBar.vue`
- Modify: `layers/base/i18n/locales/*.ts`（`messages.nav.back` 已在 Task 4 Step 5 补充，本任务无需重复）

- [ ] **Step 1: 重写 `ProductDetailBottomBar.vue`**

将整个文件替换为（`min-[375px]:flex` 为 Tailwind 任意断点，精确 375px；`sm:` 是 640px，不可用）：

```vue
<script setup lang="ts">
// 详情页统一吸底操作栏（移动端常驻 / PC 仅双按钮）
// 左：返回 + 首页（首页宽屏 ≥375px 显示，窄屏仅返回，双按钮空间更充裕）
// 右：加入购物车 + 立即购买 双按钮（复用 useBuyActions 购买逻辑）
import { useProductDetailView } from "../../composables/useProductDetailView";
import { useBuyActions } from "../../composables/useBuyActions";

const { t } = useI18n();
const localePath = useTenantLocalePath();
const router = useRouter();
const route = useRoute();
const { productServiceable } = useProductDetailView();
const { canBuy, loading, addToCartHandler, buyNowHandler } = useBuyActions();

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push(localePath("/"));
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-100 bg-white/95 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden"
    aria-label="商品详情底部操作栏"
  >
    <div class="flex items-center">
      <div class="flex items-center border-r border-gray-100 text-xs">
        <button
          type="button"
          class="flex flex-col items-center gap-0.5 px-2 py-2.5 text-gray-500"
          @click="goBack"
        >
          <UIcon name="i-lucide-arrow-left" class="h-6 w-6" />
          <span>{{ t('messages.nav.back') }}</span>
        </button>
        <NuxtLink
          :to="localePath('/')"
          class="hidden flex-col items-center gap-0.5 px-2 py-2.5 min-[375px]:flex"
          :class="route.path === '/' ? 'text-primary' : 'text-gray-500'"
        >
          <UIcon name="i-lucide-home" class="h-6 w-6" />
          <span>{{ t('messages.nav.home') }}</span>
        </NuxtLink>
      </div>

      <div class="flex flex-1 items-center gap-2 px-3 py-2.5">
        <UButton
          class="flex-1 justify-center whitespace-nowrap"
          color="secondary"
          size="lg"
          icon="i-lucide-shopping-cart"
          :loading="loading"
          :disabled="!productServiceable || !canBuy"
          @click="addToCartHandler"
        >{{ t("messages.detail.addToCart") }}</UButton>
        <UButton
          class="flex-1 justify-center whitespace-nowrap"
          color="primary"
          size="lg"
          icon="i-lucide-zap"
          :loading="loading"
          :disabled="!productServiceable || !canBuy"
          @click="buyNowHandler"
        >{{ t("messages.detail.buyNow") }}</UButton>
      </div>
    </div>
  </nav>
</template>

<style scoped></style>
```

说明：移出「分类 / 购物车 / 我的」导航项及 `useOrderStore`/`cartCount`/`isCartOpen`/`isAllCatOpen`/`active` 相关代码（原 4 列导航挤压双按钮空间导致文字换行变形）。

- [ ] **Step 2: 构建验证**

Run: `pnpm build`（cwd `d:\zhao\nshop`）
Expected: 构建成功；无未使用变量报错（`useOrderStore`/`cartCount`/`isCartOpen`/`isAllCatOpen`/`active` 已移除）。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/components/product-detail/ProductDetailBottomBar.vue
git commit -m "fix(detail): 底栏仅保留返回/首页+双按钮，宽窄屏自适应不换行"
```

---

## Task 7: 线上回归验证 + 部署

**Files:**
- Create: `tmp/verify-final.py`
- Create: `tmp-shots/verify-final-*.png`（手机视口截图，390×844 dpr=2）
- Create: `d:\zhao\docs\manual\product-detail\index.md`（操作手册）

- [ ] **Step 1: 全量单测**

Run: `pnpm test`（cwd `d:\zhao\nshop`）
Expected: 全部 PASS（Task 2/4/5 新增 3 个 spec 全绿）。

- [ ] **Step 2: 本地手机视口回归截图（六项验收）**

新建 `tmp/verify-final.py`（复用 `verify-gallery.py` 的手机视口上下文：390×844、dpr=2、is_mobile）：

```python
# -*- coding: utf-8 -*-
"""最终验收：手机视口截图 + 断言六项修复（本地跑完可对线上重跑）"""
import json
import re
from urllib.parse import quote
from playwright.sync_api import sync_playwright

DOMAIN = "https://www.youshop.cn"
PAGES = [
    ("hotel", f"{DOMAIN}/t2/product/{quote('国信南山温泉节假日房间')}"),
    ("ticket", f"{DOMAIN}/t2/product/{quote('温泉门票')}"),
]
OUT = r"d:\zhao\nshop\tmp-shots"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            locale="zh-CN",
        )
        page = ctx.new_page()
        for key, url in PAGES:
            page.goto(url, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(1500)
            # 1) 缩略图条可横滑（容器 overflow-x-auto）+ n/m 角标
            thumbs_container = page.locator(".no-scrollbar")
            counter = page.locator("text=/^\\d+\\/\\d+$/").first
            # 2) 促销/服务条文案（截图人工确认是否来自后台方案库）
            # 3) 就近库存区域：无定位时不再出现「开启定位」提示文案
            no_coords_hint = page.get_by_text("开启定位可查看就近库存").count()
            # 4) 营销标签角标（主图左上角 .marketing-tag）
            tags = page.locator(".marketing-tag").all_inner_texts()[:6]
            # 5) 面包屑：断言顶级分类「休闲娱乐」出现（截图人工核对「首页 > 休闲娱乐 > 商品名」层级）
            crumb_ok = page.get_by_text("休闲娱乐").count() > 0
            # 6) 底栏：返回 | 首页 | 双按钮（原文案保留）
            bottom = page.locator("nav[aria-label='商品详情底部操作栏']").first
            bottom_text = bottom.inner_text().replace("\n", " | ") if bottom.count() else ""
            page.screenshot(path=f"{OUT}/verify-final-{key}.png", full_page=False)
            print(f"===== {key}")
            print(f"  thumbs_container={thumbs_container.count()} n/m={counter.count() and counter.inner_text()}")
            print(f"  no_coords_hint_count={no_coords_hint} (应为 0)")
            print(f"  tags: {tags}")
            print(f"  breadcrumb_top_found={crumb_ok}")
            print(f"  bottom: {bottom_text}")
        browser.close()


if __name__ == "__main__":
    main()
```

Run: `python tmp/verify-final.py`（cwd `d:\zhao\nshop`）
Expected: 截图生成；`n/m` 有值、`no_coords_hint_count=0`、tags 含标签、`crumb_ok=True`、底栏 = `返回 | 首页 | 加入购物车 | 立即购买`。

- [ ] **Step 3: 操作手册补截图与说明**

创建 `d:\zhao\docs\manual\product-detail\index.md`，将 `tmp-shots/verify-final-*.png` 复制到同目录，记录六项修复验收点：图片多图横滑/`n/m` 角标、促销服务回退链配置入口（店铺信息-方案库 → 商品-品牌营销）、就近库存城市兜底、营销标签角标、面包屑 `首页 > 休闲娱乐`、底栏宽窄屏差异。

- [ ] **Step 4: 部署 vendure（后端 customFields）**

```bash
# 本地：确认 vendure 代码已提交并推送（Task 2 Step 18）
git -C d:/zhao/vendure push
# 服务器：git pull + pm2 restart（部署铁律：不在服务器构建）
ssh root@<SERVER_HOST> "cd <vendure-dir> && git pull && pm2 restart <vendure-app>"
```

Expected: vendure 重启后，`Product.customFields.promos/services` 与 `Channel.customFields.promoSchemes/serviceSchemes` 在 Shop API / Admin API schema 可用。

- [ ] **Step 5: 部署 nshop（C 端）**

Run: `pnpm deploy`（cwd `d:\zhao\nshop`，脚本读取 `.env` 的 SERVER_HOST/REMOTE_DIR）
Expected: 本地构建 → scp `.output/` → 服务器解压 → `pm2 restart`。

- [ ] **Step 6: 部署 web-admin**

```bash
# 本地构建（vshop/web-admin）
pnpm build:h5
# 上传 dist/build/h5 到服务器 nginx 站点目录（沿用此前手工部署方式，目标目录以服务器 nginx 站点实际路径为准）
scp -r dist/build/h5/* root@<SERVER_HOST>:<web-admin-site-dir>/
```

Expected: 管理后台可见方案库编辑与商品多选。

- [ ] **Step 7: 部署后线上回归**

Run: `python tmp/verify-final.py`（cwd `d:\zhao\nshop`，跑线上 `www.youshop.cn`）
Expected: 六项验收全过（断言输出见 Step 2）；将最终截图补充到操作手册。

- [ ] **Step 8: Commit 最终脚本与手册**

```bash
git add tmp/verify-final.py docs/manual/product-detail/
git commit -m "docs(detail): 商品详情修复验收截图与操作手册"
```

---

## 验收对照

1. 商品 ≥6 图缩略图可横滑完整查看、大图 `n/m` 角标、web-admin「已关联 N 张」→ Task 1
2. 频道方案库可维护（店铺信息）、商品可多选（品牌营销 Tab）、C 端「商品→频道→i18n」回退 → Task 2
3. 无定位有城市按城市查询；无城市显示定位引导 → Task 3
4. 商品 marketingTags 主图左上角竖排角标、灯箱 caption 同步、无标签不显示 → Task 4
5. 温泉门票面包屑 = `首页 > 休闲娱乐`（同级「特色」不再伪层级）→ Task 5
6. 底栏宽屏含返回+首页、窄屏仅返回；双按钮不换行不变形、原文案保留 → Task 6
7. 手机视口截图（390×844 dpr=2）补入操作手册 → Task 7
