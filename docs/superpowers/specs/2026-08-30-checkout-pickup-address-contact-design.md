# 结算页「自提免地址」与「到店需联系方式」设计

日期：2026-08-30
项目：nshop（Nuxt 3 前端，配合 vendure 后端）
状态：已与用户确认方案，待实现

## 1. 背景与目标

1. **自提免地址**：自提点自提通常无需收货地址。当前结算页在自提模式下仍显示「配送至 / 收货地址」区块并强制填写，应改为：**配送档案是商品级、按箱区分**，纯自提的箱不需要收货地址，且整单纯自提时不显示地址块、下单不因缺地址而阻止。
2. **到店需联系方式**：到店付款的自提订单（如蛋糕）常有客户未付款 / 放弃且无联系方式无法跟进。需要：**按配送档案配置**，凡需要联系方式的档案，结算时采集「领取联系人（姓名 + 手机号）」，登录用户联系人持久化、下次默认、可新增。

## 2. 术语

- **配送档案（shipping profile / 箱 box）**：商品级配送配置。一单可拆成多个「箱」，每箱有独立的配送方式 / 自提点（`OrderBoxInfo`：`availableShippingMethodIds`、`pickupLocations`、`defaultShippingMethodId`、`availablePaymentMethodCodes`）。
- **配送模式（delivery mode）**：结算入口 `shipping`（物流）/ `store`（门店自提）/ `employee`（职工自提）/ `point`（自提点）。
- **requiresAddress / requiresContact**：配送档案上的两个配置开关（见 §5）。

## 3. 需求一：自提单不要求收货地址

### 3.1 根因

`CheckoutLayoutJd.vue` 与 `submitJd()` 用整单 `hasLogistics = orderBoxes.some(b => b.availableShippingMethodIds.length > 0)` 判断是否显示地址块 / 是否提交地址。由于配送方式基本总可选，`hasLogistics` 恒为真，导致自提模式下地址块仍显示、`submitAddress` 被强制调用并因缺地址阻止下单。

### 3.2 方案：按「箱是否需要地址」汇总

- 把「是否要收货地址」从整单二元判断，改为**按配送档案判定**后汇总：
  - `needAddress = 任意一箱 requiresAddress === true`
- 结算页行为（JD 版式与旧版式 `submitLegacy` 一致）：
  - `needAddress === true` → 显示「配送至」地址块，下单时调用 `submitAddress` 并校验（收货人 + 街道必填），写入 `Order.shippingAddress`，供需地址的物流箱使用。
  - `needAddress === false`（整单纯自提）→ 隐藏地址块，**下单 step 跳过 `submitAddress`**，不因缺地址阻止。
- 混合箱：存在任一需地址箱即显示地址块并校验；纯自提箱忽略这份地址即可，互不冲突。

提交步骤调整：
```
submitJd():
  if needAddress: okAddress = submitAddress(); if !okAddress return
  if needDelivery: okDelivery = submitDelivery(); if !okDelivery return   // 现有逻辑，按箱
  if needContact:  okContact = submitContact();   if !okContact return   // 需求二
  okPayment = submitPayment(); if !okPayment return
```
（`needDelivery` 沿用现有按箱配送逻辑；`submitDelivery` 现有实现已能按箱给默认自提点兜底。）

## 4. 需求二：到店订单按需采集联系方式

### 4.1 数据字段（方案 A：新增 Order 自定义字段）

在 vendure 侧为 `Order` 新增可空自定义字段（建议在 cjk-plugin / pickup-plugin 的 `Order.customFields` 注册，参照现有 `pickupType` 等）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `contactName` | string, nullable | 领取/联系人姓名 |
| `contactPhone` | string, nullable | 联系电话 |
| `remark` | text, nullable | 可选备注（订单备注，非必填；可裁剪） |

> 保存后后台「订单详情 → 自定义字段」卡片即自动展示，店员可据此联系未付款 / 放弃的到店客单。

### 4.2 触发：配送档案 `requiresContact`

结算页汇总 `needContact = 任意一箱 requiresContact === true`。为真时在支付块之前显示「领取/联系电话」区块（§4.4），下单必填联系人。

### 4.3 到店支付闭环

不改结算支付方法，沿用现有 `fixed-aggregate-collection`（门店到店收银：顾客扫门店固定聚合码付款，店员确认到账）。未付款 / 客户放弃的单子，店员用 `contactPhone` 跟进。

