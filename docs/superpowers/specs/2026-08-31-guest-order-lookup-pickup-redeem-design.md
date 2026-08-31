# 游客订单查询与自提核销可见性 — 设计文档

> 日期：2026-08-31
> 范围：vendure 后端（packages/cjk-plugin、packages/pickup-plugin、packages/core 必要时）+ nshop 前端

## 目标

让**游客（未登录）**购买后能可靠地查看订单：

1. 方案A：新增 **手机号 + 订单号** 查询入口，可长期查询订单（脱敏概览）。
2. 方案D：补全**自提提货码**可见性——自提订单游客能拿到提货码并到店核销。
3. 无手机号的自提游客订单：下单完成后提示保留订单号/提货码；可在完成页**补录手机号**，之后凭「手机号+订单号」长期查询。

## 现状与缺口

- 游客可结算（`DefaultGuestCheckoutStrategy`）；游客凭 `/order/:code`（`GetOrderByCode`）在 `DefaultOrderByCodeAccessStrategy('2h')` 窗口内查订单。
- 自提核销**后端已基本存在**：`pickup-plugin` 的 `PickupRedemption`（6 位提货码 `code`、`status: generated/redeemed/void`、`claimedAt/claimedBy/claimChannel`）+ 店员核销 `claimPickupByShop`（含店归属强校验）+ web-admin `pages/pickup/redeem` 核销页已集成。
- **缺口**：
  - 提货码为**懒生成**且 `resolveMyPickupCode` 强校验「订单归属当前登录用户」→ 游客自提单**拿不到提货码**。
  - nshop 确认页 `DeliveryInfo.vue` 把 `pickupCode` 硬编码为 `null`。
  - 无「手机号+订单号」查询入口；无手机号的自提游客无法补录、无法长期查询。

## 设计

### 后端（vendure）

1. **自动生成提货码**
   - `pickup-plugin` 订阅 `OrderPlacedEvent`，对 `deliveryType === 'pickup'` 的订单调用既有 `getOrCreateRedemption(ctx, order)`（幂等一生一码），自动落 6 位提货码。
   - 复用现有 `claimPickupByShop` 与 web-admin 核销页，不改动核销后端。

2. **游客单脱敏查询 shop query** `guestOrderLookup`
   - 入参：`input: GuestOrderLookupInput { orderCode: String!, phone: String }`
   - 出参：`GuestOrderOverview`（新建 GraphQL 类型），字段：
     `orderCode, orderPlacedAt, state, currencyCode, totalQuantity, subTotal, shippingWithTax, totalWithTax, isPickup, pickupClaimed, pickupCode, pickupClaimable, pickupLocation { name address businessHours }, lines { productName sku quantity linePriceWithTax }`
   - **脱敏**：不含收货/账单地址、支付方式、顾客邮箱/姓名、优惠明细等敏感字段。
   - 鉴权规则：
     - 带 `phone`：校验 `order.customFields.contactPhone === phone`，则**不受 2h 窗口限制**（手机号+订单号即长期查询凭据）。
     - 不带 `phone`：按 `orderByCodeAccessStrategy.canAccessOrder` 逻辑（即 window 内/属主）放行，供确认页即时取提货码。
     - 仅返回**游客单**（`order.customer.user == null`）；登录用户走「我的订单」。
   - `isPickup` 由 `customFields.deliveryType === 'pickup'` 判定；`pickupCode` 取该单 `PickupRedemption.code`（未生成则返回 null，但步骤1自动生成后一般已有）；`pickupClaimable = isPickup && !pickupClaimed && 对应 fulfillment == Shipped`。

3. **补录手机号 shop mutation** `guestSetOrderCustomFields`
   - 入参：`input: GuestSetOrderCustomFieldsInput { orderCode: String!, phone: String!, name: String }`
   - 鉴权：以 code 通过 `orderByCodeAccessStrategy.canAccessOrder`（窗口内）为前提，且为游客单。
   - 动作：`orderService.updateCustomFields(orderId, { contactPhone: phone, contactName: name })`，返回 `GuestOrderOverview`。
   - 效果：补录后游客即可用「手机号+订单号」长期查询。

4. **配置项（可选，默认建议放宽）**
   - 将游客 `orderByCodeAccessStrategy` 窗口由 `2h` 放宽为**可配置（建议 7 天）**，使「保留订单链接」路径更友好。
   - 若担心暴露面，可保持 `2h`；此仅影响确认页/补录的可用时长，不影响「手机号+订单号」长期查询。
   - 实现：在 `dev-config.ts`（及测试配置）显式设置 `orderOptions.orderByCodeAccessStrategy`。

### 前端（nshop）

1. **新页面「订单查询」** `/order/lookup`
   - 页脚 / 用户区提供入口（「查询订单」）。
   - 表单：**订单号** + **手机号** → 调 `guestOrderLookup(phone)` → 展示脱敏概览（含提货码、核销状态、可取货提示）。
   - 错误态：订单号/手机号不匹配时友好提示（i18n）。

2. **确认页 `checkout/confirmation/[code].client.vue` 增强**
   - 自提单：调 `guestOrderLookup(orderCode)`（不带 phone）拉提货码，醒目展示**提货码** + 「到店出示 / 请保留订单号与提货码」提示。
   - 若该单**未留手机号**（`customFields.contactPhone` 为空）且为自提：展示**补录手机号**卡片（手机号 + 姓名选填）→ 调 `guestSetOrderCustomFields`，成功后提示「补录后可凭 手机号 + 订单号 随时查询」。
   - `DeliveryInfo.vue`：`pickupCode` 由硬编码 `null` 改为由父级/查询传入。

3. **i18n**：`zh-CN`/`en-US` 同步新增词条（查询页、提货码、补录手机号、保留订单提示、错误提示等）。

## 安全边界

- 查询凭据 = 手机号 + 订单号（无短信，按用户决策）。订单码唯一且较长。
- 仅返回脱敏字段；收货/账单地址、支付、邮箱不对外。
- 补录/写入须在窗口内以 code 作证，避免任意会话无限改写订单。
- 仅游客单可走此通道；登录用户走账号体系。

## 测试 / 交付（硬规范）

- 后端：`guestOrderLookup`（phone 匹配/不匹配、无 phone 仅窗口、生成提货码、补录后查询），`guestSetOrderCustomFields`（窗口、游客单、code 不匹配）。
- 前端：手机视口 390×844（dpr=2 → 780×1688）截图三张：
  1. 确认页：自提订单显示提货码 + 未留手机号时显示补录卡。
  2. 订单查询页：游客「手机号+订单号」查询成功，展示脱敏概览。
  3. 补录手机号后再次查询成功。
- 截图补充进操作手册。

## 范围

- 单一实施计划：vendure（pickup 自动生成 + `guestOrderLookup`/`guestSetOrderCustomFields` + schema + 配置窗口）+ nshop（查询页 + 确认页 + i18n + gql 类型重新生成）。
- 复用已有 `claimPickupByShop` 与 web-admin 核销页，不重造核销后端。
- 登录用户订单查看不在此范围（沿用「我的订单」）。