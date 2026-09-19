# 优惠券使用手册

> 适用：nshop C 端商城 + vendure 后端 coupon-plugin + vshop/web-admin 运营后台
> 更新：2026-09-19（全环节受控测试后整理）
> 环境：测试店铺渠道 92（code `official-01`）线上实测

---

## 1. 优惠券整体概念

### 1.1 券类型（type）

| type | 名称 | 面额口径 | 说明 |
|---|---|---|---|
| `FIXED` | 满减 | 减免金额（元） | 满足门槛后按面额直减，需配 `minSpend` 门槛 |
| `PERCENT` | 折扣 | 折数（1-99） | 现值=折数×10（8.5 折 → 85），按折扣比例减免 |
| `FULL` | 直减 | 减免金额（元） | 无门槛直减（保存时强制 `minSpend=0`） |
| `FREE_SHIPPING` | 免邮 | 免配送费 | `discountValue` 须传 0，退款失败时不计券金额 |

### 1.2 适用范围（scope）

| scope | 含义 |
|---|---|
| `ALL` | 全场可用 |
| `SKU` | 仅指定商品（variantId）可抵 |
| `CATEGORY` | 仅指定分类（categoryId）内商品可抵 |

### 1.3 券生命周期与状态

```
创建(模板) → 发行(claimable/定向发券 grant) → 顾客持有
   ├── UNUSED（待用）
   ├── USED（下单抵扣消耗，核销联动）
   ├── RETURNED（退单返还）
   ├── EXPIRED（过期）
   └── INVALID（异常/已回收）
```

### 1.4 各端入口

- **后台**：`e.joho.cn/guanli` → 券管理（创建/发券/统计）；商品详情 → 商品券绑定。
- **C 端**：领券中心（我的券包/凭码兑换）；商品券一键领取；结算页券选择面板。

### 1.5 关键启用前置（重要）

**券要实际打折，渠道必须配置对应的 `coupon_applied` 促销**（condition code `coupon_applied` + action code `coupon_discount`）。未配置此促销时，套券只写 `customFields` 不产生折扣行（静默不打折）。兑换/新客/会员等校验与促销是否配置无关，但**实付抵扣依赖此促销**。

---

## 2. 后台操作手册（vshop/web-admin）

### 2.1 创建优惠券

路径：运营后台 → 券管理 → 新建。

字段与校验：

| 字段 | 说明 |
|---|---|
| 券类型 | 满减/折扣/直减/免邮 |
| 面额/折数 | 满减与直减按元，折扣按折数（8.5 折填 8.5） |
| 使用门槛 | 满减/折扣可选（0=无门槛）；直减强制 0 |
| 生效/失效时间 | 不选为长期有效；校验失效不早于生效 |
| 发行总量 | 0=不限 |
| 每人限领 | 0=不限 |
| 多语言文案 | 名称（中文必填）、名称（English）；说明中/英 |
| 领取设置 | 允许自行领取、凭码领券（claimCode）、领取后 N 天有效、仅限新客、会员等级限制 |
| 是否可用 | enabled 开关 |

> 多语言文案：中/英名称与说明已支持通过 nameZh/nameEn/descZh/descEn 多语言输入（P5），非必填，留空回退。

### 2.2 定向发券

1. 券列表选中目标券 → **发券**；
2. 按 姓名/手机号/邮箱 搜索当前渠道客户（`couponChannelCustomers`）；
3. 勾选客户 → 批量发放（`grantCouponIssue`），可选站内消息通知；
4. 客户券到账即 `UNUSED`。

### 2.3 商品-券绑定（商品专属券）

在**商品详情**页可快捷建券并自动绑定该商品；已绑定券在 C 端商品页高亮展示、支持一键领取，结算仅该商品（或指定规格）可抵扣。

### 2.4 用券统计

券列表展示 `claimedCount`（已领取/已发放）；核销与台账联动见第 4 节。

---

## 3. C 端使用手册

> 截图均以手机视口 390×844（dpr=2）为准。

### 3.1 领券中心

- 展示当前渠道可领券（`claimable=true`），支持凭码兑换、一键领取、查看「我的券包」。
- 截图：[领券中心](shots/coupon-centre.png)

### 3.2 凭码兑换

输入后台配置的 `claimCode` 兑换，成功即入「我的券」。

### 3.3 我的券

展示持有券的状态（待用/已用/已过期），可在结算时选择抵扣。

### 3.4 结算抵扣

