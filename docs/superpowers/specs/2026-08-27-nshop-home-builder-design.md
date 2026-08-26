# nshop 首页积木式装修 + 主题风格跟随设计

> 日期：2026-08-27
> 范围：让 nshop 首页（京东风格首页）支持**后台积木式装修**（每租户自由加减区块、区块内自选样式）与**主题风格跟随**（布局随京东/淘宝/极简等主题变化）。管理入口复用 vshop web-admin 装修页，数据统一存 `Channel.customFields.shopContent`。

## 背景

nshop 目前首页是**硬编码**京东风格组件固定顺序（[index.vue](../app/pages/index.vue)）：PC 版与移动版分别写死 `JdCategoryNav → JdBannerCarousel → JdFunctionGrid → JdBrandFloor → JdPlazaGrid → JdProductGrid`。运营想调整区块顺序、增删区块、切换不同电商风格（京东/淘宝/极简）都改不了前端代码。

同时后台已有两套半成品能力，但未打通：
- **vshop web-admin 装修页**：已支持积木式编辑（banner/notice/nav/goods/richText 五类区块，可添加/删除），数据存 `Channel.customFields.shopContent`（JSON）；还有「主题风格」页管理 `themeId`。
- **operations-plugin ContentItem 引擎**：nshop 首页通过 `publishedContent` 消费，但目前只用其 Banner 轮播。

用户明确决策：
1. **布局跟随主题变**（京东/淘宝/极简等主题各自有首页布局模板）。
2. **金刚区图标保持圆形**（圆形图标跨风格一致，宫格排布跟随主题）。
3. **「为你推荐」选淘宝风双列大图瀑布流**（大图 + 价格/销量/店铺三行信息）。
4. **管理入口 = 复用 vshop web-admin 装修页**。
5. **数据统一用 shopContent**（后端零改动，vshop C 端与 nshop 共用一套装修数据）。

## 目标

- 后台积木式设计：每租户可自由加减首页区块、拖拽排序、为每个区块自选样式。
- 风格跟随：主题级默认风格（themeId）决定区块布局，区块级字段可覆盖主题默认。
- 保持现状兼容：未配置装修时首页按现有京东布局兜底渲染，不影响线上。
- **明确量化对页面显示速度的影响**（本设计的重点）。

## 现状关键事实（探索结论）

