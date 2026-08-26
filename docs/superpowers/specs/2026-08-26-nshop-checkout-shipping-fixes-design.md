# nshop 购买流程完善：配送方式即时生效 + 空态引导 + 自提免配 + 加购优化 · 设计文档

- 日期：2026-08-26
- 状态：待批准（用户已拍板方案，本文件固化设计）
- 范围：nshop（Nuxt 分层电商 C 端）`layers/base` 的加购与结算（选配送方式）流程
- 性质：**全部为对现有代码的完善**，无全新模块开发

---

## 1. 背景与目标

nshop 购买关键链路为：加购（`CartAddButton` → `useOrderStore.addItemToOrder`）→ 结算页
（`pages/checkout/index.vue`：地址 → 配送方式 → 自提点 → 支付）。

审查发现以下卡点，影响购买转化与体验：

| # | 卡点 | 位置 | 影响 |
| --- | --- | --- | --- |
| ②a | 切换配送方式不即时生效 | `checkout/ShippingForm.vue` + `useCheckout.ts` | 选了配送方式**不调用 `setShippingMethod`**、运费/应付金额不实时刷新；且 `useCheckout` 对 `shippingMethodId` 的 watch 误触发 `setOrderShippingAddress`（只改地址、不动方式），产生多余请求 |
| ②b | 配送方式为空时静默卡死 | `ShippingForm.vue` `onSubmit` | `if(!shippingMethodId) return` 无任何提示，自提单/未配置配送方式的渠道用户卡在结算页不知原因 |
| ①a | 加购数量硬编码上限 10 | `cart/CartAddButton.vue` `:max="10"` | 与库存无关，多件商品无法一次加购 |
| ①b | 部分满足库存无提示 | `stores/useOrderStore.ts` `addItemToOrder` | `partial`（`InsufficientStockError`）仅 TODO 注释，用户无感知 |

目标：把「加购」「选配送方式」两处推进到流畅无卡；门店自提单不再强制选配送方式。

---

## 2. 已确认决策

| 决策点 | 结论 |
| --- | --- |
| ②a 配送方式切换即时生效 | **必做**：切换时实时 `setShippingMethod`，用返回的新 Order 刷新运费/应付金额 |
| ②b 配送方式空态提示 | **必做**：无可配送方式时给明确提示/引导，不再静默 return |
| 自提单改为免配 | **必做**：`deliveryType=pickup` 时跳过配送方式必填校验与提交 |
| ①a 加购数量上限动态化 | 顺带完善：上限改为跟随可用库存，去除硬编码 10 |
| ①b `partial` 调整提示 | 顺带完善：加到购物车时给"部分加入/库存仅余 N"提示 |

---

## 3. 现状还原（代码依据）

### 3.1 加购
- `CartAddButton.vue`：`addToCart()` → `addItemToOrder(variantId, quantity)`；`UInputNumber :max="10"`。
- `useOrderStore.addItemToOrder`：调 `GqlAddItemToOrder` → `useOrderMutation(order, result)`；`partial` 时只读 `quantityAvailable` 但不对外暴露，未提示用户。

### 3.2 选配送方式
- `ShippingForm.vue`（setup）：
  - `await orderStore.getShippingMethods()`；`state.shippingMethodId = shippingMethods[0]?.value ?? ""`；`await setShippingMethod(默认)`。
  - `URadioGroup v-model="state.shippingMethodId"` **无 @change 逻辑**。
  - `onSubmit`：`if(!state.shippingMethodId) return;`（静默）；否则 `setShippingMethod` 后 `isSubmitted=true`。
  - validator（`validators/shippingForm.ts`）：`shippingMethodId` 为 `nonEmpty("Please select a shipping method")` 必填。
- `useCheckout.ts` watch：`shippingForm.shippingMethodId` 变化 → `recalcShipping()`（仅 `setOrderShippingAddress`）。

### 3.3 自提
- `PickupLocationSelect.vue`：单选自提点 → `setPickupLocation(id,type)` + 兜底 `setOrderShippingAddress`；`isPickup` 由 `order.customFields?.deliveryType==="pickup"` 或选中 id 判定（组件内 ref）。
- `checkout/index.vue onSubmit`：顺序 `address→shipping→payment`，全部 `isSubmitted.xxx && ` 才结算；自提单**仍会走 shipping 校验**，被 `nonEmpty` 拦截。
- Order 自定义字段 `customFields.deliveryType` 已在 syncOrderLocation / setPickupLocation 写入（ActiveOrder 可读，见 `useCheckout.syncOrderLocation` 代码引用）。

