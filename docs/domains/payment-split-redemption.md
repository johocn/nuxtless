# 支付/分箱/核销领域手册（Payment / Split-Box / Redemption）

> 入口指针：`project_memory.md`「分箱规则（优先级定稿）」「支付合并规则」「核销码显示规则」「核销收款逻辑」「核销后订单状态流转」「COD 自提单支付状态显示规则」「收款台账查询规则」「核销人即收款人规则」速查卡 → 本手册。
> 覆盖：后端 vendure `packages/cjk-plugin`（分箱聚合、支付合并/拆单判定、核销、分账台账 `merchant_settlement_ledger`）、C 端 nshop `layers/base/app`（核销码展示、COD 收款状态展示）。
> **职责边界**：与 `docs/domains/checkout.md` 互引——`checkout.md` 覆盖**结算页前端渲染**（orderBoxes 渲染、自提点/联系人选择、模块归属、就近默认），本手册覆盖**后端规则**（分箱判定、支付合并/拆单、核销与收款台账流转）；与 `docs/domains/shipping-profile.md` 互引——配送档案/自提点/可见性规则看配送档案手册。交叉处互相引用，不重复展开。

## 1. 概念模型

核心规则按「分箱 → 支付合并 → 核销」三段：

**分箱规则（优先级定稿）**：
1. **按租户分箱优先**：不同租户必分箱，即使共用全局配送档案（`isGlobal`）也不例外
2. **租户内按配送档案分箱**：同档案/同租户可合箱；跨档案/跨租户必分箱，箱间零交集
3. **箱的支付方式白名单**：分箱的支付方式 = 该箱配送档案所绑定的支付档案白名单

**支付合并规则（已按 2026-09-02 逐箱结算定稿更正）**：
- 合并/拆单**由「各被选箱的配送档案支付方式交集 + 余额是否充足」自动判定**，不放「合并/分箱」开关
- ① **选余额** → 全部箱跨租户/跨档案**合并为 1 个订单**（全局共享钱包一次扣款）
- ② **不选余额（在线/货到付款）** → 各箱支付方式**交集非空**时同样**合并 1 单统一收款**，实收按商户（租户）分账分别计入各商家账号
- ③ **仅当交集为空或余额不足**时才**按箱拆分**（每箱一单，各自支付）
- 取代旧的「客户不选余额则全部分单」规则

**核销（自提单到店履约 + COD 收款）**：
- **核销码显示**：仅自提单（`deliveryType='pickup'`）在订单详情页显示核销二维码；物流配送单（`deliveryType='delivery'`）不显示
- **COD 收款确认**：到店/货到付款（COD）自提单核销时，需根据租户级开关 `Channel.customFields.redeemCollectMode`（`force`/`optional`）确认收款；**强制模式下未确认收款无法核销**；确认后更新 `order.customFields.collected=true`，并将分账台账 `merchant_settlement_ledger` 状态从 `PENDING_SIGN` 翻转为 `PAID`
- **订单状态流转**：自提单核销成功（COD 单需已收款）后，自动将订单状态从 `PaymentAuthorized` 推进到 `Delivered` 再到 `Completed`
- **COD 自提单支付状态显示**：到店支付自提单下单后（未核销、未收款）支付环节显示「待到店收款」；扫码核销并确认收款后才算支付完成
- **收款台账查询**：门店查询收款台账时，需**同时过滤 `tenantChannelId` 和 `collectorChannelId`**，确保本店经手的每笔收款都可见
- **核销人即收款人**：核销收款调用时，**幂等地**将台账行归到本次核销渠道并记录核销人（优先取 `TenantMember.displayName`，逐级兜底 `Administrator.lastName` → 账号标识）

| 实体 | 关键字段 | 说明 |
|---|---|---|
| OrderBox 分箱 | `profileId`/`profileName`、`type`(`pickup`\|`delivery`)、支付方式白名单 | 后端按「租户 → 配送档案」两级聚合生成，前端见 `checkout.md` |
| ShippingProfile 配送档案 | `ownerChannelId`、`isGlobal`、`isTenantDefault` | 档案领域规则见 `shipping-profile.md` |
| `merchant_settlement_ledger` 分账台账 | `tenantChannelId`、`collectorChannelId`、`status`(`PAID`\|`PENDING_SIGN`)、`collectorName`、`collectedAt` | COD 结算时记 `PENDING_SIGN`（未实质收款），核销确认收款后翻 `PAID`；在线支付结算即 `PAID` |
| Order.customFields | `deliveryType`(`pickup`\|`delivery`)、`collected` | `deliveryType` 决定核销码显隐；`collected` 标记 COD 已收款 |
| Channel.customFields | `redeemCollectMode`(`force`\|`optional`) | 租户级核销收款确认开关 |

**核销状态机**：`PaymentAuthorized` → `Delivered` → `Completed`（COD 单需先确认收款）。

## 2. 文件地图（符号级，行号用 rg 现查）

