# nshop 商品详情页积木化 — 京东风格设计

- 日期：2026-08-27
- 范围：详情页引入与首页一致的「积木 + 版式变体」机制，先落地京东风格三种版式；配套最小兜底体系
- 仓库：`d:\zhao\nshop`

## 背景与目标

现有详情页靠 `customFields.displayTemplate` 做 `standard / galleryFirst / rich` 的**轻量 DOM 切换**（仅换顺序/隐藏），并非真正拼合模块。首页已具备成熟的积木机制（`GetChannelTheme` 读取 `shopContent` → `HomeBlockRenderer` 按 `section.type` 分派 → 块组件内走 `shape/layout` 变体）。

本次目标：把详情页改造为与首页同构的「整体积木区块」。**三种版式**（京东经典 / 京东楼层富详情 / 京东经典双按钮）都作为 **variant** 落到一个详情积木上，客户端在后台为该模块任选版式。前端当前只做**直接渲染**（不做"解析后重排"的精细控制）。

同时确立**四级可回退风格体系**的统一方向，本次落地其最小闭环。

## 四级可回退风格体系（统一方向）

| 层级 | 含义 | 载体 | 现状 |
|---|---|---|---|
| L1 风格方案 | 京东/淘宝/极简，整套配色+圆角+字号基准 | `<html data-theme>` + theme.css 令牌 | 已有 `themeId`，仅 `--ui-primary` 单变量 → **本次扩展整组令牌** |
| L2 页面配置 | 每页积木编排，决定块与整体版式 | 每页一 JSON 字段，`GetChannelTheme` 统一读 | 首页 `shopContent` 已有；**本次新增详情 `detailConfig`**；分类页 `categoryConfig` 后续 |
| L3 功能模块 | 块级样式定制（显示效果/文字大小/图片尺寸） | 块内可选字段 | 首页 nav/goods 有 `shape/layout`；**本次详情块埋最小字段** |
| 兜底链 | 具体→回退 | 块级定制 → 块内建默认 → 页面/风格默认 → 全局令牌 → 内建品牌兜底 | **本次新增逐级解析工具** |

## 数据模型：`detailConfig`（Channel.customFields 新 JSON 字段）

本阶段配置结构（整体版式 + 各功能块显隐/样式覆盖，为后续"解析后重排"预留）：

```json
{
  "version": 1,
  "layout": "classic",   // classic | floor | dualBuy，后台任选
  "blocks": {
    "gallery":      { "visible": true },
    "info":         { "visible": true },
    "price":        { "visible": true },
    "promo":        { "visible": true },
    "service":      { "visible": true },
    "variants":     { "visible": true },
    "purchase":     { "visible": true },
    "description":  { "visible": true },
    "reviews":      { "visible": true },
    "nearby":       { "visible": true },
    "related":      { "visible": true }
  }
}
```

- layout 缺省 → `classic`（回退后与现有 `standard` 渲染等价，不回归）
- blocks 缺省 → 全部 `visible: true`
- 配置按**激活 channel（租户）隔离**，与首页一致

### 功能块清单（由现有详情子组件映射）

| 块 key | 现有组件/数据 | 职责 |
|---|---|---|
| gallery | `ProductGallery` | 图集轮播+缩略图，`assetSrc` |
| info | 标题 + `ProductDetails`(库存/SKU) | 品名、库存、SKU |
| price | 价格徽章（新 `PriceBlock`） | 当前 variant 价格 |
| promo | 促销条（新 `PromoBlock`） | 促销/优惠 |
| service | 服务保障条（新 `ServiceBlock`） | 物流/售后保障 |
| variants | `ProductVariants` | 规格选择 |
| purchase | 加购栏（新 `PurchaseBar`，复刻现有加购） | 加入购物车（含 `productServiceable` 警示） |
| description | `ProductDescription` | 富文本描述 |
| reviews | 评价区（新 `ReviewsSection` 占位） | 用户评价 |
| nearby | `NearbyStores` | 门店配送 |
| related | 首页相关推荐块 | 相关推荐 |

## 前端工具：`detail-config.ts`（纯函数，SSR 友好）

仿 `layers/base/app/utils/shop-content.ts`：

```ts
export type DetailLayout = 'classic' | 'floor' | 'dualBuy';
// 可翻译文案：后台填字符串 = 各语言共用（或仅当缺失时兜底）；填对象 { language: 文本 } 逐语言
export type LocalizedText = string | Record<string, string>;
export interface DetailBlockCfg {
  visible?: boolean;
  /* L3 样式字段预留 */ title?: LocalizedText; text?: LocalizedText;
}
export interface DetailConfig { version: number; layout?: DetailLayout; blocks?: Record<string, DetailBlockCfg>; }

const BLOCK_DEFAULT_VISIBLE: Record<string, boolean> = {
  gallery:true, info:true, price:true, promo:true, service:true,
  variants:true, purchase:true, description:true, reviews:true, nearby:true, related:true,
};

export function parseDetailConfig(raw): DetailConfig | null; // JSON + 结构校验，坏则 null
export function detailLayout(cfg): DetailLayout;             // 非法/缺省 → 'classic'
export function blockVisible(cfg, key): boolean;             // 层1块定制 → 层2内建默认 → true
export function localizeText(text, locale, defaultLocale?): string; // 见「国际化」节
```

