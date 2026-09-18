# 方案3：库存体系对齐方案1（配送方式）+ web-admin 网点管理 设计

> 状态：设计定稿 · 与方案1（2026-09-19-home-filter-language-city-delivery.md）、方案2（2026-09-19-home-filter-style-system-integration.md）合并执行

## 1. 背景与目标

方案1 为首页商品/分类/促销引入「语言·城市·配送方式」过滤，Product 新增 `deliveryMethods`（MAIL/SELF_PICKUP）数组字段；方案2 将过滤功能接入五级可回退风格体系。

方案3 目标：评估方案1 变化对现有库存体系的影响，让库存体系（2026-09-14 已落地的虚拟/物理库存体系）完美支撑「配送方式三态 + 多城市」的新变化，并在运营后台 web-admin 补全**租户物理网点管理**功能。

## 2. 影响评估（方案1 × 已落地库存体系）

### 2.1 已落地库存体系现状（2026-09-14 方案2，勿重复勘探）

后端 `d:\zhao\vendure\packages\cjk-plugin\src\inventory\`：
- **虚拟仓/物理仓模型**：虚拟仓 code=`{tenantCode}-virtual`（不可发货）；物理仓含默认仓 code=`{tenantCode}` 与附加仓 `{tenantCode}-{alias}`
- **VariantLocationBinding**（`variant-location-binding.entity.ts` / `variant-location-binding.service.ts`）：变体↔物理仓绑定；物理驱动变体虚拟库存=绑定物理仓之和；纯虚拟变体无绑定
- **镜像同步**（`mirror-math.ts` / `virtual-physical-stock.service.ts`）：物理仓库存变动经 StockMovementEvent 同步虚拟仓
- **分配策略**（`physical-aware-stock-location-strategy.ts`）：物理驱动变体分配到绑定物理仓，纯虚拟→虚拟仓
- **C 端库存查询**（`inventory-shop.resolver.ts`）：返回 `saleableStock`（虚拟库存）+ `stockDetail`（物理仓明细）
- **租户开关**：`tenant-channel-custom-fields.ts` 的 `physicalStockEnabled`
- **Admin 写接口**：`inventory-admin.resolver.ts` 仅 `setVariantBindings`（变体绑定）
- **网点自定义字段**：`stock-location-custom-fields.ts`（StockLocation 的 lat/lng/serviceCities 等）

前端（nshop）：详情页 `StockInfoBlock.vue`（inStock 派生自 saleableStock，按当前城市刷新）、`useProductStockInfo.ts`（GqlVariantStockInfo）、`ServiceableCityPanel.vue`（超区/可达性提示）。

web-admin（`d:\zhao\vshop\web-admin`）：`pages/inventory/stock/index.vue` 只读库存列表（stockLevels）+ `apis/inventory.ts`（fetchStock/fetchStockLocations/adjustStock→setVariantStock）；**无仓库 CRUD、无租户隔离、无配送方式配置**。

### 2.2 影响点与处理结论

| # | 影响点 | 现状 | 结论与处理 |
|---|---|---|---|
| 1 | 库存口径不感知配送方式 | saleableStock 不区分 MAIL/SELF_PICKUP | 自提模式需「当前城市可自提点」口径；邮寄走虚拟库存/可发仓 |
| 2 | 分配候选仓无配送约束 | PhysicalAwareStockAllocationStrategy 按绑定仓分配，未查商品 deliveryMethods | 候选仓按商品×网点 deliveryMethods 交集过滤 |
| 3 | 网点配送能力无字段 | 无「网点支持自提/邮寄」表达 | StockLocation 新增 `deliveryMethods`（三态） |
| 4 | web-admin 无网点管理 | 只读库存页 + setVariantBindings | 新增网点 CRUD + 租户隔离 + 配送方式配置 |
| 5 | 首页过滤与详情库存脱节 | 首页按配送过滤，详情库存不随配送变化 | 详情页加配送方式切换，库存口径联动 |

## 3. 概念统一：网点（StockLocation）三态配送能力

**不做「门店/仓库」二元角色标签。** 一个网点（StockLocation）可以是自提点、发货仓、或两者兼备，由 `deliveryMethods` 数组表达：

| 网点 deliveryMethods | 语义 | 邮寄候选（可发仓） | 自提候选（可自提点） |
|---|---|---|---|
| `["MAIL"]` | 仅邮寄 | ✓ | ✗ |
| `["SELF_PICKUP"]` | 仅自提 | ✗ | ✓ |
| `["MAIL","SELF_PICKUP"]` | 两者兼备 | ✓ | ✓ |
| 空（兼容旧数据） | 两者都支持 | ✓ | ✓ |

候选集判定（与 Product 侧 `isProductVisible` 语义同构，前后端统一）：
- 邮寄候选 = 网点 deliveryMethods 含 MAIL（或空）**且** serviceCities 匹配当前城市（空=全国）
- 自提候选 = 网点 deliveryMethods 含 SELF_PICKUP（或空）**且** serviceCities 匹配当前城市（空=全国）
- 匹配规则：城市精确匹配（`serviceCities` 数组 `includes(city)`；空数组=全城）

## 4. 数据模型扩展（后端）

**文件：** `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-location-custom-fields.ts`

StockLocation customFields 新增：
- `channelCode`：`type:'string'`，nullable，public —— 归属租户（web-admin 按租户隔离；channelCode 与 nshop 多租户 code 白名单同源）
- `deliveryMethods`：`type:'string'`, `list:true`，nullable，public —— 网点配送能力（MAIL/SELF_PICKUP；空=两者都支持），ui 用 `multiple-select-form-input`
- 复用既有 `lat` / `lng` / `serviceCities`

> 与方案1 的 Product.deliveryMethods 同枚举同语义；不新建网点类型字段（YAGNI）。

## 5. 前端库存提示改造（详情页）

**文件（nshop）：**
- `layers/base/app/components/product-detail/`：StockInfoBlock.vue 等库存相关组件
- `layers/base/app/composables/useProductStockInfo.ts`
- 复用方案2 组件 `components/home/blocks/DeliveryFilterBar.vue`（或抽取到公共目录共用）

### 5.1 详情页配送方式切换
- 详情页新增配送方式切换（复用 DeliveryFilterBar；配置走方案2 五级风格体系，页面 key 用 `product`，新增 `filter` 或 `stockBar` 节点——与方案2 同构解析）
- 切换状态模块级独立（与首页模块级切换互不干扰；localStorage 持久化沿用方案1 useModuleDelivery 模式）

### 5.2 库存口径随切换变化
- **邮寄模式**：展示 `saleableStock`（虚拟库存；物理驱动=可发仓合计，沿用镜像机制保证一致）
- **自提模式**：
  - `physicalStockEnabled=true`：展示当前城市**可自提点合计**（含双模式与仅自提网点）
  - `physicalStockEnabled=false`：仅可达性提示（ServiceableCityPanel 现状），无自提库存数字
- 沿用方案2-D 既有规则：`physicalStockEnabled` 开启才显示「就近网点明细」折叠块（stockDetail）
- 双模式网点在邮寄与自提两种口径下都计入

### 5.3 边界
- 商品 deliveryMethods 仅 SELF_PICKUP 且当前城市无自提候选 → 自提库存显示无货/空态（i18n 词条复用方案1 `messages.home.emptyAfterFilter` 或新增详情页词条）
- **自提模式展示库存数字的前提统一为：`physicalStockEnabled=true` 且存在自提候选（含纯虚拟变体走虚拟库存兜底）；不满足则仅可达性提示（ServiceableCityPanel 现状），不展示自提库存数字**

## 6. 后端对齐

### 6.1 分配策略接入 deliveryMethods

**文件：** `d:\zhao\vendure\packages\cjk-plugin\src\inventory\physical-aware-stock-location-strategy.ts`

- 候选仓过滤前置：商品 `deliveryMethods` ∩ 网点 `deliveryMethods`（交集非空或任一为空=兼容放行）→ 再做现有就近/默认分配
- 商品 `["SELF_PICKUP"]` → 仅自提候选；`["MAIL"]` → 仅可发仓；`["MAIL","SELF_PICKUP"]` → 全量候选
- 纯虚拟变体 → 虚拟仓（现状不变）

### 6.2 C 端库存查询支持配送口径

**文件：** `d:\zhao\vendure\packages\cjk-plugin\src\inventory\inventory-shop.resolver.ts` + `stock-city-filter.ts`

- 库存查询接口支持 `deliveryMethod` 参数（MAIL/SELF_PICKUP/空=全部）
- `pinByCity` / `cityServes` 扩展：按 deliveryMethods 过滤参与聚合的网点，返回对应口径的合计与明细

## 7. web-admin 网点管理（扩展 inventory 模块）

**文件（vshop）：** `d:\zhao\vshop\web-admin\src\pages\inventory\*`、`src\apis\inventory.ts`（扩展）、`src\stores\tenantStore.ts`（租户上下文复用）

- **网点列表页**：按当前租户（channelCode）过滤；展示名称/配送方式标签（邮寄/自提/双模式）/服务城市/经纬度；入口从现有 inventory/stock 模块扩展
- **新建/编辑**：名称/经纬度/服务城市/配送方式（多选：邮寄、自提、两者兼备）/归属租户——**无「网点类型」单选**；走 Vendure 原生 `createStockLocation` / `updateStockLocation` + customFields 输入
- **变体绑定**：复用 `setVariantBindings` 补查看/编辑 UI
- **库存调整**：复用 `adjustStock`（setVariantStock）
- 移动端风格（rpx + BottomBar）延续现状

## 8. 测试与交付

- **单测（vendure cjk-plugin，Vitest 既有模式）**：
  - 三态网点匹配矩阵（仅邮寄/仅自提/双模式/空）
  - 商品×网点 deliveryMethods 交集过滤（分配候选仓）
  - 双模式网点在双口径下都计数
- **单测（nshop）**：详情页口径选择纯函数（如有抽出）
- **Playwright 手机截图（nshop）**：详情页切换 邮寄→自提 库存口径变化；未开启物理仓租户自提可达性
- **web-admin 截图（vshop）**：网点列表 + 新建/编辑（配送方式多选）+ 绑定查看
- **操作手册**：方案1/2/3 合并补丁 + 各截图
- **部署**：后端 vendure（git pull + pm2 restart，含新 customFields 生效 + schema 刷新）；前端 nshop（`node scripts/deploy.mjs`）；web-admin（vshop 既有部署机制）

## 9. 与方案1/2 的执行顺序

| 顺序 | 计划 | 仓库 | 内容 |
|---|---|---|---|
| 1 | 方案1 2026-09-19-home-filter-language-city-delivery | nshop+vendure | 首页过滤核心（含 Product.deliveryMethods 字段） |
| 2 | 方案2 2026-09-19-home-filter-style-system-integration | nshop | 过滤接入五级风格体系 |
| 3 | 方案3（本方案） | nshop+vendure+vshop | 库存体系对齐 + web-admin 网点管理 |

依赖：方案3 依赖方案1 的 `DeliveryMethod` 枚举/`isProductVisible` 语义、方案2 的 `DeliveryFilterBar`/配置解析模式；后端 Product.deliveryMethods（方案1 Task 0）与 StockLocation.deliveryMethods（方案3）同枚举对齐。

## 10. YAGNI 边界

- 不新建「网点类型」字段/实体（deliveryMethods 三态已表达角色）
- 不做「网点库存预留/调拨」流程（DeliveryRecord 已覆盖，属既有方案2-B，不在本方案扩展）
- 不做自提预约/取件码（不在范围）
- web-admin 不做 PC 端管理界面（延续移动端风格）
- 不改动对账（方案2-C）与配送记录（方案2-B）既有实现，仅保证新字段兼容
