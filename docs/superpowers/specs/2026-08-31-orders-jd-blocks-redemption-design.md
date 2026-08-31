# 订单模块京东手机帮风积木改造 + 全单核销码 — 设计文档

> 日期：2026-08-31
> 前端：`d:\zhao\nshop\layers\base`（Nuxt）　后端：`d:\zhao\vendure\packages\cjk-plugin`（多租户通用）
> 决策基线：需求澄清结论（见 §0）

## 0. 需求决策基线（brainstorming 已澄清）

| 决策 | 结论 |
|---|---|
| 改造范围 | 订单「列表 + 详情」都要，作为同一套体系改造 |
| 积木化深度 | **代码层积木式**：功能块 = 独立组件，块内建默认（文案/图片兜底链），固定京东手机帮风，**本阶段不引入后端版式配置/多版式** |
| 跨端策略 | **方案 A 全场景卡片式**：移动/桌面均卡片，桌面多列自适应 |
| 列表处理 | **全面替换**为卡片式，移除 UTable 表格与对应代码 |
| 核单码覆盖 | **所有订单**都生成一个核单码（下单即生成） |
| 核单码展示 | 详情页展示「核单码（解密）+ 核单二维码」；不暴露原始明文 |
| 加密方式 | **后端 AES-256-GCM 加密存储**，受保护解密下发 |
| 核销码格式 | **6 位字母+数字，统一大写展示**（输入容忍大小写），排除易混字符 |
| 管理端核销 | **本期完整闭合**：后端核销接口 + 管理端手动输入核销 + 已核销状态 + 幂等 |

## 1. 现状（改造前）

- 订单列表 `account/orders/index.vue`：桌面数据表格 `UTable` + 顶部 `UTabs`（`ORDER_TABS`），信号 `GetOrderHistory(take:10)`，操作走 `useOrderActions`。移动端体验差（横屏表格）。
- 订单详情 `account/orders/[code].vue`：`OrderProgress` + `OrderItems` + `OrderAddress` + `OrderDeliveryInfo` + `OrderTotals` + `OrderShippingBreakdown` + `OrderActions` 分段布局，非卡片化/非移动优先。
- 数据已有：`OrderBase` 含 `lines.productVariant.name`、`lines.featuredAsset.preview`、`lines.quantity`、`totalWithTax`、`totalQuantity`、`currencyCode`、`state`——列表卡片**无需新增字段**。
- 状态工具 `utils/order-state.ts`：`ORDER_TABS`（ALL/PAYMENT_PENDING/TO_SHIP/TO_RECEIVE/COMPLETED/CANCELLED）、`tabOfState`、`stateBadge`、`ORDER_PROGRESS_STEPS`、`progressIndex`——复用。
- 现有 pickup-plugin 为自提单生成明文提货码 `pickupCode`（`packages/pickup-plugin`）。**本阶段保留不动**；核销码作为独立加密链路新增（所有订单），自提单同时具备二者，语义互不冲突。

## 2. 架构总览

```
┌─ C 端前端 (Nuxt) ─────────────────────────────┐
│ 列表页 account/orders/index.vue               │
│   OrderCardList ─ OrderCard(Header/Items/Footer/Actions) + OrderTabBar
│ 详情页 account/orders/[code].vue              │
│   OrderStatusBanner + OrderStateProgress +     │
│   OrderRedemptionCard(核销码·二维码) +         │
│   OrderAddressCard + OrderItemsCard +          │
│   OrderPickupCard(自提单) + OrderTotalsCard +  │
│   OrderMetaCard + OrderActionsBar              │
└──────────────┬────────────────────────────────┘
       Shop API（guest/per-user 加密核销码下发）
┌──────────────▼────────────────────────────────┐
│ cjk-plugin                                   │
│  RedemptionCodeService.ensure/decrypt/redeem │
│  Shop: orderRedemptionCode (受保护解密下发)   │
│  Admin: redemptionLookup / redemptionClaim    │
│  aes-256-gcm 加密 + hmac 检索                  │
└───────────────────────────────────────────────┘
```

**职责边界**：前端只做积木式渲染与授权后调用；核销码生成/加密/解密/核销/权限全归后端 `cjk-plugin`。前端不接触明文存储、不解密（解密与二维码载荷由授权接口下发）。

## 3. 后端设计（cjk-plugin）

### 3.1 字段（Order 自定义字段扩展）
在 `Order` 自定义字段新增：

| 字段 | 类型 | 说明 |
|---|---|---|
| `redeemCodeCipher` | String | AES-256-GCM 密文（核销码）。DB 不得存明文 |
| `redeemCodeIv` | String | AES-GCM 初始化向量(nonce)，随密文存 |
| `redeemCodeHash` | String | `HMAC-SHA256(redeemCode, serverKey, 按租户 Channel 盐)`——用于核销时按输入码快速检索（密文无法索引/比对） |
| `redeemClaimed` | Boolean | 是否已核销（默认 false） |
| `redeemClaimedAt` | DateTime | 核销时间（可空） |

