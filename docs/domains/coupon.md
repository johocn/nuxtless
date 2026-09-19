# 优惠券领域手册（coupon-plugin / C 端券能力 / web-admin 券管理）

> 领域：优惠券全链路（创建 / 分发 / 领取 / 使用 / 核销 / 流转）
> 涉及：vendure coupon-plugin（后端）、nshop C 端券能力、vshop web-admin 券管理
> 覆盖已 ≥2 次独立任务的沉淀：2026-09-08 领券修复 + 2026-09-19 全环节受控测试

## 1. 概念模型

- **券模板 `CouponTemplate`**（entity）：券的「版本/发行定义」，含类型、面额、门槛、scope、有效期、限量、限领、兑换码、新客/会员限制、enabled/claimable。
  - `name/description` 实体实为 `LocalizedText`（JSON 存储），**GraphQL admin input 只暴露 `String!`** → 前端当前仅投递 zh 纯字符串（P5）。
  - **渠道归属**：模板经 `channels`（ManyToMany）关联渠道，`shopId` 标记所属店铺（商户）。后台按当前管理员店铺自动做属店隔离。
- **顾客券 `CustomerCoupon`**（entity）：模板 × 顾客的持有实例，字段含 `code`、`status`（UNUSED/USED/RETURNED/EXPIRED/INVALID）、绑定订单。
- **商品券绑定 `ProductCouponBinding`**：商品（可细化到 variantIds）→ 券模板，C 端商品页一键领取、结算仅该商品可抵。
- **券状态生命周期**：UNUSED（待用）→ 下单抵扣 USED；退单 → RETURNED；过期 → EXPIRED；异常 → INVALID。
- **折扣生效前置（关键）**：渠道必须配置 `coupon_applied` 促销（condition code `coupon_applied` + action code `coupon_discount`）。未配置时套券只写 customFields 不产生折扣行（静默不打折）。
- **作用域 scope**：`ALL` 全场 / `SKU` 仅指定商品（variantId）/ `CATEGORY` 仅指定分类（categoryId）。
- **折扣口径（P4）**：促销 `discounts[].amount` 为**净价口径**，含税 `totalWithTax` 换算差 13%；抵扣实数正确，仅展示层需按 taxMode 换算。

## 2. 文件地图（符号级）

### 后端 `vendure/packages/coupon-plugin/src/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `coupon.service.ts` | 核心服务：领券中心/券包/领取/兑换/自助领/定向发券/单人发券 | `couponCentre`、`claimCoupon`、`redeemCouponByCode`、`grantCouponIssue`、`myCouponWallet`、`grantCoupon` |
| `coupon-settlement.ts` | 结算期券处理：新客判定、剩余金额、分箱归属 | `isNewCustomerWithinChannel`（注意用 `innerJoin channels` 非 `channelId` 列） |
| `coupon-promotion-condition.ts` | 促销 condition：券状态/开关/时间/scope/门槛/折扣校验 | `coupon_applied` condition |
| `coupon-promotion-action.ts` | 促销 action：套用折扣 | `coupon_discount` action |
| `coupon-binding.service.ts` | 商品-券绑定（渠道隔离） | 绑定增删查、绑定件取模板 |
| `coupon-scope.ts` | scope 判定（ALL/SKU/CATEGORY） | scope 匹配函数 |
| `coupon-runtime.ts` | 运行时缓存/券状态机 | 状态流转、缓存 |
| `plugin.ts` | SDL/admin resolver 注册 | 定义 GraphQL `name: String!` 输入（P5 根因点）、`couponChannelCustomers` 等 |
| `coupon-template.resolver.ts` / `coupon-admin.resolver.ts` / `coupon-shop.resolver.ts` | 各端 resolver | 模板 CRUD / 后台发券 / C 端查询 mutation |
| `localize.ts` | LocalizedText 本地化解析 | `localize` 回退 |
| `constants.ts` / `types.ts` | 常量与类型 | 状态枚举、类型枚举 |

### C 端 `nshop/layers/base/app/composables/useCoupon.ts`
| 职责 | 关键符号 |
|---|---|
| 领券中心 / 我的券 / 领取 / 兑换码 / applyCoupon / 清除 | `useCoupon()`、`couponErrorMessage()` |

