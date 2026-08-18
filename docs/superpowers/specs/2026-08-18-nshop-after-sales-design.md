# nshop · 阶段「售后/退换中心」— 设计文档

- **日期**：2026-08-18
- **项目**：`d:\zhao\nshop`（nuxtless fork，京东/淘宝风格 Vendure 电商前台）+ `d:\zhao\vendure`（Vendure 3.6.4 后端）
- **范围**：顾客自助「售后/退换中心」——我的售后列表 / 售后详情 / 申请售后 / 取消售后 / 填写回寄单号；配套一处极小后端增强（Shop 类型嵌套 `orderLine`/`order`）。
- **状态**：已审阅（用户确认方案 A 与全部设计节，进入实现计划）

## 1. 背景与目标

订单中心 + 地址簿已上线（订单列表状态 Tab、通用订单详情页、地址簿 CRUD/回填、中国本地化配送/自提预留）。订单中心已完成「购买→订单→详情」闭环，但**缺乏售后环节**——顾客购买后若需退货/退款/换货，只能联系客服，无自助入口。

本阶段目标：补齐国内电商的**售后自助闭环**——顾客在订单详情对已发货商品行发起售后（退货退款/仅退款/换货），在「我的售后」列表与详情页跟踪审核/退货/退款/驳回等状态，可取消待审核单、填写回寄单号。**后端用既有 `after-sales-plugin`，仅做一处极小 SDL 增强**（暴露嵌套 `orderLine`/`order`），避免为展示商品信息在前端引入订单反查 hack。

> 调研结论（`d:\zhao\vendure/packages/after-sales-plugin`，已启用）：后端售后能力完整（状态机/退款/库存回补/防重/时效校验），**后端零新业务逻辑**，仅补 Shop 类型嵌套字段。

## 2. 后端能力现状（已核实，消费而非重造）

- **类型** `AfterSalesType`：`return_refund` / `refund_only` / `exchange`（默认 `return_refund`）。
- **状态** `AfterSalesState`：`Pending → Approved → Returning → Received → Refunded`；旁路 `Rejected`、顾客取消 `Closed`。
- **顾客端（Shop API，`@customer`）**：
  - `Query.myAfterSalesRequests(options)` / `Query.afterSalesRequest(id)`（按 `customerId` 防越权）
  - `Mutation.createAfterSalesRequest(input)` / `cancelAfterSalesRequest(id)`（仅 `Pending`） / `updateReturnTracking(id, trackingNo, carrier)`（仅 `Approved`→`Returning`）
- **创建校验（后端，前端仅预判/透传错误）**：订单归属、订单状态 ∈ 白名单、时效窗（默认 `maxDays=7`，上限 22 天）、退款上限（有 line 时 `proratedLinePrice`，否则 `order.total`）、同一 `orderLineId` 防重复（未 `Closed`）。
- **每次售后仅支持单个商品行**（`orderLineId` 唯一），不支持多行数组。
- 退款：`Received` 态由 admin 触发，走 Vendure 原生 `refundOrder`（原路退回原支付单），成功后回写 `Order.customFields.afterSalesStatus='Refunded'`。
- 库存回补：`Returning→Received` 时经 inventory-plugin 回补到原发货仓。

## 3. 关键决策

| 事项 | 决策 |
|---|---|
| 后端改动 | **一处 SDL 增强 + 一处白名单 bug fix**（见 §4），无新业务逻辑；其余全部消费既有能力 |
| 模块组织 | **方案 A 独立售后中心**：`account/after-sales.vue` 列表 + `account/after-sales/[id].vue` 详情；独立 `components/afterSales/*`、`utils/after-sales-state.ts`、`composables/useAfterSales.ts`；与订单中心同构、隔离清晰 |
| 申请入口 | **订单详情行内发起**：`orders/[code].vue` 商品行「申请售后」→ 弹 `AfterSalesCreateModal` 预填该行；契合后端单行限制 |
| 商品信息展示 | **消费后端嵌套 `orderLine`**（本次增强），列表/详情直接读 `order.code` + `orderLine.productVariant`，前端零订单反查 |
| 售后单标识 | 后端售后 `id` 为数字主键（无业务 code），详情路由即 `/account/after-sales/{id}` |
| 凭证图上传 | **本期暂缓**：表单只收文字原因/说明；`evidenceImages` 字段后端保留、前端不提供上传（避免引入资产上传管线）。后续单独加 |
| 退款金额 | 创建表单预填该行 `proratedLinePrice`，可改，前端上限校验 + 后端兜底 |
| 订单状态门槛 | 申请售后按钮仅在订单状态 ∈ `Shipped/Delivered/PartiallyDelivered/Cancelled` 显示（配合白名单 bug fix） |
| 部署 | 铁律：本地构建 → 推送 → 服务器 pull + pm2，绝不在服务器构建；后端先行，刷新 codegen schema，再前端 |

