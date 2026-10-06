# 售后体系迭代二期（批量操作 / 状态历史时间线 / 退货地址 / C 端分页）· 设计文档

- 日期：2026-10-07
- 状态：设计已确认（mockup 方案 A 已选定）
- 涉及仓库：`d:\zhao\vendure`（packages/after-sales-plugin）、`d:\zhao\nshop`（C 端）、`d:\zhao\vshop\web-admin`（后台）
- 前序文档：`docs/superpowers/specs/2026-09-30-aftersales-page-optimization-design.md`（一期，已上线）
- 参考先例：cjk-plugin 渠道 customFields 模式；web-admin `src/utils/csv.ts` 导出；vendure `synchronize:true` 免 migration

## 1. 背景与范围

一期售后页优化（2026-09-30 工单#17）已上线验收。本期推进一期明确不做清单中的四项：

| 项 | 内容 | 用户决策 |
|---|---|---|
| A | 后台批量操作（批量同意/拒绝 + CSV 导出） | 已确认 |
| B | 时间线逐节点时间（新增售后单状态历史事件表） | 已确认 |
| C | 退货地址后台配置（审核通过后 C 端直接展示） | 入口放**售后列表页内**（弹窗编辑） |
| D | C 端列表分页（现 take:100 截断） | **加载更多**形态（后端零改动） |

## 2. 已核实的关键事实（勿再假设）

1. 状态流转写入点共 **8 处**（`src/after-sales.service.ts`）：`createRequest`（L213-227，初始 Pending）、`cancelRequest`（L230-240，Pending→Closed）、`updateReturnTracking`（L242-254，Approved→Returning）、`transitionState`（L583-593，approve 走它）、`rejectRequest`（L354-364 直写 Rejected）、`confirmReceive`（L372-431 事务内直写 Received）、`executeRefund`（L501/L532 置 RefundFailed、L526 置 Refunded）、`applyRefundFailed`（L556-570 catch 兜底）。**没有统一收口点**，必须逐点插桩。
2. `findAll` / `findMyRequests` 底层都是 Vendure 标准 `ListQueryBuilder`，**原生支持 skip/take/filter/sort**。SDL 里 `input AfterSalesRequestListOptions` 空声明（plugin.ts L68/L120）实际由 Vendure 自动补全标准字段——线上证据：nshop 传 `take:100`、web-admin 传 `filter.state { eq }` + `skip/take/sort` 均正常工作。**D 项后端零改动。**
3. 数据库 `synchronize: true`，新实体/新列启动自动建表建列，**无手写 migration**（doc/2026-09-01 变更摘要佐证）。
4. 渠道 customFields 先例：`packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts`（basicConfig/serviceNotifyConfig）。插件可在自身 `configuration` 回调注册 `Channel` customFields。
5. web-admin 无渠道/设置中心页面（全库搜 serviceNotifyConfig/basicConfig 无命中）→ 退货地址配置入口放售后列表页（用户已确认）。
6. web-admin 已有 CSV 导出先例：`src/utils/csv.ts`（盘点差异、台账页在用）。
7. C 端列表页现状：`pages/account/after-sales/index.vue` 用 `useAsyncGql("MyAfterSalesRequests", { options: { take: 100 } })`，本地 tab 筛选/关键词搜索/排序（L27-47）；`utils/after-sales-state.ts` 持有页签、进度、下一步引导映射；时间线组件 `AfterSalesTimeline.vue`、引导条 `AfterSalesNextStep.vue`。
8. i18n：C 端 12 包（zh-CN 完整基底 + 11 包覆盖，`merge.ts` zhFallbackLocale）；后台 `src/locale/zh-Hans.json` + `en.json` 双包。
9. e2e：`packages/after-sales-plugin/e2e/after-sales.e2e-spec.ts`（adminClient/shopClient 模式），已有「Admin 类型暴露嵌套字段」「uploadAfterSalesEvidence 四场景」用例可参照。
10. webhook 之外的部署口径：vendure 本地构建 → push → 服务器 `git pull --ff-only` + `pm2 restart`；nshop / web-admin 走 `scripts/deploy.mjs`。提交身份 `johocn / johocn@163.com`；`git add` 精确枚举，禁 `git add -A`。

