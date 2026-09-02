# 设计：从模板创建配送/支付方式时补全缺省参数（defaultValues）

日期：2026-08-31

## 背景与问题

结算时曾出现 `INELIGIBLE_SHIPPING_METHOD_ERROR`：配送方式 9（快递配送）使用了
`default-shipping-eligibility-checker`，但创建时 `args` 为空
（`arguments: []`），导致运行时 `order.subTotalWithTax >= undefined` 恒为
`false`，下单失败。

根因：`ShippingTemplateService.createShippingMethodFromTemplate()` 会把模板里的
`checker` 原样透传给 `shippingMethodService.create()`，而 Vendure 核心的
`ConfigArgService.parseInput()` **不会自动注入 `defaultValue`**，只保留输入中
存在的参数。因此只要模板里 `checker.arguments` 缺失某项，入库的配送方式就缺参数。

已做的临时修复：
- 通过 Admin API 为方式 9 补充 `orderMinimum=0`。
- 核心 `default-shipping-eligibility-checker` 的 check 改为
  `order.subTotalWithTax >= (args.orderMinimum ?? 0)`。

但仍是"手改存量 + 单个 checker 防空"，没有从源头杜绝，且
`tiered-shipping-eligibility-checker` 尚缺空保护。

## 目标

让"从模板创建配送/支付方式"的路径入库的 `checker`/`handler` 参数必然完整：
缺失参数一律用其定义的 `defaultValue` 补齐，杜绝同类问题再次出现。

## 范围

- 配送侧：`ShippingTemplateService.createShippingMethodFromTemplate()`
- 支付侧：`PaymentTemplateService.createPaymentMethodFromTemplate()`
- 空保护：`tiered-shipping-eligibility-checker`

不动核心库、不动配送/支付档案（档案只是引用已有方式，本身安全）。

## 方案

### 1. 补全纯函数 `fillDefaultArgs`

放在 cjk-plugin 公共位置，可复用、幂等：

```ts
/**
 * 将 operation（checker/handler）按定义补齐缺失参数的 defaultValue。
 * 已传入值的参数不覆盖；定义中无 defaultValue 且未传的参数保持原样。
 */
export function fillDefaultArgs(
  def: { args: Record<string, { defaultValue?: unknown }> },
  operation: { code: string; arguments: Array<{ name: string; value: string }> },
): { code: string; arguments: Array<{ name: string; value: string }> }
```

- 遍历 `def.args` 的每个 name；
- 若 `operation.arguments` 已有同名参数 → 跳过；
- 若该参数在 `def.args[name].defaultValue` 存在 → 补一条
  `{ name, value: String(defaultValue) }`；
- 否则（无 default 又未传）不补。

### 2. 缺省值来源

注入 `ConfigService`，按 `code` 在以下定义数组中查找对应 `ConfigurableOperationDef`：

- 配送 checker：`configService.shippingOptions.shippingEligibilityCheckers`
- 支付 handler：`configService.paymentOptions.paymentMethodHandlers`
- 支付 checker：`configService.paymentOptions.paymentMethodEligibilityCheckers`

查不到对应定义时按"无法补全"处理，原样透传给核心 `parseInput()`（必填缺参会抛错，
可选缺参继续）。

### 3. 改造两个模板服务

- `ShippingTemplateService.createShippingMethodFromTemplate()`
  - 创建前：`template.checker` 经 `fillDefaultArgs` 补全后再作为 `checker` 传入
    `shippingMethodService.create()`。
- `PaymentTemplateService.createPaymentMethodFromTemplate()`
  - 创建前：`template.handler` 与 `template.checker`（若存在）各经
    `fillDefaultArgs` 补全后再传入 `paymentMethodService.create()`。

### 4. tiered checker 空保护

`tiered-shipping-eligibility-checker` 的 `check`：

```ts
const orderMinimum = args.orderMinimum ?? 0;
if (orderMinimum > 0 && order.subTotalWithTax < orderMinimum) return false;
```

防止参数缺失时行为与"无门槛"默认期望不一致。

## 错误处理

- 补全幂等、只补缺失，不覆盖已传值。
- 定义查找失败时静默放行给核心校验，不吞必填错误。

## 测试

1. 构造 `arguments: []` 的配送模板 → `createShippingMethodFromTemplate` → 断言入库
   `checker.args` 含 `orderMinimum=0`。
2. 支付模板同理，断言 `handler`/`checker` 参数补齐。
3. 手机视口截图回归结算页：配送方式正常显示名称、下单正常、不报
   `INELIGIBLE_SHIPPING_METHOD_ERROR`。