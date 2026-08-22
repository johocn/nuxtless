# nshop 本地电商底座设计（Design）

> 日期：2026-08-22 · 仓库：`nshop`（底座，涉及 `vendure` backend + admin 跨仓库改动）
> 范围：类似淘宝/京东风格的本地电商网站前端底座。后端用 Vendure 默认租户；商品归属某租户；商品级配送、支付方案按支付档案进行（前端结算映射）。

---

## 1. 背景与目标

- 在既有 **nshop**（Nuxt 4 + nuxt-graphql-client，京东淘宝风 SSR 前台）基础上推进新本地电商站。
- 后台使用 Vendure **默认租户（Channel）**；商品归属具体租户（ChannelAware / `customFields.channelId`）。
- 商品级配送 = 前端结算读取 `eligibleShippingMethods`（后端已由 `ShippingEligibilityChecker`/`ShippingCalculator` 逐店校验，阶段22 沉淀）；支付方案按**支付档案**（Profile）过滤配送与支付方式。
- 本设计只负责**前端底座四大块**，不重做后端业务能力（分销/积分/发票等仍属 vshop 已有、后续再移植）。

## 2. 总体架构与范围

```
┌────────────────────────────── nshop (Nuxt 4 SSR) ─────────────────────────────┐
│  layers/base                # 业务层：pages / components / composables / stores │
│  ├─ 首页运营位组件化渲染（type→组件，Floor 按 layout）                           │
│  ├─ 商品详情展示模板切换（product/[slug].vue）                                  │
│  └─ 渠道级配色主题（语义令牌 + <html data-theme>）                               │
└──────────────▲───────────────────────────────────────────┬─────────────────────┘
         publishedContent / product / channel   Vendure admin dashboard（装修页）
└──────────────┴───────────────────────────────────────────┴─────────────────────┘
                v                                   v
        vendure backend（默认租户）        vendure admin-ui（阶段45 Dashboard 模式）
  ┌─ operations-plugin: ContentType 扩展                        │
  │    IconGrid / CategoryNav + data JSON + sort/position       │
  ├─ Product.customFields.displayTemplate                       │
  └─ Channel.customFields.themeId                               │
```

**范围（四大块）**
1. 运营位组件化：首页楼层/板块后台可装修、前台组件化渲染。
2. 商品展示模板：商品展示布局可配置切换。
3. 渠道级配色主题：5 套配色预设在渠道级固定切换。
4. 底座选型边界：nshop 为 Web 主底座，vshop 保留多端互补，共享同一 backend。

**非目标（明确不做）**
- 不做整站换肤 / 后台下发前端模板或 Vue 代码。
- 不在本阶段实现分销/积分/直播/发票/钱包的 nshop 前端移植。
- 不重做 Vendure 后端配送/支付核心（阶段22 已具备）。

## 3. 术语对齐（Vendure 语境）

| 中文 | Vendure 对应 | 说明 |
|---|---|---|
| 租户 | `Channel` | nshop 以 `CHANNEL_TOKEN`（默认渠道）连接 |
| 商品归属租户 | ChannelAware / `customFields.channelId` | 后端既有 |
| 商品级配送 | `eligibleShippingMethods` | 后端 `ShippingEligibilityChecker`+`ShippingCalculator` 逐店校验（阶段22） |
| 支付档案 | Profile 过滤配送/支付方式 | backend + vshop checkout 已有 Profile 过滤先例 |

## 4. 块一：运营位组件化（首页后台可装修）

### 4.1 数据模型（vendure `operations-plugin`，最小改动）
现有 `ContentItem`（单表多态）已具备：`type` 判别、`code/name/enabled/sort/position/startAt/endAt/data(JSON)/publishedAt`、`channels` 关联；Shop API `publishedContent(type, position)` 按 `enabled && publishedAt IS NOT NULL` 且时间窗内、按 `sort` 升序返回。**直接复用，不新增表。**

改动点：
- `constants.ts` `ContentType` 扩展 **`IconGrid`**（金刚区图标入口）+ **`CategoryNav`**（分类导航）。其余复用既有 `Banner / Recommendation / Notice / Floor`。
- `content.service.ts` `validateDataByType` 增加两分支：
  - `IconGrid`：需 `items`（数组，`{ icon, label, link }`）。
  - `CategoryNav`：需 `items`（数组，`{ name, slug }`）或 `collection` 引用。
- 首页布局顺序 = 既有 `position='home'` + `sort`；`Floor.data.layout` 已支持多套楼层层布局。