- 结算页选择可用券 → 自动抵扣 → 优惠金额生效。
- 不可用券（不满足门槛/scope 不命中/状态无效）不可选择或会被正确拦截。
- 截图：[券选择面板（含使用）](shots/checkout-coupon-applied.png)、[结算页空态](shots/checkout-scroll.png)

### 3.5 券包页增强（C1/C2）

> 手机视口 390×844（dpr=2）。代码：`layers/base/app/pages/coupon/index.vue`。

- **C1·已退回 tab**：券包页「我的券包」新增「已退回」tab，点击可见 `RETURNED` 状态券，券面盖章「已退回」（印章为 `RETURNED` 的三元链：当前 locale → `returnedZh` → `returned`）；无券时显示空态文案。
- **C2·临期置顶高亮**：「未使用」tab 下券按**剩余有效天数值顶排序**（余数越少越靠前）；剩余有效天数 ≤ 7 天时整券**橙色高亮**并显示「**剩 N 天**」badge，便于优先使用。
- 截图：[C1·已退回 tab + 印章](shots/cclass-c1-returned.png)、[C2·临期券置顶/badge/高亮](shots/cclass-c2-expiring.png)

### 3.6 结算不可用券提示（C3）

> 手机视口 390×844（dpr=2）。代码：`layers/base/app/components/checkout/BoxCouponSelect.vue`。

- 结算页某箱**券包有券但本箱不可用**（门店隔离 / 门槛不足）时，在该箱「优惠券」区域直接给出提示：**「你有 N 张券，在本店不可用」**，并附归因拆分：**「未达门槛 m 张 · 不适用本店 k 张」**。
- 券包无券时仍显示原空态，不受影响。
- 截图：[C3·本店不可用提示（未达门槛 1 张）](shots/cclass-c3-drawer-unavailable.png)

---

## 4. 核销联动使用说明（到店/自提）

- 到店/自提订单下单用券后，到店扫码核销（订单券联动标记 `USED`）；
- 到店支付（COD）单需按渠道开关确认收款，确认后订单推进 `Delivered → Completed`；
- 退单返还 `RETURNED`。

---

## 5. 常见问题与状态流转

| 现象 | 根因/说明 | 处理 |
|---|---|---|
| 套券不产生折扣行（静默不打折） | 渠道未配置 `coupon_applied` 促销 | 后台为中心渠道建对应促销 |
| 会员券未按 memberLevel 拦截 | 后端 claim/grant/apply 均无校验（P2） | 已修复：三处接入 `assertCouponMemberLevel` |
| 凭码券/非自助券混入领券中心 | `couponCentre` 未过滤 `claimable=false`（P3） | 已修复：own/extra 两分支加 `claimable=true` |
| 后台券创建缺多语言输入 | admin input 仅 `name:String!`（P5） | 已修复：支持 nameZh/nameEn/descZh/descEn |
| 折扣金额口径与含税合计差 13% | `discounts[].amount` 为净价口径（P4） | 非 bug：抵扣实数正确，前端已用 `amountWithTax` 与含税合计同域展示 |
| 结算/核销真实下单在测试渠道不可走通 | ①channel92 结算配送不可达（数据未铺好）；②默认商城「店券挂他店商品」匹配失败：所有在库可加购变体均属其它店铺，与可领券(sant券 shopId=2 / 空 shop 的 SKU 券)不匹配 → applyCouponToOrder 抛 `COUPON_SCOPE_MISMATCH`（业务语义非 bug） | 免邮/scope 标注「需平台券(shopId=null) 或同店商品环境复测」；USED→RETURNED 已用平台券实测闭环 |

### 状态流转

```
待用 UNUSED ──下单抵扣──> USED
USED ──退单──> RETURNED
持有券 ──过期──> EXPIRED
```

---

## 6. 问题清单（现象/根因/代码点/回归脚本）

> 本次全环节受控测试发现，`P1` 已修复上线；`P2`（memberLevel 拦截）、`P3`（领券中心过滤 claimable）、`P5`（多语言输入）已修复上线；`P4` 为口径理解非 bug；`P6` 已用「平台券 shopId=null」在默认商城实测走通 USED→RETURNED 闭环（USED/RETURNED 事件监听可用，channel92 结算配送不可达仅属数据未铺好）。

