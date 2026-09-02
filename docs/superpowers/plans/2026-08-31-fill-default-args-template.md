# 从模板补全缺省参数（fillDefaultArgs）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"从模板创建配送/支付方式"时，入库的 `checker`/`handler` 参数必然完整——缺失参数用定义 `defaultValue` 补齐，杜绝因 `orderMinimum` 缺失导致 `subTotalWithTax >= undefined` 恒不合格的同类问题。

**Architecture:** 新增纯函数 `fillDefaultArgs(operation, defs)`，按 `code` 在注册的配送/支付配置定义中查找，把缺失参数按 `defaultValue` 补齐（幂等、不覆盖已传值、无默认值的缺失项不补）。在 `ShippingTemplateService` 与 `PaymentTemplateService` 从模板创建方式时调用该函数后再交给核心 `create()`。另给 `tiered-shipping-eligibility-checker` 加 `?? 0` 空保护。

**Tech Stack:** TypeScript、NestJS、Vendure core（ConfigService / ShippingMethodService / PaymentMethodService）、vitest（cjk-plugin `src/**/*.spec.ts`）。

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `d:\zhao\vendure\packages\cjk-plugin\src\common\fill-default-args.ts` | 新建 | 纯函数：按定义补齐 operation 缺失参数的 defaultValue |
| `d:\zhao\vendure\packages\cjk-plugin\src\common\fill-default-args.spec.ts` | 新建 | `fillDefaultArgs` 单测 |
| `d:\zhao\vendure\packages\cjk-plugin\src\shipping\shipping-template.service.ts` | 修改 | 创建配送方式前对 `template.checker` 补全 |
| `d:\zhao\vendure\packages\cjk-plugin\src\payment\payment-template.service.ts` | 修改 | 创建支付方式前对 `template.handler`/`template.checker` 补全 |
| `d:\zhao\vendure\packages\cjk-plugin\src\shipping\tiered-shipping-eligibility-checker.ts` | 修改 | `orderMinimum` 空保护 |
| `d:\zhao\vendure\packages\cjk-plugin\src\shipping\tiered-shipping-eligibility-checker.spec.ts` | 新建 | 回归测试 |

---

### Task 1: 新建纯函数 `fillDefaultArgs` 及其单测

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\common\fill-default-args.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\common\fill-default-args.spec.ts`

- [ ] **Step 1: 写失败测试**

Test: `d:\zhao\vendure\packages\cjk-plugin\src\common\fill-default-args.spec.ts`

```ts
import { describe, it, expect } from 'vitest';
import { fillDefaultArgs, OperationInput, OperationArgsDefLike } from './fill-default-args';

const defs: OperationArgsDefLike[] = [
    {
        code: 'default-shipping-eligibility-checker',
        args: { orderMinimum: { defaultValue: 0 } },
    },
];

const op = (arguments_: Array<{ name: string; value: string }>): OperationInput =>
    ({ code: 'default-shipping-eligibility-checker', arguments: arguments_ });

