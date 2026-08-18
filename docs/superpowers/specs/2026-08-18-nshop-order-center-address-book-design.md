# nshop · 阶段「订单中心 + 地址簿」— 设计文档

- **日期**：2026-08-18
- **项目**：`d:\zhao\nshop`（nuxtless fork，京东/淘宝风格 Vendure 电商前台）
- **范围**：「订单中心 + 地址簿」，含中国本地化配送/支付/核销的预留接口
- **状态**：已审阅（用户确认设计，准备进入实现计划）

## 1. 背景与目标

阶段 0（基建）与阶段 1（商城主入口）已落地，前端已具备：运营位首页、分类排序/筛选、结账全流程（地址→配送/自提→支付→下单）、原始「我的订单列表」、下单确认页。

但订单/地址仍偏「国外模板默认风」：
- 账户页只读 `activeCustomer.addresses[0]` 首地址，**无地址簿管理**（无增/删/改、无默认、无结算回填）。
- 「我的订单」只有一张 `UTable`，无状态筛选、无状态徽标、无取消/再次购买动作。
- 订单详情页实为「下单确认页」(`checkout/confirmation/[code].client.vue`)，残留支付回调/Stripe 逻辑，不适合作为通用详情。

本阶段目标：**补齐国内电商的订单/地址闭环**——地址簿管理 + 订单中心（详情/筛选/取消/再次购买），并把中国本地化的配送（快递/自提点/门店）、支付（货到付款/支付宝/微信/余额）、自提核销等**以「消费既有后端 + 预留接口」的方式纳入**，杜绝重复设计后端能力。

> 调研结论（`d:\zhao\vendure`，Vendure 3.6.4）：**后端已具备本文所需的绝大多数能力**，本阶段**纯前端**，后端**零新增**。详见 §7。

## 2. 关键决策

| 事项 | 决策 |
|---|---|
| 后端改动 | **零改动** —— 全部消费 Vendure 既有能力（地址原生 CRUD、订单状态机、cjk-plugin 自提/COD、logistics-plugin 的 deliveryType、delivery-plugin 核销、recharge-card 余额） |
| 订单详情实现 | **方案一 模块化**：新建通用详情页 `account/orders/[code].vue` + 新建 `layers/base/app/components/order/` 组件目录，列表/详情/确认页三处复用 |
| 取消订单 | 用原生 `transitionOrderToState('Cancelled')`（顾客端无 `cancelOrder`，那是 Admin API）；仅在 `AddingItems/ArrangingPayment` 态允许顾客取消 |
| 再次购买 | 遍历 `order.lines` 批量调 `addItemToOrder`，成功后跳购物车/结算 |
| 默认地址 | Vendure 无重排 API，`addresses` 数组首条即「默认」。本期默认 = `addresses[0]`（结算自动回填首条 + 账户页置首高亮）；真实重排列属后端扩展，非本期 |
| 本地化预留 | 不新建后端。前端以组件契约/类型/占位插槽预留：物流轨迹、自提核销/提货码、商品级卡密、安全频次校验 |
| 部署 | 纯前端铁律：本地 `nuxt build` → scp `.output/` → pm2 restart，服务器不构建 |

## 3. 架构

```
nshop/layers/base/
├── gql/queries/customer.gql        # 增补 createCustomerAddress / updateCustomerAddress / deleteCustomerAddress
├── app/composables/
│   ├── useAddressBook.ts           # 地址 CRUD + 结算回填 + 默认(首条)选中
│   └── useOrderActions.ts          # cancelOrder(transition→Cancelled) / reorder(addItemToOrder)
├── app/components/
│   ├── address/
│   │   ├── AddressList.vue         # 账户页地址卡片列表
│   │   ├── AddressFormModal.vue    # 新增/编辑表单（复用 addressForm validator）
│   │   └── AddressPicker.vue       # 结算页地址簿选择/回填
│   └── order/
│       ├── OrderStateBadge.vue     # 订单状态机→中文徽标
│       ├── OrderItems.vue          # 商品明细
│       ├── OrderTotals.vue         # 金额明细
│       ├── OrderAddress.vue        # 收货/账单地址
│       ├── OrderProgress.vue       # 订单进度条
│       ├── DeliveryInfo.vue        # 【本地化配送】快递/自提点/门店 + 预留接口
│       └── OrderActions.vue        # 取消/再次购买/复制链接
└── app/pages/account/
    ├── addresses.vue               # 新增：地址簿管理页
    ├── orders.vue                  # 增强：状态 Tab 筛选 + 操作列
    └── orders/[code].vue           # 新增：通用订单详情页
```

