# 按配送档案分箱 + 支付拆合 —— 实现计划

日期：2026-08-28
设计基准：`docs/superpowers/specs/2026-08-28-nshop-delivery-payment-splitting-design.md`
范围：后端四模块（分箱+多fulfillment / 共享余额钱包 / 聚合拆合引擎 / 支付档案绑定），前端后置
执行方式：Subagent-Driven，Task 间逐项验证

---

## 范围与决策记录
- 后端：分箱+多fulfillment（Vendure 原生）· 独立共享余额钱包实体 · 纯函数聚合拆合引擎 · 支付档案↔配送档案档案间引用。
- 前端后置：本阶段仅完成后端 API 与核心逻辑，前端结算交互后续阶段接。

## 依赖关系
```
Task1 支付档案绑定（引用关系）  ← 先行，Aggregation 依赖它取每箱支付方式
Task2 分箱 + 多 fulfillment     ← 购物车分箱消费层
Task3 共享余额钱包              ← 独立实体+扣款，依赖分箱订单可用
Task4 聚合拆合引擎              ← 最上层，依赖 Task1/2/3
Task5 后端验收（e2e / 单测）     ← 全链路
Task6 提交 + 构建（本地 + dist）
```

---

## Task 1：支付档案绑定配送档案（档案间引用）
**目标**：建立「配送档案 → 支付档案」引用，供聚合引擎取每箱支付方式白名单。
- 新增关联：ShippingProfile ↔ PaymentProfile 引用（档案间 `profileId 引用 / 关联字段`）。
- 提供查询：`paymentProfileForShippingProfile(shippingProfileId) => PaymentProfile`。
- 校验：同租户可用；全局/租户级可见性沿用既有逻辑。
- 兼容：未绑定支付档案的配送档案 → 回退租户默认支付档案（复用 `resolveEffectiveProfileIds`）。
- **验收**：admin/shop 可查询配送档案对应支付档案；无绑定时回退默认。

## Task 2：分箱 + 多 fulfillment（Vendure 原生）
**目标**：把订单内按配送档案拆成多个 fulfillment。
- 基于变体 `shippingProfileId` 对订单行分组 → 每箱一个 delivery group。
- 每箱独立选择配送方式 / 自提点（沿用现有 `setShippingMethod` / `setPickupLocation` 链路，挂到对应 group）。
- 复用 Vendure 原生多 fulfillment 模型，逐组生成 fulfillment。
- **验收**：混合购物车（多配送档案）下单后订单含多个 fulfillment，各组配送方式/自提点独立。

## Task 3：共享余额钱包（独立实体）
**目标**：全局共享余额账户 + 事务扣款。
- 新建 Wallet 实体（余额账户，全局唯一共享）。
- 余额扣款事务：`debit(wallet, amount)` 校验余额充足，原子扣减并记录流水。
- 结算时余额支付 = 从共享钱包扣减订单总额（跨租户合并订单一次性扣款）。
- **验收**：扣款成功/余额不足两分支；跨租户合单一次扣减总额。

## Task 4：聚合拆合引擎（纯函数）
**目标**：给定分箱 + 所选支付方式，返回「可合并到同一订单」的分组。
- 输入：各箱（配送档案、所绑支付方式白名单、租户）。
- 规则：
  - 余额 → 全部箱并入 1 订单。
  - 非余额同租户且每箱白名单含该方式 → 合并；缺该方式的箱拆出。
  - 非余额跨租户 / 方式不同 → 拆。
- 输出：订单分组列表（group → boxes + 总金额 + 各箱配送明细）。
- **验收**：覆盖 §2.4 三档规则与 §2.3 默认档案并入默认分组。

## Task 5：后端验收
- 为本计划编写/扩展测试：分箱、多 fulfillment、钱包扣款、聚合三层分支、默认档案回退。
- 在本地跑通 e2e，确认无回归（既有 checkout 单配送方式路径仍可用）。

## Task 6：提交 + 构建
- git commit 各 Task。
- 本地构建，提交 dist 产物到 git（遵循部署铁律）。
- 不自动部署；由后续确认后统一部署。

---

## Task 7：后端一次性拆单 mutation（Path B 非余额拆多单）

> 目标：用户选择非余额支付方式 M 且聚合引擎判定需拆单（groups.length > 1）时，通过一个 mutation 把源活动订单按 group 拆成多个独立订单，供前端逐单结算。余额（Path A）不拆，仍走既有 `addPaymentToOrder` 单订单流程。

