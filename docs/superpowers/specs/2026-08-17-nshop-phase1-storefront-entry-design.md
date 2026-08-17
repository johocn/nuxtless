# nshop · 阶段 1 商城主入口 — 设计文档

- **日期**：2026-08-17
- **项目**：`d:\zhao\nshop`（nuxtless fork，京东/淘宝风格 Vendure 电商前台）
- **范围**：阶段 1「商城主入口」——京东风首页运营位 + 分类列表页筛选/排序增强
- **状态**：待审阅

## 1. 背景与目标

阶段 0 已落地基座：nuxtless fork 克隆、主渠道认证（bearer + channel-token）、京东红主题变量、typed GraphQL、i18n/SEO、本地 build + pm2 部署链路，并已线上验证。

但商城主入口仍是**国外模板默认风**：首页用 Unsplash 随机图做 hero banner（无运营位概念），分类列表是「搜索 + 分页」骨架，无 facet 筛选与排序。这不符合京东/淘宝的经营结构。

阶段 1 的目标是**把主入口做成可运营的京东风**：
1. 在 Vendure 新增轻量**首页运营位模型** `OperationalBlock`（hero/banner、楼层/flash-sale 占位），支持后端录入、前端按序渲染，且可优雅降级。
2. 增强分类列表页：加**排序条 + Facet/分类筛选抽屉**。
3. 复用阶段 0 已通的数据链路（search/collection/product），不做新交互范式。

> 注意：本 spec 仅「阶段 1」范围。会员价/Plus（阶段 2）、营销（领券/拼团/秒杀，阶段 3）、分销、支付细化均属后续 spec；本期只搭运营位模型的 hero/floor 类型与占位。

## 2. 关键决策

| 事项 | 决策 |
|---|---|
| 技术方案 | **方案 A：Vendure 新增运营位模型** + 前端按序渲染 + 列表页增强（用户已确认） |
| 复用基准 | 参考既有 `FloorBuilderPlugin` 演示插件（Collection customFields + dashboard 预览），但将其从「演示/test 插件」升级为「正式可落库、Shop API 可读」的模型 |
| 数据模型 | 新增 `OperationalBlock` 实体（单模型统一承载 hero/floor，YAGNI，不拆 surface 层） |
| 列表增强 | 复用 `search(facetValueIds:, sort:)`，扩展既有 `GetCollectionProducts`，不新增查询 |
| 图片 | 沿用阶段 0 passthrough provider（不本地优化），运营位图片走 Vendure Asset API / 公网 |
| 部署 | 后端 Vendure 增量（build + 迁移 + pm2 restart）；前端本地 build + scp 上传 + pm2（遵守部署铁律，服务器不构建） |

## 3. 架构

```
Vendure 侧 (packages/dev-server/src 或 packages/x-plugin)        nshop 前端
────────────────────────────────────────────────                 ──────────
OperationalBlock 实体（新）
 ├ 表 operational_block
 ├ Admin schema: OperationalBlockAdminQuery/Line/admin
 ├ Shop schema:  OperationalBlockShopQuery（读）/ home-operational()
 ├ image 关联 Asset
 ├ linkCollection rel → Collection
 └ linkProducts  rel → Product[ ]
                                                     GQL          首页 index.vue
 Collection.customFields（沿用 FloorBuilder）  ←───────────────  ├ Hero 主横幅（OperationalBlock type=hero）
 └ floorLayout / floorTheme (预留)                                 ├ 频道钻石条（nav 快捷入口，阶段 3 丰富）
                                                                   ├ 楼层（type=floor：双列/三列/横向滚动）
                                                                   └ 秒杀位占位（type=flash-sale 本期空态）
                                                     GQL         分类 category/[slug].vue
 search(facetValueIds, sort)  ←──────────────────────────────────  ├ 排序条（综合/销量/新品/价格↑↓）
 GetCollectionProducts(扩展)                                       ├ 筛选抽屉（分类树 + Facet 品牌/价格段）
                                                                   └ 商品网格 ProductCard（京东式卡片）
```

### 3.1 数据流

1. **后台录入**：Admin UI（Vendure dashboard 自建扩展或 admin API）维护 `OperationalBlock`（code/type/title/layout/图片/链接商品/排序/启用）。
2. **前端拉取**：nshop composable `useHomeOperational()` 调 Shop API `operationalBlocks`（按 `position` 升序、`enabled=true`、过滤 `type in [hero,floor]`）。
3. **渲染**：`index.vue` 遍历区块 → 各类型专用渲染组件 → 商品展示走 `OperationalBlock.linkProducts` 的直接 Product 字段或 `collectionSlug` 走一次 `GetCollectionProducts`。
4. **列表增强**：`category/[slug].vue` 把选中排序/筛选条件写入 `useSearch` 参数，传给 search（`sort`/`facetValueIds`/`collectionSlug` + 分页），响应式更新网格。
5. **降级**：当运营位接口空/异常时，`index.vue` 回退渲染 nuxtless 自带 `home/*` 组件兜底，保证首屏不白。

### 3.2 错误处理

- 运营位接口失败：`useHomeOperational` 捕获 → `data = []`，首页走兜底区块，不阻塞 SSR（`await` 但失败不抛）。
- 某楼层 `linkProducts` 为空：渲染空态占位（标题保留 + “敬请期待”），不删除楼层。
- 列表筛选无结果：网格显示空态文案 + “清空筛选”。
- 图片加载失败：镜头占位符灰色块（沿用现有 placeholder-class 思路）。