| 项 | 现状 | 位置 |
|---|---|---|
| 装修数据 | `Channel.customFields.shopContent` = `{ version: 1, sections: [{type:'banner'|'notice'|'nav'|'goods'|'richText', ...}] }` | vshop `pages/decorate/home/index.vue`（`updateChannelCustomFields`） |
| 主题数据 | `Channel.customFields.themeId`（default/jd-red/taobao-orange/minimal 等） | vshop `pages/decorate/theme/index.vue`；nshop [useChannelTheme.ts](../layers/base/app/composables/useChannelTheme.ts) |
| nshop 首页 | 硬编码 Jd 组件固定顺序；PC（`lg:block`）与移动（`lg:hidden`）两套 | [index.vue](../app/pages/index.vue) |
| nshop 主题应用 | `useChannelTheme` 读 themeId → `<html data-theme>` → [theme.css](../app/assets/css/theme.css) 切 `--ui-primary` 等 | [useChannelTheme.ts](../layers/base/app/composables/useChannelTheme.ts) |
| nshop 首页数据 | `useHomeContent`（publishedContent）+ 两次 `SearchProducts`（热门/为你推荐） | [useHomeContent.ts](../layers/base/app/composables/useHomeContent.ts)、[index.vue](../app/pages/index.vue#L46-L49) |
| 硬编码色 | 金刚区/为你推荐/快讯多处 `bg-[#e6162d]`/`text-[#e6162d]` | [JdFunctionGrid.vue](../layers/base/app/components/home/jd/JdFunctionGrid.vue)、[index.vue](../app/pages/index.vue) |

## 方案

### 1. 数据模型扩展（shopContent，向后兼容）

现有 5 类 section 保持结构不变（vshop C 端 uni-app 继续兼容），**新增可选样式字段**，缺省时由主题默认风格兜底：

```ts
type ShopSection =
  | { type: 'banner';  images: { image: string; link?: string }[] }
  | { type: 'notice';  text: string }
  | { type: 'nav';
      items: { label: string; image?: string; link?: string }[];
      shape?: 'round' | 'square';             // 图标形状（圆形/方形金刚区）；默认跟随主题（默认 round）
      layout?: 'grid5x2' | 'grid4x2' | 'row'; // 宫格排布；默认跟随主题
    }
  | { type: 'goods';
      collectionId?: string;                  // 商品来源集合；为空则自动推荐（fallback 现有 SearchProducts）
      layout?: 'compact' | 'masonry' | 'single'; // 卡片布局；默认跟随主题
      title?: string;
    }
  | { type: 'richText'; html: string };
```

要点：
- **字段只增不改**，vshop C 端 `templates/shared/schema.ts` 解析时忽略新字段即零影响。
- `style`/`layout` 均为**区块级覆盖**，不填则走主题默认（见 3）。

### 2. nshop 渲染器（积木式）

新增 `useShopContent()`（读 `activeChannel.customFields.shopContent` 并 `JSON.parse`），并在 `blocks/` 目录下新增统一渲染入口 `HomeBlockRenderer.vue`，按 `section.type` 映射组件：

| section.type | 渲染组件 | 样式选择 |
|---|---|---|
| banner | 复用 `JdBannerCarousel` | — |
| nav | 金刚区组件（复用 `JdFunctionGrid`，新增 `shape`/`layout` props） | shape: round/square + layout: grid5x2/grid4x2/row |
| goods | 商品楼层组件（compact 复用现有卡片；masonry 新增瀑布流大图卡；single 新增单列大图横卡） | compact/masonry/single |
| notice | 公告条（`NoticeBar`） | — |
| richText | 富文本渲染 | — |

[index.vue](../app/pages/index.vue) 移动端 `main` 改为按 `sections` 顺序渲染 `HomeBlockRenderer` 列表；**未配置装修（sections 为空）时保持现有京东布局兜底**，保证零配置可用。PC 版本次保持现有京东布局不动（仅后续可选积木化）。

### 3. 主题布局跟随（themePresets）

新增 `themePresets` 表：`themeId → { nav: {shape, layout}, goods: {layout} }`，渲染时 `区块shape/layout = section.shape/layout ?? themePresets[themeId]`：

| themeId | 金刚区 | 为你推荐 |
|---|---|---|
| `default` / `jd-red`（京东） | round + grid5x2（现状） | compact |
| `taobao-orange`（淘宝） | round + grid4x2 | masonry（双列大图瀑布流） |
| `minimal`（极简） | round + row（单行图标条） | single |

说明：主题默认均为**圆形**金刚区（满足"淘宝风也想要圆形"），但运营可在区块级覆盖为**方形**；主题色跟随是全局 token 机制，圆形/方形均跟随 `data-theme`。

配套把金刚区/为你推荐/快讯里的硬编码 `#e6162d` 等替换为 `bg-primary`/`text-primary`（`--ui-primary`），使配色跟随 `data-theme`。

### 4. vshop 装修页 UI 扩展（用户手动构建）

- nav section：图标形状（圆形/方形）+ 宫格排布（京东十宫格/淘宝双排/极简单行）选择控件，默认跟随主题（圆形）。
- goods section：卡片布局（紧凑/瀑布流/单列）+ 商品来源（集合选择或自动推荐）。
- 保存逻辑沿用 `updateChannelCustomFields(id, { shopContent })`，后端**零改动**（customFields 已支持任意 JSON）。

### 4.1 灵活性的边界（避免过度设计）

- **能做到**：区块自由加减/排序；每区块自选样式（金刚区：圆形/方形 + 排布；商品卡：紧凑/瀑布流/单列）；每租户独立装修；主题默认兜底；未装修回退现有京东布局；主题色全局跟随（圆形/方形均跟随）。
- **不做**：后台生成新组件/新区块类型（类型由前端组件决定）、拖拽式精细排版（vshop 上下移足够）、富文本/极简等 vshop 已有能力不新增扩展。
- **取舍**：`shape` 仅保留 `round/square`（用户点名的能力，轻量枚举字段 + CSS 类切换，非过度设计）；砍掉"无底图标"等为极简假设场景铺路的设计。

### 5. 性能影响分析（重点）

核心结论：**积木化 + 主题跟随对页面显示速度影响极小（预期 <5%）**，主要增量是「每个 goods 区块多一次商品搜索」，其余全部可忽略。逐项量化：

| 关注点 | 现状 | 改造后增量 | 结论 |
|---|---|---|---|
| **SSR 渲染开销** | 硬编码固定组件树 | `HomeBlockRenderer` 为编译期 `switch(type)→组件`，区块数通常 ≤10，单区块渲染成本与现在组件等价 | 可忽略（<1ms） |
| **数据请求数** | `GetHomeContent` + 2×`SearchProducts` | `shopContent` 与 `themeId` **同一次** `activeChannel` 查询返回（扩展 `GetChannelTheme` query 同时取 `customFields`），**不新增请求**；每个 goods 区块 +1 次 `SearchProducts(collectionId)` | 每页建议 goods 区块 ≤2，配合 useAsyncData key 去重，增量可忽略 |
| **JSON 解析** | — | `shopContent` 为 KB 级，`JSON.parse` <1ms，SSR 一次性 | 可忽略 |
| **图片数量与体积** | 轮播图 + 商品图 | 积木系统只改变组织方式、不增加图片；瀑布流大图用 NuxtImg `format=webp` + 尺寸裁剪（ipx）控制体积 | 与本次改造无关，属既有优化空间 |
| **SSR 首字节（TTFB）** | 首页依赖 1 次 channel + 2 次商品查询 | 增量仅少量 JSON 解析 + ≤2 次商品查询（与现有 2 次并发） | 微增，可忽略 |
| **客户端包体积** | Jd 组件已打包 | 新增瀑布流/单列卡片组件走 Nuxt 代码分割/懒加载，不进首屏 bundle | 首屏无影响 |
| **缓存** | `useAsyncData` key 缓存 | `shopContent` 复用同一 key 缓存，SSR 内共享 | 不变 |

**风险点与对策**：
- 商品搜索请求量随 goods 区块数线性增长 → 装修时限制每页 goods 区块 ≤2（后台 UI 提示），并对同 collectionId 的区块去重合并请求。
- 主题切换本身是 `data-theme` 属性 + 已编译 CSS 变量，无运行时重算，零开销。

#### 5.1 核心 Web Vitals 影响评估（FCP / LCP / TTFB / TTI）

| 指标 | 现状基线 | 改造后预期 | 影响原因 |
|---|---|---|---|
| TTFB（首字节） | SSR 返回 HTML 前需完成：channel 查询 + 首页内容 + 2 次商品搜索 | 同基线（channel 查询一次带出 themeId+shopContent，不新增请求；商品搜索次数不变） | 增加的成本是 KB 级 JSON 序列化到 HTML，<1ms |
| FCP（首屏绘制） | 首屏 HTML 即含 banner + 金刚区 | 首屏关键区块（banner/nav）仍最先渲染，保持 HTML 内联顺序 | 积木化不改变首屏区块的 SSR 内联时机 |
| LCP（最大内容） | 轮播首图 | 轮播首图仍为首个最大元素；瀑布流大图仅在用户滚动到的 goods 区块出现 | 无回归 |
| TTI（可交互） | 客户端 hydration Jd 组件 | 组件总量不变（同一批组件复用），无新增 hydration 体积 | 新增瀑布流/单列组件代码分割，不阻塞首屏 |

结论：**四项核心 Web Vitals 均无感知回归**。积木化改变的只是"组件按后台配置排序"，数据依赖与现状一致。

#### 5.2 实测方法与基准（改造前后对比）

沿用 [bundle-audit.md](../bundle-audit.md) 的既有方法，改造前后各跑一次，记录并对比：

1. **Lighthouse 移动端**：FCP / LCP / TTFB / CLS / 总请求数 / 传输体积（重点看传输体积与请求数增量）。
2. **Nuxt `useAsyncData` 请求日志**：确认首页 SSR 请求数不增（channel 1 次 + 商品 ≤2 次）。
3. **首屏 HTML 体积**：对比 `shopContent` 注入后 HTML 增量（预期 <10KB）。
4. **pm2/服务器日志**：确认无新增慢查询（channel 查询带 shopContent 后响应时间无变化）。

阈值：改造后 TTFB 增量 ≤30ms、FCP/LCP 增量 ≤5%、请求数不增 —— 超出即回查（优先检查是否误新增了商品查询或图片尺寸未裁剪）。

#### 5.3 性能保护机制（落地约束，写入实施）

1. **请求数硬约束**：首页 SSR 商品搜索总次数 ≤2（与现状持平）；goods 区块共享同一 `useAsyncData` key 合并去重，同 collectionId 只查一次；后台 UI 提示 goods 区块 ≤2。
2. **图片规格 + 懒加载**：商品卡统一经 `NuxtImg` + ipx 输出 `format=webp` 固定尺寸（瀑布流 600×600 / 紧凑 300×300），禁止原图直出；首屏外区块图片 `loading="lazy"`，banner 首图 `fetchpriority="high"`。
3. **代码分割**：masonry/single 商品卡片组件用 Nuxt 自动按需加载，不进首屏 bundle。
4. **缓存**：`useShopContent` 走 `useAsyncData` + `{ server: true }`，SSR 内共享一次 channel 查询；shopContent 变化靠 SSR 天然刷新，不引入额外失效机制。

## 实施范围与里程碑

- **M1 · nshop 数据打通**：扩展 `GetChannelTheme` query（同时取 themeId + shopContent）、`useShopContent()`、`HomeBlockRenderer` 骨架、index.vue 移动端积木化 + 空配置兜底。
- **M2 · 主题布局跟随**：`themePresets`、金刚区 layout/style props、goods 三态卡片（compact 复用 / masonry 新增 / single 新增）、配色 token 化（替换硬编码红）。
- **M3 · vshop 装修页 UI 扩展**：nav/goods 样式选择控件（**用户 HBuilder X 手动构建**）。
- **M4 · 部署**：nshop 部分我本地构建（`node scripts/deploy.mjs` → scp → pm2 restart，遵守部署铁律，绝不在服务器构建）。

## 排除项

- operations-plugin `ContentItem` 引擎不用于本方案（保持现状，仅 banner 轮播复用）。
- PC 版首页积木化（本次保持京东布局，仅移动端积木化；PC 可后续同机制扩展）。
- 区块拖拽排序的精细 UI（vshop 现有上下移即可，不做拖拽库）。

## 验收

- 后台（vshop 装修页）能对指定租户自由加减区块、为金刚区/为你推荐选择样式并保存，nshop 前台立即生效。
- 切 `themeId=taobao-orange` 时：金刚区保持圆形图标 + 双排宫格，为你推荐变双列大图瀑布流；`minimal` 时金刚区单行、为你推荐单列。
- 区块级样式选择可覆盖主题默认。
- 未配置装修的租户首页与现在完全一致（兜底生效）。
- 首页 SSR 性能无感知下降：Lighthouse 前后对比 TTFB 增量 ≤30ms、FCP/LCP 增量 ≤5%、首页请求数不增（详见 §5.2）。
- 图片全部 webp + 固定尺寸裁剪，首屏外懒加载，goods 区块 ≤2（性能保护机制生效）。
- nshop 本地构建通过并部署（vshop 由用户构建）。

## 风险与开放问题

- vshop C 端是否也消费扩展后的 shopContent 样式字段（本设计不强制，仅 nshop 消费；如需 vshop C 端也风格化，字段可复用同一 schema）。
- 「自动推荐」（goods 无 collectionId）的商品排序策略需在 M1 明确（暂用现有 SearchProducts 热门/推荐语义）。