describe('fillDefaultArgs', () => {
    it('缺省参数时为缺失项补 defaultValue', () => {
        const result = fillDefaultArgs(op([]), defs);
        expect(result?.arguments).toContainEqual({ name: 'orderMinimum', value: '0' });
    });

    it('已传值的参数不被覆盖', () => {
        const result = fillDefaultArgs(op([{ name: 'orderMinimum', value: '99' }]), defs);
        expect(result?.arguments).toEqual([{ name: 'orderMinimum', value: '99' }]);
    });

    it('code 不匹配时原样返回', () => {
        const result = fillDefaultArgs(
            { code: 'unknown-checker', arguments: [] },
            defs,
        );
        expect(result).toEqual({ code: 'unknown-checker', arguments: [] });
    });

    it('null/undefined 返回 null', () => {
        expect(fillDefaultArgs(null, defs)).toBe(null);
        expect(fillDefaultArgs(undefined, defs)).toBe(null);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run test -- fill-default-args`
Expected: FAIL —— `Cannot find module './fill-default-args'`（模块尚未创建）

- [ ] **Step 3: 实现最小代码**

Create: `d:\zhao\vendure\packages\cjk-plugin\src\common\fill-default-args.ts`

```ts
export interface OperationArgValue {
    name: string;
    value: string;
}

export interface OperationInput {
    code: string;
    arguments: OperationArgValue[];
}

export interface OperationArgsDefLike {
    code: string;
    args: Record<string, { defaultValue?: unknown } | undefined>;
}

/**
 * 把 operation（checker/handler）按定义补全缺失参数的 defaultValue。
 * - 幂等：只补缺失项，已传值不覆盖。
 * - 定义中无 defaultValue 且未传的参数不补，保持原样。
 * - 查不到对应 code 的定义时原样返回。
 */
export function fillDefaultArgs<T extends OperationInput | null | undefined>(
    operation: T,
    defs: ReadonlyArray<OperationArgsDefLike>,
): OperationInput | null {
    if (operation == null) return null;
    const def = defs.find((d) => d.code === operation.code);
    if (!def) return operation;

    const existNames = new Set(operation.arguments.map((a) => a.name));
    const extra: OperationArgValue[] = [];
    for (const [name, argDef] of Object.entries(def.args ?? {})) {
        if (existNames.has(name)) continue;
        if (argDef && argDef.defaultValue !== undefined) {
            extra.push({ name, value: String(argDef.defaultValue) });
        }
    }
    if (extra.length === 0) return operation;
    return { ...operation, arguments: [...operation.arguments, ...extra] };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run test -- fill-default-args`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/common/fill-default-args.ts packages/cjk-plugin/src/common/fill-default-args.spec.ts
git commit -m "feat(cjk): add fillDefaultArgs helper to default-fill config op args"
```

---

### Task 2: 配送模板创建配送方式前补全 checker

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\shipping-template.service.ts`
- Tools: `d:\zhao\vendure\packages\cjk-plugin\src\common\fill-default-args.ts`（Task 1）

- [ ] **Step 1: 注入 ConfigService 并补全 checker**

修改 `d:\zhao\vendure\packages\cjk-plugin\src\shipping\shipping-template.service.ts`：

a) 顶部 import 增加 `ConfigService`：

```ts
import {
    Channel,
    ConfigService,
    EntityNotFoundError,
    ID,
    ...
} from '@vendure/core';
import { ShippingTemplate } from './shipping-template.entity';
import { fillDefaultArgs } from '../common/fill-default-args';
```

b) constructor 增加注入：

```ts
constructor(
    private connection: TransactionalConnection,
    private shippingMethodService: ShippingMethodService,
    private configService: ConfigService,
) {}
```

c) `createShippingMethodFromTemplate` 中把 `checker: template.checker` 改为补全后的值：

```ts
const shippingMethod = await this.shippingMethodService.create(ctx, {
    code,
    translations: [
        {
            languageCode: ctx.languageCode,
            name,
            description: template.description,
        },
    ],
    fulfillmentHandler: template.fulfillmentHandler,
    checker:
        fillDefaultArgs(template.checker, this.configService.shippingOptions.shippingEligibilityCheckers as any) ??
        undefined,
    calculator: template.calculator,
});
```

> `fillDefaultArgs` 接收任意含 `code`/`args` 的对象，`ShippingEligibilityChecker` 满足该形状，`as any` 用于消除只读/泛型差异；返回 `null` 时转成 `undefined` 以匹配 `create` 入参。

- [ ] **Step 2: 编译确认无类型错误**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npx tsc -p tsconfig.build.json --noEmit`
Expected: 无报错

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/shipping/shipping-template.service.ts
git commit -m "feat(cjk): default-fill checker args when creating shipping method from template"
```

---

### Task 3: 支付模板创建支付方式前补全 handler/checker

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\payment\payment-template.service.ts`
- Tools: `d:\zhao\vendure\packages\cjk-plugin\src\common\fill-default-args.ts`（Task 1）

- [ ] **Step 1: 注入 ConfigService 并补全 handler/checker**

修改 `d:\zhao\vendure\packages\cjk-plugin\src\payment\payment-template.service.ts`：

a) import 增加 `ConfigService` 与 `fillDefaultArgs`：

```ts
import {
    Channel,
    ConfigService,
    EntityNotFoundError,
    ID,
    ...
} from '@vendure/core';
import { PaymentTemplate } from './payment-template.entity';
import { fillDefaultArgs } from '../common/fill-default-args';
```

b) constructor 增加注入：

```ts
constructor(
    private connection: TransactionalConnection,
    private paymentMethodService: PaymentMethodService,
    private configService: ConfigService,
) {}
```

c) `createPaymentMethodFromTemplate` 中补全 handler 与 checker：

```ts
const paymentMethod = await this.paymentMethodService.create(ctx, {
    code,
    enabled: true,
    handler:
        fillDefaultArgs(template.handler, this.configService.paymentOptions.paymentMethodHandlers as any) ??
        (template.handler as any),
    checker:
        fillDefaultArgs(template.checker, this.configService.paymentOptions.paymentMethodEligibilityCheckers as any) ??
        undefined,
    translations: [
        {
            languageCode: ctx.languageCode,
            name,
            description: template.description,
        },
    ],
});
```

> `handler` 必填，`fillDefaultArgs` 返回 `null`（即模板 handler 为 null）时回退原值；实际模板 handler 非空。checker 可空，返回 `null` → `undefined`。

- [ ] **Step 2: 编译确认无类型错误**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npx tsc -p tsconfig.build.json --noEmit`
Expected: 无报错

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/payment/payment-template.service.ts
git commit -m "feat(cjk): default-fill handler/checker args when creating payment method from template"
```

---

### Task 4: `tiered-shipping-eligibility-checker` 空保护 + 回归测试

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\tiered-shipping-eligibility-checker.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\tiered-shipping-eligibility-checker.spec.ts`

- [ ] **Step 1: 写回归测试**

Test: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\tiered-shipping-eligibility-checker.spec.ts`

```ts
import { describe, it, expect } from 'vitest';
import { tieredShippingEligibilityChecker as checker } from './tiered-shipping-eligibility-checker';

const check = checker.check as unknown as (ctx: unknown, order: any, args: any) => Promise<boolean | string>;

describe('tieredShippingEligibilityChecker', () => {
    it('缺 orderMinimum 时按 0 处理（无门槛，允许）', async () => {
        const result = await check({}, { subTotalWithTax: 100 }, {});
        expect(result).toBe(true);
    });

    it('orderMinimum 显式门槛达标时允许', async () => {
        const result = await check({}, { subTotalWithTax: 200 }, { orderMinimum: 100 });
        expect(result).toBe(true);
    });

    it('orderMinimum 显式门槛未达标时拒绝', async () => {
        const result = await check({}, { subTotalWithTax: 50 }, { orderMinimum: 100 });
        expect(result).toBe(false);
    });
});
```

- [ ] **Step 2: 运行测试确认当前行为**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run test -- tiered-shipping`
Expected: PASS（三个用例在当前实现下已通过，属回归保护）

- [ ] **Step 3: 加空保护**

修改 `tiered-shipping-eligibility-checker.ts` 的 `check`，将金额门槛条件改为：

```ts
check: (ctx, order, args) => {
    // 1. 金额门槛检查（缺参按 0 处理，避免与默认无门槛期望不一致）
    const orderMinimum = args.orderMinimum ?? 0;
    if (orderMinimum > 0 && order.subTotalWithTax < orderMinimum) {
        return false;
    }

    // 2. 区域排除检查
    if (args.excludedAreas) {
        const shippingAddress = (order as any).shippingAddress;
        if (!shippingAddress) return true; // 未设置地址时允许
        const province = shippingAddress.province || '';
        if (!province) return true;
        const excludedList = String(args.excludedAreas).split(',').map(s => s.trim()).filter(Boolean);
        const isExcluded = excludedList.some(area => province.includes(area));
        if (isExcluded) return false;
    }

    return true;
},
```

- [ ] **Step 4: 再次运行测试确认仍通过**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run test -- tiered-shipping`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/shipping/tiered-shipping-eligibility-checker.ts packages/cjk-plugin/src/shipping/tiered-shipping-eligibility-checker.spec.ts
git commit -m "fix(cjk): null-guard orderMinimum in tiered shipping eligibility checker"
```

---

### Task 5: 全量测试 + 本地构建 + 部署 + 结算回归

**Files:**
- Build: `d:\zhao\vendure\packages\cjk-plugin`

- [ ] **Step 1: 全量单测**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run test`
Expected: 全部通过（含既有 spec 与新增 spec）

- [ ] **Step 2: 本地构建 cjk-plugin**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npx tsc -p tsconfig.build.json`
Expected: 生成 `dist/` 产物，无错误

- [ ] **Step 3: 部署到服务器**

遵循既定部署铁律（本地构建产物 → 服务器 `git pull` + `pm2 restart`，绝不在服务器构建）：

```bash
# 1) 提交本地（Task 1-4 已完成）
# 2) 上传 dist 产物与本次改动
cd d:\zhao\vendure
git add -A
git commit -m "chore: build dist for fill-default-args hardening" || true
# 3) 服务器同步 pull + restart
#    （具体路径/方式沿用本会话既定脚本，如 scp dist 后再在服务器 git pull，随后 pm2 restart 相应进程）
```

Expected: 服务器进程重启成功，无启动错误

- [ ] **Step 4: 构造缺参模板并验证补全落库**

在服务器用 Admin API 构造一个 `checker.arguments = []` 的配送模板 → 调用 `createShippingMethodFromTemplate`（或通过 Admin 侧的"从模板创建配送方式"按钮）→ 查询新建配送方式，断言 `checker.args` 含 `orderMinimum=0`。

- [ ] **Step 5: 手机视口截图回归结算页**

用既有截图脚本（`d:\zhao\nshop\scripts\_shot_type_scenarios.py` 风格）在手机视口（390×844，dpr=2）截取结算页各场景（纯物流 / 纯自提 / 混购）：
Expected: 配送方式显示名称（非数字 ID），可正常选择，下单不报 `INELIGIBLE_SHIPPING_METHOD_ERROR`。截图并入操作手册。