## 3. R' 后端设计（零业务逻辑变化）

### 3.1 B：状态历史表

新实体 `AfterSalesStateHistory`（`src/after-sales-state-history.entity.ts`）：

```ts
@Entity('after_sales_state_history')
// 字段：id、requestId(number, FK→after_sales_request, 索引)、
//       fromState(varchar nullable——创建时无来源态)、toState(varchar)、
//       operatorUserId(number nullable)、createdAt(DateTime)
```

- 注册进 `@VendurePlugin({ entities: [...] })`，`synchronize:true` 自动建表。
- service 新增私有 `recordState(ctx, requestId, fromState, toState)`：插入历史行（operatorUserId 取 `ctx.activeUserId`），失败仅 `Logger.warn` 不阻断主流程。**8 个写入点逐一插桩**（见第 2 节事实 1）；`transitionState` 内部插一次即覆盖 approve。
- 事务一致性：`confirmReceive` / `executeRefund` 在现有事务内写历史；`applyRefundFailed` 兜底路径独立写。
- SDL：Shop 类型 `AfterSalesRequest` 与 Admin 类型 `AfterSalesRequestAdmin` 各加嵌套：

```graphql
type AfterSalesStateHistoryEntry {
    fromState: AfterSalesState
    toState: AfterSalesState!
    operatorUserId: ID
    createdAt: DateTime!
}
# 两类型各加：history: [AfterSalesStateHistoryEntry!]!
```

- 仅**详情查询**加载 `relations: { history: true }`（`findOne` / `findOneForCustomer` / `hydrate`）；列表查询不加载。Admin 详情沿用「列表过滤 id eq」取单条——该路径 relations 需补 history（在 service.findAll options 透传支持不了 per-item relations，故 Admin 详情改为：resolver 检测 filter.id eq 时改走 `findOne` 加载 history，或 web-admin 详情直接调用新 Admin query `afterSalesRequestAdmin(id)`。**取舍：新增 Admin 单查 `afterSalesRequestAdmin(id: ID!): AfterSalesRequestAdmin`（内部 findOneForAdmin，加载 order/orderLine/customer/history）**，web-admin 详情页改用单查，替代「列表过滤」hack。
- 旧数据不回填：无历史行的节点，时间线沿用一期「可确知时间」规则（提交=createdAt、当前=updatedAt、到账=refundedAt）。

### 3.2 A：批量操作 mutation

```graphql
extend type Mutation {
    batchApproveAfterSalesRequests(ids: [ID!]!): [AfterSalesBatchResult!]!
    batchRejectAfterSalesRequests(ids: [ID!]!, reason: String!): [AfterSalesBatchResult!]!
}
type AfterSalesBatchResult { id: ID! success: Boolean! state: String message: String }
```

- 实现复用现有 `approveRequest` / `rejectRequest`，逐条 try/catch，单条失败不中断整批；返回逐条结果。上限 50 条/批（防误操作放大）。
- 权限 `@Allow(Permission.UpdateOrder)` 与单条 mutation 一致。

### 3.3 C：退货地址

- 插件 `configuration` 回调注册渠道 customField：

```ts
Channel: [{ name: 'afterSalesReturnAddress', type: 'string', nullable: true, label: '售后寄回地址' }]
```

- Admin 新增（免开 ChannelService 权限，入口收敛在售后插件）：

```graphql
extend type Query  { afterSalesReturnAddress: String! }
extend type Mutation { updateAfterSalesReturnAddress(address: String!): Boolean! }
```

  内部走 `ChannelService.update(ctx, { id: ctx.channelId, customFields: { afterSalesReturnAddress } })`；权限 `UpdateOrder`（与售后 mutation 一致）。query 读当前渠道 customField，未配置返回空串。
- Shop 新增只读 query `afterSalesReturnAddress: String!`（读 `ctx.channel` customField，@Allow(Permission.Authenticated)）。

### 3.4 D：分页

后端零改动。C 端直接在现有 query 传 `options: { take: 20, skip: n }`（ListQueryBuilder 原生支持）。