## 4. 后端增强（`d:\zhao\vendure`，范围收敛）

文件：`packages/after-sales-plugin/src/plugin.ts`（Shop SDL）与 `after-sales.service.ts`（白名单）。

1. **Shop SDL**：`AfterSalesRequest` 类型追加两字段（与实体属性同名，且 `findOneForCustomer`/`findMyRequests` 均已 eager-load `order`/`orderLine` 关系，GraphQL 直接反射，**无需新增 field resolver**）：
   ```graphql
   type AfterSalesRequest implements Node {
       # ...（既有字段不变）
       order: Order!
       orderLine: OrderLine
   }
   ```
2. **白名单 bug fix**：`after-sales.service.ts` 的 `allowedStates` 由 `['Shipped', 'Delivered', 'PartialDelivery', 'Cancelled']` 改为 `['Shipped', 'Delivered', 'PartiallyDelivered', 'Cancelled']`（`PartialDelivery` 非 Vendure 原生态，原写法的"部分发货"订单永远过不了校验）。

流程：改源码 → vendure 根目录本地 `pnpm build`（产出 dist/）→ 提交推送 → 服务器 `git pull` + `pm2 restart %app%`（**不在服务器构建**）。

> 例外说明（response 已与用户对齐）：接受这次小幅后端增强作为唯一例外；除此之外本阶段前端默认不改后端。

## 5. 前端架构（`d:\zhao\nshop`）

```
layers/base/
├── gql/queries/after-sales.gql        # 新增：5 操作 + 嵌套 orderLine/order fragment
├── app/utils/after-sales-state.ts     # 新增：状态/类型 → 中文文案、徽标色、可操作标记
├── app/composables/useAfterSales.ts   # 新增：list/detail/create/cancel/updateTracking
├── app/components/afterSales/
│   ├── AfterSalesStateBadge.vue       # 售后状态徽标（风格同 OrderStateBadge）
│   ├── AfterSalesCard.vue             # 列表项：商品/类型/状态/退款额/日期/操作
│   ├── AfterSalesCreateModal.vue      # 申请售后表单（订单行内弹窗）
│   └── AfterSalesTrackForm.vue        # 详情页回寄单号表单（Approved→Returning）
└── app/pages/
    ├── account/after-sales.vue        # 新增：我的售后列表
    ├── account/after-sales/[id].vue   # 新增：售后详情
    ├── account/orders/[code].vue      # 修改：商品行加「申请售后」
    ├── components/account/AccountMenu.vue  # 修改：下拉加「售后/退换」
    └── account/index.vue              # 修改：个人中心加「售后/退换」快捷按钮
```

### 5.1 数据取用
- 复用订单中心已建立的模式：`useAsyncGql("MyAfterSalesRequests", { options })`（列表，`server:false + onMounted.refresh` + `useAuthStore.isAuthenticated` 登录拦截）；`useAsyncGql("AfterSalesRequest", { id })`（详情，顶层 `await`）。
- `useAfterSales.ts` 封装对象（内部调 `GqlMyAfterSalesRequests/GqlAfterSalesRequest/GqlCreateAfterSalesRequest/GqlCancelAfterSalesRequest/GqlUpdateReturnTracking`），统一 `loading`/`error`/toast。

### 5.2 状态与类型映射（`after-sales-state.ts`）
| 状态 | 中文 | 颜色 | 可操作 |
|---|---|---|---|
| Pending | 待商家审核 | warning | 取消 |
| Approved | 审核通过·待退货 | info | 填回寄单号 |
| Rejected | 已驳回 | error | 展示驳回原因 |
| Returning | 退货中 | info | — |
| Received | 已收货·退款处理中 | warning | — |
| Refunded | 已退款 | success | — |
| Closed | 已关闭 | neutral | — |

