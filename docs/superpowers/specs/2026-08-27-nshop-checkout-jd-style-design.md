# nshop /checkout 京东风格改造 — Design

> 生成：2026-08-27　范围：**仅前端**　基线：nshop (Nuxt4 SSR, layers/base)

## 背景与目标

重构 `https://www.youshop.cn/checkout`（结账页）为京东风格交互，采用项目既有的「积木式 UI + 可回退」体系（与商品详情页构建器同款），**原有版式保留为可切换备选**。本次聚焦前端体验联动，不做后端配送档案/自动拆单引擎（另立项）。

## 范围界定

- **本方案仅改前端**（nshop `layers/base`），不新增/修改 vendure 后端字段。
- 配送方式列表沿用后端已实现的「商品级配送档案交集」逻辑（`getShippingMethods()`），前端不重复拆单/档案计算。
- 自动拆单后端引擎不在此次范围。
- 上线遵循部署铁律：本地构建、提交产物、服务器 git pull + pm2 restart。

## 架构

### 可回退的积木式 checkout 构建器

- 新增 `CheckoutRenderer` 组件，按 `checkoutConfig.layout` 动态组装版式组件。
- `checkoutConfig` 为**纯前端常量**，本次默认 `jd`（京东新版）；保留 `legacy` 版式可切换回退。
  - 不新增后端 customField；未来如需渠道级下发再接后端。
- 功能块组件（每个单一职责、可独立测试）：
  - 配送方式块 `CheckoutShippingBlock`（物流方式 + 自提类型）
  - 收货地址块 `CheckoutAddressBlock`
  - 自提点块 `CheckoutPickupBlock`（门店 / 职工单位 / 自提点）
  - 支付块 `CheckoutPaymentBlock`
  - 订单摘要块 `CheckoutOrderSummary`
- 现有个同源组件（`ShippingForm / AddressForm / PickupLocationSelect / PaymentForm`）归入 `legacy` 版式引用，不内置重复逻辑。
- 遵循 C 端模板强制规范：
  - **多语言**：固定文案走 i18n `messages.checkout.*`（中英两包同步）。
  - **多城市**：配送/自提可用性判断基于当前城市（`useCityService`），不硬编码。

## 交互

### 配送方式区（上移，置于地址之上）

- 单层选择器，由两部分构成：
  1. 物流配送方式：后端 `shippingMethod.name / code` 原始名（如邮政/同城等，不自创名）。
  2. 自提类型：门店自提 / 职工单位自提 / 自提点自提。
- 默认 / 唯一方式时直接预选第一项。
- **联动**：选中物流配送 → 展示收货地址块；选中任一自提类型 → 展示对应自提点列表、隐藏收货地址块（收货地址转为非必输，自提地址取自所选自提点）。

### 地址区（国内京东风格）

- 顶部 "配送至：收货人 电话 省市区 街道"，默认加载**默认地址**（地址簿 `isDefault` 优先 → 否则第一条；未登录用表单）。
- 提供 "新增地址 / 切换地址" 入口，支持新增与更改（复用 `useAddressBook` + `AddressForm`）。
- 自提时该块隐藏 / 折叠。

### 自提区（门店 / 职工单位 / 自提点）

- 配送方式选中某自提类型后展示对应类型自提点列表（复用 `GqlGetPickupLocations(type, lat, lng)`）。
- **最近预选**：定位有效（`useLocationStore.coords`）时按 Haversine 预选最近点；无定位时用列表首个可用项预选 + 提示开启定位按最近排序，不阻断下单。
- 三种类型各自独立成区，互不混排；选中后把 `deliveryType` 写回对应自提类型值。

### 配送↔自提联动（单一事实源）

- 用前端状态 `deliveryMode: 'shipping' | 'store' | 'employee' | 'point'` 驱动全页联动：
  - `shipping` → 展示地址块 + 配送方式块（物流方式单选；直接默认/唯一直接选）
  - `store/employee/point` → 展开对应自提点列表、隐藏地址块、`deliveryType` 置为该自提类型
- 写回后端：物流用 `setShippingMethod`；自提用 `setOrderPickupLocation(id, type)`，地址由自提点地址自动填。

### 支付区与订单摘要

- 支付方式**默认选中第一个可用**（后端已按支付档案 Profile 过滤）。
- 订单摘要保留现有 `CheckoutOrderSummary`，样式对齐京东；有默认收货信息时可折叠显示。

### 错误处理与提交

- 按 地址 → (配送|自提) → 支付 顺序提交，沿用现有「门闩式」`isSubmitted` 状态。
- 自提时跳过地址 / 配送校验；无可用物流方式时友好提示（沿用现有 Alert 文案）。
- 保留现有 `useCheckout.syncOrderLocation()` 逻辑，避免定位 / `deliveryType` 被覆盖。

## 组件 / 文件规划

- Create: `app/components/checkout/CheckoutRenderer.vue`、`CheckoutShippingBlock.vue`、`CheckoutAddressBlock.vue`、`CheckoutPickupBlock.vue`、`CheckoutPaymentBlock.vue`（复用现有 `CheckoutOrderSummary`）
- Modify: `app/pages/checkout/index.vue`、`i18n/locales/zh-CN.ts`、`i18n/locales/en-US.ts`
- 保留为 `legacy`：`app/components/checkout/ShippingForm.vue`、`AddressForm.vue`、`PickupLocationSelect.vue`、`PaymentForm.vue`
- 复用：`composables/useCheckout.ts`、`useIsPickup.ts`、`useLocationStore.ts`、`useCityService.ts`、`useAddressBook`、`stores/useOrderStore.ts`；`./<legacy>` 关联 `OrderSummary`

## 测试

- 本地 `pnpm dev` + 浏览器自动化（agent-browser）验证：
  - 三种版式渲染、物流/自提联动、自提最近预选（有/无定位）、地址默认加载与新增/更改、支付默认选中、步进提交与错误提示。
  - 回归 `legacy` 版式仍可切换。
- 提交前本地构建、`pnpm typecheck`、产物入 git。