## 4. C 端设计（nshop）

### 4.1 列表页（加载更多）

- `useAsyncGql` 改为手动加载：每页 `take: 20`，`skip` 累计；「加载更多」按钮追加下一页到本地数组；底部显示「已显示 n / totalItems 条」，全部加载后按钮消失显示「已全部加载」。
- 页签筛选 / 关键词搜索 / 排序逻辑**保持本地实现不变**（作用于已加载数据；搜索不覆盖未加载页，属已知取舍）。
- 删除一期「仅显示最近 100 条」截断提示。
- loading/error/空态沿用现有三分；「加载更多」失败保留已加载内容 + 行内重试。

### 4.2 详情页（时间线时间 + 退货地址）

- `AfterSalesTimeline` 接入 `history` 数据：节点有对应历史行则显示精确时间（`MM-DD HH:mm`）；无历史行沿用现规则（当前节点 updatedAt / 退款节点 refundedAt / 未发生节点不显示时间）。
- 引导条（`AfterSalesNextStep` 调用处）：`Approved` 状态时并行请求 `afterSalesReturnAddress`，非空则在引导条内渲染**地址卡**（📍 + 地址文本 + 复制按钮，`uni`/clipboard 复制后 toast）；为空回退现有「寄回地址请联系客服」文案。时间线「寄回商品」节点说明同步提示「寄回地址见上方」。
- 其余状态引导条不变。

### 4.3 i18n

`messages.afterSales.*` 新增词条（loadMore / allLoaded / returnAddress / copyAddress / copied / timelineTime 等约 10 条），**12 包同步**（zh-CN 全量，其余 11 包翻译覆盖）。

## 5. 后台设计（web-admin）

### 5.1 列表页

- **多选批量**：每张卡片左侧复选框（默认单选浏览态不变）；勾选任意卡片后底部浮出批量操作条：「已选 n 项｜批量同意｜批量拒绝｜取消」。批量拒绝复用现有原因输入弹窗（整批共用一个原因）。
- 操作流程：二次确认（沿用 `uni.showModal`）→ 调批量 mutation → 按返回逐条结果 toast（成功 n 条 / 失败明细）→ 刷新列表。
- **退货地址入口**：工具栏加「退货地址」按钮 → 弹窗表单（textarea 多行地址 + 取消/保存），加载时读 `afterSalesReturnAddress` query，保存调 `updateAfterSalesReturnAddress`。
- **导出 CSV**：工具栏加「导出」按钮，按当前筛选条件循环 `fetchAfterSalePage`（take 100）拉取**上限 500 条**，复用 `utils/csv.ts` 生成：售后单号/订单号/类型/状态/退款金额/商品/顾客/手机/申请时间。前端直接下载（BOM 防 Excel 乱码）。

### 5.2 详情页

- 改用新 Admin 单查 `afterSalesRequestAdmin(id)`（弃用「列表过滤 id eq」），时间线显示逐节点时间（与 C 端同一套节点文案），其余区块（顾客/商品/凭证/回补明细/吸底操作）沿用一期。

### 5.3 i18n

`afterSale.*` 新增词条（batchSelect / batchApprove / batchReject / selectedCount / returnAddress / export / 部分失败文案等约 15 条），zh-Hans / en 双包同步。

## 6. 错误处理

| 场景 | 处理 |
|---|---|
| 批量部分失败 | mutation 不抛错，逐条返回 success/message；前端汇总 toast + 明细；列表刷新以服务端为准 |
| 批量超 50 条 | 前端选择上限提示；后端 `UserInputError` |
| 历史写入失败 | 仅 Logger.warn，不阻断状态流转主流程 |
| 地址保存失败 | toast 报错，弹窗不关闭、内容保留 |
| 加载更多失败 | 保留已加载内容，行内重试按钮 |
| 未配置退货地址 | C 端回退「寄回地址请联系客服」 |
| 导出 0 条 | toast「无可导出数据」 |

## 7. 测试与交付

### 回归范围