### 后台 `vshop/web-admin/src/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `apis/coupon.ts` | admin-api 调用 | `fetchCouponTemplates/createCouponTemplate/updateCouponTemplate/deleteCouponTemplate`、`grantCouponIssue`、`searchChannelCustomers`、`fetchProductCouponBindings/create/update/delete` |
| `pages/coupon/index/index.vue` | 券列表 | 列表/启停/删除/发券入口 |
| `pages/coupon/edit/index.vue` | 建/编辑券 | `buildInput()`（name/description 投纯字符串） |
| `pages/coupon/issue/index.vue` | 定向发券 | 搜客户 + 批量发 |

## 3. 设计决策（ADR）

- **券 = 模板 + 顾客实例 双层**：模板定义发行规则，实例记录每人持有与状态，支撑限量/限领/流转。
- **折扣走 Vendure native 促销机制**（`coupon_applied` condition），而非结算层手写扣减：复用促销售后架构、税收/分账对账一致；代价是**必须为渠道配促销才生效**（易被忽略）。
- **店铺隔离**：模板 `shopId` + channels 双重隔离，后台只看到当前店铺券，C 端仅展示当前渠道可领券。
- **name/description 多语言**：实体 LocalizedText；admin input 已支持 nameZh/nameEn/descZh/descEn（P5），create/update 由 `applyMultilingualInput` 合并为对象，前端可投 zh/en。

## 4. 常见坑

1. **套券不产生折扣行**：渠道未配置 `coupon_applied` 促销。→ 到目标渠道建对应促销。
2. **后台建券/编辑保存必败**（P1）：此前 `apis/coupon.ts` 用 `$input: JSON!` 且 name 传对象。→ 已改为类型化 input 全纯字符串。
3. **凭码券/不可自助领券混入领券中心**（P3）：`couponCentre` 未过滤 `claimable=false`。→ 已修（own/extra 两分支加 `claimable=true`）。
4. **会员限制未拦截**（P2）：claim/grant/apply 均无 `memberLevel` 校验。→ 已修（`assertCouponMemberLevel`/`couponMeetsMemberLevel` 三处接入；grant 单结果 reason=MEMBER_LEVEL_BLOCKED）。
5. **折扣净价/含税口径差 13%**（P4）：非 bug。抵扣实数正确；前端用 `amountWithTax` 与含税合计同域；净价差是正确税额重算。
6. **本渠道结算配送不可达**（P6）：channel92 无可用配送方法 → 订单无法推进；且默认商城(youshop)存在「券←→商品同店」硬规则（`isDefaultMallChannel` 只算 `lineHasShopId` 本店行），在库可加购变体均属其它店、与可领券不匹配 → `applyCouponToOrder` 抛 `COUPON_SCOPE_MISMATCH` 无法真实挂券。→ 此前按「环境/数据限制（非券 bug）」判定；**2026-09-19 已用「平台券（shopId=null）」绕过同店限制，在默认商城实测走通 USED→RETURNED 闭环**（见下），推翻「不可闭环」结论：**USED/RETURNED 事件监听本身可用**，仅「店券挂他店商品」受限属业务语义。复测 harness 在 `scripts/_p6_flow.mjs`。<br>**横向限制**：channel92 无可用配送方法（订单无法推进到可勾选券的结算环节）仍属环境/数据层面未布好的坑，非 coupon-plugin 代码问题。

## 5. 问题速查（Bug 知识库）

### 已修复
| 现象 | 根因 | 代码点 | 回归脚本 |
|---|---|---|---|
| 后台新建/编辑券保存永远失败 | `$input: JSON!` + name 传对象，后端 `String!` 拒对象 | `vshop/web-admin/src/apis/coupon.ts`（create/updateCouponTemplate）、`pages/coupon/edit/index.vue` `buildInput()` | 后台建券→保存→回显 |
| 会员券未按 memberLevel 拦截（P2） | claim/grant/apply 均无校验 | `coupon.service.ts`：`couponMeetsMemberLevel`/`assertCouponMemberLevel`/`resolveRequiredMemberLevel`；claimCoupon、grantCouponIssue(reason=MEMBER_LEVEL_BLOCKED)、applyCouponToOrder 三处调用 | 设 memberLevel=GOLD/金卡，普通用户领应被 UserInputError 拦截 |
| 凭码券/非自助券混入领券中心（P3） | `couponCentre` 未过滤 claimable=false | `coupon.service.ts` `couponCentre`（own 与默认商城 extra 两分支均加 `tpl.claimable = true`） | 设 claimable=false 券不再出现在领券中心 |
| 后台券缺多语言输入（P5） | admin input 仅 `name:String!` | `plugin.ts` Create/UpdateCouponTemplateInput 加 nameZh/nameEn/descZh/descEn；`coupon.service.ts` `applyMultilingualInput`/`mergeLocalized` 合并为 LocalizedText；前端 `apis/coupon.ts` input 类型 + `edit/index.vue` buildInput 投递 | 后台传 nameZh/nameEn 保存→回显 nameZh/nameEn 一致 |