兜底设计：`blockVisible = cfg.blocks?.[key]?.visible ?? BLOCK_DEFAULT_VISIBLE[key] ?? true`。凡缺省字段（含 `title/text` 文案）一律回退到非空层。

## 国际化多语言（横切维度）

四级体系描述的是**结构层级**；国际化是贯穿 L1–L3 的**横切维度**，作用于所有「用户可见/后台可编辑文案」，不改动层级结构。现有 i18n 能力：10 种语言、default `zh-CN`、字典文件 `layers/base/i18n/locales/*.ts`、模板用 `t('messages.*')`。

将文案分两类，分别接入兜底链：

| 文案来源 | 声明位置 | 解析方式 |
|---|---|---|
| 前端固定文案 | i18n 字典 `messages.detail.*`（新增命名空间，各语种文件补 key） | 模板 `t('messages.detail.xxx')`，缺失自动回退 default locale |
| 后台可编辑文案 | `detailConfig` / 未来 `shopContent` 的 `title/text` 字段，类型 `LocalizedText` | `localizeText(text, locale)` |

**_本地化纯函数 `localizeText`（SSR 友好，并入 detail-config.ts）：** 逐级回退：

```ts
export function localizeText(
  text: LocalizedText | undefined | null,
  locale: string,
  defaultLocale = "zh-CN",
): string {
  if (typeof text === "string") return text;              // 字符串 = 各语言共用
  if (!text) return "";                                     // 缺省 → 空（由块内建占位兜底）
  return text[locale] ?? text[defaultLocale] ?? Object.values(text)[0] ?? "";
}
```

**兜底链（含语言维度，具体→回退）：**

```
当前 locale 的文案 → defaultLocale 文案 → 无语言对象首个值 → 块内建占位(final)  → i18n 字典静态文案 → 全局默认
```

**i18n 配置补充：** base 层 `nuxt.config.ts` 的 `i18n` 显式加 `fallbackLocale: 'zh-CN'`，保证个别语种 key 缺失时回退中文而非显示 key 本身；`messages.detail.*` key 至少补齐 `zh-CN` 与 `en-US`（其余语言缺失走 fallback）。

**本次落地范围：** 详情页新增块（PriceBlock/PromoBlock/ServiceBlock/ReviewsSection）的文案改用 i18n 静态 key + `localizeText` 支持台可编辑多语言字段；首页 `shopContent` 文案多语言化与其余页留后续（同一套 `LocalizedText/localizeText` 模式直接复用）。

## 渲染器：`ProductDetailRenderer.vue`

新目录 `components/product-detail/`（与 `home/` 平行）。职责 = 首页 `HomeBlockRenderer` 的详情版：

- 读 `detailConfig` → 按 `layout` 分派 `<component :is>`。
- **显式 import 组件对象再进 componentMap**（避免字符串组件名渲染成空标签——复用首页已验证的修复模式）。

```vue
import DetailClassic from "./DetailClassic.vue";
import DetailFloor from "./DetailFloor.vue";
import DetailDualBuy from "./DetailDualBuy.vue";
import { useDetailConfig } from "../composables/useDetailConfig";

const { layout, config } = useDetailConfig();
const componentMap: Record<DetailLayout, any> = { classic, floor, dualBuy };
```

`useDetailConfig`（仿 `useShopContent`，`server:true`，同一 `GetChannelTheme` 读取 `detailConfig`，`useState` 缓存）：

```ts
const config = computed(() => parseDetailConfig(data.value));
const layout = computed<DetailLayout>(() => detailLayout(config.value));
const visible = (key) => blockVisible(config.value, key);
```

## 三种版式拼装

### A · `DetailClassic.vue`（京东经典版）
桌面信息列靠左、图集靠右（沿现有主网格），功能块积木显隐驱动，而非写死：

```
图集(gallery)        info+price+promo
[轮播+缩略图]         ├ service 保障条
                     ├ variants 规格
                     └ purchase 加购栏
description 富文本（整幅）
reviews / nearby / related
```

A 版渲染结果与现有 `standard` 等价（兜底回归不变）。

