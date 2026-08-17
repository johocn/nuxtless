# nshop · 阶段 1 商城主入口 — 设计文档

- **日期**：2026-08-17
- **项目**：`d:\zhao\nshop`（nuxtless fork，京东/淘宝风格 Vendure 电商前台）
- **范围**：阶段 1「商城主入口」——京东风首页运营位 + 分类列表页筛选/排序增强
- **状态**：已审阅（用户确认，进入实现计划）

## 1. 背景与目标

阶段 0 已落地基座：nuxtless fork 克隆、主渠道认证（bearer + channel-token）、京东红主题变量、typed GraphQL、i18n/SEO、本地 build + pm2 部署链路，并已线上验证。

但商城主入口仍是**国外模板默认风**：首页用 Unsplash 随机图做 hero banner（无运营位概念），分类列表是「搜索 + 分页」骨架，无 facet 筛选与排序。这不符合京东/淘宝的经营结构。

> **方向更新（2026-08-17）**：调研发现 Vendure 仓库 `operations-plugin` 已实现完整的 CMS 运营位引擎——`ContentItem` 单表多态（`ContentType`：Banner/Recommendation/Notice/Floor）、`data: JSON` 结构校验、Shop API `publishedContent(type, position)` 公开查询（自动过滤 `enabled=true` + 已发布 + 定时上下线）、启停/软删/排序/权限（`ManageBanner`/`ManageFloor`），且已在 `dev-config.ts` 启用。**故「新建 `OperationalBlock` 实体」为重复造轮子，后端零改动**，阶段 1 聚焦前端。

阶段 1 的目标是**把主入口做成可运营的京东风**：
1. **复用 ContentItem** 承载首页运营位（hero/banner + 楼层/flash-sale 占位），前端按序渲染，空数据优雅降级。
2. 增强分类列表页：加**排序条 + Facet/分类筛选抽屉**。
3. 复用阶段 0 已通的数据链路（search/collection/product），不做新交互范式。

> 注意：本 spec 仅「阶段 1」范围。会员价/Plus（阶段 2）、营销（领券/拼团/秒杀，阶段 3）、分销、支付细化均属后续 spec；本期只搭 hero/floor 类型与 flash-sale 占位。

## 2. 关键决策

| 事项 | 决策 |
|---|---|
| 技术方案 | **复用 ContentItem 引擎** + 前端按序渲染 + 列表页增强（用户已确认） |
| 后端 | **零后端改动** —— 复用 `operations-plugin` 已有 `ContentItem` + `publishedContent` Shop API（已在 dev-config 启用） |
| 运营位约定 | 首页用 `position: 'home'`；hero/banner 用 `type: Banner`（data.imageUrl）；楼层用 `type: Floor`（data.title + layout + items[]） |
| 列表增强 | 复用 `search(facetValueIds:, sort:)`，扩展既有 `GetCollectionProducts` 增补 `$sort/$facetValueIds` 参数 |
| 图片 | 沿用阶段 0 passthrough provider（不本地优化），运营位图片走 Vendure Asset API / 公网 |
| 部署 | 纯前端：本地 build + scp 上传 + pm2（遵守部署铁律，服务器不构建；后端无需动） |

## 3. 架构

```
Vendure 后端（零改动，既有）              nshop 前端
──────────────────────────────            ──────────
operations-plugin
 ├ ContentItem 单表多态                   GQL(publishedContent)
 │  type: Banner/Recommendation/Notice/Floor   首页 index.vue
 │  position: 'home' / sort                   ├ Hero 主横幅（type=Banner, data.imageUrl）
 │  data: JSON（结构校验内置）                 ├ 楼层（type=Floor, data.title/layout/items[]）
 └ Shop API publishedContent(type,position)  ├ 频道钻石条（阶段 3 丰富）
    （enabled=true + 已发布 + 定时上下线）      └ flash-sale 占位（本期空态）
                                                     GQL
 search(facetValueIds, sort)  ←──────────────────── 分类 category/[slug].vue
 GetCollectionProducts(扩展 sort/facetValueIds)     ├ 排序条（综合/销量/新品/价格↑↓）
                                                     ├ 筛选抽屉（分类树 + Facet/价格段）
                                                     └ 商品网格 ProductCard（京东式卡片）
```

### 3.1 数据流

1. **后台录入**：Vendure Admin 已具备 ContentItem 管理能力（adpter/ SDK 或 dashboard 扩展），运营在后台新建 `Banner`/`Floor` 类型内容，`position = 'home'`，`data` 存运营内容。
2. **前端拉取**：nshop composable `useHomeContent()` 调 Shop API `publishedContent(position: 'home')`，返回按 `sort` 升序、`enabled=true`、已发布的区块列表。
3. **渲染**：`index.vue` 遍历区块按 `type`/`data` 分发到专用组件：Banner → Hero；Floor → 楼层（`data.items[]` 为商品 id 数组 → 前端一次批查商品详情）。空 / 异常 → 回退 nuxtless 自带 `home/*` 组件。
4. **列表增强**：`category/[slug].vue` 把选中排序/筛选条件写入 `GetCollectionProducts` 参数（`sort`/`facetValueIds`/`collectionSlug` + 分页），响应式更新网格。
5. **降级**：当运营位接口空/异常时，`index.vue` 回退渲染 nuxtless 自带 `home/*` 组件兜底，保证首屏不白。

