# nshop /checkout 配送方式四入口模块化（A+B 备选）— Design

> 生成：2026-08-28　范围：**仅前端**　基线：nshop (Nuxt4 SSR, layers/base)

## 背景与目标

当前 `/checkout` 配送方式区把「物流配送（一个容器）+ 三类自提（固定按钮）」**平级堆叠**展示，视觉上像「4 个并列配送方式」，易让用户误以为物流配送只是一条单选、而其余三个是按钮，观感不平整。

本方案把配送方式区收敛为**单一「订单交付」多入口模块**，收纳进**可回退配置体系**（与详情页/checkout 构建器同款），提供两套版式备选（`folded` 为默认 A 方案，`flat` 为备选 B 方案），并且**四个入口的显隐由数据驱动**——配送档案 / 支付档案里没有的方式即隐藏，其余照旧默认展示。

**本次调整后的核心交互约定**：
- **自提与配送平级展示**：物流配送与三类自提同为「订单交付」入口层级的四个并列入口，不再有"物流是容器、自提是按钮"的主次观感。
- **折叠逻辑默认展开**：物流配送的子项（动态物流方式列表）**默认展开可见**，进入即直接看到方式列表并被预选，无需点击才逐层展开；点标题可整体收起/展开（可选折叠，默认展开态）。

## 范围界定

- **仅改前端**（nshop `layers/base/app`），不新增 / 修改 vendure 后端字段，不改配送 / 支付接口。
- 底层 `deliveryMode` 状态机、`setShippingMethod / setPickupLocation` 写回逻辑**保持不变**。
- 三个自提类型仍是固定三类（store / employee / point），仅根据**是否有可用数据**决定显隐。
- 上线遵循部署铁律：本地构建、提交产物、服务器 git pull + pm2 restart。

## 架构

### 可回退的配送方式模块

- 新增 `checkout-delivery.ts`（`app/utils/`，纯函数，L4 兜底链友好）：
  - 类型 `CheckoutDeliveryLayout = "folded" | "flat"`。
  - `deliveryLayout()` 解析函数：坏值回退默认 `"folded"`，保证 SSR/客户端一致。
- 改造 `DeliveryModeBlock.vue` 为**单渲染器多版式**：
  - `folded`（默认 A）：**四个入口平级**——物流配送与三类自提并列；物流配送子项（动态物流方式列表）**默认展开可见**，点标题可整体收起/展开（默认展开态）。
  - `flat`（备选 B）：四个入口平铺 + 分组标题（`物流配送` / `自提`），物流方法仍在组内单选。
- 版式由 `checkoutConfig.layout`（`app/utils/checkout-config.ts`）同源常量驱动，当前默认 `folded`。

### 数据驱动的入口显隐（核心判定口径）

四入口显隐全部**由现有后端数据反推**，「档案没有该方式即隐藏」，无需新增后端能力清单：

| 入口 | 判定依据（数据） | 为空 → 隐藏 |
|---|---|---|
| 物流配送 | `eligibleShippingMethods` 非空 | 无任何可用物流方式 |
| 门店自提 | `getPickupLocations('store')` 非空 | 无门店 |
| 职工自提 | `getPickupLocations('employee')` 非空 | 无单位点 |
| 自提点 | `getPickupLocations('point')` 非空 | 无自提点 |

- 显隐判断在 `DeliveryModeBlock` 内以 `computed` 收集：
  - 物流方式数量：`shippingMethodList.length > 0`。
  - 三类自提分别发起 `GqlGetPickupLocations(type, ...)` 拉取首屏，**非空即认为该方式可用**。（说明见「自提可用性预检」）
- **其他默认方式不变**：可见且未被显隐规则隐藏的入口，行为完全沿用现状（默认/唯一物流直接预选第一项、自提就近预选、联动地址块等）。

### 组件 / 文件规划

- **Modify**：`app/components/checkout/DeliveryModeBlock.vue`（改造为 folded 默认 + flat 备选的单渲染器，加入口显隐判定）
- **Modify**：`app/utils/checkout-config.ts`（扩展 `CheckoutDeliveryLayout` 与解析函数）
- **Create**：`app/utils/checkout-delivery.ts`（版式解析纯函数，可从 `checkout-config` 复用/别名）
- **复用（不改）**：`stores/useOrderStore.ts`、`PickupBlock.vue`、`useCheckoutFlow.ts`、`useCheckout.ts`、`useLocationStore.ts`
- **i18n**：沿用 `messages.checkout.*`（storePickup / employeePickup / pointPickup / deliveryMethod / pickupMethod 等），仅当新增『内层展开』所需文案时补入 `zh-CN.ts` 并同步全部语言包。

## 交互

### folded（默认，A 方案）