复用关系：`components/order/*` 供订单列表行内、通用订单详情页、下单确认页（改造成复用 `OrderItems/OrderTotals/OrderAddress/OrderProgress`）三处使用。`components/address/*` 供地址簿管理页与结算地址表单（替换为 `AddressPicker` 可选回填）使用。

### 3.1 数据流

1. **地址簿**：`addresses.vue` 拉 `GetCustomerAddresses`（已有）渲染 `AddressList`；新增/编辑弹 `AddressFormModal` 提交 `create/updateCustomerAddress`，删除调 `deleteCustomerAddress`，成功后刷新列表。结算页 `AddressPicker` 读取同一查询，选择某条 → 回填 `setOrderShippingAddress`。
2. **订单列表**：`orders.vue` 拉 `GetOrderHistory`（`activeCustomer.orders`），前端按原生订单状态分组为 Tab，行内调 `OrderActions`（取消/再次购买/复制链接），点行进详情。
3. **订单详情**：`orders/[code].vue` 拉 `GetOrderByCode`（已有），按 `deliveryType` 分流 `DeliveryInfo` 三态渲染；金额/商品/地址/进度由各 order 组件渲染。
4. **默认地址**：`useAddressBook` 约定 `defaultAddress = addresses[0]`，账户页对其高亮「默认」，结算默认选中。

### 3.2 错误处理

- 地址增/删/改失败：`useAddressBook` 捕获 → toast 报错 + 不刷新列表（原地保留用户输入）。
- 取消订单失败（含状态机限制）：toast 提示原因 + 状态保持。仅 `AddingItems/ArrangingPayment` 显示取消按钮，其余态提示「请联系客服」。
- 再次购买部分失败：成功行入购物车，失败行 toast 提示；全部成功跳购物车/结算。
- 列表/详情加载失败：空态文案 + 重试。
- 地址无结果 / 订单无结果：空态占位。

## 4. 复用后端能力（关键，避免重复设计）

| 能力 | 后端现状（`d:\zhao\vendure`） | 本阶段前端做法 |
|---|---|---|
| 地址 CRUD | Vendure 原生（`Shop API`） | 补 3 个 `@Customer` mutation，无后端改动 |
| 取消订单 | 原生状态机 `X→Cancelled`，`transitionOrderToState` 是 Shop API | 复用；强调只允许待支付态取消 |
| 再次购买 | 原生 `addItemToOrder` | 批量复用 |
| 配送方式 | cjk-plugin：`store-pickup`/`pickup-point`/`employee-pickup` + 快递 tiered | `eligibleShippingMethods` 展示，`DeliveryInfo` 分流 |
| 自提信息 | `deliveryType`/`pickupType`/`selectedPickupLocationId`/`pickupLat/Lng`/`pickupClaimed`（public）| 订单详情展示自提点/门店/核销状态 |
| 支付方式 | `alipay`/`wechatpay`/`cash-on-delivery`(COD)/`balance-pay` | `eligiblePaymentMethods` 展示 + code 翻译 |
| 核销（提货码） | 仅 admin `confirmPickupHandover`，**无顾客端核销 mutation** | **预留 UI/类型插槽**（本期仅展示「待核销/已核销(pickupClaimed)」），不造后端 |
| 卡密 | 仅 `recharge-card-plugin`（充值余额）+ coupon 兑换码，**无商品级卡密** | **预留「兑换码/卡密」展示插槽**，本期空态 |
| 安全校验 | 无下单频次校验；`harden-plugin` 未启用 | **预留**（组件契约/类型），不在本期实做 |

## 5. 本地化预留接口（本期占位，不实做）

