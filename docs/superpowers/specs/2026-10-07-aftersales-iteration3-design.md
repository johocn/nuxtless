# 售后体系迭代三期设计：状态通知 · 协商留言 · 超时自动化与换货闭环 · 数据看板

> 日期：2026-10-07 ｜ 状态：已经用户确认（方案 A + 四项推荐策略 + 两节 UI mockup）
> 上游文档：二期设计 `2026-10-07-aftersales-iteration2-design.md`

## 背景与目标

二期已交付批量操作、状态历史时间线、退货地址配置、C 端分页。三期解决四个遗留痛点：

1. 状态变更靠顾客主动来查 → **双向站内信通知**
2. 沟通只能跳转客服 → **售后单内协商留言（双向）**
3. Pending 无超时催办、RefundFailed 无人重试、换货单走退货退款假链路 → **超时自动化 + 换货闭环**
4. 无售后经营视图 → **后台售后数据看板**

## 一、状态变更通知（事件解耦，方案 A）

### 机制

- after-sales-plugin 在 `transitionState` **统一出口**发布 Vendure 自定义事件 `AfterSalesStateTransitionEvent`（payload：requestId、orderId、type、fromState、toState、customerId、orderCode、createdAt）。
- notification-plugin 订阅该事件 → `NotificationService.createInbox` 落 `InboxMessage`（复用现有实体，零新表）。
- 人工操作 / 超时自动化 / 换货发货均经统一出口，通知自动全覆盖。

### 通知矩阵

| 触发 | 顾客收件箱 | 商家收件箱 |
|---|---|---|
| 新建售后（Pending） | —（顾客自己发起） | 新售后待处理 |
| Pending 超 48h | — | 超时提醒 |
| Approved | 审核通过（退货单显示寄回地址） | — |
| Rejected | 已拒绝（含拒绝原因摘要） | — |
| Returning（顾客填单号） | — | 顾客已寄回 |
| Received | 已收货确认 | — |
| Refunded | 退款已原路退回 | — |
| RefundFailed | 退款异常 | 重试耗尽提醒 |
| ExchangeShipped | 换货已发货（新品运单号） | — |
| Closed（换货确认收货） | 换货完成 | — |

- 消息体带 `afterSalesRequestId`；C 端消息中心点击直达 `/account/after-sales/{id}`；后台收件箱点击进售后详情。
- 消息 title/content 用渠道 defaultLocale 文案（服务端生成，不走 i18n 请求头）。

## 二、协商留言

### 数据模型

新实体 `after_sales_message`：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | ID | |
| requestId | int → after_sales_request | 索引 |
| senderType | enum `customer / admin` | |
| senderUserId | int nullable | customer user id 或 administrator id |
| senderName | varchar | 冗余展示名 |
| content | text | ≤1000 字 |
| images | 简单 JSON string[] | ≤3 张（复用 uploadEvidence 的 base64→Asset 模式，存 Asset 直链） |
| createdAt / updatedAt | datetime | |

### 规则

- 可留言状态：除 `Closed` 外全程（Pending→Refunded / ExchangeShipped 均可）；Closed 后只读。
- 双向均不可撤回、不可删除（审计优先）。
- images 数量 >3 或单图超限 → 抛 `IMAGES_EXCEEDED` / `IMAGE_TOO_LARGE`（沿用现有错误码风格）。

### SDL

- Shop：`addAfterSalesMessage(id, content, images)` → AfterSalesMessage
- Admin：`replyAfterSalesMessage(id, content, images)`
- 双端：`afterSalesMessages(id, options)` → 分页列表（按 createdAt 正序）
- 售后单查询（shop/admin 单查 + 列表）可选带 `messageCount`（留言总数，不做未读模型），列表徽标显示总数。

## 三、超时自动化 + 换货闭环

### 超时自动化（Vendure JobQueue delayed job，复用 order-timeout-plugin 模式）

- 状态流转时登记 delayed job（handler 按 requestId 查最新状态，不一致即作废）。
- 渠道 customFields（可配，per-channel）：
  - `afterSalesTimeoutHours`（默认 48）：Pending 超时 → 商家站内信提醒
  - `afterSalesAutoApproveHours`（默认 0 = 关闭）：>0 时超时自动 `transitionState(Approved)`（仅 refund_only / return_refund / exchange 通用；自动同意后顾客/商家均通知）
  - `afterSalesRefundAutoRetry`（默认 1）：RefundFailed 自动重试 N 次（间隔 30min × 2^n），耗尽后商家提醒
- 阈值读取：插件内 `_configService` 封装，channel customFields 缺省回退默认值。

### 换货闭环