### 4.2 后台装修页（vendure admin，阶段45 Dashboard 模式）
- 在 operations admin 侧新增「首页装修」入口：ContentItem（`position='home'`）列表 + 新增/编辑组件。
- 交互：选 `type` → 填 `data`（JSON 表单）→ 设 `sort`（拖拽排序）→ 定时上/下线（`startAt/endAt`）→ 启用/发布（`publishedAt`）。
- 遵循阶段45 Dashboard 约定：ListPage/FacetedFilter/BulkAction、`allSettled` 批量隔离、CSV 可不含在首版。
- **只存模型配置，不下发前端代码。**

### 4.3 前台渲染（nshop）
- 首页 `useHomeContent()` 拉 `publishedContent(position:'home')`，按 `sort` 顺序把每个 item 的 `type` 映射到对应 Nuxt 组件：
  `BannerCarousel / IconGrid / CategoryNav / NoticeBar / RecommendationRow / FloorBlock`。
- `FloorBlock` 读 `data.layout` 切换横版/竖版/商品墙。
- 组件缺省兜底：未知 `type` 渲染占位并不报错。

## 5. 块二：商品展示模板

- `Product.customFields.displayTemplate`（枚举：`standard` 默认 / `galleryFirst` / `rich`）。
- `product/[slug].vue` 按其切换详情展示布局（图片画廊布局/变体区位置/图文详情区块）。
- **首版只落字段 + 默认行为，不做多布局完整切换的过度开发（YAGNI）**；后续有真实需要再扩展。

## 6. 块三：渠道级配色主题（5 套）

### 6.1 设计令牌
- 抽取**语义设计令牌**：`color-primary / on-primary / color-surface / color-neutral* / color-border / color-accent` 等。
- 所有组件用令牌，**不写死 hex**（品牌定制色例外，见下）。

### 6.2 主题预置（5 套）
- 京东红（历史主选 #E1251B）、淘宝橙、现代极简、品牌定制色 + 1 套预设（预留）。
- 每套 = 一组令牌值的 preset。

### 6.3 作用域与切换（渠道级固定，已定）
- 后台 Channel customField `themeId` 指定该渠道的主题。
- 前端读取渠道主题 → 设置 `<html data-theme="<id>">`；Tailwind/Nuxt UI v4 通过 CSS 变量在 `[data-theme]` 选择器下切换令牌。
- **SSR 防闪烁**：首帧内联脚本在 hydration 前写 `data-theme`（来源：渠道配置/服务端注入），默认兜底主题。
- 品牌定制色令牌可由渠道 customField 下发（可选，首版内置 preset 即可）。

## 7. 错误处理 / 健壮性

- 后台装修字段校验抛 `UserInputError`（沿用 operations-plugin 既有模式）。
- 前台未知 `type`/`layout`/`displayTemplate`：兜底渲染，不白屏。
- 主题缺失/无效渠道：回退默认主题。
- 运营位上下线由后端 `runLifecycleCheck`（ScheduledTask）驱动；前端只需按已发布内容渲染。

## 8. 测试策略

- **后端（vendure）**：`operations-plugin` e2e——IconGrid/CategoryNav 的 CRUD + `publishedContent` 过滤/排序；`displayTemplate` 自定义字段存在性；themeId 渠道字段写入。
  - e2e 运行：`$env:PACKAGE='<x>-plugin'; npx vitest run --config vitest.config.mts e2e/...`；改 schema 后删 `e2e/__data__/*.sqlite`（铁律）。
- **前端（nshop）**：`pnpm typecheck` + `pnpm build`（本地构建）；预渲染首页含多种 `type` 组件与多主题 `data-theme` 冒烟。

## 9. 部署（铁律）
- **本地构建产物入库，服务器 `git pull` + `pm2 restart`，绝不在服务器构建/安装。**
- nshop：`pnpm build` → `scripts/deploy.mjs`（SCP `.output/` + pm2）→ 线上 `www.youshop.cn`。
- vendure：本地构建 `lib`/`dist` 入库 → 服务器 git pull + pm2。

## 10. 依赖与里程碑
- 依赖：nshop 首页 `useHomeContent`（已接 `publishedContent`）；vendure `operations-plugin`（已存在 ContentItem 引擎）；阶段45 Dashboard 模式（admin 装修页参考）；channel customFields 能力（既有）。
- 里程碑（建议顺序）：后端插件扩展（ContentType+校验+字段）→ admin 装修页 → nshop 首页组件映射 → 商品展示模板字段与切换 → 配色主题令牌+切换 → 集成实测与构建入库。

## 11. 决策记录（已定案，勿回退）
- 底座 = nshop；vshop 多端互补，共享 backend。
- 模板定制 = **运营位组件化（运营装修）**，禁整站换肤/后台下发模板代码。
- 商品展示模板 = `Product.customFields.displayTemplate`。
- 配色主题 = **5 套预设、渠道级固定**，语义令牌 + `<html data-theme>`，只切配色不切布局。