### 待办（记录，未修复）
| 现象 | 根因 | 代码点 | 回归建议 |
|---|---|---|---|
| discounts[].amount 净价口径差 13% | 促销折扣按净价计算 | `coupon-promotion-condition.ts` | **已确认非 bug**：抵扣实数正确（全环节实测）；前端 `OrderTotals.vue` 已用 `discounts[].amountWithTax`（含税域）与 `totalWithTax` 同域展示；净价 amount 仅在与含税合计手工比对时才显 13% 差，属正确税额重算，不改任何代码 |
| ~~channel92 结算配送不可达，订单无法推进（P6 残余）~~ **已闭环** | ① 商品78 `enabled=false` → shop-api 过滤；② 无 `isTenantDefault` 配送档案 → 分箱空；③ 无 native 支付方法 assign → `payment-method-not-found`；④ 无 `coupon_applied` 促销（`promotion 3` disabled）→ 券不折扣 | （结算链路 + 环境数据铺好） | **2026-09-19 已修**：启用商品78、建 isTenantDefault 档案36 绑快递配送(9)、`assignPaymentMethodsToChannel`(支付4/5)、启用 promotion 3；`scripts/_c92_used_returned.mjs` 在 channel92 实测 **USED→RETURNED 全通**（券65 C-KAT2-GSB9，order99 PaymentAuthorized→Cancelled）。**验证先决**：该渠道建 `coupon_applied` 促销（coupon_discount action）后券才实际折扣 |
| ~~P2 memberLevel 高等级券拦截未单独回归~~ | 代码已接入 `assertCouponMemberLevel`，但仅验证 memberLevel=null 可领 | `coupon.service.ts` `claimCoupon`/`grantCouponIssue`/`applyCouponToOrder` | **2026-09-19 已回归**：`scripts/_c2_memberlevel.mjs`（channel92）。建 memberLevel='3'(金卡)券 → 普通新客(成长值0档位1) `claimCoupon` 报 `Coupon requires a higher member level`；admin `grantCouponIssue` 单条返回 `ok=false reason=MEMBER_LEVEL_BLOCKED` |
| ~~SKU / CATEGORY 作用域券~~ **已实测** | scope=SKU 经 `ProductCouponBinding`（productId+variantIds）过滤订单行实现，创建 binding 时自动把 `template.scope` 置为 `SKU`、单 variant 写 `variantId`；**注意**：`template.scope`/`categoryId` 字段本身不参与运行时结算匹配（CATEGORY 无匹配逻辑），SKU 限定的唯一权威入口是 binding | `coupon-promotion-condition.ts` L48-55（binding 过滤）、`coupon-binding.service.ts`（scope/variantId 同步） | **2026-09-19 已回归**：`scripts/_c3_scope.mjs`（channel92）。正例 bind{78,var74}→订单var74→套券减100；反例 bind{55}→订单仅var74→套券保持不变 |
| ~~`ProductCouponBinding` 商品页一键领取~~ **已实测** | 绑定件取模板、`claimProductCoupon`(bindingId) 复用 `claimCoupon` 链路 | `coupon-binding.service.ts` / `coupon.service.ts` `claimProductCoupon` L490 | **2026-09-19 已回归**：`scripts/_c4_binding_claim.mjs`（channel92）。C 端 `productCoupons(78)` 列出绑定券 → `claimProductCoupon(bindingId)` 一键领取 `status=UNUSED`（code C-9MD4-FUET）→ myCoupons 可见 → 目标商品 var74 套券减100 |
| ~~券状态 EXPIRED / INVALID 分支~~ **已实测** | ① INVALID：admin `revokeCustomerCoupon` 将 UNUSED→INVALID；② **EXPIRED 不落库（缺口）**：全插件无 `status='EXPIRED'` 赋值，过期券维持 `UNUSED`，仅靠 `expiredAt` 在可用计数(claim 去重)、领券中心过滤、结算条件中被排除 | `coupon.service.ts` `revokeCoupon` L687、`listMyCoupons` L340、`countHeld` L901；`coupon-promotion-condition.ts` L59 | **2026-09-19 已回归**：`scripts/_c5_status.mjs`（channel92）。INVALID：claim→revoke→`INVALID`→结算拒（`Coupon is not in a usable state`）；EXPIRED：endsAt 过去券不入领券中心、claim 报过期；validDays 券快照 expiredAt 但 status 恒 UNUSED，`myCoupons(status:EXPIRED)` 恒空——**建议后续补 EXPIRED 落库/定时态转换** |
| ~~核销收款联动与券 USED 冲突~~ **已实测** | 自提单核销（redeemCollectMode/`collected`/ledger 翻转）属订单级字段，券 `USED` 由 `usedOrderId` 标记，两者正交、结构上无冲突 | `redemption-code.service.ts` `claim` L491-529、`recordCollection` L145-192 | **2026-09-19 已回归**：`scripts/_c6_redeem_usd.mjs`（channel92）。建平台券→新客领券→下单 var74 套券（`fixed-aggregate-collection`，命中 `COD_PAYMENT_CODES` 属到店收款路径）→ 券 `USED` → C 端 `orderRedemptionCode` 取明文码（`status=active`，省略 `phone` 参数走登录归属校验）→ admin `redemptionLookup`（未核销未收款）→ `redemptionClaim(collect=true)`（核销成功 + `recordCollection` 写台账 PAID + `collected=true`）→ **核销收款后券仍 `USED`，确认联动不冲突** |
| ~~验证脚本（`_verify_*.mjs`/`_gql.json`）未重建归档~~ **已实测** | 文档第 6 节注明"按需重建" | `scripts/` | **2026-09-19 已归档**：新建 `scripts/_verify_discount.mjs`（channel92）并回归通过：建平台券→新客领券→加购 var74（读无券基准 20000）→设地址/运费（含运费基准 21000）→套券→checkoutSplitted（券 USED）→ admin `order(id:)` 读 `discounts[].amountWithTax=-100` 与 `totalWithTax=20900`；断言折扣额绝对值为 100、`totalWithTax == 含运费基准 - 100`。已归档进第 6 节 |