## 4. 后端数据模型（OperationalBlock）

### 4.1 实体 — `OperationalBlock`

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | string, unique, index | 运营位标识（如 `home-hero`、`home-floor-brand`） |
| `type` | enum | `hero` \| `floor` \| `nav-diamond` \| `flash-sale`（本期实现 hero/floor，nav/flash-sale 占位） |
| `position` | int | 首页渲染顺序，升序 |
| `title` | string | 楼层/横幅标题 |
| `subTitle` | string, nullable | 副标题/标语 |
| `layout` | enum | `hero_full` \| `double_grid` \| `triple_grid` \| `single_scroll`（默认 `double_grid`，沿用 FloorBuilder 命名） |
| `linkCollection` | @ManyToOne Collection, nullable | 跳转分类 |
| `linkProducts` | @ManyToMany Product, nullable | 楼层/横幅选品（关联 product 直接取图与名称） |
| `metadata` | jsonb | 预留元数据（高度、主题色等） |
| `enabled` | bool, default true | 开关 |
| `sortOrder` | int, default 0 | Admin 排序/兜底顺序 |

> 权限：Admin schema 全量 CRUD；Shop schema 仅公开读，且强制 `enabled=true` + 按 `position` 排序，不暴露内部字段。

### 4.2 迁移

- 新增/注册实体，走 Vendure 标准 migration（`migration.ts` / 启动 generate）生成 `CreateOperationalBlock`，不含 TS 语法（参照既有 migration 约定）。
- 预留 `Collection.customFields.floorLayout/floorTheme/floorItemConfig`（沿用 FloorBuilder 演示字段），本期不读，仅保证类型连通。

## 5. nshop 前端交付项

### 5.1 首页 `app/pages/index.vue`

- 计数器逻辑改为：拉 `useHomeOperational()` → 渲染区块序列；空则兜底 `home/*`。
- 新增区块组件（`layers/shop/components/home/`）：
  - `OperationalHero.vue`（hero_full：大图 + 标题 + 跳转）
  - `OperationalFloor.vue`（double/triple/single_scroll：标题条 + 商品卡片网格）
  - `FlashSalePlaceholder.vue`（本期空态占位，接入阶段 3）
- 删除/停用 Unsplash 随机 hero（运营位接管）；`HomeHero` 等旧组件下线或仅作兜底。

### 5.2 分类列表 `layers/base/app/pages/category/[slug].vue`

- 顶部商品级「排序条」：综合 / 销量 / 新品 / 价格↑ / 价格↓ → 映射 `search(sort:)`。
- 「筛选」按钮 → 抽屉（`layers/base/app/components/category/` 新增或增强）：
  - 分类树（子 Collection 级联）
  - Facet 筛选：品牌、价格段（走 `facetValueIds`）
- 复用 `GetCollectionProducts` 扩展 `$term?/sort/facetValueIds` + 分页；选中条件变化重置到第一页。

### 5.3 GQL 与类型

- `layers/shop/gql/queries/operational.gql`：拉取运营位 + 关联商品/图/链接分类。
- 列表查询在 `layers/base/gql/queries/collection.gql` 的 `GetCollectionProducts` 增补 `sort`/`facetValueIds` 参数。
- 用 `nuxt-graphql-client` codegen 生成类型；前端 types/ 增补对应结构。

### 5.4 主题 / 组件风格

- 复用阶段 0 `--color-brand`（京东红）变量；商品卡片/排序条/抽屉统一京东风（红色价格、白底卡片、吸顶工具栏）。

## 6. 测试与验证

- **后端**：Admin 录入一个 hero + 一个 floor → Shop API 可读、`enabled=false` 被过滤；迁移可幂等重跑（参照既有 migration-runner）。
- **前端（本地）**：`pnpm dev` 首页渲染 hero/floor 区块、空数据兜底；分类页排序/facet 筛选生效、分页正常。
- **部署（遵守铁律）**：后端增量 OK → pm2 restart；前端本地 build → scp `.output/` → pm2 restart → 线上 `curl` 首页 200 + 运营位接口 200；检查无 `Cannot find module` / 无 500。
- **回归**：购物车/结算/认证（阶段 0）不回归。

## 7. 非目标（阶段 1 不实现）

- Plus/会员价/会员专属页（阶段 2）
- 领券/拼团/秒杀运营页面本体（阶段 3，本期仅 flash-sale 占位）
- 分销/评价/售后
- `nav-diamond` 频道完全体（本期占位）
- 运营位 WYSIWYG 编辑器（先用 Admin/SDK 手工录入 + 简单表单，重编辑器后续）

## 8. 里程碑

| 里程碑 | 内容 |
|---|---|
| M1 后端 | `OperationalBlock` 实体 + Admin/Shop schema + 迁移，Shop API 可读 |
| M2 首页 | `useHomeOperational` + Hero/Floor 组件 + 兜底 |
| M3 列表 | 排序条 + Facet/分类筛选抽屉 |
| M4 联调部署 | 本地联调 → 后端 build/迁移/pm2 → 前端 build/scp → 线上验证 + 回归 |