# 订单详情中式增强（京东风）+ 自提核销码机制升级 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在京东 `jd` 版式内做中式增强，并把自提核销码升级为「有效期/过期待处理/作废重发/一次性核销」的可视化高光卡。

**Architecture:** 后端 extended cjk-plugin redemption（System 2）：新增 `redeemExpiresAt/redeemVersion/redeemReissuedAt` 三字段，服务层计算状态、`reissue` 以覆盖密文+指纹的方式天然作废旧码、`claim` 幂等 + 已核销禁重发形成一次性闭环；状态推导用纯函数便于 TDD。前端 `jd` 版式内 `OrderRedemptionCard` 重写为五状态机高光卡，`utils/order-config.ts` 扩展 L3 块级定制，i18n 双语言同步。

**Tech Stack:** NestJS（cjk-plugin，vitest）、Vendure `ConfigService`/`TransactionalConnection`、GraphQL（shop+admin 双 schema）、Nuxt 3 `layers/base`、vue-i18n、QRCode（前端 qrcode）、Tailwind（前置 Nuxt UI）。

**跨仓库约定**：后端 = `d:\zhao\vendure\packages\cjk-plugin`（提交 `lib/`，服务器 `git pull` + `pm2 restart vendure --update-env`，**绝不在服务器构建**）；前端 = `d:\zhao\nshop`（`node scripts/deploy.mjs` 本地构建→scp）。

---

## 文件结构

**后端（cjk-plugin，`d:\zhao\vendure\packages\cjk-plugin\src\`）**
- 改 `redemption/redemption-crypto.ts`：新增纯函数 `computeRedemptionStatus`（状态推导，TDD 对象）。
- 改 `redemption/redemption-crypto.spec.ts`：`computeRedemptionStatus` 单测。
- 改 `order/order-custom-fields.ts`：追加 `redeemExpiresAt/redeemVersion/redeemReissuedAt` 三字段。
- 改 `redemption/redemption-code.service.ts`：构造注入 `ConfigService`；`ensure` 写有效期/版本；`getWithQr` 返回状态；新增 `reissue`；`claim` 禁已核销重发。
- 改 `redemption/redemption.schema.ts`：`OrderRedemptionResult`/`RedemptionLookupResult` 补字段；Admin 增 `redemptionReissue` mutation。
- 改 `redemption/redemption.resolver.ts`：`orderRedemptionCode` 下发状态字段；`redemptionLookup` 补状态；新增 `redemptionReissue` resolver。

**前端（nshop，`d:\zhao\nshop\layers\base\`）**
- 改 `app/utils/order-config.ts`：`OrderBlockCfg` 增 `highlight/fontScale/cardRadius`。
- 改 `app/components/order/OrderDetailRedemptionBlock.vue`：透传高光卡配置 + 门店名。
- 改 `app/components/order/OrderRedemptionCard.vue`：重写为五状态机高光卡。
- 改 `gql/queries/OrderRedemptionCode.gql`：补 `status/expiresAt/reissueable/version`。
- 改 `gql/queries/AdminRedemption.gql`：`AdminRedemptionReissue` mutation + Lookup 补状态。
- 改 `app/pages/admin/redemption.vue`：过期订单「重新生成」入口。
- 改 `i18n/locales/zh-CN.ts` + `en-US.ts`：补高光卡状态/提示/按钮词条（**双语言同步**）。

---

### Task 1: 后端纯函数「状态推导」+ TDD

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption-crypto.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption-crypto.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `redemption-crypto.spec.ts` 追加：

```ts
import { computeRedemptionStatus } from './redemption-crypto';