### 待修复方案：EXPIRED 状态落库（已评审，2026-09-19）
> 回应上表 c5 行的「不落库缺口」。方案：`CouponStatus` 联合类型已含 `EXPIRED`（`types.ts`），但全插件无任何 `status='EXPIRED'` 赋值——过期券维持 `UNUSED`/`RETURNED`，仅靠查询 `expiredAt` 过滤隐藏。判定依据已具备：`createUserCoupon`（`coupon.service.ts` L961）已在 validDays/endsAt 时写 `expiredAt` 快照。

**触发层次（按推荐度，可组合）**
1. **惰性 on-read（主，推荐）**：新增 `expireDueCoupons(customerId?)`，`UPDATE ... SET status='EXPIRED' WHERE status IN ('UNUSED','RETURNED') AND expiredAt IS NOT NULL AND expiredAt <= now`。在 `listMyCoupons` / `countHeld` / `applyCouponToOrder` 前置调用——即读即转化、无定时依赖，用户与结算路径即时可见。代价：无人访问的懒券暂不落库（无业务影响，由第 2 层兜底）。
2. **定时 job（可选加固）**：cron 周期性归集清扫全部过期懒券；事务 + 批量、幂等（`plugin.ts` 注入 `@Cron`）。
3. **存量 backfill（上线迁移）**：执行 `UPDATE ... SET status='EXPIRED' WHERE status IN ('UNUSED','RETURNED') AND expiredAt <= now`。

