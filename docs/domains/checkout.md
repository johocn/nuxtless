# Checkout 结算页领域手册（Checkout / 结算页）

> 入口指针：`project_memory.md`「结算页模块归属规则」速查卡 → 本手册。
> 覆盖：C 端 nshop `layers/base/app`（结算页前端）。
> 与配送档案手册（`docs/domains/shipping-profile.md`）互为引用：档案/自提点/可见性规则看配送档案手册，结算页领域看本手册，交叉处互相引用不重复展开。

## 1. 概念模型

| 实体 | 说明 |
|---|---|
| CheckoutRenderer 渲染器 | 按 `checkoutConfig.layout`（`cn` / `jd` / `jd-legacy` / 回退 `legacy`）动态组装版式 |
| 版式 Layout | `CheckoutLayoutCn` / `CheckoutLayoutJd` / `CheckoutLayoutJdLegacy`，与功能块解耦，4 种版式共用同一批功能块 |
| 功能块组件 | `components/checkout/*` 20 个，积木式拼装结算页 |
| 分箱模型 orderBoxes | 每箱返回 `profileId`/`profileName`/`type`(`pickup`|`delivery`)/`pickupLocations`/`availableShippingMethods`；物流箱 ↔ 配送方式+地址块，自提箱 ↔ 自提点+联系人一体模块 |
| 每箱选择 | `usePerBoxSelection` 以订单结构指纹（profileId 序列）为 key 重建，换单不串 |
| 自提选择 | `usePickupSelection` 集中管理 + 可 `resetSelection()`；切换用户/刷新时重置 |
| 自提点就近默认 | `usePickupDefaults.nearbyPickups`：按定位 **50km 内就近**（Haversine）排序取默认 |
| 高德导航 | `usePickupNavigation`：`uri.amap.com/navigation` URI 唤起高德 App，Web 回退网页导航 |
| 返回按钮 | `AppBackButton`：有浏览历史 `router.back()`，无历史回退 `:to`（默认首页） |

**模块归属规则（重要）**：自提箱的自提点选择 + 联系人是一体模块（`BoxPickupBlock` + `CheckoutPickupContactBlock`/`CheckoutCnContactCard`），联系人姓名/电话随自提点切换联动；物流箱则配送方式 + 地址块。切换自提点数量 >1 时必须显示切换入口。

## 2. 文件地图（符号级，行号用 rg 现查）

### 页面入口
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `pages/checkout/index.vue` | 结算页入口 | 页首 `<AppBackButton>`；`watch(isAuthenticated)` → `resetSelection()` + 重拉分箱/地址簿 + 就近重算（按当前登录用户刷新） |

### 渲染器与版式（4）
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `components/checkout/CheckoutRenderer.vue` | 按 layout 动态组装功能块 | `props.layout` |
| `components/checkout/CheckoutLayoutCn.vue` | 京东/CN 风格版式 | — |
| `components/checkout/CheckoutLayoutJd.vue` | JD 风格版式 | — |
| `components/checkout/CheckoutLayoutJdLegacy.vue` | JD 旧版式（回退） | — |

### 功能块组件（20）
| 文件 | 职责 | 关键点 |
|---|---|---|
| `components/checkout/BoxPickupBlock.vue` | **自提箱核心块**：自提点列表 + 切换 | 自提点名称点击 / 地图图标按钮触发导航弹层；`pickupLocations.length > 1` 时必显切换入口；选择状态经 `usePickupSelection` 持久化 |
| `components/checkout/CheckoutPickupContactBlock.vue` | 自提联系人（姓名/电话）采集 | 随自提点切换联动；空时不显示示例（已删硬编码示例） |
| `components/checkout/CheckoutCnContactCard.vue` | CN 联系人卡片 | 同上；无示例数据兜底，空时仅手填 |
| `components/checkout/PickupBlock.vue` | 通用自提块 | 自提方式选择入口 |
| `components/checkout/PickupLocationSelect.vue` | 自提点选择器 | 就近排序列表渲染 |
| `components/checkout/BoxDeliveryBlock.vue` | 物流箱配送方式块 | `props.box`，方式选择 |
| `components/checkout/DeliveryModeBlock.vue` | 配送方式选择（通用） | 按档案 modes 渲染 |
| `components/checkout/AddressBlock.vue` | 地址展示块 | `props.box` |
| `components/checkout/AddressForm.vue` | 地址表单 | 新增/编辑 |
| `components/checkout/ShippingForm.vue` | 配送地址表单 | — |
| `components/checkout/BoxLines.vue` | 箱内商品行 | `props.boxes` |
| `components/checkout/BoxCouponSelect.vue` | 优惠券选择块 | `props.boxes` |
| `components/checkout/PerBoxSummary.vue` | 每箱小计 | — |
| `components/checkout/OrderSummary.vue` | 订单汇总 | — |
| `components/checkout/CheckoutPerBoxList.vue` | 分箱列表容器 | 各箱按类型路由到物流/自提块 |
| `components/checkout/CheckoutCnAgreement.vue` | 协议勾选 | `defineModel<boolean>` |
| `components/checkout/CheckoutCnPromoDrawer.vue` | CN 促销抽屉 | `defineModel<boolean>` |
| `components/checkout/CheckoutCnSummaryBar.vue` | CN 底部合计栏 | — |
| `components/checkout/PaymentBlock.vue` | 支付方式块 | — |
| `components/checkout/PaymentForm.vue` | 支付表单 | — |