### 7.0 设计要点（为什么这样拆）
- 源活动订单 = 所有 box 都在一个 Order（`AddingItems` 态）。groups[0] 保留在源订单；groups[1..n] 各自新建 Order。
- 订单行迁移采用「从源订单按箱移除 + 对新订单按 variant+qty 重加」：
  - 箱划分依据是 `line.productVariant.customFields.shippingProfileId`（变体级，重加后仍满足分箱），line 级 customFields 不在本方案迁移（记录即得）。
  - 移除用 `orderService.removeItemFromOrder(orderId, lineId)`；添加用 `orderService.addItemsToOrder(orderId, [{ productVariantId, quantity }])`。
- 每单配送：对新订单 `computeOrderBoxes` 后，按各箱已保存选择/默认兜底 `setBoxShippingMethod`，与整单多 fulfillment 保持一致。
- 每单计税：Vendure 订单在重算时自动 applyPriceAdjustments；仅需 `orderService` 的修改接口触发，无需手调 OrderCalculator。
- 先全部建单并过渡到 `ArrangingPayment`，再对每个订单分别 `addPaymentToOrder`；mutation 保持 `@Transaction()` 保证整体原子。

### 7.1 GraphQL schema（plugin.ts）
```graphql
extend type Mutation {
    # 一次性拆单：返回拆后需各自结算的订单列表（0 或 1 个 = 无需拆单）。
    checkoutSplitted(paymentMethodCode: String!): [Order!]!
}
```

### 7.2 新建 `src/order/order-split.service.ts`
**职责**：`performSplitCheckout(ctx, order, paymentMethodCode): Promise<Order[]>`。

```ts
async performSplitCheckout(ctx, order, paymentMethodCode): Promise<Order[]> {
    const boxes = await this.orderBoxService.computeOrderBoxes(ctx, order);
    if (boxes.length === 0) throw new UserInputError('NO_BOXES');

    const aggBoxes: AggregationBox[] = [];
    for (const box of boxes) {
        const codes = await this.resolvePaymentCodesForBox(ctx, box);
        aggBoxes.push({ boxKey: box.boxKey, profileId: String(box.profileId), tenantChannelId: String(box.tenantChannelId), availablePaymentMethodCodes: codes });
    }
    const { groups } = decideAggregation({ boxes: aggBoxes, userSelectedPaymentMethod: paymentMethodCode });
    if (groups.length <= 1) return [order]; // 合并单或余额 → 前端走既有支付

    // groups[0] 保留在源订单
    const orders: Order[] = [];
    let activeOrder = order;
    for (let i = 1; i < groups.length; i++) {
        const g = groups[i];
        activeOrder = await this.splitOffGroup(ctx, activeOrder, g, order);
        orders.push(activeOrder);
    }
    // 源订单（groups[0]）设置剩余箱配送方式
    await this.orderBoxService.setShippingForOrder(ctx, order, groups[0].boxes.map(b => b.boxKey));
    orders.unshift(order);
    return orders;
}

private async splitOffGroup(ctx, source, group, originalOrder): Promise<Order> {
    const newOrder = (await this.orderService.create(ctx)) as Order;
    // 1) 累加该组各 box 的 variant+qty，从源订单移除
    const lines = await this.getBoxLines(ctx, source, group.boxes); // [{productVariantId, quantity}]
    for (const line of lines) {
        // 移除源订单里的对应行（按 variantId 匹配该行）
        const lineEntity = ...; // 定位
        if (lineEntity) await this.orderService.removeItemFromOrder(ctx, source.id, lineEntity.id);
    }
    // 2) 重加到新订单
    await this.orderService.addItemsToOrder(ctx, newOrder.id, lines);
    // 3) 新订单按箱设置配送
    const newOrder = await this.orderBoxService.setShippingForOrder(ctx, newOrder, group.boxes.map(b => b.boxKey));
    return this.orderService.findOne(ctx, newOrder.id);
}
```

### 7.3 扩展现有 OrderBoxService
新增 `setShippingForOrder(ctx, order, boxKeys)`：对给定 boxKeys 用已保存选择/默认配送方式一次性 `setShippingMethod`（复用现有 readSelections + orderedMethodIds 逻辑，抽出公共方法）。

新增 `resolvePaymentCodesForBox(ctx, box)`（或独立 PaymentProfileService 方法）：按 box.profileId 查配送档案 → bound paymentProfile → paymentMethods → `code` 列表。

### 7.4 新建分析
- Box 需暴露 `availablePaymentMethodCodes`。方案：在 `orderBoxes` 查询返回中同样填充（分析同一逻辑函数），前端可直接用它渲染「该箱可用支付方式」。

### 7.5 关键约束
- `@Transaction()`：mutation 级保证源订单移除 + 新单添加 + 状态流转 + 支付整体原子；任一步失败整体回滚。
- 过渡到 `ArrangingPayment`：每单在 `addPaymentToOrder` 前若未在货，需 `transitionToState(ctx, id, 'ArrangingPayment')`（addPaymentToOrder 内部依赖该状态）。
- 前端契约：返回数组长度 = 需结算订单数；前端对每个订单循环 `addPaymentToOrder`。余额 = 1（不拆）。