**边界与一致性**
- USED / INVALID 不覆盖（已核销消费、已作废券保持原状态）。
- RETURNED 回退后若已过 `expiredAt` → 落 EXPIRED，不可再次使用。
- `countHeld` 的 `expiredAt > now` 过滤**保留**（不删除），防惰性转化与结算/领券并发竞态，两语义一致。
- Schema 零改动：`customerCoupons(status:EXPIRED)` 等 admin 检索直接可用。

**代码点**：`coupon.service.ts` 新增 `expireDueCoupons()`；`listMyCoupons` / `countHeld` / `applyCouponToOrder` 前置调用；定时 job 于 `plugin.ts`。状态机见会话内可视化（UNUSED→USED→RETURNED；UNUSED→INVALID；UNUSED/RETURNED→EXPIRED 为新增焦点路径）。

**实现要点（实现级，2026-09-19 完善；**2026-09-19 已落地实现**）**
- **方法**：`async expireDueCoupons(ctx, customerId?): Promise<number>`。执行单语句条件 UPDATE（原子、幂等）：
  `UPDATE customer_coupon SET status='EXPIRED' WHERE status IN ('UNUSED','RETURNED') AND expiredAt IS NOT NULL AND expiredAt <= :now`（传 customerId 时追加 `AND customerId=:id`；不传则全量）。因条件含 `status IN(...)`，**天然不会覆盖 USED/INVALID**；已 EXPIRED 不在条件内 → 多次执行幂等。返回受影响行数便于观测。
- **接入点**：
  - `listMyCoupons`（L340）开头先 `expireDueCoupons(ctx, customerId)`，随后 status 精确过滤即可命中 EXPIRED → 用户侧即时正确。
  - 结算/领券前（`applyCouponToOrder`、`claimCoupon`/`exchangeWithPoints` 的 `countHeld` 调用方，均有 ctx）先转化，杜绝"过期仍可结算/计数"。
  - **结算条件热路径不改**：`coupon-promotion-condition.check` L59 已有 `expiredAt` 双重拦截（过期即不放行），不在此加 UPDATE。`applyCouponToOrder`（温和路径）增加**实例级过期落库+拒绝**：读 cc 后先查 `cc.expiredAt`，越界则置 EXPIRED 并抛 `Coupon has expired`——顺带修复原实现只查 `tpl.endsAt`、漏查实例快照的真实缺口（validDays 券的模板 endsAt 往往晚于实例 expiredAt）。
- **定时 job（无新依赖）**：项 0 pkg 无 `@nestjs/schedule`；`plugin.ts` 在 `onApplicationBootstrap` 监听（`expireDueCouponsAll()` 用 rawConnection 全量清扫，幂等）。**实装：env `COUPON_EXPIRE_SWEEP_MS` 门控，默认关闭**（避免生产意外全量 UPDATE），设为毫秒即启动并先跑一次。
  - `countHeld` 的 `expiredAt > now` 过滤**保留**作竞态双保险。
- **存量 backfill**：复用现有 `migrations/*.ts` 的 `OnApplicationBootstrap` ensure 模式，写一条幂等 UPDATE（条件同上，覆盖全量历史 UNUSED/RETURNED 过期券）；符合仓库现有迁移约定，无需新增 Ctrl 表。
- **回归验证**：扩 `scripts/_c5_status.mjs` 或新 `scripts/_c_expired_persist.mjs`：建 validDays 短券（或 endsAt 已过模板）→ 领券 → 越过 `expiredAt` 快照 → 断言 `myCoupons(status:EXPIRED)` 出现该券（此前恒空）、`customerCoupons(status:EXPIRED)` 可检索、结算条件不再放行该券。channel92（`_c5` 环境）复用。
- **Schema/前端**：零改动（类型/查询均已支持）；前端"我的券"若按 status 分 tab，EXPIRED 落地后无需再依赖前端自行比较 expiredAt。