### 通用组件（2，`components/` 根下）
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `components/AppBackButton.vue` | 全局「返回上级」按钮 | `props: { to?, label? }`；`window.history.length > 1 ? router.back() : router.push(localePath(props.to))`；文案 `messages.general.back` |
| `components/AppPickupNavigationModal.vue` | 高德导航弹层 | `defineModel<boolean>("open")`（**必须显式声明 name**）；`props: { pickup }`；内容放 `<template #body>`；`usePickupNavigation.loadAmapSdk()` 动态加载；rAF 轮询容器就绪再 `new AMap.Map`；`AMap.Driving` 画路线；Marker 必须传 `map` 参数 |

### composables（5）
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `composables/usePerBoxSelection.ts` | 每箱选择状态（按订单指纹重建） | `export type BoxSelection`、`export function usePerBoxSelection()` → `resetPerBox` 等 |
| `composables/usePickupSelection.ts` | 自提点选择集中管理 | `export function usePickupSelection()` → `resetSelection()` |
| `composables/usePickupDefaults.ts` | 50km 就近默认 | `export function usePickupDefaults()` → `nearbyPickups` |
| `composables/usePickupNavigation.ts` | 高德导航（SDK 加载/URI/容错） | `export function usePickupNavigation()` → `loadAmapSdk()`、`openAmapNavigation` 等；AMap key 服务端下发不硬编码 |
| `composables/useGeoLocation.ts` | 定位 + AMap SDK 动态加载 | `export function useGeoLocation()` |

### utils / stores / i18n
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `utils/checkout-config.ts` | 结算页配置 + 纯函数工具 | `CheckoutLayout` 类型、`checkLayout()`、`CheckoutDeliveryMode`（`shipping`/`store`/`employee`/`point`）、`DELIVERY_MODE_TO_PICKUP_TYPE`/`PICKUP_TYPE_TO_DELIVERY_MODE`、`isShippingMode()`/`isPickupMode()`、`parseCoordinates()`、`haversineKm()`、**`PICKUP_RADIUS_KM = 50`**、`nearbyPickups<T>()` |
| `composables/useOrderStore.ts` | 订单状态（含自提点选择） | Pinia + persistedstate |
| `composables/useLocationStore.ts` | 定位状态 | Pinia + persistedstate，切换定位后同步自提点就近重算 |
| `i18n/locales/zh-CN.ts` / `en-US.ts` | 文案 | `messages.general.back`、`messages.checkout.navigation`（**两语言同步**） |

## 3. 设计决策（ADR 式）

| 决策 | 理由 |
|---|---|
| 分箱渲染器架构：布局与功能块解耦 | 4 种版式共用同一批功能块，新增版式只加 Layout 不重写功能块 |
| 按当前登录用户刷新：`watch(isAuthenticated)` → `resetSelection()` + 重拉分箱/地址簿 + 就近重算 | 切换用户后沿用旧选择是历史 Bug 根因；用户会话变化是重置信号 |
| 50km 就近（Haversine）而非城市字段过滤 | 自提点无城市字段，只能按距离；50km 为经验半径 |
| 导航用 `https://uri.amap.com/navigation?to={lng},{lat},{name}&mode=car` | 唤起高德 App 最优路径；Web 端自动回退网页导航；key 服务端下发避免硬编码泄露 |
| 选择状态集中到可 `$reset` 的 composable | 避免模块单例状态泄漏；`usePerBoxSelection` 按订单结构指纹重建防串单 |
| 返回按钮组件化（`AppBackButton`） | 结算页等页面复用，统一「有历史 back / 无历史回退首页」行为 |

## 4. 常见坑

