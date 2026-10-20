# 买单券资金流（结算合规）T1-T4 交付账本

> 设计定稿：2026-10-19 会话（服务商分账模式）。代码：vendure `1faffacfc`（T1-T4 全量），生产验证：2026-10-20 本文档 §3。
> 合规核心：售出即结算 = 二清红线；正确链路 = 购买资金冻结微信待分账 → **核销后 T+1 出结算单再分账**。平台收入 = 佣金净额（费率待法务/财务确认前保持 0）。

## 1. 已交付（T1-T4，commit 1faffacfc）

| 任务 | 交付物 | 关键设计 |
|---|---|---|
| T1 结算单实体 | [coupon-settlement-order.entity.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon-settlement-order.entity.ts) | 状态机 `PENDING → SETTLED → PAID_OUT`（REVERSED/CANCELLED 预留）；佣金费率快照烧录（bp 万分比）；`@Unique(customerCouponId)` 一券一单防重（铁律④）；单号 `CSTL-{channel}-{couponId}` = 分账幂等键 |
| T3 分账适配器 | [coupon-settlement-adapter.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon-settlement-adapter.ts) | `SettlementAdapter` 接口（submitSplit/queryReceipt/refundSplit）+ `COUPON_SPLIT_MODE=stub\|wechat`；**wechat 模式未持合规结论（Q3.1/Q3.2）前启动即拒绝**，不静默回落 stub（防假分账成功） |
| T2 核销结算 | [coupon-settlement.service.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon-settlement.service.ts) + [in-store-bill.service.ts L235](file:///d:/zhao/vendure/packages/coupon-plugin/src/in-store-bill.service.ts) | 核销成功同步 `registerFromBill`（幂等、失败不阻断核销）+ `runSettlementCycle` T+1 汇总 job（兜底补登→提交→回执推进，SQL 下推 + 带原状态条件原子更新）；结算口径 P0 仅到店核销的**出售券**（`cc.saleOrderId IS NOT NULL`），免费/发放券不涉及分账 |
| T4 监管参数 | [coupon-sale-regulatory.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon-sale-regulatory.ts) + web-admin 监管参数卡（主包已入包） | 渠道 customFields：billpayMaxSalePrice 等；服务端创建/改模板校验（超限抛错），默认宽松向后兼容 |

定时器：`COUPON_SETTLE_JOB_MS`（默认 0 关闭；**生产已启用 21600000=6h**，2026-10-20）。佣金费率 `COUPON_SPLIT_COMMISSION_BP`（默认 0 = 暂不分佣，合规保守起步）。重试上限 `COUPON_SETTLE_MAX_ATTEMPTS`（默认 8）。

## 2. 风险铁律（不变量）

1. stub→微信实联必须持 Q3.1/Q3.2 书面结论 + 灰度（单渠道小额先行）
2. 定时任务 SQL 全部下推、日期用参数绑定 Date 对象（规避 SQLite/PG 序列化前科）
3. 全程不动全局 OrderItemPriceCalculationStrategy
4. 结算幂等 = `@Unique(customerCouponId)` + settlementNo 幂等键 + 带原状态条件原子更新
5. 实体日期列双方言范式：`@Column({nullable:true})` + `?: Date`（禁 `| null` 联合、禁 `type:'datetime'`）

## 3. 生产全链验证（2026-10-20，stub 模式）

植入测试资金链（channel 7 / tpl84 五元券 / 昨日核销 / cc.saleOrderId 溯源）→ 两轮 `runCouponSettlementCycle`：

| 步骤 | 结果 |
|---|---|
| 轮1（T+1 界线内） | backfill 补登 1 条 PENDING（face=500 净=500 费率 0），**不提交**——界线正确 |
| 轮2（绕界线 createdAt 昨日） | submitted=1 → stub 受理 `STUB-CSTL-7-333` → SETTLED → 回执 FINISHED → **PAID_OUT**，splitMode=stub 快照烧录 |
| 幂等复跑 | submitted/promoted/failed 全 0 |
| 清理 | 测试 bill/券/结算单全删（残留 0）；定时器保留启用 |

spec：`coupon-settlement.service.spec.ts` + `coupon-settlement.spec.ts` 共 **20 用例全过**（含并发抢占/失败重试/回执 FAILED 退回/唯一约束防重）。单测/e2e 走 sqljs 测不出 PG 方言问题已按铁律⑤ grep 排查。

## 3.1 T5 三方对账（2026-10-20 交付）

**对账口径**（结算单 ↔ 分账回单 ↔ 商户核销流水）：

| 差异类型 | 严重度 | 判定 |
|---|---|---|
| AMOUNT_MISMATCH | HIGH | face ≠ commission + net（账内不平，资损级） |
| MISSING_RECEIPT | HIGH | SETTLED/PAID_OUT 无回执号（单边缺失） |
| RECEIPT_STATE_MISMATCH | HIGH | 本地 PAID_OUT 但回执非 FINISHED |
| MISSING_BILL | HIGH | 结算单指向的核销流水不存在 |
| SETTLE_STUCK | MEDIUM | PENDING 重试耗尽 / SETTLED 滞留超阈值（`COUPON_RECONCILE_STUCK_HOURS`，默认 24h） |
| MISSING_SETTLEMENT | MEDIUM | 有核销流水无结算单（结算 job 兜底补登会自愈，持续存在说明补登失败） |
| RECEIPT_QUERY_FAILED | LOW | 回执查询异常（网关侧排查，下轮重试） |

**实现**：
- `coupon-settlement-reconcile.ts` 纯函数（输入快照 → 差异列表，spec 16 用例）；`CouponSettlementReconcileDiff` 实体（settlement_reconcile_diff，幂等建表迁移 + 渠道/轮次索引）；`CouponSettlementReconcileService`（整渠道一轮对账，重跑覆盖未解决差异、resolved 留审计；单边缺失口径与 backfill 同查询）
- admin schema：`couponReconcileDiffs` / `runCouponReconcile` / `resolveCouponReconcileDiff`
- web-admin 台账页：优惠券模块 → **结算对账**（对账差异 + 结算单双 tab；手动对账/严重度筛选/标记已处理；截图 `vshop/docs/superpowers/manual/shots/2026-10-20-t5-reconcile/`）

**生产验证**（2026-10-20）：空跑 0 差异 → 注入金额不平脏单 → 对账精确报 AMOUNT_MISMATCH HIGH（detail 含三金额）→ resolve → t3 渠道隔离正确（看不到 t1 差异）→ 清理残留 0 → 复跑归零。

## 4. 未决与后续（P1/P2）

- **T6** 发票凭证类型预留（601/消费/佣金）；**T7** 须知文案 12 语言（nshop i18n）；**T8** 退款联动（未分账取消登记/已分账 reversed 追偿，挂 refundCouponSaleOrder——适配器 refundSplit 已预留）
- **T9** 进件状态页；**T10** 监管参数多租户 UI；**T11** 看板口径=结算单汇总；**T12** 三仓联测
- **前置依赖**：微信实联前须完成商户进件（特约商户 + 分账接收方）+ 合规书面结论
