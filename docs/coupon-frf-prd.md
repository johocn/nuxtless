# 优惠券营销 FR-F PRD：每日领券 / 神券日限量抢 / 支付有礼

> 版本：v1.2（2026-10-20）　状态：**已交付**（C51 真实支付链路待首笔真实订单回填核验）
> 版式决策：C 端动线采用**方案 A（券店首页内嵌楼层）**——每日领券卡 + 神券日倒计时楼层直接内嵌券店首页（mockup 已评审，用户选型 2026-10-20）；支付完成页赠券提示卡两案共用，随方案 A 落地。
> 前序：P1（FR-C 裂变 / FR-D 新客 1 元购 / E1 沉睡召回 / E2 会员等级券）已交付生产并审计 PASS（原账本 roadmap 已归档删除，本 PRD 独立承载 FR-F）。
> 三仓：vendure（packages/coupon-plugin）/ vshop（web-admin 配置台）/ nshop（C 端券店）。

## 0. 背景与目标

P2 储备三项转正，补齐券营销「拉新—促活—复购」闭环：

- **FR-F1 每日领券**：促活——每天来领一次，培养打开习惯。
- **FR-F2 神券日限量抢**：造节——限时限量制造稀缺感与传播爆点。
- **FR-F3 支付有礼**：复购——支付完成自动送券，引导下次到店/下单。

## 1. FR-F1 每日领券

### 1.1 需求

- 运营在渠道配置「每日领券」：开关 + 券模板组（1~5 张）+ 可选活动期 + 文案（名称/副标题/规则，多语言）。
- C 端券店首页展示「每日领券」卡：每张券「可领 / 已领」两态，一键逐张领取。
- 规则：**每人每券每天限领 1 张**（跨天可再领）；模板 totalCount 限量、perUserLimit、会员等级门槛（E2）照常生效。
- 未登录点击领取 → 引导登录。

### 1.2 数据与规则

- 渠道 customFields `couponDailyClaim`（JSON）：`{enabled, name, subtitle, rules, templateIds, startsAt, endsAt}`（形状对齐 couponCampaign）。
- 新实体 `CouponDailyClaimRecord`：`channelId / customerId / templateId / claimDate('YYYY-MM-DD', UTC+8)`，唯一索引 `(channelId, customerId, templateId, claimDate)`；发券与落记录同事务，唯一冲突即当天已领（R3）。
- 发放复用 `issueForProgram`（R2 原子限量）；`issuedBy='DAILY'`。
- 拦截语义：`ALREADY_CLAIMED / SOLD_OUT / PER_USER_LIMIT / MEMBER_LEVEL_BLOCKED / NOT_STARTED / ENDED / NOT_ENABLED`。

### 1.3 验收判据

| # | 判据 |
|---|---|
| A1 | 同用户同券同日二次领取返回 ALREADY_CLAIMED，DB 仅 1 条记录 + 1 张券 |
| A2 | 并发 10 请求同日同券 → 恰 1 成功 |
| A3 | 模板售罄返回 SOLD_OUT，claimedCount 精确不超发 |
| A4 | 日期边界 UTC+8：23:59 与次日 00:01 属不同天，可再领 |
| A5 | 未启用/不在时间窗 → C 端不渲染入口，API 硬拦 |
| A6 | 会员等级不达标拦截 MEMBER_LEVEL_BLOCKED |

## 2. FR-F2 神券日限量抢

### 2.1 需求

- 运营配置神券日场次：名称/副标题/规则（多语言）、时间窗（精确到分钟）、关联券模板（**限量靠模板 totalCount，为每场单独建券模板**）。
- C 端券店首页活动楼层（复用 campaign 位样式）：倒计时 + 抢券按钮；开始前预告态、进行中「立即抢」、结束/售罄置灰。
- 抢券 API：时间窗内 + 原子限量 + 场次内每人限抢 + 会员等级门槛；`issuedBy='FLASH'`。
- 并发安全：DB 条件 UPDATE 原子扣减（R2），超发不可能。

### 2.2 数据与规则

- 渠道 customFields `couponFlashSale`（JSON）：`{enabled, name, subtitle, rules, startsAt, endsAt, templateIds, perUserLimit}`（`perUserLimit` 默认 1）。
- 无新实体：场次内限抢按 `CustomerCoupon: issuedBy='FLASH' AND templateId AND issuedAt ∈ 场次窗` 计数。
- 服务端 now 判定时间窗，不信任前端时钟。

### 2.3 验收判据

| # | 判据 |
|---|---|
| B1 | 开始前 NOT_STARTED、结束后 ENDED，两侧硬拦 |
| B2 | 限量 10 张、100 并发 → 恰 10 成功，claimedCount=10 |
| B3 | 场次内同券同用户第 2 抢拒 PER_USER_LIMIT（跨场次不限制） |
| B4 | 未配置/禁用 → 楼层不渲染、API 硬拦 |
| B5 | 文案多语言下发（zh/en） |

## 3. FR-F3 支付有礼

### 3.1 需求

- 运营配置支付有礼：开关 + 奖励券模板（单张）+ 门槛（订单实付 ≥ minAmount，单位分，0=不限）+ 冷却 N 天（强制 ≥1）。
- 订单支付成功（PaymentSettled）→ 服务端**自动**发券，无需用户操作；失败静默不阻塞支付。
- C 端：支付完成页展示「已送你一张券」提示卡；券落在「我的券」。

### 3.2 数据与规则