> 说明：密文字段用于“展示时解密”；指纹哈希专用于“输入码→定位订单”的核销检索，二者同源于同一明文 `redeemCode`，均不落明文。

### 3.2 核销码生成规则
- 编码：**6 位字母+数字**，统一大写；**排除易混字符** `O I 0 1`（避免输入歧义）。
  可选字符集：`A B C D E F G H J K L M N P Q R S T U V W X Y Z 2 3 4 5 6 7 8 9`（共 32 字符）→ 空间 `32^6 ≈ 10.7 亿`，配合内置校验位防误输。
- 格式：`XXXXXX`，不分组（短、便于手动输入）。
- 至少含一位校验信息：第 6 位为辅校验位（对前 5 位的简单的校验），提高“输入错但不校验”的容错。
- 生成：`RedemptionCodeService.ensure(orderId)` **幂等**（已存在则不重生成）。
- 触发时机（满足「下单即生成」）：
  1. 订阅 `OrderStateTransitionEvent`，当到达 `ArrangingPayment` 时调用 `ensure`；
  2. 详情页/管理端查询时惰性兜底（首次读取确保存在），与 pickup 生态的 `ensurePickupRedemptionForOrder` 模式一致。

### 3.3 加密与核销接口
- 工具：`redemption-crypto.ts`（纯函数，SSR/单测友好）：
  - `generateRedemptionCode()` → 6 位大写码（含校验位）
  - `encrypt(code, key)` → `{ cipher, iv }`（AES-256-GCM）
  - `decrypt(cipher, iv, key)` → code
  - `fingerprint(code, channelSalt, key)` → HMAC（核销检索用）
- 密钥：来自服务端环境配置（如 `REDEMPTION_KEY` / `environmentalVariable`），不落 DB、不写死。

- **Shop API**（受保护解密下发）：
  ```
  query orderRedemptionCode($input: OrderRedemptionCodeInput!) {
    orderRedemptionCode(input:{ orderCode, phone? }) {
      redemptionCode      # 解密后的 6 位核销码（仅授权请求返回）
      qrPayload           # 签名载荷 {orderCode, redemptionCode, ts, claimNonce}
      claimed           # 是否已核销
    }
  }
  ```
  访问控制：登录用户本人订单（`orderByCodeAccessStrategy.canAccessOrder`）；游客凭「手机号+订单号」校验后亦可。`qrPayload` 用服务端签名（HMAC+ts+nonce），防止被篡改；下发仅对授权者、经 HTTPS，前端仅内存暂存。

- **Admin API（租户管理员手动核销）**：
  ```
  query redemptionLookup($code: String!) {
    redemptionLookup(code) {
      order { id code state totalWithTax currencyCode totalQuantity lines{...} }
      claimed claimedAt
    }
  }
  mutation redemptionClaim($input: RedemptionClaimInput!) {
    redemptionClaim(input:{ code }) {
      order { id code }
      claimed
    }
  }
  ```
  - `redemptionLookup`：输入 6 位码 → 服务端算 `fingerprint` → **仅限当前租户 Channel** 检索订单 → 返回订单摘要（订单号/金额/商品/客户首名）供确认。
  - `redemptionClaim`：二次确认后标记 `redeemClaimed=true` + `redeemClaimedAt`。**幂等**：已核销则禁止重复核销（返回已核销结果或失败）。
  - 权限：`Permission.UpdateOrder` + 限定当前租户管理员；限流防暴力枚举（每租户每 IPv/账号短窗口阈值）。

## 4. 前端设计（Nuxt）

### 4.1 列表页（全面卡片式）
新增组件与结构：
- `OrderTabBar`：顶部状态 Tab，复用 `ORDER_TABS` + `tabOfState`，横向可滚动（移动端）。
- `OrderCardList`：容器；持有 `skip/take` 状态，`GetOrderHistory` 分页取数；底部「加载更多」按钮（`totalItems` 未尽时显示）。
- `OrderCard`（卡片容器，`grid-cols-1 md:grid-cols-2`，整卡可点跳详情）：
  - `OrderCardHeader`：店铺/站内标识（自营/配送标识）+ 状态徽标（复用 `stateBadge`）。
  - `OrderCardItems`：商品缩略行（复用 `featuredAsset.preview`/`name`）、`×N` + 单价；`lines` 超多折叠。
  - `OrderCardFooter`：「共 N 件 实付 ¥X」(复用 `formatMoney`)。
  - `OrderCardActions`：按 `tabOfState`/`canCancel` 渲染操作（去支付/再次购买/查看详情/取消），复用 `useOrderActions`（`cancelOrder`/`reorder`）。
- 移除：`UTable`、`columns`、`getRowItems`、`OrderTableRow` 类型。
- 空态：无订单 → 空态插画 +「去逛逛」按钮。

新增 GQL：`GetOrderHistory` 已够（`OrderBase`+`orderPlacedAt`），沿用 `OrderListOptions(skip,take)`。