| 现象 | 根因 | 解法 |
|---|---|---|
| `UModal` 只显示标题栏 | 内容放默认插槽未放 `<template #body>` | 内容必须放 `#body` 插槽 |
| 地图永不初始化 | `defineModel` 未声明 name，`watch(open)` 恒 false | `defineModel<boolean>("open")` 显式声明 name |
| 弹层内模板 ref 拿不到 | `useTemplateRef` 绑定不到插槽内元素 | 用唯一 `data-` 属性 + rAF 轮询容器就绪（有元素且高度>0）再初始化 |
| 门店标记不显示 | `new AMap.Marker({...})` 未传 `map` | Marker 必须传 `map` 参数才挂载 |
| Playwright 点「导航」选中了 radio | `get_by_text(exact=True)` 命中切换器内层名字 span | 触发导航点概览区名称或 `get_by_role("button", name="导航")` |
| 本地 dev 商品详情页 500 | `defineOgImage` client-only（nuxt-og-image，仅本地路径） | 加购绕过用同源 fetch `/shop-api` |
| 返回按钮失效 | 默认回退地址 `/cart` 无浏览历史时无效 | 默认 `:to="/"` |
| 切换用户后沿用旧自提点 | 选择状态未重置 | `watch(isAuthenticated)` → `resetSelection()` + 重拉 |

## 5. 问题速查（Bug 知识库）

| 现象 | 根因 | 代码点 | 回归 |
|---|---|---|---|
| 导航弹层仅剩标题栏 | 内容放默认插槽未放 `#body` | `AppPickupNavigationModal.vue` | 手机截图 s2（`tmp/verify-checkout-real3.py`） |
| 地图永不初始化 | `defineModel` 未声明 name，`watch(open)` 恒 false | 同上 | 手机截图 s2 |
| 门店标记不显示 | Marker 未传 `map` 参数 | 同上 | 手机截图 s2 |
| 无浏览历史时返回按钮失效 | 默认回退地址 `/cart` 无效 | `AppBackButton.vue` | 手机截图 s1 |
| Playwright 点「导航」选中 radio | `get_by_text` 命中内层 span | 测试选择器 | `tests/checkout-navigation.test.mjs` |
| 切换自提点被遗忘，结算沿用旧选择 | 切换状态未持久化/同步 | `BoxPickupBlock.vue` / `useOrderStore` | `tmp/verify-orderboxes-*.mjs`（配送档案手册 §5） |
| 自提点列表未按用户就近重算 | 未监听定位/未就近排序 | `usePickupDefaults.ts` | `tests/checkout-navigation.test.mjs` |

## 6. 验证脚本清单

| 脚本 | 用途 | 运行 |
|---|---|---|
| `tests/checkout-navigation.test.mjs` | **单测（21 用例）**：parseCoordinates / haversineKm / nearbyPickups / 导航 URI | `node tests/checkout-navigation.test.mjs` |
| `tmp/verify-checkout-real3.py` | 手机视口端到端（截图 `tmp-shots/checkout-pickup-*`） | `python tmp/verify-checkout-real3.py` |
| `tmp/verify-orderboxes-t2-now.mjs` 等 | 各租户 C 端分箱 | `node tmp/<script>.mjs` |
| `tmp/verify-shop-pickup-visibility.mjs` | 门店自提可见性 | `node tmp/verify-shop-pickup-visibility.mjs` |
| `tmp/regress-shipping-profile.mjs` | 配送档案一键回归（关联领域） | `node tmp/regress-shipping-profile.mjs` |

## 7. 历史文档索引

**本轮（按用户刷新 + 导航 + 返回按钮）**：
- `docs/superpowers/specs/2026-09-12-checkout-per-user-refresh-navigation-design.md` — 按用户刷新 + 50km 就近 + 高德导航设计
- `docs/superpowers/manual/checkout-per-user-refresh-nav/` — 操作手册（含手机截图 s0–s3）

**配送/自提直接相关（与配送档案手册 §7 重叠，从简）**：
- `docs/superpowers/specs/2026-08-30-checkout-pickup-address-contact-design.md` + plan — 自提点联系人（姓名/电话）
- `docs/superpowers/specs/2026-08-26-nshop-checkout-shipping-fixes-design.md` + plan — 配送/结算修复（自由大路店误显示）
- `docs/superpowers/specs/2026-08-28-nshop-checkout-delivery-modes-design.md` + plan — 配送方式选择（per-box）
- `docs/superpowers/manual/pickup-contact-switch/pickup-contact-switch.html` — 自提联系人切换手册
- 关联手册：`docs/domains/shipping-profile.md`（档案/自提点领域）

**结算/订单流程相关（完整清单见配送档案手册 §7）**：`2026-09-02-nshop-cn-per-box-checkout-design.md`、`2026-09-03-orders-cn-redemption-design.md`、`2026-09-02-nshop-cn-checkout-perbox-card-design.md`、`2026-09-02-nshop-checkout-cn-design.md`、`2026-09-01-order-template-jd-4level-design.md`、`2026-08-31-checkout-box-type-module-association-design.md` 等 specs + 对应 plans（均在 `docs/superpowers/specs|plans/`）。