类型中文：`return_refund` 退货退款、`refund_only` 仅退款、`exchange` 换货。详情页 5 步进度条：Pending→Approved→Returning→Received→Refunded。

### 5.3 页面与交互
- **售后列表** `account/after-sales.vue`：状态 Tab（全部/待审核/已通过/退货中/已退款/已关闭/已驳回）+ 卡片列表（`AfterSalesCard`）+ 空态/加载态 + 分页。
- **售后详情** `account/after-sales/[id].vue`：`AfterSalesStateBadge` + 进度条 + 类型/商品（`orderLine.productVariant`）/退款金额/原因/说明/驳回原因/回寄单号承运商 + `order.code` 跳订单详情 + 依据状态渲染「取消」/「回寄单号表单」。
- **申请售后**：`orders/[code].vue` 每行「申请售后」按钮（订单态 ∈ 白名单才显示）→ 弹 `AfterSalesCreateModal`（预填 `orderId/orderLineId/refundAmount=proratedLinePrice`，类型下拉、必填原因、可选说明）→ 提交成功 toast + 跳售后详情。

### 5.4 错误处理
- 创建/取消/填单号：后端保留错误明文（超时效/超金额/重复/状态不符/越权）→ toast + 表单内联提示，**不丢失用户输入**。
- 列表/详情加载：`BaseLoader` + 空态 + 重试。

### 5.5 i18n
- 新增顶层 `messages.afterSales.*`（对仗 `order` 块），含 tab*/state*/type*/表单/操作文案；账户入口键加进 `messages.account`。
- **同步全部 10 个 locale**：`zh-CN / en-US / bg-BG / de-DE / es-ES / fa-IR / fr-FR / it-IT / pt-BR / ru-RU`（zh 中文、其余英文兜底值）。

## 6. 交付项

### 6.1 后端（`d:\zhao\vendure`）
- `plugin.ts`：Shop SDL 补 `order: Order!`、`orderLine: OrderLine`。
- `after-sales.service.ts`：白名单改 `PartiallyDelivered`。
- 本地 build → 提交推送 → 服务器 pull+restart。

### 6.2 前端（`d:\zhao\nshop`）
- `gql/queries/after-sales.gql`（5 操作 + 嵌套 fragment）。
- 刷新 `graphql.schema.json`（从已部署后端 introspection）→ `nuxi prepare` 重生成类型。
- `utils/after-sales-state.ts`、`composables/useAfterSales.ts`、`components/afterSales/*`（4 个）、两个新页面、三处入口修改。
- i18n 全量补键。

### 6.3 里程碑
| 里程碑 | 内容 |
|---|---|
| R0 后端增强 | SDL+白名单 fix，本地 build、推送、服务器 restart；刷新 schema.json + prepare 重生成类型 |
| R1 数据层 | after-sales.gql + useAfterSales + after-sales-state util |
| R2 组件 | AfterSalesStateBadge / Card / CreateModal / TrackForm |
| R3 页面与入口 | 列表页、详情页、订单行入口、AccountMenu + 个人中心 |
| R4 文案与联调部署 | i18n 全部同步；typecheck → build → 部署（后端→schema→前端）→ 线上验证 + 回归 |

## 7. 非目标（本阶段不做）
- 多商品行合并售后（后端单行已定，不复刻意 UI 兜底）
- 凭证图上传（`evidenceImages` 预留、本期省略）
- 顾客端自主打款/余额退款（退款走原路支付，admin 触发）
- 售后规则可视化配置（服务端 `maxDays` 参数，非本期 UI）
- 自动审核/自动退款机器人
- 发票、物流轨迹对接（属后续模块）

## 8. 测试与验证（遵守部署铁律）
- 本地：`pnpm typecheck` + `pnpm dev` 走「订单详情行内申请 → 列表 → 详情 → 取消 → 重申请 → 填回寄单号 → 空态/驳回展示」。
- 部署序：**后端先行**（build→push→server pull+restart）→ 刷新 nshop `graphql.schema.json` → `pnpm build`（前端）→ scp `.output` → pm2 → 线上 curl `/account/after-sales` 200。
- ⚠️ 上线必验：首次生产部署后 introspection 确认 `e.joho.cn/shop-api` 已暴露售后 mutation（杜绝"前端已上、后端未启用插件"）。
- 回归：购物车/结算/确认页/订单中心/登录不回归。