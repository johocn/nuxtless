# 结算页箱型模块归属重构（OrderBox.type 唯一真源）— 设计文档

日期：2026-08-31
范围：cjk-plugin 后端 + nshop 结算页前端 + 生产数据修正
状态：用户已确认关键决策

---

## 1. 背景与根因（已实证）

结算点「去结算」报 `{operation:'CheckoutSplitted', errors:[...]}`。根因链：

1. **OrderBox 无显式 `type`**，前端靠 `requiresAddress` / `requiresContact` 两个 flag 猜箱型。
2. **生产数据污染**：默认「物流」配送档案上误挂自提点「自由大路店」。
   - `computeOrderBoxes` 把 `profile.pickupLocations` 原样塞进每个 box → 物流商品所在的 delivery 箱也被赋了 1 个自提点。
   - 前端每箱兜底逻辑 `initDefaultFor`（自提点唯一且物流方式≤1 → 判为自提）→ **物流商品被默认走"自由大路店门店自提"**。
3. 自提档案 `requiresAddress=true` → 页面误弹「配送至收货地址」块，与自提模块"相连"；同时 `requiresContact=false` → 自提应带的「收货人/电话」不出现。
4. 混购时地址块/自提模块归属错乱 → `checkoutSplitted` 逐箱 `addPaymentToOrder` 时某箱状态非法 → 报错。

**结论**：这不是分箱算法坏，而是**结算页模块与箱型归属错乱 + 数据污染**。需以箱型为骨架重排模块归属。

## 2. 用户确认的规则（权威）

### 2.1 分箱层级
- 第一层：**按租户必分**。
- 第二层：**租户内按配送档案分箱**（`groupKey = shippingProfileId`，维持 spec 2026-08-28 §8.1 与源码现状）。支付档案按配送档案绑定，随档案走。

### 2.2 箱型与模块归属（唯一真源 = 后端 `OrderBox.type`）
| box.type | 模块 | 说明 |
|---|---|---|
| **delivery**（物流类） | **物流配送方式 + 收货地址（配送至）** | 永远带地址 |
| **pickup**（自提类） | **自提点**；若需联系方式 → 另带**收货人/电话模块**（与自提点连成一体） | 分"需联系方式/不需联系方式"两情形 |

- 地址块显示 ⟺ 存在任意 `box.type === 'delivery'`。
- 自提点模块显示 ⟺ 存在任意 `box.type === 'pickup'`。
- 收货人/电话模块显示 ⟺ 存在任意 `box.type === 'pickup'` 且该箱 `requiresContact === true`。
- 地址块**只与物流模块**绑定，绝不与自提模块相连。

### 2.3 后端 `type` 推导口径
`ShippingProfile` 实体无 `type` 字段；`pickupLocations` 是"自提能力"的本源（实体注释：仅当 shippingMethods 含 store-pickup/pickup-point 时生效）。故：

```
box.type = profile.pickupLocations?.length > 0 ? 'pickup' : 'delivery'
```

依赖数据正确：**物流档案不得挂自提点**（否则误判 pickup）。故需一并修正数据。

## 3. 修改清单

### 3.1 后端（cjk-plugin，本地构建+提交产物+服务器 git pull + pm2 restart）
- `order-box.service.ts`：`OrderBox` 接口新增 `type: 'delivery' | 'pickup'`；`computeOrderBoxes` 按上述口径推导填充。
- GraphQL：暴露 `OrderBox.type`（resolver / schema），保证 `GetOrderBoxes` 可查 `type`。
- 说明：`requiresAddress/requiresContact` 保留（驱动地址/联系块的"是否必填"语义），但**不再作为箱型判定**。

### 3.2 生产数据修正（SQL，先建备份表）
- 移除**物流档案**上误挂的 `pickupLocations`（保物流档案 `type='delivery'`）。
- 修正 flag 语义：
  - 物流档案：`requiresAddress=true, requiresContact=false`。
  - 自提档案：`requiresAddress=false`；`requiresContact` 按需（需联系方式档案=true，不需=false）。
- 复跑 `computeOrderBoxes`（通过 API 验证）确认各箱 `type` 正确。

### 3.3 前端（nshop layers/base）
- `gql/queries/order.gql` `GetOrderBoxes` 增 `type`；`_refresh_schema.mjs` 刷 schema + codegen。
- `CheckoutLayoutJd.vue`：按 `box.type` 重排装配——
  - `hasDeliveryBox = boxes.some(b => b.type==='delivery')` → 控制地址块。
  - `hasPickupBox = boxes.some(b => b.type==='pickup')` → 控制自提点模块。
  - `hasPickupContactBox = boxes.some(b => b.type==='pickup' && b.requiresContact)` → 控制收货人/电话块。
  - 自提点 + 收货人/电话作为**一体的自提单模块**。
- `BoxDeliveryBlock.vue`：每箱按 `type` 渲染——`delivery` 箱仅物流方式单选；`pickup` 箱仅自提点单选（+ 联系方式若需）；去除"物流/自提"跨类型切换。
- `AddressBlock.vue`：门控改用 `hasDeliveryBox`，提交仍写整单地址（仅被 delivery 箱使用）。
- `CheckoutPickupContactBlock.vue`：门控改用 `hasPickupContactBox`。

## 4. 验证
- API 回归：对物流/自提档案断言 `orderBoxes[].type` 正确。
- 前端手机视口（390×844）截图：
  - 纯自提单 → 仅自提点模块（+收货人电话若需），**无地址块**，可下单。
  - 纯物流单 → 地址块 + 物流方式。
  - 混购 → 地址块(delivery) + 自提单模块(pickup) 正确分离，`checkoutSplitted` 正常拆 2 单各自 `PaymentAuthorized`。
- 交付 = 实现 + API/回归 + 手机截图 + 操作手册/测试用例补充。