### B · `DetailFloor.vue`（京东楼层/富详情版）
顶部轻量信息卡 + 整页彩图楼层 + **吸顶楼层 tab**（详情/参数/评价/售后）。借助项目已有 `@vueuse/nuxt` 实现吸顶锚点。对应现有 `rich` 语义（描述不 `line-clamp`）。

### C · `DetailDualBuy.vue`（京东经典 + 双按钮）
与 A 拼装一致，差异：`purchase` 块渲染底部**双按钮**「立即购买 + 加入购物车」；`service/promo` 区**可折叠**。

## 读取链路：context.gql 扩展

`GetChannelTheme` 增加 `detailConfig`：

```
activeChannel { customFields { themeId  shopContent  detailConfig } }
```

- 与 `useChannelTheme`/`useShopContent` 走同一次 SSR 查询，**零新增请求**。
- 生成类型随 codegen（`disableOnBuild:false`，构建时自动 codegen）更新。

## L1 配色令牌扩展（最小闭环）

theme.css 从单一 `--ui-primary` 扩为统一语义令牌集，京东/淘宝各给整组值，未定义主题落 `default`（内建兜底已存在）：

```css
:root[data-theme='jd-red'] {
  --ui-primary: #E1251B; --ui-success:#07c160; --ui-warning:#ff8f1f;
  --ui-error:#f03d3d; --ui-radius:0.375rem; --font-size-base:14px;
}
:root[data-theme='taobao-orange'] { --ui-primary:#FF5000; --ui-radius:0.5rem; ... }
:root[data-theme='default'] { /* 内建兜底 */ }
```

- 消费：块样式用 `var(--ui-*)` 引用；JS 读 `getComputedStyle` 仅当需要（保持 SSR 一致）。
- 兜底天然成立：CSS 变量继承/覆盖，`data-theme` 缺省走 `default`。
- **L1 令牌形态**：主题常量表直接映射（非后台可编辑 CSS 变量）——本次取简单形态，后续要灵活性再升级。

## 复用与降本原则

- 零重写：三版式全复用现有 `ProductGallery / ProductVariants / ProductDescription / NearbyStores` 等，仅新增少量新块（PriceBlock / PromoBlock / ServiceBlock / PurchaseBar / ReviewsSection）。
- 数据流不破：`useProductStore` 为跨组件全局响应式，版式切换无重复拉取/状态错乱。
- 图片：新块一律 `assetSrc` + 懒加载（沿用已完成改造）。

## 测试与验收策略

| 层 | 手段 | 验收标准 |
|---|---|---|
| 类型 | `pnpm typecheck` | 无新增错误（基线已有 N 个历史错误，不允许新增） |
| 单元 | `parseDetailConfig / detailLayout / blockVisible` | 缺省→classic；坏 JSON→null→classic；blocks 缺省全可见 |
| 组件级 | 本地 `pnpm dev` + Playwright | 三版式各渲染：layout 含 classic/floor/dualBuy 出对应版式 |
| 集成 | detailConfig 注入 GetChannelTheme mock + SSR | SSR HTML 含对应版式关键 DOM；图片带 `assetSrc` webp 参数 |
| 回归 | 无 detailConfig（null） | 回退 classic 且与现有 standard 渲染等价 |
| 端到端 | dev 连线上后端 | 配置 detailConfig 后三版式桌面/移动正确切换 |

**成功标准**：三版式后台可指定并正确渲染；数据仍走 `useProductStore` 单一状态；无新增 typecheck 错误；无 detailConfig 时行为与现状一致。

## 国际化落地边界

- **本次**：详情页新增块的固定文案进 i18n 字典 `messages.detail.*`（至少 zh-CN/en-US，其余走 `fallbackLocale`）；`LocalizedText` 支持台可编辑多语言字段，`localizeText` 逐级回退。
- **后续**：首页 `shopContent`、分类页 `categoryConfig` 的文案多语言化（同一套 `LocalizedText/localizeText` 模式复用）；其余语种字典补 key。

## 不在本次范围（后续迭代）

- 分类页积木化（`categoryConfig`）
- 后台自由排序/重排详情功能块（"解析后重排"）
- L1 令牌后台可编辑（改为运行时覆盖）
- 首页块 L3 样式字段全面补齐（本次仅详情块埋最小字段）
- 首页/其余页文案多语言化（见「国际化落地边界」）

## 逐步实现（写入实现计划后细化为里程碑）

1. L1 令牌扩展（theme.css）
2. `detail-config.ts` 类型/解析/兜底工具 + 单测
3. context.gql 增 `detailConfig` + codegen
4. `useDetailConfig` composable
5. 新块组件 PriceBlock/PromoBlock/ServiceBlock/PurchaseBar/ReviewsSection
6. `ProductDetailRenderer` + 三版式组件，接入详情页
7. 本地构建/typecheck/验收 →（按部署铁律）部署