- 现状：exchange 与退货退款完全同路径，`processRefund` 对换货无意义。
- 新状态 `ExchangeShipped`（追加进 `AfterSalesState` 枚举 + `STATE_TRANSITIONS` 表）：

```
Received(exchange) --exchangeShip(商家填新品运单号/承运商)--> ExchangeShipped --exchangeReceive(顾客确认)--> Closed
```

- `processRefund` / `retryRefund` 对 `type=exchange` 直接抛错 `EXCHANGE_NO_REFUND`。
- `confirmReturnReceived` 对 exchange 单收货后**不**自动流转，停在 Received 等商家发货。
- 新 mutation：Admin `exchangeShip(id, trackingNo, carrier)`；Shop `exchangeReceive(id)`。
- 历史表/时间线/两端状态字典同步扩展新节点文案（12 语言包）。
- 批量操作：批量同意/拒绝对 exchange 单照常适用；批量不含换货发货（发货需逐单填运单号）。

## 四、数据看板

### 后端

Admin 查询 `afterSalesStats(from: DateTime!, to: DateTime!)` → 单 JSON 对象（一次往返）：

```graphql
type AfterSalesStats {
  totalRequests: Int!          # 窗口内申请总数
  pendingCount: Int!           # 截止 to 时刻仍 Pending
  totalRefundAmount: Int!      # 窗口内 Refunded 实退总额（分）
  avgHandleHours: Float        # Pending→终态平均处理时长（小时，无终态数据为 null）
  daily: [AfterSalesDaily!]!   # 按日申请量 { date, count }
  byState: [AfterSalesBucket!]!  # { key, count }
  byType: [AfterSalesBucket!]!
}
```

- 实现用 TypeORM `getRawMany` 聚合（COUNT/GROUP BY/AVG），不留伪造数据，空窗口返回 0/null。
- 权限：`ReadAdministrator`（或 ReadOrder 同级，对齐现有 admin resolver 惯例）。

### 前端（web-admin）

- 现有 `src/pages/data/dashboard/index.vue` 顶部加「售后」页签（与经营/库存同级）。
- KPI 三卡（申请数 / 退款总额 / 平均处理时长）+ 近 7 日申请量柱图（复用自绘 canvas / css bar 模式，与 TrendChart 风格一致，不引第三方图表库）+ 状态分布横条。
- 空数据显示 `—`，不伪造。

## 五、C 端（nshop）

- 售后详情页新增「协商留言」卡（时间线下方）：顾客右/商家左气泡、附图缩略、底部输入框 + ⊕ 图片（≤3）+ 发送；Closed 后隐藏输入区只读。
- 换货单：时间线插入「换货已发货」节点（新品运单号）；`ExchangeShipped` 时吸底主操作 =「确认收货」（`exchangeReceive`）；确认后落「已完成」。
- 消息中心（现有 `pages/messages/index.vue`）支持售后消息点击跳转售后详情；账户页菜单已有/补「我的消息」入口 + `inboxUnreadCount` 未读红点（若现有一期已实现则复用）。
- i18n：12 语言包同步新增留言/换货/通知跳转词条（禁止单语言硬编码）。

## 六、后台（web-admin）

- 售后详情新增「协商留言」区块（气泡 + 回复输入 + 发送）。
- 详情/列表吸底与卡上动作按状态机扩展：exchange 单 `Received` 态出现「换货发货」（弹运单号表单）。
- 数据看板「售后」页签（见第四节）。
- i18n zh-Hans/en 同步。

## 测试与验收

- e2e（after-sales-plugin）：留言 CRUD 与状态限制；exchangeShip/exchangeReceive 全链路；exchange 调 processRefund 被拒；超时 JobQueue 到期提醒/自动同意/重试耗尽（可用假时钟或短阈值）；afterSalesStats 聚合正确性。
- 单测/构建：nshop vitest 售后状态工具扩展 ExchangeShipped；两端构建绿。
- 手机截图（390×844 dpr=2）：C 端留言卡 / 换货确认收货 / 消息中心售后消息跳转；后台留言回复 / 看板售后页签 → 补操作手册「六期」章节。
- 验收命令回归：既有 e2e 全绿。

## 非目标（本期不做）

- 短信/微信公众号模板消息外发（仅站内信；notification-plugin 后续可扩展）
- 留言撤回/删除、留言未读已读分离模型
- 自动同意的白名单金额上限（仅总开关）
- 看板导出 Excel

## 风险与回退

- 新状态 `ExchangeShipped` 对旧前端未知：C 端/后台状态字典缺省回退显示原 key → 两端同步发版规避。
- JobQueue 依赖 redis/job-queue-plugin 现有配置（order-timeout 已验证可用）。
- 事件订阅失败不阻断主流程（notify 侧 try/catch，与现有 dispatch 失败不阻断一致）。
