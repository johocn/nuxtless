# nshop 首页积木式装修（京东风格模板）+ 主题色跟随 设计

> 日期：2026-08-27（修订：聚焦京东风格模板，金刚区/商品卡提供淘宝风格布局作为可选样式）
> 范围：让 nshop 首页在**京东风格模板**基础上支持积木式装修——单套可自由增删/排序/换样式的首页区块配置，后台可视化搭建，前台按配置渲染；金刚区等区块提供多种样式（含淘宝风格圆形图标、双列大图瀑布流）供客户选择；主色统一跟随所选主题。

## 背景

nshop 目前首页是**硬编码**京东风格组件固定顺序（[index.vue](../app/pages/index.vue)）：PC 版与移动版分别写死 `JdCategoryNav → JdBannerCarousel → JdFunctionGrid → JdBrandFloor → JdPlazaGrid → JdProductGrid`。运营想调整区块顺序、增删区块、给金刚区换样式（方形/圆形、宫格排布）、把「为你推荐」做成淘宝双列大图瀑布流，都改不了前端代码。

同时后台已有两套半成品能力，但未打通：
- **vshop web-admin 装修页**：已支持积木式编辑（banner/notice/nav/goods/richText 五类区块，可添加/删除），数据存 `Channel.customFields.shopContent`（JSON）；还有「主题风格」页管理 `themeId`。
- **operations-plugin ContentItem 引擎**：nshop 首页通过 `publishedContent` 消费，但目前只用其 Banner 轮播。

用户明确决策（2026-08-27 修订）：
1. **当前聚焦京东风格模板，一切按京东风格落地**——不做按风格分套的多套区块体系。
2. **金刚区可加淘宝风格布局供客户选择**：区块内可选「京东方形图标」或「淘宝圆形图标」、可选「京东十宫格/淘宝八宫格/极简单行」排布。
3. **「为你推荐」可选淘宝风双列大图瀑布流**（大图 + 价格/标题/底行信息），与京东紧凑卡并列可选。
4. **区块增减/排序/样式均在京东模板基础上进行**（单套 sections，无多风格分套）。
5. **管理入口 = 复用 vshop web-admin 装修页**；数据统一用 shopContent（后端零改动）。
6. **主题色全局跟随 `data-theme`**（themeId），与区块样式解耦——选哪个形状/布局，主色都跟当前主题。

## 目标

- **积木化**：单套 `sections`，可自由加减/排序区块，互相独立。
- **京东风格落地**：新建区块默认样式 = 京东（金刚区方形图标、十宫格；商品卡紧凑），渲染兜底同京东。
- **区块样式可选**：金刚区（方形/圆形 + 十宫格/八宫格/单行）、商品卡（紧凑/瀑布流/单列）；淘宝风格作为客户可选布局。
- **主题色全局跟随**：主色随 `data-theme` 走 token，与区块形状/布局无关。
- **向后兼容**：未配置装修回退现有京东布局；老数据（`sections` 结构）零迁移。
- **明确量化对页面显示速度的影响**（本设计的重点）。

## 现状关键事实（探索结论）