### 4.4 联系人区块（ContactBlock）交互

一个轻量 UI 区块，插在支付块之前（仅 `needContact` 时渲染）：

- **未登录用户**：直接填「联系人姓名 + 手机号」，写入 `Order.customFields.contactName / contactPhone`。
- **登录用户（复用地址本 CustomerAddress）**：
  - 加载当前 `Customer` 的地址本，任一地址的 `fullName + phoneNumber` 视为一个可用联系人；首选默认地址，其次最近创建。
  - 默认带出地址本中的默认联系人；支持切换其它联系人。
  - 支持「新增联系人」：填写姓名 + 手机号 → 保存到地址本（`customer.addAddress` / `setCustomerShippingAddress`），并设为默认；下单写入 `Order` 联系字段。
  - 保存的联系人在下一次结算自动带出（默认联系人）。
- 字段与提交：区块维护 `contactName`、`contactPhone`（登录可从所选地址本条目回填）；提交时写入订单联系字段。

校验：
- `needContact === true` → `contactPhone` 必填且通过手机号格式校验（如 11 位 / 电话号码模式），未通过阻止下单并 toast 提示。
- `needAddress === false && needContact === true` 时，联系人区块独立显示（不依赖地址块），用户无需再填地址。

## 5. 配送档案配置化（两个开关的承载）

- 在**配送档案实体 / 相关配置**上新增两个开关字段：
  - `requiresAddress: boolean`（默认由档案类型推导：物流档案 = true，纯自提档案 = false）
  - `requiresContact: boolean`（默认 false；需要联系方式的到店档案如蛋糕门店自提 = true）
- 随箱实例下发到前端 `OrderBoxInfo`（`box.requiresAddress`、`box.requiresContact`），结算页据此做 §3.2 / §4.2 汇总。
- 说明：具体后端承载位置（配送档案自定义字段 / 映射表）在实现计划阶段核实并最终确定；此处先定契约 `OrderBoxInfo.requiresAddress / requiresContact`。

## 6. 数据流与提交顺序

1. 载入结算 → 拉订单箱（`fetchOrderBoxes`）→ 得到每箱 `requiresAddress / requiresContact`。
2. 计算 `needAddress` / `needContact`（任一箱为真）。
3. 渲染：
   - `needAddress` → 地址块（收货人 + 街道必填）
   - `needContact` → 联系区块（姓名 + 手机必填）
   - 配送方式/自提点选择：沿用现有按箱区块。
4. 提交（见 §3.2）：按 `need*` 逐项校验，全部通过后 `submitPayment`，再成功重定向。

## 7. 边界与错误处理

- 混合箱：需地址箱存在 → 显示地址块；地址对需地址箱生效，纯自提箱忽略，不加额外校验。
- 整单纯自提且无需联系 → 既不显示地址块也不显示联系区块，直接可下单。
- `needContact` 但手机号格式错 / 为空 → 阻止下单 + toast。
- 登录用户地址本为空：联系区块退化为直接填写（不强制先建地址），填写的联系人仍写入订单；可选：同时提示可保存。
- 旧版式（非 JD）：`submitLegacy` 同样按 `needAddress` 决定是否提交地址，按 `deliveryType==='pickup'` 跳过配送方式（保持现状），并接入 `needContact`。

## 8. 测试计划

- 纯自提（无需联系）：地址块不显示、下单不校验地址、直接成功。
- 自提 + 需联系：地址块隐藏、联系人区块显示、未填手机号下单被阻、填写成功入库。
- 混合箱（需地址箱 + 纯自提箱）：地址块显示并校验，纯自提单照常成功。
- 登录用户：默认联系人带出；新增联系人保存进地址本并成为默认；下次结算带出最新默认。
- 未登录：手填姓名手机号入库。
- 校验：手机号格式错误阻止；合法提交订单 `customFields.contactName/contactPhone` 正确写入。
- 后台：订单详情自定义字段卡片可见 `contactName / contactPhone / remark`。
- 交付：手机视口（390×844，dpr=2）结算页截图补齐操作手册（遵循部署铁律）。

## 9. 后续可裁剪项

- `remark` 订单备注：本版本保留为可选（蛋糕核销场景有价值）；若确不需要可在实现时移除。