### 7.6 验收
- 混合车（多租户/缺某支付方式）选非余额 M → 返回多个订单；每单 paymentMethodCode 均 M；金额 = 该组箱合计；配送方式各自独立。
- 余额选余额 → 返回 1 单。
- 既有单配送方式路径无回归。

---

## 风险与说明
- Vendure 原生多 fulfillment 需确认当前 Vendure 版本对 `eligibleShippingMethods`（整单级）与多 fulfillment 的兼容；若原生按档案分箱不可直接映射既定配送履约，需在 Task2 内评估是否扩展示例或降级为"分箱下单+合并统计"。
- 共享钱包资金归属/对账：全局共享钱包下跨租户扣款需预留流水明细，供后续对账。
- 前端后置意味着本阶段用户侧结算 UI 不变，仅后端能力就绪。

## 完成标准
- 四模块后端实现 + 测试通过 + 提交 + 本地构建成功，dist 干净。

---

## Task 8：前端结算改造（按配送档案分箱展示 + 支付聚合拆合）

> 目标：把京东版结算页改为「按箱配送 + 一次性拆单结算」。用户为每个「配送组（按配送档案分箱）」独立选择物流配送方式或自提点；支付方式取全箱可用白名单并集；提交统一走后端 `checkoutSplitted`（内部按所选支付方式聚合拆合 + 逐单结算）。

### 8.0 依赖
- 后端 `orderBoxes` 查询、`setOrderBoxShippingMethod` mutation、`checkoutSplitted` mutation 已就绪（Task1-7）。
- 本地 `graphql.schema.json` 已用脚本注入 `OrderBox` 类型 + 上述 3 个操作（代码生成需要）。

### 8.1 前端改动清单
- **`layers/base/gql/queries/order.gql`**：新增 `GetOrderBoxes` 查询；`SetOrderBoxShippingMethod` mutation（返回 Order，注意**非** ErrorResult 联合，勿 `... on ErrorResult`）；`CheckoutSplitted` mutation（返回 `[Order!]!`）。
- **`types/order.ts`**：新增 `OrderBoxInfo` / `OrderBoxes` / `SetOrderBoxShippingMethodResult` / `CheckoutSplittedResult`，派生自 `.nuxt/gql/default`。
- **`types/general.ts`**：`CheckoutState` 增加可选 `placedOrderCode`（拆单后跳确认页用首单 code）。
- **`stores/useOrderStore.ts`**：新增 `orderBoxes` ref（默认 `[]`）；`fetchOrderBoxes()`；`setOrderBoxShippingMethod(boxKey, methodId, pickupId?)`；`checkoutSplitted(method, metadata?)`（成功后 order/orderBoxes 置空并返回已结算订单）。
- **新建 `components/checkout/BoxDeliveryBlock.vue`**：按箱渲染「物流配送方式（由 eligibleShippingMethods 映射名称）」+「自提点」两个子选择区；选择即调 `setOrderBoxShippingMethod` 写库；onMounted 按 `defaultShippingMethodId` 兜底应用；注册 `submitDelivery` 校验每箱已有生效配送方式。
- **`components/checkout/PaymentBlock.vue`**：支付方式列表取「全箱 `availablePaymentMethodCodes` 并集」∩ eligiblePaymentMethods；默认优先余额（可跨租户/跨档案合单）；提交改走 `checkoutSplitted` 并把首单 code 写入 `placedOrderCode`。
- **`components/checkout/CheckoutLayoutJd.vue`**：改用 `BoxDeliveryBlock`；存在物流箱时展示 `AddressBlock`；移除对全局 deliveryMode 的依赖。
- **`pages/checkout/index.vue`**：`submitJd` 按「(物流箱)地址 → 各箱配送 → 支付(拆单)」门闩式推进；`successRedirect` 优先用 `placedOrderCode`，活动订单已置空时回退 `activeOrder.code`。

### 8.2 提交
- `checkoutSplitted` 仅在已 `ArrangingPayment` 的单上逐单结算；余额单选余额 → 后端返回 1 单（不拆）。
- 混合车选非余额 → 后端批量拆单返回多单；前端只结算一次 mutation，用首单 code 跳确认页。
- **验收**：`npx nuxt prepare` 成功；`npx nuxi typecheck` 对本次改动文件无类型错误（仓库既有 home/spec 等预存告警不计）。

### 8.3 待办
- 后端新 schema 需部署（git pull + pm2 restart）后，本地 `npx nuxt prepare` 才能以线上真实 schema 校验；当前本地 schema.json 已注入以便离线开发。
- 完整构建 + deploy（遵循部署铁律：本地构建、提交 dist、服务器仅 pull + restart）。前端结算改造不在本次范围。