### 后端 vendure `packages/cjk-plugin/src/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `order/order-box.service.ts` | 分箱聚合主服务 | `OrderBoxService`；经 `shippingProfileService.resolveBoxFulfilment` 按档案解析履约 |
| `order/order-box-aggregation.ts` | 分箱聚合纯函数 | 配套单测 `order-box-aggregation.spec.ts` |
| `shipping/shipping-profile.service.ts` | 配送档案履约解析 | `resolveBoxFulfilment`（档案 → 配送方式/自提点 → 支付白名单） |
| `order/order-split.service.ts` | **支付合并/拆单自动判定** | `OrderSplitService`（支付方式交集 + 余额充足性判定） |
| `order/order-split-shop.resolver.ts` | C 端拆单 GraphQL 入口 | — |
| `order/merchant-settlement-ledger.entity.ts` | 分账台账实体 | `MerchantSettlementLedger`（`tenantChannelId`/`collectorChannelId`/`status`/`collectorName`） |
| `order/merchant-settlement.service.ts` | 台账分账状态 | `MerchantSettlementService`：`codPaymentCodes` 命中 → `PENDING_SIGN`，否则 `PAID` |
| `order/merchant-settlement-admin.resolver.ts` | 商户端台账查询 | `collectorChannelId` 过滤 |
| `redemption/redemption-code.service.ts` | **核销核心逻辑** | `RedemptionCodeService`：`collectMode`（force/optional 判定）、`recordCollection`（按 `(orderId, collectorChannelId)` 幂等建 `PAID` 行）、核销人兜底 `TenantMember.displayName`、核销后推进订单状态 |
| `redemption/redemption.resolver.ts` | 核销 GraphQL 入口 | — |
| `redemption/redemption.schema.ts` | 核销类型/字段 | `collected`/`collectRequired` |
| `redemption/redemption-crypto.ts` | 核销码加解密 | 配套单测 `redemption-crypto.spec.ts` |
| `tenant/tenant-channel-custom-fields.ts` | 租户自定义字段 | `redeemCollectMode`（`force`/`optional`） |

### C 端 nshop `layers/base/app/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `composables/useIsPickup.ts` | 自提单判定 | `order.customFields.deliveryType === 'pickup'` |
| `components/redemption/RedemptionCodeBar.vue` | 核销码/商品条码（Code128）展示 | 仅自提单渲染 |
| `components/order/OrderRedemptionCard.vue` | 订单详情核销卡 | — |
| `pages/admin/redemption.vue` | 门店核销页 | — |
| `pages/checkout/` + `components/checkout/*` | 结算页分箱渲染（orderBoxes） | 前端渲染职责 → 关联 `docs/domains/checkout.md`，本手册不展开 |

## 3. 设计决策（ADR 式）

| 决策 | 理由 |
|---|---|
| 合并/拆单由「支付方式交集 + 余额是否充足」自动判定，**不放「合并/分箱」开关** | 开关引入组合爆炸与状态不一致；交集/余额已能完备表达三种结果（全并 / 交集并统一收款 / 全拆），自动判定对用户透明且贴合逐箱结算模型 |
| 核销人即收款人，幂等归账 | 台账按 `(orderId, collectorChannelId)` 幂等建 `PAID` 行，重复核销/并发调用不产生重复收款行；本次核销渠道即收款归属渠道，收款人优先取 `TenantMember.displayName` |
| 核销码仅自提单（`deliveryType='pickup'`）显示 | 物流单无到店履约环节，展示核销码无意义且易被误扫 |
| COD 收款独立于订单支付状态确认（`PENDING_SIGN` → `PAID`） | COD 结算时未实质收款，不能按在线支付记 `PAID`；以核销确认收款为翻转事件，账实一致 |
| 收款台账同时过滤 `tenantChannelId` + `collectorChannelId` | 门店既要看本店名下（tenant）的收款，也要看本店经手（collector）的收款，两维缺一不可 |

## 4. 常见坑

| 现象 | 根因 | 解法 |
|---|---|---|
| COD 自提单未核销未收款时支付环节无收款状态 | 到店支付单在核销确认前未实质收款，支付完成状态不应成立 | 支付环节按「`deliveryType='pickup'` 且 `collected=false`」显示「待到店收款」；扫码核销并确认收款后才算支付完成 |
| 强制模式（`redeemCollectMode=force`）下无法核销 | 未先确认收款就提交核销 | 强制模式必须先确认收款（`collected=true` + 台账翻 `PAID`）再核销；`optional` 模式可跳过确认 |
| 本店经手的收款在台账不可见 | 台账查询只过滤 `tenantChannelId`，漏过滤 `collectorChannelId` | 查询同时过滤 `tenantChannelId` 与 `collectorChannelId` |
| 核销码在物流配送单上显示 | 核销码渲染未判断 `deliveryType` | 仅 `deliveryType='pickup'` 渲染核销码（`useIsPickup` 判定） |
| 合并订单误按旧规则拆成多单 | 判定逻辑沿用旧的「客户不选余额则全部分单」 | 按 2026-09-02 定稿：各箱支付方式交集非空即合并统一收款，交集为空/余额不足才拆分 |