| ID | 现象 | 根因 | 代码点 | 回归脚本 |
|---|---|---|---|---|
| **P1** | 后台新建/编辑券保存永远失败 | `apis/coupon.ts` 用 `$input: JSON!`，且 `name` 传 LocalizedText 对象，后端 schema `name:String!` 拒绝对象 | `vshop/web-admin/src/apis/coupon.ts` L117-139（改 `CreateCouponTemplateInput!/UpdateCouponTemplateInput!`）；`pages/coupon/edit/index.vue` `buildInput()`（`name` 改纯字符串） | **已修复**。回归=后台建券→保存→回显 |
| **P2** | 会员券未按 memberLevel 拦截，任意用户可领/可用 | `claimCoupon`/`grantCouponIssue`/`apply` 均无 memberLevel 校验 | `vendure/packages/coupon-plugin/src/coupon.service.ts` | **已修复**。三处接入 `assertCouponMemberLevel`/`couponMeetsMemberLevel`（grant 单结果 reason=MEMBER_LEVEL_BLOCKED）。回归=设 GOLD/金卡券普通用户领被拦截 |
| **P3** | 凭码券/不可自助领的券混入领券中心 | `couponCentre` 未过滤 `claimable=false` | `coupon.service.ts` `couponCentre()`（own/extra 两分支） | **已修复**。回归=设 claimable=false 券不再出现在领券中心 |
| **P4** | discounts[].amount 为净价口径，与含税 totalWithTax 差 13% | 促销折扣按净价计算 | `coupon-promotion-condition.ts` | **已确认非 bug**。抵扣实数正确（实测）；前端 `OrderTotals.vue` 已用 `amountWithTax` 与含税合计同域展示；仅净价 amount 与含税合计手工比对才显 13% 差，属正确税额重算，不改代码 |
| **P5** | 后台券创建缺多语言输入，en 无法投递 | admin schema 仅 `name:String!` | `plugin.ts` input + `coupon.service.ts` `applyMultilingualInput`；前端 `apis/coupon.ts` + `edit/index.vue` | **已修复**。支持 nameZh/nameEn/descZh/descEn。回归=传中英名称保存→回显一致 |
| **P6** | channel92 结算配送不可达＋默认商城(youshop)「券←→商品同店」匹配失败（current在库可加购变体均属其它店铺，与可领券不匹配→`COUPON_SCOPE_MISMATCH`） | 无可用配送方法 / `isDefaultMallChannel` 下 `lineHasShopId` 只算本店商品行，无本店行即抛 scope 不符（非券 bug，环境+数据限制） | `coupon.service.ts` `applyCouponToOrder` L750-759（scope 校验）；`coupon-promotion-condition.ts` L40 | 免邮券 / scope=SKU·CATEGORY / 真实下单核销 USED / 退单 RETURNED 均标注「需完整结算+同店商品环境复测」。已在 `scripts/_p6_flow.mjs` 留可复用复测 harness |

---

## 7. 实测结论摘要

- **核心抵扣逻辑验证通过**（shop-api 确凿）：FIXED 满 1 减 1（40000→39900）、PERCENT 8.5 折（→34000 减 15%）、FULL 直减、凭码/兑换/新客/会员券全部抵扣正确。
- **P6 线上复测（2026-09-19，默认商城 youshop 部署后）**：shop-api 健康、新码（memberLevel/nameZh）已上线；`couponCentre` 仅返回 claimable 券（P3 生效）、memberLevel=null 券可正常领（UNUSED）、配送下单链路（加购→地址→配送方式 sm=9→支付方式 fixed-aggregate-collection/balance-wallet）在默认商城**可正常走通**。
- **USED→RETURNED 全流程已闭环**（2026-09-19 更新，推翻此前「未能封闭」结论）：默认商城可通过**平台券（`shopId=null`）**绕过「券←→商品同店」硬规则（`lineHasShopId` 对 `shopId==null` 恒返回 true）——创建平台券 → 变体55 加购 → `applyCouponToOrder` 成功 → `checkoutSplitted` 下单 → **券 `USED`**；再 `cancelOrder` 取消订单 → **券 `RETURNED`**（实测券62 C-8Z5A-7FL9：USED(`usedOrderId=86`)→RETURNED(`usedOrderId=null`)）。结论：`OrderPlaced→bindAsUsed→Cancelled→returnCoupon` 事件监听全链路在线可用，「店券挂他店商品」受限属业务语义而非 bug。复测 harness：`scripts/_p6_flow.mjs`（USED 段）+ `scripts/_p6_cancel.mjs`（RETURNED 段，admin `cancelOrder` 而非 `transitionOrderToState`，PaymentAuthorized→Cancelled 有 `checkAllItemsBeforeCancel` 守卫须先全 items 取消）。channel92 结算配送不可达仍为数据未铺好。