### 3.4 订单合计刷新
- `useOrderMutation` 于 `typename==="Order"` 时 `order.value = result`（整体替换），`InsufficientStockError` 会替换 `order` 并返回 `{status:"partial", quantityAvailable}`；其余错误类型返回 `{status:"error"}`。
- `OrderSummary.vue` 的 `shippingWithTax/totalWithTax` 为 `activeOrder` 的 computed → **订单 ref 更新即自动刷新合计**。因此 `setShippingMethod` 成功（返回 Order）后无需手动重取，合计自动变。

---

## 4. 模块设计

### A · 配送方式切换即时生效（②a）

**目标**：用户切换配送方式 → 立即调用 `setShippingMethod`，返回的新 Order 驱动运费/应付金额实时刷新。

改动：
1. **`checkout/ShippingForm.vue`**：给 `URadioGroup`（两处：lg 横 / 其余竖）绑定 `@update:model-value`（或 `@change`），回调执行：
   ```ts
   async function onMethodChange(id: string) {
     if (!id || id === state.shippingMethodId) return;
     orderStore.error = null;
     await orderStore.setShippingMethod(id);
     if (orderStore.error) {
       // 方式不可用（IneligibleShippingMethodError 等）→ 回退上一方式并提示
       toast.add({ title: '配送方式不可用', description: orderStore.error, color: 'error' });
       // state.shippingMethodId 由返回失败时后段还原（见下行）
     }
   }
   ```
   失败时需还原 select 值：因 `state.shippingMethodId` 仍是旧值（v-model），但 UI 已切换，可在 error 分支 `state.shippingMethodId = '' ` 触发 `setShippingMethod('')`？不可取。改为：成功后 v-model 自然更新；失败时显式 `state.shippingMethodId` 回填失败前的最后一次成功 id（用一个 `lastAppliedId` 引用记录）。

2. **`useCheckout.ts`**：移除对 `shippingForm.shippingMethodId` 的 watch（其语义是"改地址"，与方式切换无关，且造成切换时多余 `setOrderShippingAddress`）。保留对 `postalCode` 的 watch → `recalcShipping()`（地址变化后重设收货地址；配送方式随地址的重新拉取见「范围外」）。

3. 进结算时默认方式：保留现有"组件 setup 里对首个默认方式 setShippingMethod 一次"，作为首次进入即应用默认配送方式（合理）。

**效果**：选方式即重算合计；最多一次请求（去掉了 watch 触发的重复 setAddress）。

### B · 配送方式空态引导（②b）

**目标**：无可配送方式时，不再静默卡死，给明确提示并可引导切自提。

改动：
1. `ShippingForm.vue`：当 `shippingMethods.length === 0` 时，在表单顶部渲染提示条：
   - 文案："当前收货地址暂无可配送方式，可尝试上方「门店自提 / 自提点」，或填写其他收货地址。"
   - 样式黄/灰信息条（复用现有 UI 组件如 `UAlert`/`UBadge`）。
2. `onSubmit` 改造：
   ```ts
   async function onSubmit() {
     if (isPickup) { isSubmitted.value = true; return; }   // 自提免配（见 C）
     if (!state.shippingMethodId) {
       orderStore.error = '请选择配送方式，或切换为门店自提';
       toast.add({ title: t('messages.general.shippingSelect'), description: orderStore.error, color: 'error' });
       return;
     }
     await orderStore.setShippingMethod(state.shippingMethodId);
     if (orderStore.error) return;
     isSubmitted.value = true;
   }
   ```

### C · 自提免配（②b 的配套）

**目标**：`deliveryType=pickup` 的自提单不用选配送方式，跳过校验与提交。

改动：
1. 新增共享判定 `useIsPickup()`（composable，或直接在组件用 `orderStore.order?.customFields?.deliveryType === 'pickup'`）：
   ```ts
   export function useIsPickup() {
     const orderStore = useOrderStore();
     return computed(() => (orderStore.order?.customFields?.deliveryType ?? '') === 'pickup');
   }
   ```
2. `validators/shippingForm.ts`：必填改为运行时按自提态跳过——valibot 不便读运行时 state，故改为**不改 schema，改提交流**：
   - `checkout/index.vue onSubmit`：若 `isPickup`，`isSubmitted.shipping = true`（跳过）。
   - `ShippingForm.onSubmit`：若 `isPickup` 直接置 `isSubmitted=true` 并 return（不触发表单校验拦截）。为放行校验，可在 `onSubmit` 里先行 return，使 `submit()` 不被调用。
   - `ShippingForm.vue` 模板：自提时隐藏"配送方式"选择块，展示"门店自提"徽标或隐藏（避免空态误导）。

### D · 加购数量上限动态化（①a）

**目标**：`UInputNumber` 上限跟随可用库存，去掉写死 10。