### 4.2 详情页（竖排信息卡）
新增组件：
- `OrderStatusBanner`：渐变底 + 订单状态 + 副文案（新建）。
- `OrderStateProgress`：复用 `OrderProgress`/`progressIndex`。
- `OrderItemsCard`：复用 `OrderItems`；移动端竖排；保留售后入口 `canApplyAfterSales`。
- `OrderAddressCard`：复用 `OrderAddress`（收货人/电话/地址，自提显示自提联系人）。
- `OrderPickupCard`：`deliveryType=pickup` 时显示自提点/||现有提货码 pickupCode||/核销状态（联动已上线 pickup 能力）。
- `OrderTotalsCard`：复用 `OrderTotals` + `OrderShippingBreakdown` + `discounts`。
- `OrderMetaCard`：订单号/下单时间/支付方式/配送方式（新建）。
- `OrderActionsBar`：复用 `OrderActions` + 售后 Modal。

### 4.3 OrderRedemptionCard（核销码卡）
- 位置：详情页信息流中位于进度条之后、地址卡之前。
- 数据：新增 GQL `OrderRedemptionCode.gql` 调用 `orderRedemptionCode`；组件内 `onMounted` 拉取。
- 展示：**解密后的核销码（6 位大写）+ 二维码**（二维码用 `qrPayload` 渲染，前端生成 QR 图），附文案“到店出示本码 / 扫码由门店核销”。
- 隐藏语义：明文仅内存展示，不写 localStore/明文缓存。
- 状态：`claimed=true` 时显示「已核销」置灰/徽标，不再高亮。
- 新增 GQL：`queries/OrderRedemptionCode.gql`；类型经 `npx nuxt prepare` 生成（必要时手动补 `graphql.schema.json`）。

## 5. 管理端核销 UI（租户管理员）
- 管理端新增「订单核销」入口（Admin 端页面/区块）：
  - 输入框：6 位核销码（容忍小写，展示统一转大写）。
  - `redemptionLookup` → 展示订单摘要（订单号/金额/商品/客户）供管理员核对。
  - 「确认核销」→ `redemptionClaim` → 成功提示 + `claimed` 状态刷新。
  - 已核销码：提示“该码已核销（时间）”，不可重复核销。
- 权限：租户管理员（`UpdateOrder`），限当前 Channel。

## 6. 数据流 / 错误处理

- **数据流**：
  - 列表：`GetOrderHistory(skip/take)` → `OrderCardList` 分页 → `OrderCard`。
  - 详情：`GetOrderByCode(OrderDetail)` → 各块按 `state`/`deliveryType`/`canApplyAfterSales`/`canCancel`/`claimed` 条件显隐。
  - 核销码：`orderRedemptionCode`（受保护）→ 仅授权者拿到解密码/二维码。
  - 核销：Admin 输入码 → `redemptionLookup` → `redemptionClaim`（幂等）。
- **错误处理**：
  - 列表取数失败：沿用现有 `useAsyncGql` error → toast 提示 + 重试。
  - 详情无订单：现有 `UError` 404 分支保留。
  - 核销码拉取失败/无权限：卡片显示加载/部分隐藏，不整页失败。
  - 核销：码不存在 / 非本租户 / 已核销 → 明确中文提示。
- **安全**：核销接口租户隔离；密文/指纹均不落明文；核销码解密仅授权者；管理端限流。

## 7. 测试与交付

- **后端单测/e2e**（`cjk-plugin`）：生成规则（6 位、排除字符、含校验位、幂等）；加密-解密往返；指纹检索；`redemptionClaim` 成功/重复/越权/非本租户；`orderRedemptionCode` 越权拒绝。
- **前端**：本地 `npx nuxt build` 通过；`AccountOrders*` 相关 GQL 类型生成。
- **手机视口截图**（390×844, dpr=2）：列表页卡片（含多状态+空态）、详情页（含核销码卡+二维码、自提单含提货码）、管理端核销页；截图入操作手册 `d:\zhao\vendure\doc\多租户使用手册.md`。
- **交付**：实现 + API/e2e 回归 + 手机截图 + 操作手册。

## 8. 范围外（本阶段不做）

- 后端版式配置/多版式可回退（客户后续如需再做）。
- 门店扫码核销的完整坐席界面（本期只做输入码核销闭环；扫码解析可复用 `qrPayload` 后续接）。
- pickup-plugin 明文提货码结构的迁移（保留不动，与核销码并存）。
- 核销记录分页列表（本期只做单单核销；如需记录台账可后续扩展）。

## 9. 关联文件

- 后端（cjk-plugin）：`redemption-crypto.ts`(新)、`redemption-code.service.ts`(新)、`redemption.resolver.ts`(新)、plugin schema(改)、`plugin.ts`(改)、Order 自定义字段配置(改)
- 前端：`account/orders/index.vue`(重写)、`account/orders/[code].vue`(重写)、`components/order/OrderCard*.vue`(新)、`OrderRedemptionCard.vue`(新)、`OrderStatusBanner.vue`(新)、`OrderMetaCard.vue`(新)、`OrderPickupCard.vue`(新)、`components/redemption/RedemptionAdmin*.vue`(新，管理端)、`gql/queries/OrderRedemptionCode.gql`(新)、`i18n/zh-CN.ts`+`en-US.ts`(补词条)