**线上验证（2026-09-19 通过）**：部署 commit `7c3e956be`（git pull + pm2 restart 至 `/www/apps/vendure`）后，`scripts/_verify_grant_expired.mjs` 端到端四段全通：
1. admin 定向发放一枚 `endsAt` 已过期的券（实例 `expiredAt`=过去、`status=UNUSED`）；
2. C 端 `myCoupons(status:EXPIRED)` 触发惰性落库 → 该券 UNUSED→EXPIRED（code `C-DM6T-36EA`）；
3. admin `customerCoupons(status:EXPIRED)` 检索到 64 条，历史 UNUSED/USED/RETURNED 均正确区分（**条件 UPDATE 未误伤**）；
4. `applyCouponToOrder` 对该已过期券报 `Coupon has expired`（实例级过期校验生效）。
> 说明：`_c_expired_persist.mjs`（claim 路径）受模板 `validDays` 为 Int 限制无法单次即时越界，故用 admin 定向发放已过期实例做等价验证（条件与惰性落库逻辑一致）；券自然过期一天后契约脚本同样可复跑通过。

### 环境限制（非券 bug）
| 现象 | 根因 | 代码点 |
|---|---|---|
| channel92 结算配送不可达，订单无法推进 | 无可用配送方法 → 不生成配送线 | （结算链路，非券逻辑） | **2026-09-19 已铺好**：启用商品78 + 建 isTenantDefault 档案36 + assign native 支付方法 + 启用 promotion 3，channel92 已可完整结算并走通 USED→RETURNED（见待办表 c1 行）。 |
| 默认商城真实挂券下单推不进（P6，2026-09-19 线上复测）：全部在库可加购变体与可领券不同店 | 默认商城 `isDefaultMallChannel` 下 `applyCouponToOrder` 只算 `lineHasShopId` 本店商品行，无本店行即抛 `COUPON_SCOPE_MISMATCH` | `coupon.service.ts` `applyCouponToOrder` L750-759；`coupon-prescription-condition.ts` L40 | **已实证走通**：创建平台券（`shopId=null`，对任意行 `lineHasShopId` 返回 true）→ 变体55 加购 → applyCouponToOrder 成功 → checkoutSplitted 下单 → **券 USED**；`cancelOrder` 取消 → **券 RETURNED**（券62 C-8Z5A-7FL9 实测 USED→RETURNED，`usedOrderId` 由 `86` 清空为 null）。harness：`scripts/_p6_flow.mjs`（USED 段）+ `scripts/_p6_cancel.mjs`（RETURNED 段，用 admin `cancelOrder` 而非 `transitionOrderToState`，因 PaymentAuthorized→Cancelled 有 `checkAllItemsBeforeCancel` 守卫需先全 items 取消）。**结论**：USED/RETURNED 事件监听可用；「店券挂他店商品」受限是业务语义非 bug；channel92 配送不可达仍属数据未铺好。 |

## 6. 验证脚本清单

- 后台券保存回归：建券→保存→回显（web-admin UI 手动回归）。
- **shop-api 抵扣核验（可复用，2026-09-19 已归档）**：`scripts/_verify_discount.mjs`。受控顾客下单套券，读 `order.discounts[].amountWithTax` + `totalWithTax`，断言折扣额==券面额、`totalWithTax == 含运费基准 - 折扣`。用法：`node scripts/_verify_discount.mjs [VARIANT_ID] [channelToken]`（默认 var74 / official-1）。其余一次性回归脚本（c 系列、已随 coupon.md 待办表归档）：`_c92_used_returned.mjs`（USED→RETURNED）、`_c2_memberlevel.mjs`、`_c3_scope.mjs`、`_c4_binding_claim.mjs`、`_c5_status.mjs`、`_c6_redeem_usd.mjs`、`_verify_discount.mjs`。
- **EXPIRED 落库验证（2026-09-19 新增）**：`scripts/_verify_grant_expired.mjs`（线上端到端，四段全通，见方案小节"线上验证"）；`scripts/_c_expired_persist.mjs`（TDD 契约，claim 路径，券越界后复跑）。
- 凭码兑换/领券状态：C 端领券中心 + 我的券（手机视口截图比对）。

## 7. 历史文档索引

- 使用手册：`docs/superpowers/manual/coupon/README.md`（本领域交付手册，含图片）
- 测试设计：`docs/superpowers/specs/2026-09-19-coupon-full-cycle-test-design.md`
- 早期领券修复：`docs/superpowers/manual/coupon-claim-fix/index.html`
- Web-admin 保管截图：`vshop/web-admin/dist/build/h5/static/manual/shots/d2_*.png`

## 速查卡（memory 指针）