describe('computeRedemptionStatus', () => {
    const now = new Date('2026-09-03T12:00:00Z');
    it('claimed 优先级最高，返回 claimed', () => {
        expect(computeRedemptionStatus(true, '2026-09-10T12:00:00Z', now, 24)).toBe('claimed');
    });
    it('未核销且已过期返回 expired', () => {
        expect(computeRedemptionStatus(false, '2026-09-02T12:00:00Z', now, 24)).toBe('expired');
    });
    it('未核销且临期（剩余<=阈值）返回 expiring_soon', () => {
        // 剩余 12h < 24h 阈值
        expect(computeRedemptionStatus(false, '2026-09-04T00:00:00Z', now, 24)).toBe('expiring_soon');
    });
    it('未核销且临期（剩余==阈值边界）返回 expiring_soon', () => {
        const edge = new Date(now.getTime() + 24 * 3600_000);
        expect(computeRedemptionStatus(false, edge.toISOString(), now, 24)).toBe('expiring_soon');
    });
    it('未核销且未临期返回 active', () => {
        expect(computeRedemptionStatus(false, '2026-09-20T12:00:00Z', now, 24)).toBe('active');
    });
    it('无 expiresAt 视为未过期（active）兼容旧单', () => {
        expect(computeRedemptionStatus(false, null, now, 24)).toBe('active');
    });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest --config vitest.config.mts run src/redemption/redemption-crypto.spec.ts`
Expected: FAIL（`computeRedemptionStatus is not a function`）

- [ ] **Step 3: 实现纯函数**

在 `redemption-crypto.ts` 文件末尾追加：

```ts
export type RedemptionStatus = 'active' | 'expiring_soon' | 'expired' | 'claimed';

/** 状态推导为纯函数（服务/resolver 共用，TDD 友好）。阈值=剩余毫秒 <= remindHours 判断「即将过期」。 */
export function computeRedemptionStatus(
    claimed: boolean,
    expiresAtIso: string | null | undefined,
    now: Date,
    expireRemindHours: number,
): RedemptionStatus {
    if (claimed) return 'claimed';
    if (!expiresAtIso) return 'active';
    const expiresMs = new Date(expiresAtIso).getTime();
    if (now.getTime() >= expiresMs) return 'expired';
    const remainingMs = expiresMs - now.getTime();
    return remainingMs <= expireRemindHours * 3600_000 ? 'expiring_soon' : 'active';
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest --config vitest.config.mts run src/redemption/redemption-crypto.spec.ts`
Expected: PASS（6 个用例全绿；原有用例不破坏）

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/redemption/redemption-crypto.ts packages/cjk-plugin/src/redemption/redemption-crypto.spec.ts
git commit -m "feat(cjk-plugin): 核销码状态推导纯函数 + 单测"
```

---

### Task 2: 后端 Order 自定义字段（有效期/版本/重发时间）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\order\order-custom-fields.ts`

- [ ] **Step 1: 在核销字段组末尾追加三字段**

在 `redeemClaimedAt` 字段项之后、数组闭合 `];` 之前追加：

```ts
        {
            name: 'redeemExpiresAt',
            type: 'datetime',
            nullable: true,
            public: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '核销码有效期' }],
        },
        {
            name: 'redeemVersion',
            type: 'int',
            nullable: true,
            defaultValue: 1,
            public: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '核销码版本' }],
        },
        {
            name: 'redeemReissuedAt',
            type: 'datetime',
            nullable: true,
            public: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '重发时间' }],
        },
```

- [ ] **Step 2: 校验字段名类型**

Run: `rg -n "name: 'redeem(ExpiresAt|Version|ReissuedAt)'" packages/cjk-plugin/src/order/order-custom-fields.ts`
Expected: 输出三行（各字段唯一）。

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/order/order-custom-fields.ts
git commit -m "feat(cjk-plugin): Order 核销码新增有效期/版本/重发时间字段"
```

---

### Task 3: 后端 service 扩展（有效期、状态、reissue、claim 保护）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption-code.service.ts`

- [ ] **Step 1: 引入依赖与配置读取**

把构造签名改为注入 `ConfigService`，并加两个只读配置（Vendure `ConfigService.get` 用点路径从 runtime config 取值，未配置时返回默认）：

```ts
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService, ID, RequestContext, OrderService, TransactionalConnection, Order } from '@vendure/core';
import {
    generateRedemptionCode, encryptRedemptionCode, redemptionFingerprint,
    decryptRedemptionCode, redemptionQrPayload, redemptionBarcodePayload,
    computeRedemptionStatus, RedemptionStatus,
} from './redemption-crypto';

@Injectable()
export class RedemptionCodeService {
    private readonly keyHex: string;
    private readonly graceDays: number;
    private readonly expireRemindHours: number;

    constructor(
        private orderService: OrderService,
        private connection: TransactionalConnection,
        configService: ConfigService,
    ) {
        this.keyHex = process.env.REDEMPTION_KEY ?? '7'.repeat(64);
        if (process.env.REDEMPTION_KEY === undefined && process.env.NODE_ENV === 'production') {
            throw new Error('REDEMPTION_KEY 必须在生产环境注入（32 字节 hex）');
        }
        this.graceDays = Number(configService.get('pickup.redeemGraceDays')) || 7;
        this.expireRemindHours = Number(configService.get('pickup.redeemExpireRemindHours')) || 24;
    }
```

> TS 提示：`ConfigService.get` 的泛型 key 受 `RuntimeVendureConfig` 约束，`'pickup.redeemGraceDays'` 非内置 key，若类型检查报错，用 `Number((configService.get('pickup.redeemGraceDays' as any)) as any) || 7` 规避。

- [ ] **Step 2: `ensure` 写有效期 + 版本（幂等，历史单补算有效期）**

把 `ensure` 中的 `updateCustomFields` 调用改为同时写有效期与版本，并处理「已有码但缺 expiresAt」的历史单补算：

```ts
    private async writeExpiry(ctx: RequestContext, orderId: ID, placedAt: Date | null): Promise<void> {
        const base = placedAt ?? new Date();
        const expiresAt = new Date(base.getTime() + this.graceDays * 24 * 3600_000);
        // 多次调用的保持一致：字段级写 expiresAt，version 不在此递增（重发才 +1）
        await this.orderService.updateCustomFields(ctx, orderId, {
            redeemExpiresAt: expiresAt.toISOString(),
        } as any);
    }

    async ensure(ctx: RequestContext, orderId: ID): Promise<string> {
        const order = (await this.orderService.findOne(ctx, orderId, [])) as Order | undefined;
        if (!order) throw new Error('order not found');
        const cf = this.cf(order);
        if (cf.redeemCodeCipher && cf.redeemCodeIv) {
            // 历史单缺有效期：补算（幂等；已在生产跑过的单补上 graceDays 起算）
            if (!cf.redeemExpiresAt) {
                await this.writeExpiry(ctx, orderId, order.orderPlacedAt);
            }
            return decryptRedemptionCode(cf.redeemCodeCipher, cf.redeemCodeIv, this.keyHex);
        }
        const code = generateRedemptionCode();
        const { cipher, iv } = encryptRedemptionCode(code, this.keyHex);
        const channelToken = ctx.channel?.token ?? String(ctx.channelId ?? '');
        const hash = redemptionFingerprint(code, this.keyHex, channelToken);
        await this.orderService.updateCustomFields(ctx, orderId, {
            redeemCodeCipher: cipher,
            redeemCodeIv: iv,
            redeemCodeHash: hash,
            redeemExpiresAt: new Date((order.orderPlacedAt ?? new Date()).getTime() + this.graceDays * 24 * 3600_000).toISOString(),
            redeemVersion: 1,
            redeemReissuedAt: new Date().toISOString(),
        } as any);
        return code;
    }
```

> 原初生成的 `redeemReissuedAt` 记为「首次生成时间」，便于审计（语义：最近一次刷新）。
> `cf`/`orderPlacedAt`：`cf` 已存在；`orderPlacedAt` 为 `Order` 现有字段。

- [ ] **Step 3: `getWithQr` 返回状态 + 有效期 + 版本**

把返回值扩展（前端状态机数据源），并把 `ensure` 的缺码路径一并补有效期：

```ts
    async getWithQr(
        ctx: RequestContext,
        orderId: ID,
        orderCode: string,
    ): Promise<{
        code: string; qrPayload: string; barcode: string; claimed: boolean;
        status: RedemptionStatus; expiresAt: string | null; version: number; reissueable: boolean;
    }> {
        const order = (await this.orderService.findOne(ctx, orderId, [])) as Order | undefined;
        if (!order) throw new Error('order not found');
        const cf = this.cf(order);
        const code =
            cf.redeemCodeCipher && cf.redeemCodeIv
                ? decryptRedemptionCode(cf.redeemCodeCipher, cf.redeemCodeIv, this.keyHex)
                : await this.ensure(ctx, orderId);
        const claimed = !!cf.redeemClaimed;
        const expiresAt: string | null = cf.redeemExpiresAt ?? null;
        const version = Number(cf.redeemVersion) || 1;
        const now = new Date();
        const status = computeRedemptionStatus(claimed, expiresAt, now, this.expireRemindHours);
        return {
            code,
            qrPayload: redemptionQrPayload(orderCode, code, this.keyHex),
            barcode: redemptionBarcodePayload(orderCode, code),
            claimed,
            status,
            expiresAt,
            version,
            reissueable: !claimed,
        };
    }
```

- [ ] **Step 4: `claim` 加一次性保护**（核销后不再可核销——现有幂等已保证；明确抛语义化错误）与 `reissue` 实现

在 `claim` 后追加 `reissue`（作废重发：覆盖密文/指纹/有效期、递增版本）：

```ts
    async claim(ctx: RequestContext, orderId: ID): Promise<{ already: boolean; claimedAt: Date }> {
        const order = (await this.orderService.findOne(ctx, orderId, [])) as Order | undefined;
        if (!order) throw new Error('order not found');
        const cf = this.cf(order);
        if (cf.redeemClaimed) return { already: true, claimedAt: cf.redeemClaimedAt };
        await this.orderService.updateCustomFields(ctx, orderId, {
            redeemClaimed: true,
            redeemClaimedAt: new Date(),
        } as any);
        return { already: false, claimedAt: new Date() };
    }

    /**
     * 作废重发：已核销单禁止重发（一次性闭环）。新码重算密文/指纹并覆盖 → lookupByCode 命中激活码，旧码自然失效。
     */
    async reissue(ctx: RequestContext, orderId: ID): Promise<{
        code: string; qrPayload: string; barcode: string; claimed: boolean;
        status: RedemptionStatus; expiresAt: string; version: number; reissueable: boolean;
    }> {
        const order = (await this.orderService.findOne(ctx, orderId, [])) as Order | undefined;
        if (!order) throw new Error('order not found');
        const cf = this.cf(order);
        if (cf.redeemClaimed) {
            throw new Error('redemption.already_claimed');
        }
        const orderCode = order.code;
        const code = generateRedemptionCode();
        const { cipher, iv } = encryptRedemptionCode(code, this.keyHex);
        const channelToken = ctx.channel?.token ?? String(ctx.channelId ?? '');
        const hash = redemptionFingerprint(code, this.keyHex, channelToken);
        const version = (Number(cf.redeemVersion) || 1) + 1;
        const expiresAt = new Date(new Date().getTime() + this.graceDays * 24 * 3600_000).toISOString();
        await this.orderService.updateCustomFields(ctx, orderId, {
            redeemCodeCipher: cipher,
            redeemCodeIv: iv,
            redeemCodeHash: hash,
            redeemVersion: version,
            redeemReissuedAt: new Date(),
            redeemExpiresAt: expiresAt,
        } as any);
        return {
            code,
            qrPayload: redemptionQrPayload(orderCode, code, this.keyHex),
            barcode: redemptionBarcodePayload(orderCode, code),
            claimed: false,
            status: 'active',
            expiresAt,
            version,
            reissueable: true,
        };
    }
```

- [ ] **Step 5: 运行既有测试确认不破坏**

Run: `npx vitest --config vitest.config.mts run`
Expected: PASS（cjk-plugin 全部已有 spec 绿）

- [ ] **Step 6: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/redemption/redemption-code.service.ts
git commit -m "feat(cjk-plugin): 核销码有效期/状态/reissue/一次性保护"
```

---

### Task 4: 后端 schema 扩展（shop/admin 字段 + redemptionReissue）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption.schema.ts`

- [ ] **Step 1: Shop `OrderRedemptionResult` 补字段**

`OrderRedemptionResult` 追加：

```graphql
        status: String!        # active | expiring_soon | expired | claimed
        expiresAt: DateTime
        reissueable: Boolean!
        version: Int
```

- [ ] **Step 2: Admin 补 Lookup 字段 + 新增 reissue mutation**

`RedemptionLookupResult` 追加同组字段；`RedemptionClaimResult` 追加 `message`（已有）与新状态字段；Admin schema 新增 mutation：

```graphql
    extend type Mutation {
        redemptionClaim(code: String!): RedemptionClaimResult
        redemptionReissue(code: String!): RedemptionClaimResult
    }

    type RedemptionLookupResult {
        order: RedemptionOrder
        claimed: Boolean!
        claimedAt: DateTime
        status: String!
        expiresAt: DateTime
        version: Int
        reissueable: Boolean!
    }

    type RedemptionClaimResult {
        order: RedemptionOrder
        claimed: Boolean!
        claimedAt: DateTime
        message: String
        status: String!
        expiresAt: DateTime
        version: Int
    }
```

> 兼容：`status/expiresAt/version/reissueable` 均为可空或带默认的返回字段，不破坏既有客户端解析。

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/redemption/redemption.schema.ts
git commit -m "feat(cjk-plugin): 核销 schema 扩展状态字段与 redemptionReissue"
```

---

### Task 5: 后端 resolver 扩展

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption.resolver.ts`

- [ ] **Step 1: Shop `orderRedemptionCode` 下发状态字段**

把返回对象补 `status/expiresAt/reissueable/version`（来自 `r`，`r` 现含 status/expiresAt/version/reissueable）：

```ts
        return {
            redemptionCode: r.code,
            qrPayload: r.qrPayload,
            barcodePayload: r.barcode,
            claimed: r.claimed,
            canAccess: true,
            status: r.status,
            expiresAt: r.expiresAt,
            reissueable: r.reissueable,
            version: r.version,
        };
```

- [ ] **Step 2: `redemptionLookup` 补状态字段**

在 resolver 中引入 `computeRedemptionStatus`（`import { RedemptionCodeService }` 同文件顶部 `import { computeRedemptionStatus } from './redemption-crypto';`），并把返回 `claimed` 分支与正常分支补状态：

```ts
    @Query()
    @Allow(Permission.UpdateOrder)
    async redemptionLookup(@Ctx() ctx: RequestContext, @Args('code') code: string) {
        const order = await this.redemptionCodeService.lookupByCode(ctx, code);
        if (!order) {
            return { order: null, claimed: false, claimedAt: null, status: 'active', expiresAt: null, version: 1, reissueable: false };
        }
        await this.entityHydrator.hydrate(ctx, order, { relations: ['lines'] } as any);
        const cf = order.customFields ?? {};
        const claimed = !!(cf as any).redeemClaimed;
        const expiresAt: string | null = (cf as any).redeemExpiresAt ?? null;
        const version = Number((cf as any).redeemVersion) || 1;
        const status = computeRedemptionStatus(claimed, expiresAt, new Date(), 24);
        return {
            order: {
                id: order.id,
                code: order.code,
                state: order.state,
                totalWithTax: order.totalWithTax,
                currencyCode: order.currencyCode,
                totalQuantity: order.totalQuantity,
            },
            claimed,
            claimedAt: (cf as any).redeemClaimedAt ?? null,
            status,
            expiresAt: expiresAt ?? (cf as any).redeemExpiresAt ?? null,
            version,
            reissueable: !claimed,
        };
    }
```

> `computeRedemptionStatus` 的 remind 阈值在 resolver 缺配置时可写默认 24；如须与 service 完全一致，可注入 `ConfigService` 读同一 key，本期以 service 真源为准 + resolver 默认 24 可接受（仅影响 admin 展示临期判定）。

- [ ] **Step 3: 新增 `redemptionReissue` resolver**

在 `RedemptionAdminResolver` 类内追加：

```ts
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async redemptionReissue(@Ctx() ctx: RequestContext, @Args('code') code: string) {
        const order = await this.redemptionCodeService.lookupByCode(ctx, code);
        if (!order) throw new UserInputError(ERR_NOT_FOUND);
        const result = await this.redemptionCodeService.reissue(ctx, order.id);
        return {
            order: {
                id: order.id,
                code: order.code,
                state: order.state,
                totalWithTax: order.totalWithTax,
                currencyCode: order.currencyCode,
                totalQuantity: order.totalQuantity,
            },
            claimed: result.claimed,
            claimedAt: null,
            message: 'reissued',
            status: result.status,
            expiresAt: result.expiresAt,
            version: result.version,
        };
    }
```

> `reissue` 内部对已核销单抛 `redemption.already_claimed`。若希望映射为语义化 GraphQL 错误，可在 catch 中转 `UserInputError('核销码已核销，不可重发')`（resolver 层统一）。

- [ ] **Step 4: 结果分支错误信息核实**（`redemptionClaim` 未动，仅确认 schema 已含 message；无需改）

- [ ] **Step 5: 编译校验**

Run: `cd d:\zhao\vendure && npx tsc -p packages/cjk-plugin/tsconfig.build.json --noEmit`
Expected: 无新增类型错误（若 `computeRedemptionStatus` 导入路径或 resolver 返回值类型报错，参照 Task 3 类型规避手法修正）。

- [ ] **Step 6: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/redemption/redemption.resolver.ts
git commit -m "feat(cjk-plugin): 核销 resolver 状态下发与 redemptionReissue"
```

---

### Task 6: 后端测试 + 构建 + 部署

**Files:**
- Build: `d:\zhao\vendure\packages\cjk-plugin\lib`（生成）
- Deploy: `d:\zhao\vendure`（git pull / pm2 restart 在服务器执行）

- [ ] **Step 1: 全量跑 cjk-plugin 测试**

Run: `cd d:\zhao\vendure && npm test`（或 `npx vitest --config packages/cjk-plugin/vitest.config.mts --run`）
Expected: 全部通过（含 Task 1 新用例 + merchant-settlement 等既有用例）。

- [ ] **Step 2: 本地构建 cjk-plugin**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`
Expected: 生成 `lib/`，无 TS 错误。

- [ ] **Step 3: 提交 lib 与源码**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/lib packages/cjk-plugin/src
git commit -m "chore(cjk-plugin): 构建产物 + 核销机制升级"
```

- [ ] **Step 4: 推送并部署**

```bash
cd d:\zhao\vendure
git push origin master
```
然后**在服务器**（qing 39.97.54.5，`/www/apps/vendure`）执行：
```bash
git pull origin master
pm2 restart vendure --update-env
pm2 flush vendure && pm2 restart vendure && sleep 5 && pm2 logs --lines 50 --nostream
```
Expected: pm2 进程 online，日志无 error；`synchronize` 自动建/增 `redeemExpiresAt` 等列（postgres）。

> 部署铁律：**绝不在服务器构建/安装**。

- [ ] **Step 5: 服务器核对字段与 DB 状态**

Run（服务器）：`psql -d <vendure_db> -c "\d \"order\"" | grep -i redeem`
Expected: 出现 `redeem_expires_at`、`redeem_version`、`redeem_reissued_at` 列。

---

### Task 7: 前端 `order-config` 扩展 L3 块级配置

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\utils\order-config.ts`

- [ ] **Step 1: `OrderBlockCfg` 追加可选样式字段**

```ts
export interface OrderBlockCfg {
  visible?: boolean;
  title?: LocalizedText;
  text?: LocalizedText;
  /** 核销码块：高光卡开关（默认 true） */
  highlight?: boolean;
  /** 核销码块：字体缩放 */
  fontScale?: number;
  /** 核销码块：卡片圆角 */
  cardRadius?: number;
}
```

- [ ] **Step 2: 新增核销块默认与取值函数**（L4 兜底链）

在 `localizeOrderText` 后追加：

```ts
// 核销码块定制取值（L4 兜底：块定制 → 内建默认）
export function orderBlockHighlight(cfg: OrderDetailConfig | null, key: string, dft = true): boolean {
  const v = cfg?.blocks?.[key]?.highlight;
  return v === undefined ? dft : v;
}
export function orderBlockNumber(cfg: OrderDetailConfig | null, key: string, name: 'fontScale' | 'cardRadius', dft: number): number {
  const v = cfg?.blocks?.[key]?.[name];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : dft;
}
```

- [ ] **Step 3: 运行既有 typecheck 关注新增错误**

Run: `npm run typecheck`
Expected: `order-config.ts` 本次无新增错误（基线既有错误不计，见项目记忆）。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/utils/order-config.ts
git commit -m "feat(order): 核销码块 L3/L4 配置（highlight/fontScale/cardRadius）"
```

---

### Task 8: 前端 GQL 变更 + i18n 词条

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\OrderRedemptionCode.gql`
- Modify: `d:\zhao\nshop\layers\base\gql\queries\AdminRedemption.gql`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts`

- [ ] **Step 1: 补 Shop 查询字段**

`OrderRedemptionCode.gql` 改为：

```graphql
query OrderRedemptionCode($input: OrderRedemptionCodeInput!) {
  orderRedemptionCode(input: $input) {
    redemptionCode
    qrPayload
    barcodePayload
    claimed
    canAccess
    status
    expiresAt
    reissueable
    version
  }
}
```

- [ ] **Step 2: Admin 查重发 mutation**

`AdminRedemption.gql` 追加：

```graphql
mutation AdminRedemptionReissue($code: String!) {
  redemptionReissue(code: $code) {
    claimed
    claimedAt
    message
    status
    expiresAt
    version
    order {
      id
      code
      state
    }
  }
}
```

- [ ] **Step 3: 补 zh-CN 词条**（在既有 `order:` 组 `redeem*` 附近追加）

```ts
      redeemStatusPending: '未核销 · 待取货',
      redeemStatusExpiring: '即将过期',
      redeemStatusExpired: '已过期',
      redeemStatusReissued: '已重发 · 当前生效',
      redeemExpiresTo: '有效期至 {date}',
      redeemExpireSoonTip: '核销码即将过期，请尽快到店核销',
      redeemExpiredTip: '核销码已过期，请联系自提点处理',
      redeemReissuedTip: '原核销码已作废，请使用下方新码',
      redeemReissueBtn: '重新生成',
      redeemReissueSuccess: '已重新生成核销码',
      redeemReissueFailed: '重新生成失败',
      redeemAlreadyClaimed: '该核销码已核销，不可重发',
      redeemPoint: '自提点',
```

- [ ] **Step 4: 补 en-US 词条**（同 key 英文）

```ts
      redeemStatusPending: 'Pending pickup',
      redeemStatusExpiring: 'Expiring soon',
      redeemStatusExpired: 'Expired',
      redeemStatusReissued: 'Reissued · active now',
      redeemExpiresTo: 'Valid until {date}',
      redeemExpireSoonTip: 'Code expires soon, please pick up in time',
      redeemExpiredTip: 'Code expired, please contact the pickup point',
      redeemReissuedTip: 'Previous code voided, use the new code below',
      redeemReissueBtn: 'Reissue',
      redeemReissueSuccess: 'Redemption code reissued',
      redeemReissueFailed: 'Reissue failed',
      redeemAlreadyClaimed: 'Already redeemed, cannot reissue',
      redeemPoint: 'Pickup point',
```

- [ ] **Step 5: 校验双语言同步**

Run:
```powershell
Select-String -Path "d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts" -Pattern "redeemStatusPending|redeemReissueBtn|redeemPoint"
Select-String -Path "d:\zhao\nshop\layers\base\i18n\locales\en-US.ts" -Pattern "redeemStatusPending|redeemReissueBtn|redeemPoint"
```
Expected: 两文件都命中（勿缺词条裸显 `messages.order.xxx`）。

- [ ] **Step 6: 重新生成 GQL 类型并编译**

Run: `cd d:\zhao\nshop && npx nuxt prepare`
Expected: 生成/校验新增字段类型；无报错。

- [ ] **Step 7: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/gql/queries/OrderRedemptionCode.gql layers/base/gql/queries/AdminRedemption.gql layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "feat(order): 核销码状态字段 + 双语言词条"
```

---

### Task 9: 前端核销码高光卡（五状态机）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\order\OrderRedemptionCard.vue`

- [ ] **Step 1: 重写脚本（状态机 + 高光样式常量）**

```ts
<script setup lang="ts">
const { t } = useI18n();
const gql = useGql();

const props = withDefaults(defineProps<{
  orderCode: string;
  phone?: string;
  /** 高光卡开关（L3/L2 覆盖，缺省 true） */
  highlight?: boolean;
  /** 门店名（nullable：订单无自提信息则隐藏门店行） */
  pickupName?: string | null;
}>(), { highlight: true, pickupName: null });

interface RedemptionResult {
  redemptionCode?: string | null;
  qrPayload?: string | null;
  claimed: boolean;
  canAccess?: boolean;
  status?: string;
  expiresAt?: string | null;
  reissueable?: boolean;
  version?: number | null;
}

const result = ref<RedemptionResult | null>(null);
const loading = ref(true);
const error = ref(false);

onMounted(async () => {
  try {
    const res: any = await gql("OrderRedemptionCode", {
      input: { orderCode: props.orderCode, phone: props.phone },
    });
    result.value = (res?.orderRedemptionCode ?? null) as RedemptionResult | null;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
});

const qrDataUrl = ref("");
watch(result, async (r) => {
  if (r?.qrPayload) {
    try {
      const QRCode = (await import("qrcode")).default;
      qrDataUrl.value = await QRCode.toDataURL(r.qrPayload, { width: 164, margin: 1 });
    } catch {
      qrDataUrl.value = "";
    }
  }
}, { immediate: true });

// 状态机判优：已核销 > 已过期；重发仅作徽标（version>1）
const isClaimed = computed(() => !!result.value?.claimed);
const isExpired = computed(() => !isClaimed.value && result.value?.status === "expired");
const isExpiring = computed(() => !isClaimed.value && result.value?.status === "expiring_soon");
const isReissued = computed(() => (result.value?.version ?? 1) > 1);

const expiresText = computed(() => {
  const iso = result.value?.expiresAt;
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return t("messages.order.redeemExpiresTo", { date: `${mm}-${dd}` });
});

const fontScale = computed(() => props.highlight ? undefined : undefined); // 样式缩放由外层 config 传入
</script>
```

- [ ] **Step 2: 重写模板（高光卡 + 五状态视觉）**

```vue
<template>
  <section
    :class="['overflow-hidden rounded-2xl border shadow-sm',
      props.highlight ? 'border-amber-150 from-amber-50 to-white bg-gradient-to-b dark:from-neutral-800 dark:to-neutral-900' : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900']"
  >
    <header class="flex items-center justify-between px-4 pb-2 pt-3">
      <h2 class="font-semibold">{{ t("messages.order.redemptionTitle") }}</h2>
      <span v-if="isExpired" class="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
        {{ t("messages.order.redeemStatusExpired") }}
      </span>
      <span v-else-if="isExpiring" class="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600">
        {{ t("messages.order.redeemStatusExpiring") }}
      </span>
      <span v-else-if="isReissued" class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        {{ t("messages.order.redeemStatusReissued") }}
      </span>
      <span v-else-if="isClaimed" class="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-500">
        {{ t("messages.order.redeemed") }}
      </span>
      <span v-else class="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
        {{ t("messages.order.redeemStatusPending") }}
      </span>
    </header>

    <div v-if="loading" class="px-4 pb-4 text-sm text-neutral-500">{{ t("messages.general.loading") }}</div>
    <p v-else-if="error" class="px-4 pb-4 text-sm text-neutral-500">
      {{ t("messages.order.redemptionUnavailable") }}
    </p>

    <div v-else-if="result" class="px-4 pb-4">
      <!-- 码区：已过期置灰遮罩 -->
      <div :class="['flex items-center justify-between rounded-xl px-4 py-3',
        props.highlight ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white' : 'border border-neutral-200',
        isExpired && 'opacity-60 grayscale']">
        <div class="min-w-0">
          <p class="text-xs opacity-80">{{ t("messages.order.redemptionCodeLabel") }}</p>
          <p class="mt-1 break-all font-mono text-3xl font-bold tracking-[0.3em]">
            {{ result.redemptionCode || "--" }}
          </p>
        </div>
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="核销码" class="h-20 w-20 shrink-0 rounded bg-white p-1" />
      </div>

      <!-- 门店行（可空隐藏） -->
      <div v-if="pickupName" class="mt-3 flex items-center justify-between text-sm">
        <span class="text-neutral-500">{{ t("messages.order.redeemPoint") }}</span>
        <span class="font-medium text-neutral-800">{{ pickupName }}</span>
      </div>

      <!-- 有效期与提示 -->
      <div class="mt-2 flex items-center justify-between text-sm">
        <span v-if="expiresText" class="text-neutral-500">{{ expiresText }}</span>
        <span v-if="isExpiring" class="text-orange-600">{{ t("messages.order.redeemExpireSoonTip") }}</span>
        <span v-else-if="isExpired" class="text-neutral-500">{{ t("messages.order.redeemExpiredTip") }}</span>
        <span v-else-if="isReissued" class="text-green-700">{{ t("messages.order.redeemReissuedTip") }}</span>
      </div>
    </div>
  </section>
</template>
```

- [ ] **Step 3: 局部 typecheck**

Run: `npm run typecheck`
Expected: 仅本文件无新增错误（`useGql`/`computed` 等 Nuxt 自动导入可用）。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/components/order/OrderRedemptionCard.vue
git commit -m "feat(order): 核销码高光卡五状态机"
```

---

### Task 10: 前端 jd 版式集成 + 门店名透传 + 中式微调

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\order\OrderDetailRedemptionBlock.vue`
- Modify: `d:\zhao\nshop\layers\base\app\components\order\OrderDetailJd.vue`

- [ ] **Step 1: Redemption 块透传高光配置与门店名**

`OrderDetailRedemptionBlock.vue` 改为：

```vue
<script setup lang="ts">
import type { OrderBlockCfg } from "../../utils/order-config";
import { orderBlockHighlight } from "../../utils/order-config";
import type { OrderDetailConfig } from "../../utils/order-config";

const props = defineProps<{ order: any; block?: OrderBlockCfg; config?: OrderDetailConfig | null }>();
const highlight = computed(() => orderBlockHighlight(props.config ?? null, "redemption", true));
// 门店名尽力提取（自提点/配送自定义字段，null-safe），拿不到则隐藏
const pickupName = computed(() => {
  const o: any = props.order ?? {};
  return o?.customFields?.pickupStoreName ?? o?.delivery?.method?.name ?? o?.shippingMethod?.name ?? null;
});
</script>
<template>
  <OrderRedemptionCard
    :order-code="props.order.code"
    class="mb-4"
    :highlight="highlight"
    :pickup-name="pickupName"
  />
</template>
```

- [ ] **Step 2: Jd 版式把 config 传进 Redemption 块并做容器中式微调**

`OrderDetailJd.vue` 中 Redemption 行改为传 `config`，并把各块容器统一到一致的圆角/间距（低风险，不动交互）：

```vue
  <OrderDetailRedemptionBlock v-if="visible('redemption')" :order="order" :config="props.config" :block="block('redemption')" />
```

> 中式微调（低风险、不动快语义/逻辑）：给 `OrderDetailJd.vue` 模板根容器补 `space-y-3`（块间距）与各 Card 统一 `rounded-2xl`，仅此而已。若不想触碰其它块的回归面，可在根 `<template>` 外层的 `<div class="space-y-3">` 包一层（页面已有结构可自行套用），不新增配色/文案改动。

- [ ] **Step 3: 本地构建验证**

Run: `cd d:\zhao\nshop && pnpm build`
Expected: `.output` 生成无报错。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/components/order/OrderDetailRedemptionBlock.vue layers/base/app/components/order/OrderDetailJd.vue
git commit -m "feat(order): jd 版式核销块集成高光卡与门店透传"
```

---

### Task 11: 前端管理端核销重发入口

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\admin\redemption.vue`

- [ ] **Step 1: 在查询到过期订单时展示「重新生成」按钮并调用 mutation**

在 `redemption.vue` 的核销结果区追加「重新生成」（当已查询且 `status==='expired'` 且非 claimed 时显示），并接组 mutation：

```ts
const canReissue = computed(() => lookup.value?.status === 'expired' && !lookup.value?.claimed);
const reissuing = ref(false);
async function onReissue() {
  if (!lookup.value?.order?.code) return;
  reissuing.value = true;
  try {
    const res: any = await useGql("AdminRedemptionReissue", { code: lookup.value.order.code });
    const msg = res?.redemptionReissue?.message;
    if (msg === 'reissued') {
      toast.success(t("messages.order.redeemReissueSuccess"));
    }
    await refreshLookup(lookup.value.order.code); // 重新查询以刷新新码/状态
  } catch {
    toast.error(t("messages.order.redeemReissueFailed"));
  } finally {
    reissuing.value = false;
  }
}
```

模板（在核销按钮旁，仅 `canReissue` 时显示）：
```vue
<UButton
  v-if="canReissue"
  color="primary"
  variant="soft"
  :loading="reissuing"
  @click="onReissue"
>{{ t("messages.order.redeemReissueBtn") }}</UButton>
```

> `lookup`/`refreshLookup`/`useGql`/`toast` 以该文件现有变量名为准，若命名不同则以现有为准对齐；`redemptionReissue` 期望输入为**核销码**（管理端输入框的 code），但重发按钮应在已按码查到结果后针对**新码**操作——此处用现有输入框的 `code` 即可（`order.code` 是订单号，非核销码，注意核对）；如该页的核销码变量为 `enteredCode`/`codeParam`，改为传该核销码。

- [ ] **Step 2: 本地构建验证**

Run: `cd d:\zhao\nshop && pnpm build`
Expected: 构建通过。

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/pages/admin/redemption.vue
git commit -m "feat(admin): 核销到过期订单支持重新生成"
```

---

### Task 12: 构建、手机截图与部署交付

**Files:**
- Image: `d:\zhao\nshop\scripts\shots\`（截图产物）
- Manual: `d:\zhao\vendure\doc\多租户使用手册.md`（截屏补充）

- [ ] **Step 1: 前端本地构建并部署**

```bash
cd d:\zhao\nshop
node scripts/deploy.mjs
```
Expected: 本地 `.output/` → scp → 服务器解压 → pm2 restart 完成。

- [ ] **Step 2: 手机截图（390×844, dpr=2）**

用 Playwright 移动视口截三张订单详情核销卡状态（自提单）：
1. **待取货（active）**高光卡含码+二维码+有效期
2. **即将过期（expiring_soon）**：用临期订单数据或后端临时 mock 阈值验证
3. （可选）**已核销/已过期**一张
存 `d:\zhao\nshop\scripts\shots\`，核对页面 body 无 `messages.order.*` 裸显（i18n 词条补齐验证）。

- [ ] **Step 3: 补充操作手册**

把截图补入 `d:\zhao\vendure\doc\多租户使用手册.md`，说明：
- 自提订单详情展示「核销码高光卡」五状态；
- 管理端对过期订单可「重新生成」（一次性，已核销不可重发）；
- 有效期默认 7 天（`pickup.redeemGraceDays`），临期 24h（`pickup.redeemExpireRemindHours`）提示。

- [ ] **Step 4: 验收核对**

- 手机端查看两条订单（active + 已核销）状态正确、二维码可扫。
- Admin 输入过期码可重新生成；输入已核销码提示不可重发。
- 回归：`jd` 高光卡开启与关闭（`highlight:false` 回退简洁卡）均正常；`classic` 版式不受影响。
- 前端 `typecheck` 无本次文件新增错误；后端 `npm test` 全绿。

- [ ] **Step 5: 提交截图与手册**

```bash
cd d:\zhao\nshop
git add scripts/shots layers/base/i18n/locales  # 截图（精确枚举，勿 git add -A）
git commit -m "test(order): 核销码高光卡手机截图"
```
（手册在 vendors 仓库单独提交。）

---

## Self-Review

**1. Spec 覆盖：**
- 有效期/过期提醒 → Task 1（纯函数）、Task 3（service）、Task 8/9（前端临期态）。✓
- 作废重发/补发 → Task 3 `reissue`（覆盖指纹天然作废）、Task 4/5（mutation）、Task 11（Admin UI）。✓
- 一次性核销 → Task 3 `claim` 幂等 + `reissue` 已核销抛错。✓
- 前端高光卡五状态机 + 中式增强（jd 内）→ Task 9/10。✓
- 四级风格 L3/L4 → Task 7（`highlight/fontScale/cardRadius` 兜底）。✓
- 双语言、测试截图、部署 → Task 8/12。✓
- design 中的 C 端自助重发开关（默认 false）→ 本期前端不显示按钮（Task 9 模板无顾客重发按钮），仅 Admin 入口，符合「默认管理员重发」。✓

**2. 占位符扫描：** 无 "TBD/TODO/参考 Task N"；所有代码步骤给出真实代码/命令。Task 11 对 `redemption.vue` 现有命名作「以现有为准对齐」的务实说明（文件非本次新建，勾稽变量名属合理本地适配，非计划缺口）。

**3. 类型一致性：**
- `computeRedemptionStatus(claimed, expiresAtIso, now, remindHours)` 在 Task1 定义、Task3/5 调用，签名一致（返回 `RedemptionStatus`）。✓
- `getWithQr`/`reissue` 返回值含 `status/expiresAt/version/reissueable`，resolver 逐字段透传给 `OrderRedemptionResult`。✓
- 前端 `RedemptionResult.status: string`（宽松接受后端 enum 字符串），判优键 `claimed/status/version`。✓
- `orderBlockHighlight/orderBlockNumber` 在 Task7 定义、Task10 使用，参数 `(config, key, dft)`，`OrderDetailJd` 传 `props.config` 与 key `"redemption"`。✓
- i18n key（`messages.order.redeemStatus*` 等）在 Task8 定义、Task9/11 引用一致。✓

---

## Execution Handoff

计划已保存。两种执行方式：

1. **Subagent-Driven（推荐）** — 为每个 Task 派遣独立子代理，任务间两段式审查，迭代快。
2. **Inline Execution** — 在本会话按 `executing-plans` 批量执行，带检查点供用户评审。