## 5. 问题速查（Bug 知识库）

| 现象 | 根因 | 代码点 | 回归脚本 |
|---|---|---|---|
| 各箱支付方式交集非空时订单仍按箱拆分，产生多单 | 合并/拆单判定沿用旧规则「不选余额则全部分单」，未按支付方式交集 + 余额自动判定 | `order/order-split.service.ts`（`OrderSplitService`） | `tmp/verify-t1t3-orderboxes.mjs` / `tmp/verify-orderboxes-multichannel.mjs` |
| 物流配送单（`deliveryType='delivery'`）误显核销二维码 | 核销码渲染未判断 `deliveryType`，订单有核销码字段即显示 | `components/redemption/RedemptionCodeBar.vue` / `components/order/OrderRedemptionCard.vue` | 订单详情端到端截图（自提/物流两场景对照） |
| 台账收款行归属错（记到别的门店/渠道） | 核销收款调用未按 `(orderId, collectorChannelId)` 幂等归账、未记录核销人 | `redemption/redemption-code.service.ts`（`recordCollection`）/ `order/merchant-settlement.service.ts` | 台账查询验证（`tenantChannelId`+`collectorChannelId` 过滤） |
| 本店经手收款在台账不可见 | 台账查询漏过滤 `collectorChannelId` | `order/merchant-settlement-admin.resolver.ts` | 台账查询验证脚本 |

## 6. 验证脚本清单

运行方式均为 `node tmp/<script>.mjs`（线上 admin API `https://e.joho.cn/admin-api`，superadmin/z123123）：

| 脚本 | 用途 | 运行 |
|---|---|---|
| `tmp/regress-shipping-profile.mjs` | **配送档案一键回归套件**（分箱前置：档案/自提点/可见性） | `node tmp/regress-shipping-profile.mjs` |
| `tmp/verify-orderboxes-pickup.mjs` | C 端自提单分箱场景 | `node tmp/verify-orderboxes-pickup.mjs` |
| `tmp/verify-orderboxes-multichannel.mjs` | C 端多租户分箱场景 | `node tmp/verify-orderboxes-multichannel.mjs` |
| `tmp/verify-orderboxes-t2-now.mjs` / `tmp/verify-orderboxes-vt.mjs` / `tmp/verify-t1t3-orderboxes.mjs` | 各租户 C 端 orderBoxes 实时/租户组合场景 | `node tmp/<script>.mjs` |
| `packages/cjk-plugin/src/order/order-box-aggregation.spec.ts` | 分箱聚合纯函数单测 | vendure cjk-plugin `npm test` |
| `packages/cjk-plugin/src/order/merchant-settlement.service.spec.ts` | 台账分账状态（COD→`PENDING_SIGN` / 在线→`PAID`）单测 | vendure cjk-plugin `npm test` |
| `packages/cjk-plugin/src/redemption/redemption-crypto.spec.ts` | 核销码加解密单测 | vendure cjk-plugin `npm test` |
| C 端订单详情截图 | 核销码仅自提单显示、COD「待到店收款」状态展示 | 手机视口端到端截图 |

## 7. 历史文档索引

**规则权威来源（memory）**：
- `project_memory.md`「分箱规则（优先级定稿）」「支付合并规则」「核销码显示规则」「核销收款逻辑」「核销后订单状态流转」「COD 自提单支付状态显示规则」「收款台账查询规则」「核销人即收款人规则」段落（Hard Constraints 区）— 本手册全部规则出处

**领域手册（关联）**：
- `docs/domains/checkout.md` — 结算页前端渲染（orderBoxes、自提点选择、模块归属），前端职责边界
- `docs/domains/shipping-profile.md` — 配送档案/自提点/可见性，分箱前置领域

**设计蓝本**：
- `docs/superpowers/specs/2026-09-13-domains-sso-login-design.md` §4.4 — 本手册设计蓝本（支付/分箱/核销章节）

**spec + plan 成对（核心）**：
- `2026-09-02-nshop-cn-per-box-checkout-design.md` + `plans/2026-09-02-nshop-cn-per-box-checkout.md` — 逐箱结算（支付合并/拆单自动判定定稿）
- `2026-09-03-orders-cn-redemption-design.md` + `plans/2026-09-03-orders-cn-redemption.md` — 订单中心核销（核销码显示/核销流程）
- `2026-08-31-orders-jd-blocks-redemption-design.md` + `plans/2026-08-31-orders-jd-blocks-redemption.md` — JD 风格订单块/核销
- `2026-08-28-nshop-delivery-payment-splitting-design.md` + `plans/2026-08-28-nshop-delivery-payment-splitting.md` — 配送费/支付拆分
- `2026-08-31-guest-order-lookup-pickup-redeem-design.md` + `plans/2026-08-31-guest-order-lookup-pickup-redeem.md` — 游客订单查询/自提兑换

（以上 spec/plan 均在 `docs/superpowers/specs|plans/` 下）