> 优惠券先决：渠道建 `coupon_applied` 促销（coupon_discount action）才实际打折；P1 后台保存已修，P2 memberLevel 拦截（claim/grant/apply）已修，P3 领券中心过滤 claimable 已修，P5 多语言输入 nameZh/nameEn 已修，P4 净价口径为非 bug（前端用 amountWithTax 同域）；P6 已用「平台券 shopId=null」在默认商城**实测走通 USED→RETURNED 闭环**（USED/RETURNED 事件监听可用）；channel92 结算配送不可达为环境/数据未铺好，非券 bug。

## 8. 完善 Backlog（2026-09-19 评审）

> 全环节受控测试（c1-c7 + EXPIRED 落库）后盘点。A 类为**已源码核实**的真实缺口/体验问题；B 类为能力已存在但缺自动化回归；C 类为前端/产品向（现状未深挖，标注「需前端确认」）。按严重度排序，择项进入实现。

### A. 功能缺口（后端，已核实）
| # | 现象 | 代码点 | 严重度 | 处置方向 |
|---|---|---|---|---|
| A1 | **CATEGORY 作用域券不生效**：配置「分类券」后结算**不过滤分类**，全局可抵 | `coupon-promotion-condition.ts` L47-55（只按 bindings 过滤）、`applyCouponToOrder` L804-814（无 categoryId 消费）；`scope`/`categoryId` 除「建 binding 副作用置 SKU」外不被消费 | 🔴 高 | ✅ **已处置 2026-09-19（下线）**：产品形态仅「商品页指定商品券」（SKU 即唯一入口），CATEGORY 为遗留死壳（无 UI/结算/实体关系）。`coupon.service.ts` 新增 `assertScopeSupported`，create/update 传入 `scope='CATEGORY'` 一律抛错（`Scope CATEGORY is not supported...`）；web-admin `coupon/index.vue` 移除「指定分类」标签 |
| A3 | 部分退款/退货时券状态未定义：Vendure 订单无 `Refunded` 态，退款经 Refund 实体独立状态机到 `Settled`，原仅监听 `Cancelled` | `plugin.ts`（OrderStateTransitionEvent）/ `coupon.service.ts` `returnCoupon` | 🟠 中 | ✅ **已处置 2026-09-19**：新增 `returnCouponOnFullRefund` + 监听 `RefundStateTransitionEvent`（toState=`Settled`），累计该单已 Settled 退款额达应付总额即回退券；部分退不触发（幂等由 returnCoupon 保证）。注意 Refund→Payment→Order 中转关系 |
| A2 | 删除**已发券模板**时抛裸外键错误（`FK_... customer_coupon`），无可读文案；binding 保护已有 `Template has product bindings` | `coupon.service.ts` `deleteTemplate` L283-307 | 🟡 中低 | ✅ **已处置 2026-09-19**：`deleteTemplate` 增加已发放券计数（`cc.template = :id`），>0 抛 `Template has N issued coupon(s); revoke or delete the customer coupons first`；web-admin 删除弹窗文案如实提示「已发放券将被阻止并提示数量」 |