改动（`cart/CartAddButton.vue`）：
1. `max` 改为 `maxStock`：优先取 `selectedVariant.stockOnHand`（需 introspection 确认 schema 暴露数字库存字段；若 `selectedVariant` 无该字段，回退到合理上限 `99`，让后端 `InsufficientStockError` 兜底）。
2. 顺带：`min` 保留 1；当 `stockLevel === 'OUT_OF_STOCK'` 保持禁用。

> **执行时 introspection 校准**：确认 `ProductVariant` 是否含 `stockOnHand`/`stockAllocated`/`stockLevel` 之外的可用数字。探测脚本见计划 Task1 探针。

### E · `partial` 调整提示（①b）

**目标**：加入时部分满足库存，明确告知"仅加入 N 件"。

改动：
1. `stores/useOrderStore.addItemToOrder`：返回本次结果的 `OrderStatus`（把 `useOrderMutation` 的返回透出），并在 `partial` 时同时保留 `quantityAvailable`。
2. `cart/CartAddButton.vue` `addToCart`：按返回状态处理：
   - `status==='partial'` → toast "库存不足，已加入 N 件"。
   - `error` → 现有 `error` watch 的 toast 保留。
3. 可有可无：`CartPanel`/加购后同步刷新购物车数量（现有 `CartTrigger` 依赖 order 变化，天然更新，无需新增）。

---

## 5. 错误处理

- `setShippingMethod` 返回 `IneligibleShippingMethodError`（地址与方式不匹配）时：SHIPForm 提示明确原因，并回退选择到上一次成功方式。
- 配送方式为空且非自提：B 的空态提示 + onSubmit 明确错误 toast，不再静默。
- 自提切换后回到普通配送：`isPickup=false` 时恢复配送方式校验；若此前已 `isSubmitted.shipping=true` 需复位，避免残留通过态（在 checkout onSubmit 里用响应式 `isSubmitted.shipping` 依据 `isPickup` 重算）。
- GraphQL 错误统一走现有 `useOrderStore.error` 与 toast 呈现。

---

## 6. 测试 / 验收

- 本地 `pnpm dev`（nshop）后浏览器/agent-browser 走通：
  1. 有可用配送方式的渠道：选方式 → 应付金额/运费**即时刷新**，确认无重复地址请求（Network 观察）。
  2. 无配送方式渠道：结算页展示"暂无可配送方式"引导，可切换到自提完成下单。
  3. 门店自提单：不出现配送方式必填卡点，直接进入支付并下单成功。
  4. 加购：多件商品数量上限不再固定 10（跟随库存/放宽到 99）；加入超出库存数量时提示"仅加入 N 件"。
- 探针脚本：introspection 确认 `ProductVariant.stockOnHand`、`setOrderShippingMethod` 返回 union 中含 `Order` 与 `IneligibleShippingMethodError`、`Order.customFields.deliveryType` 可读。

---

## 7. 范围外（YAGNI）

- 不重构 valibot schema 为运行时动态校验（用提交流处理自提免配，改动更小）。
- 不做"地址变化后重拉可用配送方式列表并自动切换"（现状保留；改地址只重设收货地址）。此项若影响体验可后续单独立项。
- 不新增优惠券真实逻辑（`OrderSummary` 优惠券输入本就未接线，与本次无关）。
- 不做购物车合并跨设备等后端能力（非本链路卡点）。

---

## 8. 涉及文件

- `layers/base/app/components/cart/CartAddButton.vue`（改，D/E）
- `layers/base/app/components/checkout/ShippingForm.vue`（改，A/B/C）
- `layers/base/app/composables/useCheckout.ts`（改，A：移除方式 watch）
- `layers/base/app/pages/checkout/index.vue`（改，C：isSubmitted.shipping 依 isPickup 跳过）
- `layers/base/stores/useOrderStore.ts`（改，E：addItemToOrder 返回 status；透出 quantityAvailable）
- `layers/base/validators/shippingForm.ts`（不改或仅注释说明；自提放行走提交流）
- 新增（可选）：`layers/base/app/composables/useIsPickup.ts`（C 共享判定）
- 探针：`_probe_checkout_schema.mjs`（执行后删除）

---

## 自检

- **明确"完善 vs 全新"**：所有条目均为对现有 nshop 代码的完善，无新模块。✓
- **无占位**：每项给出具体文件/逻辑/文案；唯一不确定的 schema 字段（`stockOnHand`）已标注 introspection 探针。✓
- **一致性**：自提免配 C 与 B 空态、A 即时生效在 `ShippingForm.onSubmit` 内统一分支；合计刷新依赖 `useOrderMutation` 的 `Order` 整体替换这一既有行为。✓
- **范围聚焦**：未扩大至地址变化重拉配送方式（范围外单列）。✓