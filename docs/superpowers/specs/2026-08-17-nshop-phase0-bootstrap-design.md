# nshop · 阶段 0 基建 — 设计文档

- **日期**：2026-08-17
- **项目**：`d:\zhao\nshop`（nuxtless fork，京东/淘宝风格 Vendure 电商前台）
- **范围**：阶段 0「基建」，后续阶段的非目标项不在本期实现
- **状态**：待审阅

## 1. 背景与目标

在 `d:\zhao\nshop` 基于 [nuxtless](https://github.com/grandant/nuxtless/)（用户 fork）做二次开发，构建京东/淘宝风格的 Vendure 电商前台。部署与后端沿用现有铁律：**本机构建 → 产物上传服务器目录 → pm2 运行**。

阶段 0 的目标是**搭好地基并跑通 nuxtless 自带的核心商城骨架**，让后续阶段的营销/会员/配送/分销可以安全叠加。它不实现新的业务功能，只负责基建与基座稳定性。

> 注意：本 spec 只有「阶段 0」范围；营销（秒杀/拼团/优惠券）、会员/配送方案、分销、评价、售后等属于后续独立 spec。

## 2. 关键决策

| 事项 | 决策 |
|---|---|
| 技术方案 | 方案一：保留 nuxtless 的 `layers/base` + `app/` 分层，新增自定义 layer（如 `layers/shop`）承载扩展能力 |
| 风格基调 | 京东红 `#E1251B` 为主 + D 品牌定制色辅助，主色统一放 Nuxt UI v4 主题变量，一处配置、全局可切 |
| 认证 | nshop 走 **bearer token**；为避免破坏现有 vshop（cookie），后端 Vendure `tokenMethod` 设为 `both`（cookie 与 bearer 并存）；复用现有手机号/微信/抖音登录与 SSO 降级链，首期先接手机号登录 |
| 渠道 | 复用主渠道（与 vshop 同一 channel），channel-token 以 header 透传 |
| 部署 | 照搬现有铁律：本地 `nuxt build`（Nitro `node-server` 预设）→ 上传 `.output/` 到服务器目录 → `pm2` 起进程 |

## 3. 架构

```
d:\zhao\nshop\                      # = nuxtless fork
├── app/                            # 最终组合与页面覆盖（京东红主题入口）
│   ├── assets/css/                 # Tailwind v4 与全局样式
│   ├── layouts/  pages/  app.vue
│   └── nuxt.config.ts
├── layers/
│   ├── base/                       # 【nuxtless 自带】核心电商：cart/checkout/account/product/category/header
│   │   ├── components/  composables/  gql/  pages/  stores/  utils/  validators/
│   │   └── nuxt.config.ts
│   └── shop/                       # 【新增 layer】阶段 0 先建骨架，业务模块后续填充
│       ├── components/  composables/  gql/  stores/  validators/
│       └── pages/                  # 营销/会员/分销入口预留
├── types/                          # 类型定义（product/order/customer + 扩展）
├── server/                         # Nuxt server（BFF/代理兜底）
├── schema/                         # schema.org / 结构化数据
├── public/
├── .nuxtrc / nuxt.config.ts / package.json / pnpm-* / .env.example
```

## 4. 依赖与被覆盖范围

### 4.1 依赖的外部系统
- **Vendure shop-api**：主渠道 GraphQL 端点（`/shop-api`），bearer + channel-token 认证。
- **Vendure 扩展插件域**（后续阶段消费）：flash-sale / group-buy / coupon / member-level / distribution / logistics / delivery / review 等。阶段 0 只打通基础 `customFields`/扩展类型的类型定义连通性，不实现其页面。

### 4.2 本项目组件
- `app/` 与 `layers/shop/` 由本项目新增或覆盖；`layers/base/` 来自 nuxtless 上游，倾向既有实现，必要时覆盖。

## 5. 阶段 0 交付项

1. **仓库落地**
   - 用 fork 的 git 地址克隆 nuxtless → `d:\zhao\nshop`
   - `pnpm install`、本地 `pnpm dev` 跑通
   - `.env`（由 `.env.example` 派生）配置：
     - `GQL_HOST` → 主渠道 shop-api
     - `NUXT_PUBLIC_CHANNEL_TOKEN` → 主渠道 token
     - `NUXT_IMAGE_PROVIDER=ipx`；`PORT`；`NUXT_PUBLIC_I18N_BASE_URL`；`NUXT_PUBLIC_SITE_NAME`
2. **认证适配**
   - 后端 Vendure `authOptions.tokenMethod: 'both'`（保留 vshop 的 cookie，新增 bearer 兼容），本地验证不回归 vshop
   - nshop bearer 会话：登录/登出、activeOrder 与购物车在同一会话贯通
   - 首期接入手机号登录；微信/抖音登录与 SSO 降级链纳入后续阶段
3. **主题落地**
   - 京东红 `#E1251B` + D 定制色，配置 Nuxt UI v4 主题变量（一处定义、可切换）
   - 跑通 base 自带首页/列表/详情/购物车/结算骨架的样式适配
4. **部署**
   - Nitro `node-server` 预设本地 `nuxt build`，产物 `.output/`
   - 部署脚本：上传 `.output/` 到服务器目标目录，`pm2` 启动/重启，验证 online 与 URL 可达
5. **基座稳定性**
   - 类型化 GraphQL（nuxt-graphql-client）对 shop-api 打通、代码生成正常
   - SEO 头、`@nuxtjs/i18n` 基础配置就绪，`NUXT_PUBLIC_I18N_BASE_URL` 生效

## 6. 非目标（阶段 0 不实现）

- 营销玩法（秒杀/拼团/优惠券）页面
- 会员等级/积分与配送方案页面
- 分销/团队/提现
- 商品评价、售后、发票、物流跟踪
- 多语言内容扩充（仅搭 i18n 骨架、默认中文）

## 7. 风险与应对

| 风险 | 应对 |
|---|---|
| nuxtless 要求 Vendure 关闭 cookie 认证，与我们现有 vshop 冲突 | 后端 `tokenMethod: 'both'`，cookie 与 bearer 并存；阶段 0 先本地验证 vshop 不回归 |
| nuxtless 默认 Cloudflare 部署，与服务器铁律不同 | 改用 Nitro `node-server` 预设本地 build + pm2 |
| 后端扩展插件的 schema 不在 nuxtless 默认生成范围内 | 阶段 0 完成类型连通性配置（graphql.schema.json / graphqlrc），验证生成无红错 |
| Node/SSR 首版配置未知项较多 | 以对外可验证的「本地 dev 跑通 + 类型生成 + 部署 online」为完成标准 |

## 8. 完成标准（Definition of Done）

- [ ] `nshop` 目录就位，`pnpm dev` 本地可访问首页/列表/详情/购物车/结算骨架
- [ ] 后端 `tokenMethod: 'both'` 生效，vshop cookie 登录不回归
- [ ] nshop bearer 登录/登出、activeOrder 同一会话贯通（手机号登录可验证）
- [ ] 京东红 + D 主题在 Nuxt UI 一处配置且全局生效
- [ ] `.output/` 本机构建成功，部署脚本上传并在服务器 `pm2` 起 online、URL 可达
- [ ] 类型化 GraphQL 与 i18n/SEO 基础配置无报错

## 9. 后续阶段（不在本 spec 内）

阶段 1 核心电商链路 → 阶段 2 营销 → 阶段 3 会员与配送方案 → 阶段 4 分销、售后/发票/物流。各自独立 spec → plan → 实现。