### B. 补自动化回归（能力已存在，缺脚本）
| # | 项 | 严重度 | 归因 |
|---|---|---|---|
| B3 | **限量/限领防超发 + `claimedCount` 口径**：`totalCount`/`perUserLimit` 并发超发；自助领+定向发(`grantCouponIssue`)+兑换(`exchangeCouponWithPoints`) 是否都正确计入 `claimedCount` 未验证 | 🟠 中（涉资金/领取承诺） | ✅ **已回归 2026-09-19**：`scripts/_c_b3_limits.mjs` 全通。perUserLimit 超限报 `Per-user coupon limit reached`（计 UNUSED/RETURNED 持有，USED 不计）；totalCount 靠 `atomicIncrementClaimed` 原子条件 UPDATE 防超发，耗尽报 `Coupon sold out` 且拦截不增量；`claimedCount` 只增不减=累计发行量，自助领/定向发均计入（claim1+grant1==2） |
| B1 | 凭码兑换 `redeemCouponByCode(claimCode)` 仅 manual 截图，无自动脚本 | 🟡 低中 | ✅ **已回归 2026-09-19**：`scripts/_c_b1_redeem.mjs` 全通。凭码兑换成功领 UNUSED 券；同用户同码二次兑换被 perUserLimit 拦截；不同用户同码可各领（claimCode 非一次性）；错误码报 `Invalid claim code`。命中后复用 `claimCoupon`（限领/限量/会员联动生效） |
| B2 | 积分兑换 `exchangeCouponWithPoints`（`pointsPrice` 扣减/失败回滚/券入账）无回归 | 🟡 低中 | ✅ **已回归 2026-09-19**：`scripts/_c_b2_points.mjs` 全通。admin `adjustPoints` 充值入口验证（返回 `MemberInfo{ growthValue points level }`，字段是 `level` 非 `tierLevel`）；昂贵券 `pointsPrice=5000` 兑换被拒报 `Insufficient points`（`@Transaction` 同回滚、不产券）；正常兑换 `pointsPrice=300` 成功 `{coupon{C-ARSF-WUM8, UNUSED}, spentPoints:300}` 且 `myCoupons` 可见；二次兑换报 `Per-user redemption limit reached`。**SPEND 流水校验（DB 直查 `member_points_history`，表列为 camelCase）**：adjust +1000（0→1000，remark `b2-test`）+ spend -300（1000→700，remark `积分兑换优惠券:b2e-3899`，`orderId=null`），余额链自洽与 C 端 `points` 一致；积分不足那次因回滚无残留 SPEND。`spendPoints` 由 member-level `applyPointsChange(customerId,-amt,SPEND)` 落账。**并发防超扣（`_c_b2_concurrent.mjs`）**：`applyPointsChange` 在 `withTransaction` 内经 `loadCustomerForUpdate` 加 `pessimistic_write` 行锁读余额、`balanceAfter<0` 抛 `Insufficient points` → 充值 1000、并发 6 个兑换（price=300, perUserLimit/totalCount=10 排除限兑/总量）→ 恰 3 成功/3 失败（失败全 Insufficient）、券袋 3 张 UNUSED、最终余额 100=1000-3×300；DB 每用户 1 adjust+3 spend。**结论：并发由悲观行锁串行，不超扣不超发**。**兑换计入 claimedCount（`_c_b2_claimed.mjs`）**：`atomicIncrementClaimed` 原子 `claimedCount+1 WHERE totalCount=0 OR claimedCount<totalCount`；建模板(totalCount=5) claimedCount 0→兑换→1（+1，未超 totalCount），兑换计入累计发行量并与限量防超发联动 |
| B4 | 券折扣与其它 `promotion` / 分箱 `checkoutSplitted` 运费的叠加顺序未细测 | 🟪 低 | ✅ **已回归 2026-09-19（单箱叠加）**：`scripts/_c_b4_stack.mjs` 全通（official-1、variant74、TPL19、FIXED_OTHER=500）。两段式基准规避「促销加购即生效」混淆：orig=21000（含运费）→ 建 `order_fixed_discount` 促销 `setOrderLineQuantity` 归一化触发 recalc 得 base2=20500=orig-500（促销独立生效，discounts=[500]）→ 套券得 final=20400=base2-100=orig-600，`discounts=[100(coupon_discount),500(order_fixed)]` 两条独立行、无相互覆盖、合计精确。顺序断言 `final==base2-券额` 确证**券在已含促销后叠加**。清理：`deletePromotion` 走 finally 防泄漏（`ok()` 抛错而非 exit）。**未覆盖**：分箱 `checkoutSplitted` 多箱时票券只作用于订单级、运费按箱分级结算的叠加顺序——留待有真实多箱含运费票券场景再补 |

> 注：B4 屡次泄漏的 `b4-stack-*` 促销(#6-#11)已用 `scripts/_c_b4_cleanup.mjs` 全清。

### C. 前端/产品（需前端确认现状）
| # | 项 | 严重度 | 备注 |
|---|---|---|---|
| C1 | 我的券按 status 分 tab（EXPIRED 落地后） | 🟡 低中 | 文档已在 EXPIRED 方案注明：若做分 tab 则无需前端再自行比较 expiredAt |
| C3 | 结算时不可用券的可读原因文案（门槛/scope 不符） | 🟢 低 | 现错误多为英文 I18nError message |
| C2 | 券临期提醒（快到期高亮/置顶，核销侧已有 `expiring_soon` 概念） | 🟢 低（产品向） | 需产品排期 |