| 项 | 现状 | 位置 |
|---|---|---|
| 装修数据 | `Channel.customFields.shopContent` = `{ version: 1, sections: [...] }` | vshop `web-admin/src/pages/decorate/home/index.vue`（`updateChannelCustomFields`） |
| 主题数据 | `Channel.customFields.themeId`（default/jd-red/taobao-orange/modern-minimal 等） | vshop `web-admin/src/pages/decorate/theme/index.vue`；nshop [useChannelTheme.ts](../layers/base/app/composables/useChannelTheme.ts) |
| nshop 首页 | 硬编码 Jd 组件固定顺序；PC（`lg:block`）与移动（`lg:hidden`）两套 | [index.vue](../app/pages/index.vue) |
| nshop 主题应用 | `useChannelTheme` 读 themeId → `<html data-theme>` → [theme.css](../app/assets/css/theme.css) 切 `--ui-primary` 等 | [useChannelTheme.ts](../layers/base/app/composables/useChannelTheme.ts) |
| nshop 首页数据 | `useHomeContent`（publishedContent）+ 两次 `SearchProducts`（热门/为你推荐） | [useHomeContent.ts](../layers/base/app/composables/useHomeContent.ts)、[index.vue](../app/pages/index.vue#L46-L49) |
| 硬编码色 | 金刚区/为你推荐/快讯多处 `bg-[#e6162d]`/`text-[#e6162d]` | [JdFunctionGrid.vue](../layers/base/app/components/home/jd/JdFunctionGrid.vue)、[index.vue](../app/pages/index.vue) |

## 方案

### 1. 数据模型（沿用现有 sections 结构，零迁移、无 byTheme）

```ts
// Channel.customFields.shopContent
interface ShopContent { version: 1; sections: ShopSection[]; }

type ShopSection =
  | { type: 'banner';  images: { image: string; link?: string }[] }
  | { type: 'notice';  text: string }
  | { type: 'nav';
      items: { label: string; image?: string; link?: string }[];
      shape?: 'square' | 'round';        // 图标形状；默认 'square'（京东）；'round' = 淘宝风格
      layout?: 'grid5x2' | 'grid4x2' | 'row'; // 宫格排布；默认 'grid5x2'（京东十宫格）；'grid4x2' 淘宝八宫格 / 'row' 单行
    }
  | { type: 'goods';
      collectionId?: string;              // 商品来源集合；为空则自动推荐（fallback 现有 SearchProducts）
      layout?: 'compact' | 'masonry' | 'single'; // 卡片布局；默认 'compact'（京东）；'masonry' 淘宝瀑布流 / 'single' 单列
      title?: string;
    }
  | { type: 'richText'; html: string };
```

要点：
- **字段只增不改**：`sections` 结构与 vshop C 端现有解析完全兼容；`shape`/`layout`/`collectionId?` 均为新增可选字段，老数据忽略即零影响。
- **京东默认值**（前端常量，不落库，控制复杂度）：`nav → {shape:'square', layout:'grid5x2'}`、`goods → 'compact'`。新建区块时 UI 预填该默认；渲染时区块字段缺省用京东默认兜底。
- **淘宝风格 = 区块级可选值**：金刚区选 `shape:'round' + layout:'grid4x2'`（圆形八宫格）、商品卡选 `layout:'masonry'`（双列大图瀑布流），即呈现淘宝风格——无需维护独立套。
- 老数据（`{ version: 1, sections }`）直接使用，**零迁移**。

### 2. nshop 渲染器（积木渲染，themeId 不驱动区块）

- 新增 `useShopContent()`：读 `activeChannel.customFields.shopContent`（与 `themeId` 同一次 `GetChannelTheme` 查询返回），`JSON.parse` 后取 `sections`。
- 新增统一渲染入口 `HomeBlockRenderer.vue`，按 `section.type` 映射组件：

| section.type | 渲染组件 | 样式选择 |
|---|---|---|
| banner | 复用 `JdBannerCarousel` | — |
| nav | 金刚区组件（复用 `JdFunctionGrid`，新增 `shape`/`layout`/`items` props） | shape: square/round + layout: grid5x2/grid4x2/row |
| goods | 商品楼层组件（compact 复用现有卡片；masonry 新增瀑布流大图卡；single 新增单列大图横卡） | compact/masonry/single |
| notice | 公告条（`NoticeBar`） | — |
| richText | 富文本渲染 | — |

- [index.vue](../app/pages/index.vue) 移动端 `main` 改为按 `sections` 顺序渲染 `HomeBlockRenderer`；**sections 为空时保持现有京东布局兜底**（零配置可用）。PC 版本次保持现有京东布局不动（后续可同机制扩展）。
- **themeId 只驱动配色（`data-theme`），不驱动区块集合**——简化点：切主题只换主色，区块配置为单套（京东模板）。

### 3. 主题色跟随（token 化）

配套把金刚区/为你推荐/快讯里的硬编码 `#e6162d` 等替换为 `bg-primary`/`text-primary`（`--ui-primary`），使配色统一跟随 `data-theme`。**圆形/方形、任何布局均跟随同一套主色 token**。

### 4. vshop 装修页 UI 扩展（用户手动构建）

- **nav section**：图标形状（方形=京东/圆形=淘宝，预填方形）+ 宫格排布（京东十宫格/淘宝八宫格/单行，预填十宫格）。
- **goods section**：卡片布局（京东紧凑/淘宝瀑布流/极简单列，预填紧凑）+ 商品来源（集合选择或自动推荐，collectionId 可留空）。
- 保存逻辑沿用 `updateChannelCustomFields(id, { shopContent })`，写 `sections` 结构；后端**零改动**（customFields 已支持任意 JSON）。

### 4.1 灵活性的边界（避免过度设计）

- **能做到**：区块增删/排序（京东模板基础）；每区块自选样式（金刚区：方形/圆形 + 排布；商品卡：紧凑/瀑布流/单列），含淘宝风格布局；每租户独立装修；主题色全局跟随；未装修回退现有京东布局。
- **不做**：按风格分套的多套区块体系（本次明确不做，切主题不切区块集合）；后台生成新组件/新区块类型；拖拽式精细排版（vshop 上下移足够）；富文本/极简等已有能力不扩展。
- **取舍**：默认样式用前端常量而非落库；`shape` 仅 square/round；老数据零迁移。

### 5. 性能影响分析（重点）

核心结论：**积木化 + 样式可选对页面显示速度影响极小（预期 <5%）**，主要增量是「每个 goods 区块多一次商品搜索」，其余全部可忽略。逐项量化：

| 关注点 | 现状 | 改造后增量 | 结论 |
|---|---|---|---|
| **SSR 渲染开销** | 硬编码固定组件树 | `HomeBlockRenderer` 为编译期 `switch(type)→组件`，单风格区块数通常 ≤10，单区块渲染成本与现在组件等价 | 可忽略（<1ms） |
| **数据请求数** | `GetHomeContent` + 2×`SearchProducts` | `shopContent` 与 `themeId` **同一次** `activeChannel` 查询返回（扩展 `GetChannelTheme` query 同时取 `customFields`），**不新增请求**；每个 goods 区块 +1 次 `SearchProducts(collectionId)` | 每页建议 goods 区块 ≤2，配合 useAsyncData key 去重，增量可忽略 |
| **JSON 解析** | — | `shopContent` 为 KB 级，`JSON.parse` <1ms，SSR 一次性 | 可忽略 |
| **图片数量与体积** | 轮播图 + 商品图 | 积木系统只改变组织方式、不增加图片；瀑布流大图用 NuxtImg `format=webp` + 尺寸裁剪（ipx）控制体积 | 与本次改造无关，属既有优化空间 |
| **SSR 首字节（TTFB）** | 首页依赖 1 次 channel + 2 次商品查询 | 增量仅少量 JSON 解析 + ≤2 次商品查询（与现有 2 次并发） | 微增，可忽略 |
| **客户端包体积** | Jd 组件已打包 | 新增瀑布流/单列卡片组件走 Nuxt 代码分割/懒加载，不进首屏 bundle | 首屏无影响 |
| **缓存** | `useAsyncData` key 缓存 | `useShopContent` 复用同一 key 缓存，SSR 内共享 | 不变 |

#### 5.1 核心 Web Vitals 影响评估（FCP / LCP / TTFB / TTI）

| 指标 | 现状基线 | 改造后预期 | 影响原因 |
|---|---|---|---|
| TTFB（首字节） | SSR 返回 HTML 前需完成：channel 查询 + 首页内容 + 2 次商品搜索 | 同基线（channel 查询一次带出 themeId+shopContent，不新增请求；商品搜索次数不变） | 增加的成本是 KB 级 JSON 序列化到 HTML，<1ms |
| FCP（首屏绘制） | 首屏 HTML 即含 banner + 金刚区 | 首屏关键区块（banner/nav）仍最先渲染，保持 HTML 内联顺序 | 积木化不改变首屏区块的 SSR 内联时机 |
| LCP（最大内容） | 轮播首图 | 轮播首图仍为首个最大元素；瀑布流大图仅在用户滚动到的 goods 区块出现 | 无回归 |
| TTI（可交互） | 客户端 hydration Jd 组件 | 组件总量不变（同一批组件复用），无新增 hydration 体积 | 新增瀑布流/单列组件代码分割，不阻塞首屏 |

结论：**四项核心 Web Vitals 均无感知回归**。积木化改变的只是"组件按配置排序"，数据依赖与现状一致。

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

- **M1 · nshop 数据打通**：扩展 `GetChannelTheme` query（同时取 themeId + shopContent）、`useShopContent()`（解析 sections）、`HomeBlockRenderer` 骨架、index.vue 移动端积木化 + 空配置兜底。
- **M2 · 主题化渲染**：京东默认样式常量、金刚区 `shape`/`layout` props、goods 三态卡片（compact 复用 / masonry 新增 / single 新增）、配色 token 化（替换硬编码红）。
- **M3 · vshop 装修页 UI 扩展**：nav/goods 样式控件（含淘宝风格选项）（**用户 HBuilder X 手动构建**）。
- **M4 · 部署**：nshop 部分我本地构建（`node scripts/deploy.mjs` → scp → pm2 restart，遵守部署铁律，绝不在服务器构建）。

## 排除项

- **按风格分套的多套区块体系**（本次明确不做；切主题只切配色）。
- operations-plugin `ContentItem` 引擎不用于本方案（保持现状，仅 banner 轮播复用）。
- PC 版首页积木化（本次保持京东布局，仅移动端积木化；PC 可后续同机制扩展）。
- 区块拖拽排序的精细 UI（vshop 现有上下移即可，不做拖拽库）。

## 验收

- 后台（vshop 装修页）能加减区块、为金刚区/商品卡选择样式（含淘宝风格）并保存，nshop 前台按配置渲染，立即生效。
- 金刚区选「圆形 + 八宫格」→ 淘宝风格圆形图标双排宫格；选「方形 + 十宫格」→ 京东风格（默认）。
- 「为你推荐」选「瀑布流」→ 淘宝双列大图瀑布流；默认「紧凑」→ 京东紧凑卡。
- 老数据（仅 sections）正常显示（零迁移）。
- 未配置装修的租户首页与现在完全一致（兜底生效）。
- 首页 SSR 性能无感知下降：Lighthouse 前后对比 TTFB 增量 ≤30ms、FCP/LCP 增量 ≤5%、首页请求数不增（详见 §5.2）。
- 图片全部 webp + 固定尺寸裁剪，首屏外懒加载，goods 区块 ≤2（性能保护机制生效）。
- nshop 本地构建通过并部署（vshop 由用户构建）。

## 风险与开放问题

- vshop C 端是否也消费 `shopContent` 的 `sections` 新可选字段（本设计不强制；C 端 schema 已兼容新字段，零影响）。
- 「自动推荐」（goods 无 collectionId）的商品排序策略需在 M1 明确（暂用现有 SearchProducts 热门/推荐语义）。
- `SearchResult` 无「销量/店铺」字段，masonry 卡底行暂用「自营 + 站点名」；如需真实销量/店铺需另扩 query（后续项，不在本设计）。
- 主题色与区块关系：`themeId` 只驱动配色（`data-theme`），不驱动区块集合——简化后不存在"配色与区块错配"问题。