```
配送方式
├─ ● 物流配送               ← 四个入口之一（平级）
│     子项（默认展开）：○ 邮寄 ● 京东物流 ○ 大件专送 …  （eligibleShippingMethods 动态单选）
├─ ○ 门店自提               ← 仅当 getPickupLocations('store') 非空显示
├─ ○ 职工单位自提            ← 仅当 employee 非空显示
└─ ○ 自提点                 ← 仅当 point 非空显示
```

- **平级展示**：物流配送与三类自提同为「订单交付」入口层的四个并列入口，主次一致。
- **默认展开**：进入即以展开态直接展示物流方式子项并预选第一条（沿用"默认/唯一物流直接选"）。
- **可选折叠**：点「物流配送」标题可整体收起/展开子项；默认展开，收起不影响底层逻辑（仅 UI）。
- 切到某自提类型：物流子项保持可见但不再作为选中态；联动 `PickupBlock` 展示对应自提点列表，隐藏地址块。

**京东红视觉约定（folded 版式）**：主题色为京东红 `#E4393C`；卡片白底、边框 `#ECECEC`；四入口平级排列（按常用度：物流配送 → 门店自提 → 自提点 → 职工单位自提），入口为胶囊按钮（红框红字浅红底 `#FFF0F0` 表示选中）；物流配送子项区以虚线分隔，子项「物流配送」为单选胶囊 + 价格右对齐 + 首页「京东物流」红色「推荐」标签；折叠箭头在「请选择承运方式」标题旁，默认展开。深色模式同步适配（红 `#F05053`、浅红底 `#3A1414`）。

### flat（备选，B 方案）

```
配送方式
 [ 物流配送：请选择承运方式 ]
    ● 邮寄   ○ 京东物流  ○ 大件专送 ...
 [ 自提 ]
    (门店自提)  (职工单位自提)  (自提点)     ← 同样按数据显隐
```

- 改动最小；交互与现状一致，仅加分组标题。

**京东红视觉约定（flat 版式）**：主题色为京东红 `#E4393C`；卡片白底、边框 `#ECECEC`；分组标题带 4×14px 红竖条（`.dot`）+ 分组名（`物流配送 | 请选择承运方式` / `自提`）；选中项红框红字浅红底 `#FFF0F0`；「京东物流」首项加红色「推荐」标签；价格右对齐、选中态变红；「自提」分组内按常用度排 门店自提 → 自提点 → 职工单位自提。深色模式同步适配（红 `#F05053`、浅红底 `#3A1414`）。

### 自提可用性预检（显隐判定的落地）

- 不预检全部类型加重首屏负担：三类自提的可用性在 `DeliveryModeBlock` 挂载时以 `GqlGetPickupLocations(type, lat, lng, first:1)` 并发探测一次（`first:1` 仅取一条判断有无）。
- 结果为空的类型对应入口隐藏；用户切到某类型时，实际列表仍由 `PickupBlock` 全量加载（与现状一致）。
- 探测失败（网络/后端异常）**视为不可用即隐藏**，并仅在控制台告警，不阻塞其余入口；同时登录前/无定位时仍可探测（坐标传 null）。
- 探测结果在 `deliveryMode` 联动与语言切换下保持稳定（`computed` + 一次性 `onMounted` 请求，缓存到模块局部 ref）。

## 数据流

- `DeliveryModeBlock` 内部维护 `available: Record<'shipping'|'store'|'employee'|'point', boolean>`（探测结果）。
- 渲染入口列表 = 全量四类 `filter(available[type])`。
- 选中后仍走既有 `flow.setMode(type)` → `PickupBlock` / 地址块联动；物流子项选中走既有 `applyShipping(id)`。
- 底层 `useOrderStore` / `checkout-config.ts` 的配送逻辑零改动。

## 错误处理

- 显隐探测失败：对应入口隐藏 + 仅告警，不抛错、不阻塞下单（沿用"无可用方式"的既有 Alert 语义）。
- 无任何可用入口时：保留现有 `noShippingMethod` Alert 文案与空态。
- 全部沿用既有多语言词条；新增文案仅在内层展开需要时补。

## 测试

- 本地 `pnpm dev` + agent-browser 验证：
  - `folded` 默认版式：四入口平级渲染、物流子项默认展开并预选第一项、点标题收起/展开、切自提类型联动收起/隐藏地址、按数据隐藏入口（清空某类型自提点后该入口消失）。
  - `flat` 备选：改 `checkout-config` 布局后平铺 + 分组标题正常，交互与现状一致。
  - 回归：物流预选第一条、自提就近预选（有/无定位）、地址块联动显隐、提交门闩不回归。
  - 语言切换（中英）下入口与展开文案正常。
- 提交前本地构建、`pnpm typecheck`、产物入 git（遵循部署铁律）。