| 层 | 用例 |
|---|---|
| 后端 e2e | ① 批量同意/拒绝：全成功、部分失败（含非法 id / 非法状态）、超 50 拒绝 ② 状态历史：create/approve/reject/confirmReceive/退款路径逐点断言 history 行 ③ 退货地址：未登录被拒、写读回环、Shop 只读 ④ 单查 afterSalesRequestAdmin 含 history/order/customer |
| C 端 e2e | 列表加载更多累计、详情时间线时间渲染、Approved 地址卡展示/回退 |
| 后台 e2e | 多选批量同意/拒绝（部分失败 toast）、退货地址弹窗保存、导出 CSV、详情时间线时间 |

### 交付物

1. 实现代码（三仓）
2. API / e2e 回归
3. 手机视图截图 390×844 dpr=2（C 端列表加载更多、详情地址卡、详情时间线时间；后台批量操作、地址弹窗、详情时间线）
4. 操作手册增「五期：批量操作与迭代二期」章节 + 测试用例
5. 收口：提交 → 推送 → 部署（vendure 服务器 git pull + pm2 restart；两端 deploy.mjs）

## 8. 风险与取舍

| 项 | 说明 | 处置 |
|---|---|---|
| 旧售后单无历史数据 | 历史表只记录上线后的流转 | 不回填；时间线按现规则降级显示 |
| C 端搜索不覆盖未加载页 | 「加载更多」形态的固有权衡 | 底部明示「已显示 n / m」；搜索提示作用于已加载内容 |
| 历史行随状态机增长 | 每单一行/次流转，量级可控 | 仅详情查询加载；不加清理机制 |
| 导出上限 500 | 前端导出防卡顿 | 超出提示缩小筛选范围 |
| 批量上限 50 | 防误操作放大 | 前端选择时提示 |
| 渠道 customField 仅单值地址 | 不做多语言/多仓地址 | 地址为固定文本；后续需要再扩 |

## 9. 明确不做

- 历史表的操作人姓名/角色展示（只记 operatorUserId）
- 退货地址多语言、多退货仓
- 服务端关键词搜索（C 端搜索保持本地）
- 导出 Excel 二进制格式（仅 CSV）

## 10. 文件清单（预估）

### 后端 `d:\zhao\vendure\packages\after-sales-plugin`

| 文件 | 动作 |
|---|---|
| `src/after-sales-state-history.entity.ts` | 新增 |
| `src/after-sales.service.ts` | 改：recordState 插桩 8 处 + 批量方法 + 地址读写 + 单查 |
| `src/after-sales-shop.resolver.ts` | 改：afterSalesReturnAddress query |
| `src/after-sales-admin.resolver.ts` | 改：批量 mutation ×2、地址读写、单查 |
| `src/plugin.ts` | 改：entities 注册、SDL（history 嵌套、批量/地址/单查）、configuration 注册 Channel customField |
| `e2e/after-sales.e2e-spec.ts` | 改：新增约 6 个用例 |
| `lib/**` | 本地重建产物一并提交（仓内惯例） |

### C 端 `d:\zhao\nshop\layers\base`

| 文件 | 动作 |
|---|---|
| `gql/queries/after-sales.gql` | 改：query 加 skip/take 变量、history 字段、地址 query |
| `app/pages/account/after-sales/index.vue` | 改：加载更多分页 |
| `app/pages/account/after-sales/[id].vue` | 改：时间线 history、地址卡 |
| `app/components/afterSales/AfterSalesTimeline.vue` | 改：接 history 时间 |
| `app/composables/useAfterSales.ts` | 改：地址读取/复制辅助 |
| `i18n/locales/*.ts`（12 个） | 改：同步词条 |

### 后台 `d:\zhao\vshop\web-admin`

| 文件 | 动作 |
|---|---|
| `src/apis/afterSale.ts` | 改：批量/地址/单查/导出取数封装 |
| `src/pages/after-sale/list/index.vue` | 改：多选 + 批量条 + 地址弹窗 + 导出 |
| `src/pages/after-sale/detail/index.vue` | 改：单查 + 时间线时间 |
| `src/locale/zh-Hans.json`、`src/locale/en.json` | 改：同步词条 |
