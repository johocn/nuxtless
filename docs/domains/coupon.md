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
- **name/description 多语言**：实体 LocalizedText 但 admin input 降级 String，权衡是「先交付单语言，多语言输入留待后端增强」。

## 4. 常见坑

1. **套券不产生折扣行**：渠道未配置 `coupon_applied` 促销。→ 到目标渠道建对应促销。
2. **后台建券/编辑保存必败**（P1）：此前 `apis/coupon.ts` 用 `$input: JSON!` 且 name 传对象。→ 已改为类型化 input 全纯字符串。
3. **凭码券混入领券中心**（P3）：`couponCentre` 未过滤 `claimable=false`。→ 未修（后端待办）。
4. **会员限制未拦截**（P2）：claim/grant/apply 均无 `memberLevel` 校验。→ 未修（后端待办）。
5. **折扣净价/含税口径差 13%**（P4）：`discounts[].amount` 净价口径 vs `totalWithTax`。→ 抵扣正确，展示按 taxMode 换算。
6. **本渠道结算配送不可达**（P6）：无可用配送方法 → `setOrderShippingMethod` 不生成配送线 → 订单停留 AddingItems，无法推进 ArrangingPayment。→ 环境/渠道配置问题，API 层无法修。

## 5. 问题速查（Bug 知识库）

### 已修复
| 现象 | 根因 | 代码点 | 回归脚本 |
|---|---|---|---|
| 后台新建/编辑券保存永远失败 | `$input: JSON!` + name 传对象，后端 `String!` 拒对象 | `vshop/web-admin/src/apis/coupon.ts`（create/updateCouponTemplate）、`pages/coupon/edit/index.vue` `buildInput()` | 后台建券→保存→回显 |

### 待办（记录，未修复）
| 现象 | 根因 | 代码点 | 回归建议 |
|---|---|---|---|
| 会员券未按 memberLevel 拦截 | claim/grant/apply 均无校验 | `coupon-plugin/coupon.service.ts` `claimCoupon`/`grantCouponIssue`；`coupon-settlement.ts` apply | 设 memberLevel=GOLD，普通用户领应被拦截 |
| 凭码券混入领券中心 | `couponCentre` 未过滤 claimable=false | `coupon.service.ts` `couponCentre` | 设 claimable=false 券仍出现在领券中心 |
| discounts[].amount 净价口径差 13% | 促销折扣按净价计算 | `coupon-promotion-condition.ts` | 抵扣实数与含税合计核对展示换算 |

### 环境限制（非券 bug）
| 现象 | 根因 | 代码点 |
|---|---|---|
| channel92 结算配送不可达，订单无法推进 | 无可用配送方法 → 不生成配送线 | （结算链路，非券逻辑） |

## 6. 验证脚本清单

- 后台券保存回归：建券→保存→回显（web-admin UI 手动回归）。
- shop-api 抵扣核验：受控顾客下单套券，读 order `discounts[]` + `totalWithTax`（曾用 `_verify_*.mjs`、`_gql.json` 模式，脚本按需重建）。
- 凭码兑换/领券状态：C 端领券中心 + 我的券（手机视口截图比对）。

## 7. 历史文档索引

- 使用手册：`docs/superpowers/manual/coupon/README.md`（本领域交付手册，含图片）
- 测试设计：`docs/superpowers/specs/2026-09-19-coupon-full-cycle-test-design.md`
- 早期领券修复：`docs/superpowers/manual/coupon-claim-fix/index.html`
- Web-admin 保管截图：`vshop/web-admin/dist/build/h5/static/manual/shots/d2_*.png`

## 速查卡（memory 指针）

> 优惠券先决：渠道建 `coupon_applied` 促销（coupon_discount action）才实际打折；模板 name/description admin 仅纯字符串；P1 后端使用/保存已修复，P2 memberLevel 拦截、P3 领券中心过滤 claimable、P4 净价口径为后端待办；P6 本渠道结算配送不可达为环境限制。