1. **物流轨迹**：`DeliveryInfo` 组件内置 `expressCompany?/expressNo?/trackingUrl?` 类型字段与「物流轨迹」slot，后续接 `logistics-api-plugin`（快递100）。
2. **自提核销/提货码**：订单详情预留「核销/提货码」区域占位；本期依据 `pickupClaimed` 展示「待核销/已核销」。顾客端核销 mutation 为后端后续项。
3. **商品级卡密**：预留「兑换码/卡密」展示插槽（本期空态），供未来虚拟商品/已购可兑换内容。
4. **支付 code 翻译**：`alipay`→支付宝、`wechatpay`→微信支付、`cash-on-delivery`→货到付款、`balance-pay`→余额支付，未知 code 显原值。

## 6. 订单状态中文映射（前端层）

原生状态 → Tab/徽标文案（不对后端加自定义状态）：

| 原生状态 | 中文 | 归入 Tab |
|---|---|---|
| AddingItems / Draft | 待下单 | 待支付 |
| ArrangingPayment | 待支付 | 待支付 |
| PaymentAuthorized / PaymentSettled / ArrangingAdditionalPayment | 已支付/待发货 | 待发货 |
| PartiallyShipped / Shipped | 已发货/待收货 | 待收货 |
| PartiallyDelivered / Delivered | 已完成 | 已完成 |
| Cancelled | 已取消 | 已取消 |
| Modifying | 处理中 | 全部 |

## 7. 交付项

### 7.1 GQL
- `layers/base/gql/queries/customer.gql`：增补 `CreateCustomerAddress`、`UpdateCustomerAddress`、`DeleteCustomerAddress` mutation（复用 `CustomerDetail`/address fragment）。
- （可选）增补 `GetFacets`/订单相关如需，确认 `GetOrderHistory` 含 `state/customFields(deliveryType,pickupType,selectedPickupLocationId,pickupClaimed)`。

### 7.2 composables
- `useAddressBook.ts`：`list/saveDefaultAddress/createAddress/updateAddress/deleteAddress/getSavedAddresses`，`defaultAddress` 逻辑。
- `useOrderActions.ts`：`cancelOrder(code)`（`transitionOrderToState('Cancelled')`）、`reorder(code)`（批量 `addItemToOrder`）、`copyOrderLink(code)`。

### 7.3 地址簿
- `pages/account/addresses.vue` + `components/address/AddressList/AddressFormModal/AddressPicker`。
- 账户侧边菜单 `AccountMenu.vue` 增「收货地址」入口；`account/index.vue` 首地址卡片改为链接进地址簿。

### 7.4 订单中心
- `pages/account/orders.vue` 改造成状态 Tab + 操作列 + 金额/状态徽标。
- 新建 `pages/account/orders/[code].vue` 通用详情页；`components/order/*` 七组件。
- 确认页 `confirmation/[code].client.vue` 改造成复用 order 组件（保留支付回调逻辑）。

### 7.5 测试与验证（遵守部署铁律）
- 本地 `pnpm typecheck && pnpm dev`：地址 CRUD/回填、Tab 筛选、详情展示、取消（待支付态）、再次购买。
- 部署：本地 `nuxt build` → scp `.output/` → pm2 restart → 线上 curl 订单页 200；无 500。
- 回归：购物车/结算/确认页/登录不回归。

## 8. 非目标（本阶段不做）

- 商品级卡密/虚拟兑换码体系（预留插槽）
- 顾客端真实物流轨迹对接（预留 slot）
- 顾客端自提核销/提货码 mutation（后端新增，预留）
- 售后退换/发票/物流跟踪全流程
- 下单频次等安全加固（`harden-plugin` 等，预留）
- 地址重排列（默认地址真持久化）——前端用 `addresses[0]` 语义
- 已付款/已发货订单的顾客端取消（受 `checkAllItemsBeforeCancel` 约束，提示联系客服）

## 9. 里程碑

| 里程碑 | 内容 |
|---|---|
| M1 地址簿 | 3 个 mutation + useAddressBook + addresses 页 + AddressPicker 结算回填 |
| M2 订单列表 | Tab 筛选 + 状态徽标 + OrderActions（取消/再次购买/复制链接） |
| M3 订单详情 | `orders/[code].vue` + components/order/* 七组件 + DeliveryInfo 三态 + 预留接口 + 确认页改造复用 |
| M4 联调部署 | typecheck/dev → build/scp/pm2 → 线上验证 + 回归 |