- 渠道 customFields `couponPayGift`（JSON）：`{enabled, templateId, minAmount, cooldownDays}`（cooldownDays ≥ 1）。
- 触发：`OrderStateTransitionEvent → toState === 'PaymentSettled'`（先例：coupon-plugin/plugin.ts 加价购结算订阅）。
- 发放：`issueForProgram(issuedBy='PAYGIFT')`；R4 防骚扰 = 同模板+PAYGIFT+cooldownDays 去重；perUserLimit 生效；余量不足/不达标静默跳过（Logger.warn 留痕）。
- 幂等：PaymentSettled 重复事件被 cooldownDays≥1 冷却拦截，不会重复发券。
- 渠道隔离：按订单所属渠道取该渠道配置（R5）。

### 3.3 验收判据

| # | 判据 |
|---|---|
| C1 | 实付达标订单支付成功后，「我的券」出现 PAYGIFT 券 |
| C2 | 未达标（实付 < minAmount）不发券 |
| C3 | 冷却期内第二单不发券，Logger 留痕 RECENTLY_GRANTED |
| C4 | 发放异常不影响支付流程（吞异常 + warn） |
| C5 | 奖励券售罄静默跳过 |
| C6 | 渠道隔离：仅本渠道订单触发本渠道配置 |

## 4. 共享规则（承接 P1 R1-R4，续推）

| # | 规则 |
|---|---|
| R1 | issuedBy 留痕：枚举新增 `DAILY / FLASH / PAYGIFT`（plugin.ts admin+shop schema 两处同步） |
| R2 | 原子限量：atomicIncrementClaimed 条件 UPDATE，超发不可能 |
| R3 | 幂等：唯一索引（F1 每日记录）+ 冷却去重（F3）；发券与留痕同事务 |
| R4 | 防骚扰：同模板+同 issuedBy+N 天去重（F3 冷却；F1 按天唯一天然防骚扰） |
| R5（新） | 渠道隔离：配置/记录/校验/事件触发全部按 channelId 隔离 |
| R6（新） | 配置容错：坏 JSON/缺字段 → 纯函数 parse 返回 null → 功能整体不启用（页面不渲染、API 硬拦），不炸页面 |
| R7（新） | 多语言：配置文案 LocalizedText（string \| {zh,en,…}），复用 localizeCampaignText 兜底链；nshop i18n zh-CN/en-US 同步补词条 |

## 5. 交付物

- **vendure**：coupon-plugin 新增 daily-claim 实体/服务/schema/migration + flash 抢券 + pay-gift 事件发放；单测 + 包内 e2e。
- **web-admin**：券营销配置弹窗新增三块表单（每日领券/神券日/支付有礼）→ 渠道 customFields。
- **nshop**：券店首页每日领券卡 + 神券日楼层（抢券动线）+ 支付完成页赠券提示卡；i18n 同步。
- **手册**：操作手册新增 FR-F 用例 + 手机截图（390×844 dpr=2）。

## 6. 状态与审计记录

| 项 | 状态 | 审计记录 |
|---|---|---|
| FR-F1 每日领券 | ✅ 已交付 | 单测（纯函数 16 例）+ 包内 e2e 全绿；生产 e2e：幂等二次领 ALREADY_CLAIMED 回带券 344（A1）、SOLD_OUT 且 claimedCount 不超发（A3）、gold 门槛 MEMBER_LEVEL_BLOCKED（A6）、未启用/窗口外硬拦（A5）；DB 核验 coupon_daily_claim_record 唯一索引 + DAILY 留痕 + 同事务落记录；UTC+8 日界（A4）单测覆盖 |
| FR-F2 神券日限量抢 | ✅ 已交付 | 生产 e2e：NOT_STARTED/ENDED 双侧服务端硬拦（B1）、场次内限抢 PER_USER_LIMIT 跨场次不限（B3）、原子扣减不超发（B2 逻辑单测+DB claimedCount 核验）、未配置不渲染（B4）、文案 zh/en 双语下发（B5）；FLASH 留痕核验；C 端走秒/进度条生产截图（03） |
| FR-F3 支付有礼 | ✅ 已交付（C51 待回填） | 单测覆盖 payGiftEligible 门槛/冷却去重/售罄同路径；代码审计：PaymentSettled 订阅 try-catch 静默不阻塞支付（C4）、event.ctx 按订单渠道取配置（C6）、Logger.warn 留痕（C3）；**真实支付无法免费测试，待首笔真实订单后回填 C1/C2 实证** |

**生产审计环境**：shop-api `https://www.youshop.cn/shop-api`（vendure-token 头 = t1 渠道）；截图 `docs/manual/shots/2026-10-20-coupon-frf/`（390×844 dpr=2：01 首页整页 / 02 每日领券卡双态 / 03 神券日走秒+限量进度）。

**测试数据清理（2026-10-20 审计后）**：模板 98-101「FRF-AUDIT-*」禁用+改名 [ARCHIVED]；测试券 5 张（DAILY×3 / FLASH×2）置 RETURNED；coupon_daily_claim_record 测试记录 3 条删除；测试账号 frf-audit/frf-audit2 软删；渠道 t1 三项配置（daily/flash/paygift）还原 NULL——**裂变正式活动（tpl85）不受影响**，API 复核 daily/flash=null、fission 仍下发。

**交付过程事故记录**：FR-F 构建 nshop 时以 `$env:GQL_HOST=localhost:3000`（codegen 用途）覆盖 `.env` 正确值，被 graphql-client runtimeConfig 烧进产物 → 线上 SSR 渠道主题拉取失败 → t1 券店降级渲染为普通商城（2026-10-20 已修复重部署）。教训：**codegen 走本地 graphql.schema.json（schema 优先于 host），构建 nshop 无需也禁止设置 GQL_HOST**；已写入手册 §9 部署清单。

> 生产环境：shop-api https://e.joho.cn/shop-api（渠道 t1：vendore-token 头）；部署走本地构建铁律；coupon-plugin lib/ 编译产物与 src 同 commit 推送。
