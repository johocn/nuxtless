# 优惠券全环节手动测试与修复 Design

> 日期：2026-09-19
> 范围：nshop C 端（www.youshop.cn）+ web-admin 运营后台（e.joho.cn/guanli）+ vendure 后端 coupon-plugin
> 交付物：① 分层矩阵实测（创建/分发/领取/使用/核销/流转）② 端到端真实链路 ③ 问题清单+修复 ④ 新建 `docs/superpowers/manual/coupon/` 使用手册

## 1. 背景与目标

用户要求「测试各种优惠券，从创建、分发、领取、使用、核销等各环节是否好用，最后补充到使用手册」。
目标：用线上受控数据全量验证优惠券全链路，找出不好用/失效点并修正，最终沉淀 coupon 使用手册。

## 2. 测试范围

### 2.1 分层矩阵

| 环节 | 覆盖点 | 关键判定 |
|---|---|---|
| **创建** | 后台 4 类型（FIXED 满减 / PERCENT 折扣 / FULL 直减 / FREE_SHIPPING 免邮）× 3 scope（ALL/CATEGORY/SKU）；指定商品券（product-coupon binding）；兑换码券（claimCode）、新客限制（newCustomerOnly）、会员限制（memberLevel）、有效期（startsAt/endsAt 或 validDays）、门槛（minSpend）、限量（totalCount）、每人限领（perUserLimit） | 后台保存成功、字段正确回显、多语言 zh/en 生效、刷新后可读 |
| **分发** | 后台定向发券：选模板→搜客户（couponChannelCustomers 姓名/手机/邮箱）→批量发（grantCouponIssue）→站内通知（notify） | 发券成功、客户券到账、失败 reason 合理 |
| **领取** | C 端自助领取（claimable=true 券，领券中心/商品券一键领取）；兑换码 redeemCouponByCode 领券；我的券展示 | 领取成功、状态 UNUSED、限量/限领/新客/会员校验拦截正确 |
| **使用** | 结算页选券抵扣：满减/折扣/直减金额正确；免邮免配送费；scope=SKU 仅该商品可抵、CATEGORY 限定分类可抵；不满足门槛/不可用时提示 | 抵扣金额精确、不可用券不可选或被拦截、与 taxMode 价格口径一致 |
| **核销** | 到店/自提订单核销联动用券：核销（含确认收款）时该单所用券标记 USED；后台用券核销统计准确 | 核销后券状态 USED、台账/统计一致 |
| **流转** | 下单消耗→USED；退单返还→RETURNED；过期→EXPIRED；异常→INVALID；预留订单（reservedOrderId） | 状态流转符合调用链 |

### 2.2 端到端场景（关键节点合理化选取）

- **场景 A（线下/在线下单消耗）**：建满减券→定向发给测试用户→用户领/收券→下单结算抵扣成功→券 USED→后台统计+1。
- **场景 B（到店自提核销联动）**：建直减券→用户下单用券（自提单 COD）→到店扫码核销（确认收款）→订单推进 Delivered/Completed→该券联动 USED→后台台账核对。
- **场景 C（商品专属券）**：商品-券绑定→C 端商品页一键领取→结算仅该商品可抵→其余商品不可用。

### 2.3 受控数据策略
- 用测试账号（superadmin/z123123 后台；受控测试顾客账号 C 端）。
- 新建**低门槛小面额测试券**：面额/门槛设小（如满 1 减 1、直减 1、8.5 折、免邮）、限定 scope 或指定商品、短有效期，**不影响在售主券与正常用户**。
- 测后清理：删除测试券模板、撤销/禁用测试券、归档测试订单（或保留作核销演示）。
- 每次改动前记录原值，便于回滚。

## 3. 判定方法
- C 端视觉/交互结果一律以**浏览器手机视口（390×844，dpr=2）截图**为准。
- 后台券状态/抵扣/核销统计以 shop-api/admin 查询（couponTemplates / customerCoupons / 订单/台账）辅助验证。
- 判定易受 SSR/nginx 缓存滞后影响，改配置后须冷加载（`?cb=`）确认（承 P5 教训）。

## 4. 手册结构（新建 docs/superpowers/manual/coupon/）
单文件或多文件视篇幅定，至少含：
1. 优惠券整体概念（类型/scope/状态/生命周期/各端入口）
2. 后台操作手册：创建券、定向发券、商品绑券、用券统计
3. C 端使用手册：领券中心/兑换码/我的券/结算抵扣
4. 核销联动使用说明（到店/自提）
5. 常见问题与状态流转说明
6. 按项目铁律附手机视口截图

## 5. 交付物
① 分层矩阵实测 + 端到端 + 问题清单（P1…，现象/根因/代码点/回归脚本四列） ② `docs/superpowers/manual/coupon/` 使用手册 ③ 修复项落地 + 部署/说明 ④ 领域手册沉淀（复盘是否需要新建 `docs/domains/coupon.md`）

## 6. 不做的事
- 不改优惠券核心结算逻辑（除非实测发现 bug 属本次修复范围）。
- 不新增后台/C 端页面（现有入口已齐全）。
- 不动在售主券模板与正常用户券数据。

## 7. 关键代码地图（测试定位用，符号级）
- 后台券管理：`vshop/web-admin/src/apis/coupon.ts`（fetchCouponTemplates/create/update/delete、grantCouponIssue、searchChannelCustomers、fetchProductCouponBindings/create/update/delete）；页面 `vshop/web-admin/src/pages/coupon/{index,edit,issue}/index.vue`
- C 端券能力：`nshop/layers/base/app/composables/useCoupon.ts`（领券中心/我的券/领取/兑换码/applyCoupon/清除）
- 后端结算/校验：`d:\zhao\vendor\packages\coupon-plugin\src\coupon-settlement.ts`（新客判定 isNewCustomerWithinChannel）、`coupon-promotion-condition.ts`（券状态/开关/时间/渠道商品绑定/门槛/折扣校验）、`coupon-binding.service.ts`（商品-券绑定/渠道隔离）