### 3.2 错误处理

- 运营位接口失败：`useHomeContent` 捕获 → `data = []`，首页走兜底区块，不阻塞 SSR（`await` 但失败不抛）。
- 某楼层 `data.items[]` 为空或商品批查无结果：保留标题 + 空态占位，不删除楼层。
- 列表筛选无结果：网格显示空态文案 + “清空筛选”。
- 图片加载失败：镜头占位符灰色块（沿用现有 placeholder-class 思路）。

## 4. 后端（复用，零改动）

- **不做任何后端改动**。复用 `operations-plugin` 既有 `ContentItem` 实体 + `ContentService.findPublishedContentItems` + `OperationsShopResolver.publishedContent`。
- 运营位数据约定（写入后端 ContentItem 的 `data` JSON）：
  - **Banner**：`{ imageUrl: string, link?: string, title?: string, subTitle?: string }`（data 校验已要求 `imageUrl`）
  - **Floor**：`{ title: string, layout: 'double_grid'|'triple_grid'|'single_scroll'|'hero_full', items: number[] }`（商品 id 数组；data 校验已要求 `title`+`layout`+`items`）
  - `position = 'home'`；同一 position 内按 `sort` 升序渲染。
- 若后续楼层需真实外键关联/拖拽编辑器，再演进为独立实体（阶段 3 评估）。

## 5. nshop 前端交付项

### 5.1 首页 `app/pages/index.vue`

- 计数器逻辑改为：拉 `useHomeContent()` → 渲染区块序列；空则兜底 `home/*`。
- 新增区块组件（`layers/base/app/components/home/`）：
  - `OperationalHero.vue`（Banner：大图 + 标题 + 跳转）
  - `OperationalFloor.vue`（Floor：double/triple/single_scroll 标题条 + 商品卡片网格）
  - `FlashSalePlaceholder.vue`（本期空态占位，接入阶段 3）
- 删除/停用 Unsplash 随机 hero（运营位接管）；`HomeFeaturedProducts` 等旧组件仅作兜底。

### 5.2 分类列表 `layers/base/app/pages/category/[slug].vue`

- 顶部商品级「排序条」：综合 / 销量 / 新品 / 价格↑ / 价格↓ → 映射 `search(sort:)`。
- 「筛选」按钮 → 抽屉（`layers/base/app/components/category/` 新增或增强）：
  - 分类树（子 Collection 级联）
  - Facet 筛选：品牌、价格段（走 `facetValueIds`）
- 复用 `GetCollectionProducts` 扩展 `$term?/sort/facetValueIds` + 分页；选中条件变化重置到第一页。

### 5.3 GQL 与类型

- `layers/base/gql/queries/operational.gql`：新增 `GetHomeContent`（`publishedContent(position: 'home')`）——返回 ContentItemPublic（id/type/name/sort/data）。
- `layers/base/gql/queries/product.gql`：新增 `GetProductsByIds`（`products(filter: { id: { in: [...] } })`，批量商品回查，供楼层渲染）。
- 列表查询在 `layers/base/gql/queries/collection.gql` 的 `GetCollectionProducts` 增补 `$sort`/`$facetValueIds` 参数。
- 用 `nuxt-graphql-client` codegen 生成类型；前端 `types/` 增补对应结构（ContentItemPublic、SearchResult sort 等）。

### 5.4 主题 / 组件风格

- 复用阶段 0 `--color-brand`（京东红）变量；商品卡片/排序条/抽屉统一京东风（红色价格、白底卡片、吸顶工具栏）。

## 6. 测试与验证

- **后端**：无需改动，仅确认 `publishedContent` Shop API 已启用可访问（线上 `curl` 一次校验）。
- **前端（本地）**：`pnpm dev` 首页渲染 hero/floor 区块、空数据兜底；分类页排序/facet 筛选生效、分页正常。
- **部署（遵守铁律）**：前端本地 build → scp `.output/` → pm2 restart → 线上 `curl` 首页 200 + `publishedContent` 接口 200；检查无 `Cannot find module` / 无 500。
- **回归**：购物车/结算/认证（阶段 0）不回归。

## 7. 非目标（阶段 1 不实现）

- Plus/会员价/会员专属页（阶段 2）
- 领券/拼团/秒杀运营页面本体（阶段 3，本期仅 flash-sale 占位）
- 分销/评价/售后
- `nav-diamond` 频道完全体（本期占位）
- 运营位 WYSIWYG 编辑器 / 独立强类型实体（用后台 ContentItem 手工录入，重编辑器后续）

## 8. 里程碑

| 里程碑 | 内容 |
|---|---|
| M1 首页 | `GetHomeContent` + `useHomeContent` + OperationalHero/Floor 组件 + 兜底 |
| M2 列表 | `GetCollectionProducts` 增补 sort/facetValueIds + 排序条 + Facet/分类筛选抽屉 |
| M3 联调部署 | 本地联调 → 前端 build/scp → 线上验证 + 回归 |