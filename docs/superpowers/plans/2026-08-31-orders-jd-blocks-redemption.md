# 订单模块京东手机帮积木改造 + 全单加密核销码 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把订单「列表+详情」改造成京东手机帮风的积木式卡片页面（代码层积木、方案 A 全场景卡片式、全面替换 UTable），并为每个订单生成加密存储的 6 位核销码，支持 C 端展示（码+二维码）与租户管理员手动输入/扫码核销，形成完整闭环。

**Architecture:** 后端 `cjk-plugin` 承担核销码全生命周期（Order 自定义字段加密存储 + `RedemptionCodeService` 下单即生成 + Admin/Shop resolver），前端 nshop 把订单页拆成可复用功能块组件（`OrderCard*`、`Order*Card`）积木式拼装；C 端用 QR 展示核销码，管理端用 Code128 一维条码（门店一维码枪可扫，复用现有商品条码扫码设备）+ 手动输入双通道核销。

**Tech Stack:** Nuxt 4 / Vue 3、@nuxt/ui、@vendure/core 3.6、cjk-plugin、node:crypto（AES-256-GCM / HMAC-SHA256）、`qrcode`、`JsBarcode`。

---

## 0. 决策与假设（务必先读）

- **管理端核销页宿主**：仓库无现成 vendure admin-ui 扩展，故管理核销页做成 nshop 内独立受保护管理路由 `/admin/redemption`（复用 C 端登录会话 + 管理员角色校验）。后端核销能力走 cjk-plugin `adminApiExtensions`（Admin GraphQL），与前端解耦，后续可平移到任何管理端。
- **「复用商品条码功能」落地**：仓库现仅 ProductVariant/Product 有 string 字段 `barcode`，无现成扫码/渲染组件。故「复用商品条码扫码设备」落地为：①核销凭证渲染为 **Code128 一维条码**（门店现有一维扫码枪可读，与商品条码同设备）；②管理端核销页提供 `扫码输入`：聚焦输入框，扫码枪键入即回车触发核销（等价键盘输入，兼容一切扫码枪）。**不**依赖/扩展商品 `barcode` 字段本身。
- **新增前端依赖**：C 端用 `qrcode` 渲染二维码；管理端用 `JsBarcode` 渲染 Code128。两者均为纯 JS，浏览器侧运行，Nuxt 下按需客户端加载，避免 SSR 兼容问题。
- **加密密钥**：AES-GCM 与 HMAC 密钥来自环境变量 `REDEMPTION_KEY`（服务端配置，不进 DB、不写死）。dev-config 默认注入测试密钥，生产由运维注入。
- 本阶段**不**新增后端版式配置/多版式；`pickup-plugin` 现有明文 `pickupCode` 保留不动，与核销码并存。
- 所有金额单位沿用现有惯例（厘/分：`totalWithTax` 直接展示，复用 `formatMoney`）。

---

## 文件结构

```
后端 cjk-plugin（d:\zhao\vendure\packages\cjk-plugin\src\）
├── order\order-custom-fields.ts            [改] 新增 5 个核销码字段
├── redemption\redemption-crypto.ts         [新] AES-256-GCM + HMAC + 生码 + Code128 载荷
├── redemption\redemption-code.service.ts   [新] ensure/decrypt/lookup/claim 幂等核销
├── redemption\redemption.resolver.ts       [新] Shop orderRedemptionCode + Admin redemptionLookup/Claim
├── redemption\redemption.schema.ts         [新] shopSchema/adminSchema 扩展字符串
└── plugin.ts                               [改] 注册字段、service/provider、schema、事件订阅、GQL 类型

前端 nshop layers\base（d:\zhao\nshop\layers\base\）
├── package.json / 根 package.json          [改] 加 qrcode + JsBarcode
├── app\utils\order-state.ts                [复用]（不改）
├── app\components\order\OrderCard.vue        [新] 卡片容器
│    ├── OrderCardHeader.vue                 [新]
│    ├── OrderCardItems.vue                  [新]
│    ├── OrderCardFooter.vue                 [新]
│    └── OrderCardActions.vue                [新]
├── app\components\order\OrderCardList.vue   [新]
├── app\components\order\OrderTabBar.vue     [新]
├── app\components\order\OrderStatusBanner.vue [新]
├── app\components\order\OrderRedemptionCard.vue [新]
├── app\components\order\OrderMetaCard.vue   [新]
├── app\components\order\OrderPickupCard.vue [新]
├── app\pages\account\orders\index.vue       [重写] 列表卡片式
├── app\pages\account\orders\[code].vue      [重写] 详情积木拼装
├── app\pages\admin\redemption.vue           [新] 管理端核销页
├── gql\queries\OrderRedemptionCode.gql      [新]
├── gql\queries\AdminRedemption.gql          [新]
└── i18n\locales\zh-CN.ts / en-US.ts         [改] 补词条
```

---

## 后端任务（cjk-plugin）

### Task 1: 新增核销码自定义字段

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\order\order-custom-fields.ts`

- [ ] **Step 1: 在 `orderCustomFields.Order` 数组末尾追加 5 个字段**

在 `order-custom-fields.ts` 的 `Order: [...]` 内、`remark` 之后追加：

```ts
    {
        name: 'redeemCodeCipher',
        type: 'text',
        nullable: true,
        public: true,
        label: [{ languageCode: LanguageCode.zh_Hans, value: '核销码密文' }],
    },
    {
        name: 'redeemCodeIv',
        type: 'string',
        nullable: true,
        public: false,
        label: [{ languageCode: LanguageCode.zh_Hans, value: '核销码IV' }],
    },
    {
        name: 'redeemCodeHash',
        type: 'string',
        nullable: true,
        public: false,
        label: [{ languageCode: LanguageCode.zh_Hans, value: '核销码检索指纹' }],
    },
    {
        name: 'redeemClaimed',
        type: 'boolean',
        nullable: true,
        defaultValue: false,
        public: true,
        label: [{ languageCode: LanguageCode.zh_Hans, value: '已核销' }],
    },
    {
        name: 'redeemClaimedAt',
        type: 'datetime',
        nullable: true,
        public: true,
        label: [{ languageCode: LanguageCode.zh_Hans, value: '核销时间' }],
    },
```

> `redeemCodeCipher` 用 `text`（内容可能较长）；`redeemCodeIv/Hash` 用 `string` 且 `public: false`（不暴露给 C 端查询返回）。确认文件头已 import `LanguageCode`（文件内已有）。

- [ ] **Step 2: 编译验证**

```bash
cd d:\zhao\vendure\packages\cjk-plugin && npm run build
```
Expected: 编译通过（`tsc` 无报错）。

- [ ] **Step 3: Commit**

```bash
cd d:\zhao\vendure && git add packages/cjk-plugin/src/order/order-custom-fields.ts
git commit -m "feat(cjk): 新增核销码 Order 自定义字段"
```

---

### Task 2: 核销码加解密与生码工具

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption-crypto.ts`

- [ ] **Step 1: 新建 `redemption-crypto.ts`（纯函数，SSR/单测友好）**

```ts
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

// 6 位大写字母+数字，去掉易混 O/I/0/1。校验位 = 前 5 位映射和 mod(31) 对应的字符，避免误输。
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 32 chars
const CODE_LEN = 6;

export interface RedemptionKeyInput {
    key: string; // 用于 AES + HMAC 的 32 字节十六进制串（64 hex chars）
}

export function generateRedemptionCode(): string {
    const body = Array.from({ length: CODE_LEN - 1 }, () =>
        CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
    ).join('');
    let sum = 0;
    for (const ch of body) sum += CODE_CHARS.indexOf(ch);
    const check = CODE_CHARS[sum % CODE_CHARS.length];
    return (body + check).toUpperCase();
}

function validChars(code: string): boolean {
    if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code)) return false;
    const body = code.slice(0, 5);
    let sum = 0;
    for (const ch of body) sum += CODE_CHARS.indexOf(ch);
    return CODE_CHARS[sum % CODE_CHARS.length] === code[5];
}

export function encryptRedemptionCode(code: string, keyHex: string): { cipher: string; iv: string } {
    const key = Buffer.from(keyHex, 'hex');
    const iv = randomBytes(12); // GCM 12B nonce
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        cipher: Buffer.concat([enc, tag]).toString('base64'),
        iv: iv.toString('base64'),
    };
}

export function decryptRedemptionCode(cipherB64: string, ivB64: string, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivB64, 'base64');
    const data = Buffer.from(cipherB64, 'base64');
    const tag = data.subarray(data.length - 16);
    const enc = data.subarray(0, data.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function redemptionFingerprint(code: string, keyHex: string, channelSalt: string): string {
    return createHmac('sha256', `${keyHex}:${channelSalt}`).update(code.toUpperCase()).digest('hex');
}

/** 管理端 Code128 一维条码载荷：可被门店一维扫码枪读取（复用商品条码扫码设备） */
export function redemptionBarcodePayload(orderCode: string, redemptionCode: string): string {
    return `RD:${orderCode}:${redemptionCode.toUpperCase()}`;
}

/** C 端二维码载荷：签名（nsQ #ts，服务端验签用） */
export function redemptionQrPayload(orderCode: string, code: string, keyHex: string): string {
    const ts = Date.now();
    const sig = createHmac('sha256', keyHex).update(`${orderCode}:${code}:${ts}`).digest('hex').slice(0, 16);
    return JSON.stringify({ o: orderCode, c: code, ts, s: sig });
}

export function verifyRedemptionQr(payloadStr: string, keyHex: string, maxAgeMs = 5 * 60_000): boolean {
    try {
        const p = JSON.parse(payloadStr);
        if (typeof p.o !== 'string' || typeof p.c !== 'string' || typeof p.ts !== 'number' || typeof p.s !== 'string') return false;
        if (Date.now() - p.ts > maxAgeMs) return false;
        const sig = createHmac('sha256', keyHex).update(`${p.o}:${p.c}:${p.ts}`).digest('hex').slice(0, 16);
        return sig === p.s && validChars(p.c);
    } catch {
        return false;
    }
}
```

- [ ] **Step 2: 单测**

Create `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption-crypto.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    generateRedemptionCode, validChars, encryptRedemptionCode, decryptRedemptionCode,
    redemptionFingerprint, redemptionQrPayload, verifyRedemptionQr,
} from './redemption-crypto';

const KEY = 'a'.repeat(64);

describe('redemption-crypto', () => {
    it('生成 6 位大写码且不含易混字符', () => {
        for (let i = 0; i < 200; i++) {
            const code = generateRedemptionCode();
            expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
            expect(code).toBe(code.toUpperCase());
        }
    });
    it('校验位验证通过', () => {
        // 内部校验位：从自身再取一次不该变；validChars 未导出则跳过——此处用加解密往返间接验证码结构
        const code = generateRedemptionCode();
        const { cipher, iv } = encryptRedemptionCode(code, KEY);
        expect(decryptRedemptionCode(cipher, iv, KEY)).toBe(code);
    });
    it('指纹稳定且区分大小写归一', () => {
        expect(redemptionFingerprint('AB12CD', KEY, 'chn')).toBe(redemptionFingerprint('ab12cd', KEY, 'chn'));
        expect(redemptionFingerprint('AB12CD', KEY, 'chn')).not.toBe(redemptionFingerprint('AB12CE', KEY, 'chn'));
    });
    it('二维码载荷签名可验签', () => {
        const payload = redemptionQrPayload('XORDER1', 'AB12CD', KEY);
        expect(verifyRedemptionQr(payload, KEY)).toBe(true);
    });
});
```

> 若 `validChars` 未作为导出(上例已导出)，测试可移除对未导出符号的引用。运行：
```bash
cd d:\zhao\vendure\packages\cjk-plugin && npx vitest run src/redemption/redemption-crypto.spec.ts
```
Expected: PASS。若 vitest 配置 include 未覆盖 `.spec.ts`，用临时配置跑（参照仓库既有做法），通过后删除临时配置。

- [ ] **Step 3: Commit**

```bash
cd d:\zhao\vendure && git add packages/cjk-plugin/src/redemption/ && git commit -m "feat(cjk): 核销码加解密/生码/指纹/qr载荷工具"
```

---

### Task 3: RedemptionCodeService（ensure/decrypt/lookup/claim）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption-code.service.ts`

- [ ] **Step 1: 新建服务**

```ts
import { Injectable, ID, RequestContext, OrderService, ChannelService, hasCustomFields, Logger } from '@vendure/core';
import { Repository } from 'typeorm';
import { Order } from '@vendure/core';
import {
    generateRedemptionCode, encryptRedemptionCode, redemptionFingerprint, decryptRedemptionCode,
    redemptionQrPayload, redemptionBarcodePayload,
} from './redemption-crypto';

@Injectable()
export class RedemptionCodeService {
    private readonly keyHex: string;

    constructor(
        private orderService: OrderService,
        private channelService: ChannelService,
    ) {
        this.keyHex = process.env.REDEMPTION_KEY ?? '7'.repeat(64); // dev 默认；生产必由运维注入
        if (process.env.REDEMPTION_KEY === undefined && process.env.NODE_ENV === 'production') {
            throw new Error('REDEMPTION_KEY 必须在生产环境注入（32 字节 hex）');
        }
    }

    private cf(order: Order): Record<string, any> {
        return (order.customFields ?? {}) as Record<string, any>;
    }

    /** 幂等确保订单已生成核销码。返回解密的明文核销码。 */
    async ensure(ctx: RequestContext, orderId: ID): Promise<string> {
        const order = (await this.orderService.findOne(ctx, orderId, [])) as Order | undefined;
        if (!order) throw new Error('order not found');
        const cf = this.cf(order);
        if (cf.redeemCodeCipher && cf.redeemCodeIv) {
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
        });
        return code;
    }

    async getWithQr(ctx: RequestContext, orderId: ID, orderCode: string): Promise<{ code: string; qrPayload: string; barcode: string; claimed: boolean }> {
        const order = (await this.orderService.findOne(ctx, orderId, [])) as Order | undefined;
        if (!order) throw new Error('order not found');
        const cf = this.cf(order);
        const code = cf.redeemCodeCipher && cf.redeemCodeIv
            ? decryptRedemptionCode(cf.redeemCodeCipher, cf.redeemCodeIv, this.keyHex)
            : await this.ensure(ctx, orderId);
        const claimed = !!cf.redeemClaimed;
        return {
            code,
            qrPayload: redemptionQrPayload(orderCode, code, this.keyHex),
            barcode: redemptionBarcodePayload(orderCode, code),
            claimed,
        };
    }

    /** 管理端按输入码定位（限当前租户 Channel）。返回订单指针或 null。 */
    async lookupByCode(ctx: RequestContext, inputCode: string): Promise<Order | null> {
        const code = inputCode.trim().toUpperCase();
        const channelToken = ctx.channel?.token ?? String(ctx.channelId ?? '');
        const hash = redemptionFingerprint(code, this.keyHex, channelToken);
        // 用实体管理器按 Channel 过滤（Order 是 ChannelAware）
        return this.orderService.getRepository(ctx)
            .createQueryBuilder('order')
            .innerJoin('order.channels', 'ch', 'ch.token = :t', { t: channelToken })
            .where('LOWER(order.customFields->>\'redeemCodeHash\') = LOWER(:h)', { h: hash })
            .getOne() as Promise<Order | null>;
    }

    async claim(ctx: RequestContext, orderId: ID): Promise<{ already: boolean; claimedAt: Date }> {
        const order = (await this.orderService.findOne(ctx, orderId, [])) as Order | undefined;
        if (!order) throw new Error('order not found');
        const cf = this.cf(order);
        if (cf.redeemClaimed) return { already: true, claimedAt: cf.redeemClaimedAt };
        await this.orderService.updateCustomFields(ctx, orderId, {
            redeemClaimed: true,
            redeemClaimedAt: new Date(),
        });
        return { already: false, claimedAt: new Date() };
    }
}
```

> 若 `OrderService.getRepository`/`updateCustomFields` 签名与实际不符，参照仓库内 `order-split-shop.resolver.ts` / `pickup.service.ts` 中的实际调用方式（`connection.getRepository(ctx, Order)`、`orderService.updateCustomFields`）。`lookupByCode` 的 JSON 字段查询是 Postgres jsonb 语法；若仓库用 MySQL，替换为 `customFields LIKE` 或按租户先取候选再在内存比对 hash（数据量小，内存比对更稳健）。

- [ ] **Step 2: 简化检索的稳健替代（若 jsonb 查询不可用）**

若上文 jsonb 语法验证不通，改用内存比对版：

```ts
async lookupByCode(ctx: RequestContext, inputCode: string): Promise<Order | null> {
    const code = inputCode.trim().toUpperCase();
    const channelToken = ctx.channel?.token ?? String(ctx.channelId ?? '');
    const hash = redemptionFingerprint(code, this.keyHex, channelToken);
    const qb = this.channelService.getRepository(ctx) as any; // 占位，实际用 connection
    const orders = await this.orderService.findAll(ctx, { take: 5000 }, ['channels']) as any;
    return orders.items.find((o: any) => o.customFields?.redeemCodeHash === hash) ?? null;
}
```

> 采用哪种以仓库 ORM 能力为准——由实现者按 `pickup.service.ts` / `order.service.ts` 实际 API 定，保证最终编译通过且按租户隔离。

- [ ] **Step 3: Commit**

```bash
cd d:\zhao\vendure && git add packages/cjk-plugin/src/redemption/redemption-code.service.ts && git commit -m "feat(cjk): 核销码 ensure/解密/按码检索/核销幂等服务"
```

---

### Task 4: Shop + Admin Schema 扩展与 Resolver

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption.schema.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 新建 schema 扩展（Shop + Admin）**

`redemption.schema.ts`:

```ts
import gql from 'graphql-tag';

export const redemptionShopSchema = gql`
    extend type Query {
        orderRedemptionCode(input: OrderRedemptionCodeInput!): OrderRedemptionResult
    }

    input OrderRedemptionCodeInput {
        orderCode: String!
        phone: String
    }

    type OrderRedemptionResult {
        redemptionCode: String
        qrPayload: String
        barcodePayload: String
        claimed: Boolean!
        canAccess: Boolean!
    }
`;

export const redemptionAdminSchema = gql`
    extend type Query {
        redemptionLookup(code: String!): RedemptionLookupResult
    }
    extend type Mutation {
        redemptionClaim(code: String!): RedemptionClaimResult
    }

    type RedemptionOrder {
        id: ID!
        code: String!
        state: String!
        totalWithTax: Int!
        currencyCode: String!
        totalQuantity: Int!
    }

    type RedemptionLookupResult {
        order: RedemptionOrder
        claimed: Boolean!
        claimedAt: DateTime
    }

    type RedemptionClaimResult {
        order: RedemptionOrder
        claimed: Boolean!
        claimedAt: DateTime
        message: String
    }
`;

export { gql };
```

- [ ] **Step 2: 新建 resolver**

`redemption.resolver.ts`:

```ts
import { Args, Ctx, Mutation, Parent, Query, Resolver } from '@nestjs/graphql';
import {
    Allow, Ctx as VendureCtx, RequestContext, Permission, UserInputError,
    OrderService, ConfigService,
} from '@vendure/core';
import { RedemptionCodeService } from './redemption-code.service';
import { Order } from '@vendure/core';

const ERR_NOT_FOUND = 'redemption.error.not_found';

@Resolver()
export class RedemptionShopResolver {
    constructor(
        private redemptionCodeService: RedemptionCodeService,
        private orderService: OrderService,
        private configService: ConfigService,
    ) {}

    @Query()
    @Allow(Permission.Public)
    async orderRedemptionCode(
        @Ctx() ctx: RequestContext,
        @Args('input') input: { orderCode: string; phone?: string },
    ): Promise<any> {
        const order = await this.orderService.findOneByCode(ctx, input.orderCode) as any;
        let canAccess = false;
        if (order) {
            if (input.phone) {
                const cf = order.customFields ?? {};
                canAccess = (cf.contactPhone ?? '') === input.phone;
            } else {
                canAccess = await this.configService.orderOptions.orderByCodeAccessStrategy.canAccessOrder(ctx, order);
            }
        }
        if (!order || !canAccess) {
            throw new UserInputError(ERR_NOT_FOUND);
        }
        const r = await this.redemptionCodeService.getWithQr(ctx, order.id, order.code);
        return { redemptionCode: r.code, qrPayload: r.qrPayload, barcodePayload: r.barcode, claimed: r.claimed, canAccess: true };
    }
}

@Resolver()
export class RedemptionAdminResolver {
    constructor(
        private redemptionCodeService: RedemptionCodeService,
        private orderService: OrderService,
    ) {}

    @Query()
    @Allow(Permission.UpdateOrder)
    async redemptionLookup(@Ctx() ctx: RequestContext, @Args('code') code: string) {
        const order = await this.redemptionCodeService.lookupByCode(ctx, code);
        if (!order) {
            return { order: null, claimed: false, claimedAt: null };
        }
        const cf = order.customFields ?? {};
        return {
            order: { id: order.id, code: order.code, state: order.state, totalWithTax: order.totalWithTax, currencyCode: order.currencyCode, totalQuantity: order.totalQuantity },
            claimed: !!cf.redeemClaimed,
            claimedAt: cf.redeemClaimedAt ?? null,
        };
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async redemptionClaim(@Ctx() ctx: RequestContext, @Args('code') code: string) {
        const order = await this.redemptionCodeService.lookupByCode(ctx, code);
        if (!order) throw new UserInputError(ERR_NOT_FOUND);
        // 二次校验租户隔离（lookup 已限 Channel，claim 复用同一检索）
        const result = await this.redemptionCodeService.claim(ctx, order.id);
        const cf = order.customFields ?? {};
        return {
            order: { id: order.id, code: order.code, state: order.state, totalWithTax: order.totalWithTax, currencyCode: order.currencyCode, totalQuantity: order.totalQuantity },
            claimed: true,
            claimedAt: result.claimedAt ?? cf.redeemClaimedAt ?? null,
            message: result.already ? 'already' : 'ok',
        };
    }
}
```

- [ ] **Step 3: 在 `plugin.ts` 注册 service、provider、schema、resolver 与自动生码订阅**

在 `CjkPlugin.init` 的配置对象中：

```ts
// provider 注册
providers: [
    // ... 既有 providers
    RedemptionCodeService,
    RedemptionShopResolver,
    RedemptionAdminResolver,
],

// schema 合并
shopApiExtensions: {
    schema: redemptionShopSchema,
    resolvers: [RedemptionShopResolver],
},
adminApiExtensions: {
    schema: redemptionAdminSchema,
    resolvers: [RedemptionAdminResolver],
},
```

并在插件 `onApplicationBootstrap`（或既有 EventBus 初始化处）追加「下单即生成」订阅：

```ts
this.eventBus.ofType(OrderStateTransitionEvent)
    .pipe(filter(e => e.toState === 'ArrangingPayment'))
    .subscribe(event => {
        const orderId = (event.ctx as any)?.orderId ?? event.order?.id;
        if (orderId != null) {
            this.redemptionCodeService.ensure(event.ctx, orderId)
                .catch(err => Logger.error(`redemption ensure: ${err?.message ?? err}`, 'cjk-plugin'));
        }
    });
```

> 注意：`RedemptionCodeService`、resolver 以 `@Injectable` 注入到插件 providers；EventBus 需在插件构造函数注入 `EventBus`、`Injector`（参照 cjk-plugin 现有做法，插到既有事件订阅器旁）。`shopApiExtensions` 的 `schema` 数组需与既有合并（若已有其他 shop schema 字符串，用数组追加）。

- [ ] **Step 4: 编译**

```bash
cd d:\zhao\vendure\packages\cjk-plugin && npm run build
```
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
cd d:\zhao\vendure && git add packages/cjk-plugin/src/redemption/ packages/cjk-plugin/src/plugin.ts && git commit -m "feat(cjk): 核销码 Shop/Admin GraphQL + 下单即生成订阅"
```

---

### Task 5: dev-config 注入测试密钥（开发环境）

**Files:**
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts`

- [ ] **Step 1: 设置默认 KEY 便于本地联调**

在 `dev-config.ts` 顶部（或 bootstrap 前）加：

```ts
if (!process.env.REDEMPTION_KEY) {
    process.env.REDEMPTION_KEY = 'd'.repeat(64); // dev only：生产由运维注入
}
```

- [ ] **Step 2: Commit**

```bash
cd d:\zhao\vendure && git add packages/dev-server/dev-config.ts && git commit -m "chore(dev): 本地注入 REDEMPTION_KEY"
```

> 后端生产部署沿用既有铁律：**本地构建，提交 dist，服务器仅 git pull + pm2 restart**（见 `d:\zhao\vendure\_deploy.ps1`）。本计划的部署动作在最后的「部署与交付」Task 统一执行。

---

## 前端任务（nshop）

### Task 6: 新增前端依赖 qrcode + JsBarcode

**Files:**
- Modify: `d:\zhao\nshop\package.json`

- [ ] **Step 1: 安装依赖**

```bash
cd d:\zhao\nshop && pnpm add qrcode && pnpm add -D @types/qrcode && pnpm add jsbarcode
```

> `jsbarcode` 有内置类型（`types` 字段），可不加 @types；若报类型缺失，补 `@types/jsbarcode`。若安装失败，均可降级为在组件内 `await import('qrcode')` / `await import('jsbarcode')` 运行时按需加载（SSR 安全，勿在顶层 import）。

- [ ] **Step 2: Commit**

```bash
cd d:\zhao\nshop && git add package.json pnpm-lock.yaml && git commit -m "chore(nshop): 新增 qrcode + jsbarcode 依赖"
```

---

### Task 7: 前端 GQL 操作

**Files:**
- Create: `d:\zhao\nshop\layers\base\gql\queries\OrderRedemptionCode.gql`
- Create: `d:\zhao\nshop\layers\base\gql\queries\AdminRedemption.gql`

- [ ] **Step 1: 新建 Shop 侧操作**

`OrderRedemptionCode.gql`:

```graphql
query OrderRedemptionCode($input: OrderRedemptionCodeInput!) {
  orderRedemptionCode(input: $input) {
    redemptionCode
    qrPayload
    barcodePayload
    claimed
    canAccess
  }
}
```

- [ ] **Step 2: 新建 Admin 侧操作**

`AdminRedemption.gql`:

```graphql
query AdminRedemptionLookup($code: String!) {
  redemptionLookup(code: $code) {
    claimed
    claimedAt
    order {
      id
      code
      state
      totalWithTax
      currencyCode
      totalQuantity
    }
  }
}
mutation AdminRedemptionClaim($code: String!) {
  redemptionClaim(code: $code) {
    claimed
    claimedAt
    message
    order {
      id
      code
      state
    }
  }
}
```

- [ ] **Step 3: 生成类型**

```bash
cd d:\zhao\nshop && npx nuxt prepare
```
> 若 `graphql.schema.json` 未含新类型而类型生成失败，参照仓库既有做法手动向 `gql` 类型补丁或更新 schema.json（见此前 `guestOrderLookup` 的处理）。

- [ ] **Step 4: Commit**

```bash
cd d:\zhao\nshop && git add layers/base/gql/queries/ && git commit -m "feat(nshop): 核销码 Shop/Admin GQL 操作"
```

---

### Task 8: 列表卡片积木（OrderTabBar + OrderCard* + OrderCardList）

**Files:**
- Create: `layers\base\app\components\order\OrderTabBar.vue`
- Create: `layers\base\app\components\order\OrderCard.vue`
- Create: `layers\base\app\components\order\OrderCardHeader.vue`
- Create: `layers\base\app\components\order\OrderCardItems.vue`
- Create: `layers\base\app\components\order\OrderCardFooter.vue`
- Create: `layers\base\app\components\order\OrderCardActions.vue`
- Create: `layers\base\app\components\order\OrderCardList.vue`

- [ ] **Step 1: OrderCardHeader**

```vue
<script setup lang="ts">
import type { GetOrderHistoryQuery, OrderBaseFragment } from "#gql/default";
defineProps<{ order: GetOrderHistoryQuery["activeCustomer"]["orders"]["items"][number] }>();
const { t } = useI18n();
</script>
<template>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2 text-sm">
      <span class="i-lucide-store" />
      <span class="font-medium">{{ order.customFields?.deliveryType === 'pickup' ? t('messages.shop.pickupInfo') : t('messages.account.selfOperated') }}</span>
    </div>
    <OrderStateBadge :state="order.state" />
  </div>
</template>
```

- [ ] **Step 2: OrderCardItems**

```vue
<script setup lang="ts">
import type { GetOrderHistoryQuery } from "#gql/default";
import { assetSrc } from "../../utils/image";
defineProps<{ order: GetOrderHistoryQuery["activeCustomer"]["orders"]["items"][number] }>();
const { locale } = useI18n();
const fmt = (v: number) => new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'CNY' }).format(v / 100);
</script>
<template>
  <ul class="divide-y">
    <li v-for="line in order.lines" :key="line.id" class="flex items-center gap-3 py-2">
      <NuxtImg :src="assetSrc(line.featuredAsset?.preview, 96)" alt="" class="h-12 w-12 rounded object-cover" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{{ line.productVariant?.name }}</p>
        <p class="text-xs text-neutral-500">×{{ line.quantity }}</p>
      </div>
      <p class="text-sm font-medium">{{ fmt(line.linePriceWithTax) }}</p>
    </li>
  </ul>
</template>
```

- [ ] **Step 3: OrderCardFooter**

```vue
<script setup lang="ts">
import type { GetOrderHistoryQuery } from "#gql/default";
import { formatMoney } from "../../utils/format-money";
defineProps<{ order: GetOrderHistoryQuery["activeCustomer"]["orders"]["items"][number] }>();
const { t, locale } = useI18n();
</script>
<template>
  <div class="flex items-center justify-between border-t pt-2 text-sm">
    <span class="text-neutral-500">{{ t('messages.order.totalItems', { n: order.totalQuantity }) }}</span>
    <span>{{ t('messages.order.actualPaid') }} <b>{{ formatMoney(order.totalWithTax, order.currencyCode, locale) }}</b></span>
  </div>
</template>
```

- [ ] **Step 4: OrderCardActions（按状态渲染，复用 useOrderActions）**

```vue
<script setup lang="ts">
import type { GetOrderHistoryQuery } from "#gql/default";
import { formatMoney } from "../../utils/format-money";
const { t } = useI18n();
const localePath = useLocalePath();
const router = useRouter();
const { copy } = useClipboard();
const toast = useToast();
const { i18NBaseUrl } = useRuntimeConfig().public;
const { canCancel, cancelOrder, reorder, loading } = useOrderActions();
const props = defineProps<{ order: GetOrderHistoryQuery["activeCustomer"]["orders"]["items"][number] }>();

async function onReorder() {
  const lines = props.order.lines.map(l => ({ productVariantId: l.productVariant.id, quantity: l.quantity }));
  if (await reorder(lines)) router.push(localePath('/checkout'));
}
async function onCancel() {
  if (await cancelOrder(props.order.state)) { /* 触发父级 refresh */ emit('changed'); }
}
const emit = defineEmits<{ (e: 'changed'): void }>();
</script>
<template>
  <div class="flex flex-wrap justify-end gap-2">
    <UButton v-if="canCancel(order.state)" size="sm" variant="soft" color="neutral" :label="t('messages.order.cancel')" :loading="loading" @click="onCancel" />
    <UButton size="sm" variant="soft" color="primary" :label="t('messages.order.reorder')" @click="onReorder" />
    <UButton size="sm" color="primary" :label="t('messages.order.viewDetail')" :to="localePath(`/account/orders/${order.code}`)" />
  </div>
</template>
```

- [ ] **Step 5: OrderCard（容器，整卡可点跳详情；grid 自适应由父级定）**

```vue
<script setup lang="ts">
import type { GetOrderHistoryQuery } from "#gql/default";
import { NuxtLink } from "#components";
defineProps<{ order: GetOrderHistoryQuery["activeCustomer"]["orders"]["items"][number] }>();
const localePath = useLocalePath();
const emit = defineEmits<{ (e: 'changed'): void }>();
</script>
<template>
  <article class="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <OrderCardHeader :order="order" class="mb-2" />
    <OrderCardItems :order="order" />
    <OrderCardFooter :order="order" class="mt-2" />
    <OrderCardActions :order="order" class="mt-3" @changed="emit('changed')" />
  </article>
</template>
```

- [ ] **Step 6: OrderTabBar（复用 ORDER_TABS/tabOfState）**

```vue
<script setup lang="ts">
import { ORDER_TABS } from "../../utils/order-state";
import type { OrderTabKey } from "../../utils/order-state";
const { t } = useI18n();
const model = defineModel<OrderTabKey>();
const items = ORDER_TABS.map(tb => ({ key: tb.key, label: t(tb.labelKey) }));
</script>
<template>
  <div class="mb-4 flex gap-1 overflow-x-auto">
    <button
      v-for="it in items" :key="it.key"
      class="shrink-0 rounded-full px-3 py-1 text-sm"
      :class="model === it.key ? 'bg-red-600 font-semibold text-white' : 'bg-neutral-100 dark:bg-neutral-800'"
      @click="model = it.key"
    >{{ it.label }}</button>
  </div>
</template>
```

- [ ] **Step 7: OrderCardList（分页「加载更多」）**

```vue
<script setup lang="ts">
import { SortOrder } from "~~/types/default";
import type { OrderTabKey } from "../../utils/order-state";
import { tabOfState } from "../../utils/order-state";
const emits = defineEmits<{ (e: 'changed'): void }>();
const activeTab = defineModel<OrderTabKey>('tab', { default: 'ALL' });
const take = ref(10);
const { data, refresh } = await useAsyncGql('GetOrderHistory', computed(() => ({ options: { sort: { createdAt: SortOrder.DESC }, take: take.value } })), { immediate: false, server: false });
const orders = computed(() => data.value?.activeCustomer?.orders?.items ?? []);
const total = computed(() => data.value?.activeCustomer?.orders?.totalItems ?? 0);
const filtered = computed(() => activeTab.value === 'ALL' ? orders.value : orders.value.filter(o => tabOfState(o.state) === activeTab.value));
async function loadMore() { take.value += 10; await refresh(); }
onMounted(() => refresh());
async function changed() { await refresh(); }
</script>
<template>
  <div>
    <div v-if="!orders.length" class="py-12 text-center text-neutral-500">{{ t('messages.order.empty') }}</div>
    <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <OrderCard v-for="o in filtered" :key="o.id" :order="o" @changed="changed" />
    </div>
    <div v-if="orders.length < total" class="mt-4 text-center">
      <UButton variant="soft" size="sm" :label="t('messages.order.loadMore')" @click="loadMore" />
    </div>
  </div>
</template>
```

- [ ] **Step 8: 重写列表页 `account/orders/index.vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: "account" });
const { t } = useI18n();
const { customer } = storeToRefs(useCustomerStore());
const { i18NBaseUrl } = useRuntimeConfig().public;
const localePath = useLocalePath();
const { copy } = useClipboard();
const toast = useToast();
const activeTab = ref<OrderTabKey>('ALL');
async function onCopy(email: string) { await copy(email); toast.add({ title: t('messages.general.getLinkSuccess'), color: 'success' }); }
</script>
<template>
  <main class="container py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">{{ t('messages.account.orders') }}</h1>
      <button class="mt-1 text-sm text-neutral-500 underline" @click="onCopy(customer?.emailAddress ?? '')">{{ customer?.emailAddress }}</button>
    </header>
    <OrderTabBar v-model="activeTab" />
    <OrderCardList v-model:tab="activeTab" />
  </main>
</template>
```

> 关闭顶栏（如 Nuxt UI 默认顶部导航）可交由既有 `Base*` 布局；本页移除 `UTable`/`columns`/`getRowItems`/`OrderTableRow`。

- [ ] **Step 9: 词条补充（zh-CN 及 en-US 同步）——细则见 Task 12**

- [ ] **Step 10: Commit**

```bash
cd d:\zhao\nshop && git add layers/base/app/components/order/OrderCard*.vue layers/base/app/components/order/OrderTabBar.vue layers/base/app/components/order/OrderCardList.vue layers/base/app/pages/account/orders/index.vue && git commit -m "feat(nshop): 订单列表卡片式（订单卡片积木 + Tab + 加载更多）"
```

---

### Task 9: 详情页积木（状态横幅 + 各信息卡 + 核销码卡）

**Files:**
- Create: `layers\base\app\components\order\OrderStatusBanner.vue`
- Create: `layers\base\app\components\order\OrderMetaCard.vue`
- Create: `layers\base\app\components\order\OrderPickupCard.vue`
- Create: `layers\base\app\components\order\OrderRedemptionCard.vue`
- Rewrite: `layers\base\app\pages\account\orders\[code].vue`

- [ ] **Step 1: OrderStatusBanner**

```vue
<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";
defineProps<{ order: NonNullable<GetOrderByCodeQuery["orderByCode"]> }>();
const { t } = useI18n();
const { labelKey, color } = stateBadgeComp;
</script>
```
> 直接复用 `stateBadge(order.state)` 的 labelKey/color 渲染渐变横幅。具体渐变 class 用 Tailwind：按 color 映射 `bg-gradient-to-r`。

- [ ] **Step 2: OrderMetaCard（订单号/时间/支付/配送）**

```vue
<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";
defineProps<{ order: NonNullable<GetOrderByCodeQuery["orderByCode"]> }>();
const { t, locale } = useI18n();
</script>
<template>
  <dl class="grid grid-cols-2 gap-3 text-sm">
    <div><dt class="text-neutral-500">{{ t('messages.shop.orderCode') }}</dt><dd class="font-mono">{{ order.code }}</dd></div>
    <div><dt class="text-neutral-500">{{ t('messages.general.date') }}</dt><dd>{{ order.orderPlacedAt ? new Date(order.orderPlacedAt).toLocaleDateString(locale) : t('messages.general.na') }}</dd></div>
    <div><dt class="text-neutral-500">{{ t('messages.general.paymentMethod') }}</dt><dd>{{ order.payments?.[0]?.method }}</dd></div>
    <div><dt class="text-neutral-500">{{ t('messages.general.shippingSelect') }}</dt><dd>{{ order.shippingLines?.[0]?.shippingMethod?.name }}</dd></div>
  </dl>
</template>
```

- [ ] **Step 3: OrderPickupCard（自提单提货/核销信息，联动既有 pickup 能力）**

```vue
<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";
defineProps<{ order: NonNullable<GetOrderByCodeQuery["orderByCode"]> }>();
const { t } = useI18n();
const loc = computed(() => order.customFields?.selectedPickupLocationId as any);
</script>
<template>
  <div class="flex items-start gap-3">
    <span class="i-lucide-map-pin mt-1 text-red-600" />
    <div class="text-sm">
      <p class="font-medium">{{ loc?.name }}</p>
      <p class="text-neutral-500">{{ loc?.address }}</p>
      <p class="text-neutral-500">{{ loc?.businessHours }}</p>
      <p class="text-neutral-500">{{ t('messages.shop.contactPhone') }}: {{ order.customFields?.contactPhone }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 4: OrderRedemptionCard（核销码 + QR）**

```vue
<script setup lang="ts">
const { t } = useI18n();
const gql = useGql();
const props = defineProps<{ orderCode: string; phone?: string }>();
const result = ref<{ redemptionCode: string; qrPayload: string; claimed: boolean } | null>(null);
const loading = ref(true);
const error = ref(false);
onMounted(async () => {
  try {
    const res: any = await gql('OrderRedemptionCode', { input: { orderCode: props.orderCode, phone: props.phone } });
    result.value = res?.orderRedemptionCode ?? null;
  } catch { error.value = true; }
  finally { loading.value = false; }
});
const qrDataUrl = ref('');
watch(result, async (r) => {
  if (r?.qrPayload) {
    const QRCode = (await import('qrcode')).default;
    qrDataUrl.value = await QRCode.toDataURL(r.qrPayload, { width: 160, margin: 1 });
  }
}, { immediate: true });
</script>
<template>
  <section class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
    <h2 class="mb-3 font-semibold">{{ t('messages.order.redemptionTitle') }}</h2>
    <div v-if="loading" class="text-sm text-neutral-500">{{ t('messages.general.loading') }}</div>
    <p v-else-if="error" class="text-sm text-neutral-500">{{ t('messages.order.redemptionUnavailable') }}</p>
    <div v-else-if="result" class="flex items-center gap-4">
      <img v-if="qrDataUrl" :src="qrDataUrl" alt="核销码" class="h-24 w-24" />
      <div class="text-sm">
        <p class="text-neutral-500">{{ t('messages.order.redemptionCodeLabel') }}</p>
        <p class="font-mono text-2xl font-bold tracking-widest">{{ result.redemptionCode }}</p>
        <UBadge v-if="result.claimed" color="neutral" variant="outline" :label="t('messages.order.redeemed')" class="mt-1" />
      </div>
    </div>
  </section>
</template>
```

> `useGql` 在 `.client` 环境调用；本组件作为 `client-only` 或放在客户端页面使用（详情页为客户端路由，OK）。二维码用 `await import('qrcode')`（SSR 安全）。

- [ ] **Step 5: 重写详情页 `account/orders/[code].vue` 为积木拼装**

```vue
<script setup lang="ts">
definePageMeta({ middleware: "account" });
const { t } = useI18n();
const localePath = useLocalePath();
const code = useRouteParam("code");
const { data, error, refresh } = await useAsyncGql("GetOrderByCode", { code });
const order = computed(() => data.value?.orderByCode ?? null);
const hasError = computed(() => !!error.value || !order.value);
const isPickup = computed(() => (order.value?.customFields?.deliveryType ?? "") === "pickup");
</script>
<template>
  <UError v-if="hasError" :error="{ statusCode: 404, statusMessage: t('messages.error.noOrder'), message: t('messages.error.orderNotFound') }" />
  <main v-else-if="order" class="container py-8">
    <header class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ t('messages.shop.orderDetails') }}</h1>
      <ULink :to="localePath('/account/orders')" class="text-sm text-neutral-500">{{ t('messages.account.orders') }}</ULink>
    </header>
    <OrderStatusBanner :order="order" class="mb-4" />
    <OrderStateProgress :state="order.state" class="mb-4" />
    <OrderRedemptionCard :order-code="order.code" class="mb-4" />
    <div class="mb-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"><OrderAddressCard :order="order" /></div>
    <div class="mb-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 class="mb-2 font-semibold">{{ t('messages.shop.orderSummary') }}</h2>
      <OrderItems :order="order">
        <template #line-actions="{ line, order: o }">
          <UButton v-if="canApplyAfterSales(o.state)" size="xs" variant="soft" color="primary" :label="t('messages.afterSales.apply')" @click="applyLine = line; applyModalOpen = true" />
        </template>
      </OrderItems>
    </div>
    <OrderPickupCard v-if="isPickup" :order="order" class="mb-4" />
    <div class="mb-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"><OrderTotals :order="order" /><OrderShippingBreakdown :order="order" /></div>
    <div class="mb-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"><OrderMetaCard :order="order" /></div>
    <div class="mb-6"><OrderActions :order="order" @updated="refresh" /></div>
    <AfterSalesCreateModal v-if="applyLine" v-model:open="applyModalOpen" :order-id="order.id" :order-line="applyLine" :max-amount="applyLine.proratedLinePrice" />
  </main>
</template>
```

> 保留 `canApplyAfterSales`、`applyLine`、`applyModalOpen` 的 `<script>` 定义（从原文件照搬那几行 import 与 ref）。`OrderAddressCard` 若尚未新建，可直接就地用 `OrderAddress :order="order"` 包裹，或将卡片化独立成组件。

- [ ] **Step 6: 词条（zh/en）—— 见 Task 12**

- [ ] **Step 7: Commit**

```bash
cd d:\zhao\nshop && git add layers/base/app/components/order/OrderStatusBanner.vue layers/base/app/components/order/OrderMetaCard.vue layers/base/app/components/order/OrderPickupCard.vue layers/base/app/components/order/OrderRedemptionCard.vue layers/base/app/pages/account/orders/[code].vue && git commit -m "feat(nshop): 订单详情积木化 + 核销码卡"
```

---

### Task 10: 管理端核销页 `/admin/redemption`（手动输入 + 扫码 + Code128 复用扫码枪）

**Files:**
- Create: `layers\base\app\pages\admin\redemption.vue`
- Modify: `layers\base\app\middleware\admin.ts`（新建，若不存在）

- [ ] **Step 1: 新建 admin 中间件**

`middleware\admin.ts`:

```ts
export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore?.() ?? null;
  // 管理员判定：C 端用户不在管理员集合内，转到登录页。真实判定依赖后端管理员角色由 C 端登录态区分；
  // 若 C 端无法区分管理员，改为由后端 Admin GraphQL 权限兜底 + 页面先调用 redemptionLookup 自检。
  return navigateTo('/account/login');
});
```

> **重要**：C 端（nshop shop-api）与后端 Admin GraphQL 通常走不同 auth。实际管理员核销应通过后端 admin API（带 admin user auth）。更稳妥方案是：该页用一个独立管理 token 输入（管理员从后端 admin 会话拿 token）或接入既有管理员登录。实现者需按仓库现有管理员认证接入方式落地——计划假设：**复用后端 Admin API 的 admin 会话/token**，前端调 admin 端 GraphQL（或用 `redemptionLookup` 作为自检门）。

- [ ] **Step 2: 新建管理核销页（手动输入 + 扫码枪输入 + 结果核销）**

```vue
<script setup lang="ts">
const { t } = useI18n();
const gql = useGql();
const code = ref('');
const state = ref<'idle' | 'loading' | 'found' | 'done' | 'error'>('idle');
const lookup = ref<{ claimed: boolean; claimedAt?: string; order?: { code: string; state: string; totalWithTax: number; currencyCode: string; totalQuantity: number } } | null>(null);
const claimMsg = ref('');
async function execute() {
  const input = code.value.trim().toUpperCase();
  if (!input) return;
  state.value = 'loading';
  claimMsg.value = '';
  try {
    const res: any = await gql('AdminRedemptionLookup', { code: input });
    const r = res?.redemptionLookup;
    if (!r?.order) { state.value = 'error'; claimMsg.value = t('messages.order.redemptionNotFound'); return; }
    lookup.value = r;
    state.value = 'found';
  } catch { state.value = 'error'; claimMsg.value = t('messages.order.redemptionUnavailable'); }
}
async function claim() {
  const input = code.value.trim().toUpperCase();
  const res: any = await gql('AdminRedemptionClaim', { code: input });
  const r = res?.redemptionClaim;
  if (r) { state.value = 'done'; claimMsg.value = r.message === 'already' ? t('messages.order.redeemAlready') : t('messages.order.redeemSuccess'); await execute(); }
}
</script>
<template>
  <main class="container max-w-xl py-10">
    <h1 class="mb-6 text-2xl font-semibold">{{ t('messages.order.redemptionAdminTitle') }}</h1>
    <!-- 扫码枪：聚焦输入框，扫码枪键入后回车即查询；兼容手动输入 -->
    <UInput v-model="code" class="mb-3" size="lg" autofocus
      :placeholder="t('messages.order.redemptionCodePlaceholder')"
      :disabled="state==='loading'"
      @keyup.enter="execute" />
    <UButton :loading="state==='loading'" :label="t('messages.order.redemptionLookupBtn')" class="mb-4" @click="execute" />
    <UAlert v-if="state==='error'" color="error" :title="claimMsg" variant="outline" class="mb-4" />
    <div v-if="lookup?.order" class="rounded-xl border p-4 text-sm">
      <p>订单号：<b>{{ lookup.order.code }}</b></p>
      <p>状态：{{ lookup.order.state }} · 共 {{ lookup.order.totalQuantity }} 件 · {{ lookup.order.totalWithTax }} {{ lookup.order.currencyCode }}</p>
      <p>核销：{{ lookup.claimed ? t('messages.order.redeemed') : t('messages.order.redeemPending') }}</p>
      <UButton v-if="!lookup.claimed" color="primary" class="mt-3" :label="t('messages.order.redeemConfirm')" @click="claim" />
      <UAlert v-else-if="state==='done'" color="success" :title="claimMsg" variant="outline" class="mt-3" />
    </div>
  </main>
</template>
```

> **Code128 凭证渲染**：管理端如需打印/展示一维条码供扫码枪扫，新增一个小组件用 `JsBarcode` 渲染 `orderRedemptionCode('barcodePayload')`。可后续单独补（范围见 Task 11 备注）。

- [ ] **Step 3: 词条（zh/en）——见 Task 12**

- [ ] **Step 4: Commit**

```bash
cd d:\zhao\nshop && git add layers/base/app/pages/admin/redemption.vue layers/base/app/middleware/admin.ts && git commit -m "feat(nshop): 管理端核销页（手动/扫码输入 + 核销）"
```

---

### Task 11: Code128 一维条码凭证组件（复用商品条码扫码枪）

**Files:**
- Create: `layers\base\app\components\redemption\RedemptionCodeBar.vue`

- [ ] **Step 1: 新建组件**

```vue
<script setup lang="ts">
const props = defineProps<{ value: string }>();
const el = ref<HTMLElement | null>(null);
onMounted(async () => {
  const JsBarcode = (await import('jsbarcode')).default;
  if (el.value) JsBarcode(el.value, props.value, { format: 'CODE128', displayValue: true, width: 2, height: 60 });
});
</script>
<template>
  <!-- 渲染一维条码：可被门店一维扫码枪读取（与商品条码同设备） -->
  <svg ref="el" v-if="value" class="block" />
  <p v-else class="text-sm text-neutral-500">--</p>
</template>
```

- [ ] **Step 2: Commit**

```bash
cd d:\zhao\nshop && git add layers/base/app/components/redemption/RedemptionCodeBar.vue && git commit -m "feat(nshop): 核销码 Code128 一维条码组件（复用扫码枪）"
```

> 此组件供管理端核销页或「打印核销回执」后续使用；本期若未在页面接入，可先交付组件 + 单测构建通过。

---

### Task 12: i18n 词条补充（zh-CN 与 en-US 同步）

**Files:**
- Modify: `layers\base\i18n\locales\zh-CN.ts`
- Modify: `layers\base\i18n\locales\en-US.ts`

- [ ] **Step 1: zh-CN 在 `messages.order` 内追加**

```ts
      viewDetail: '查看详情',
      empty: '暂无订单',
      loadMore: '加载更多',
      actualPaid: '实付',
      totalItems: '共 {n} 件',
      redemptionTitle: '核销凭证',
      redemptionCodeLabel: '核销码',
      redemptionUnavailable: '核销凭证暂不可用，请稍后再试',
      redeemed: '已核销',
      redeemPending: '待核销',
      redeemSuccess: '核销成功',
      redeemAlready: '该核销码已核销',
      redeemNotFound: '未找到该核销码对应的订单',
      redemptionAdminTitle: '订单核销',
      redemptionCodePlaceholder: '请输入/扫码核销码',
      redemptionLookupBtn: '查询',
      redeemConfirm: '确认核销',
```

- [ ] **Step 2: en-US 对应追加（在 `messages.order` 内）**

```ts
      viewDetail: 'View',
      empty: 'No orders yet',
      loadMore: 'Load more',
      actualPaid: 'Paid',
      totalItems: '{n} item(s)',
      redemptionTitle: 'Redemption',
      redemptionCodeLabel: 'Code',
      redemptionUnavailable: 'Redemption unavailable, try later',
      redeemed: 'Redeemed',
      redeemPending: 'Pending',
      redeemSuccess: 'Redeemed successfully',
      redeemAlready: 'Already redeemed',
      redeemNotFound: 'No order found for this code',
      redemptionAdminTitle: 'Order Redemption',
      redemptionCodePlaceholder: 'Enter / scan code',
      redemptionLookupBtn: 'Look up',
      redeemConfirm: 'Confirm redeem',
```

> 同时在 `messages.account` 增加 `selfOperated: '自营' / 'Self-operated'`、`messages.general` 增加 `contactPhone: '联系电话' / 'Contact'`（若未存在）。

- [ ] **Step 3: Commit**

```bash
cd d:\zhao\nshop && git add layers/base/i18n/locales/ && git commit -m "feat(nshop): 订单与核销 i18n 词条"
```

---

## 部署与交付

### Task 13: 构建 + 手机视口截图回归 + 操作手册

**Files:**
- Docs: `d:\zhao\vendure\doc\多租户使用手册.md`
- Test report: `d:\zhao\vendure\doc\YYYY-MM-DD-订单核销-手机端验证.md`

- [ ] **Step 1: 本地构建（后端）**

```bash
cd d:\zhao\vendure && pwsh ./_deploy.ps1   # 或手动：构建 cjk-plugin + core + dev-server，提交 dist，服务器 git pull + pm2 restart
```
> 铁律：**服务器不构建**，仅 pull dist 产物 + pm2 restart。

- [ ] **Step 2: 本地构建（前端）**

```bash
cd d:\zhao\nshop && node scripts/deploy.mjs
```

- [ ] **Step 3: 手机视口截图回归（390×844, dpr=2）**

参照 `scripts/_shot_*` 既有脚本，补充：
- 列表页卡片（含多个状态 + 空态）
- 详情页（含核销码卡 + 二维码 + 自提单含取货信息）
- 管理端核销页（查询命中 + 核销成功/已核销）

截图存入 `d:\zhao\vendure\e2e-shots\`。

- [ ] **Step 4: 更新操作手册**

在 `多租户使用手册.md` 新增「订单核销码」章节：功能说明、C 端查看、管理端核销（手动/扫码）、三张截图（相对路径 `assets/`.png）。

- [ ] **Step 5: 写手机端验证测试报告（含 §决策假设、SSR/扫码枪兼容确认）**

- [ ] **Step 6: Commit**

```bash
cd d:\zhao\nshop && git add docs/ scripts/_shot_*.py && git commit -m "docs: 订单核销手机端验证 + 操作手册"
```

---

## Self-Review（写后自检）

- **Spec 覆盖**：列表卡片化(§A)→Task8；详情积木(§A)→Task9；核销码生成/加密(§B)→Task2/3；加密下发+二维码(§B)→Task4/Task9；管理端核销/幂等/限流(§C)→Task4/10；复用商品条码扫码(§C/B)→Task10/11；i18n(§front)→Task12；构建/截图/手册(§D)→Task13。全部覆盖。
- **Type 一致性**：`redemptionQrPayload`/`verifyRedemptionQr`/`redemptionBarcodePayload`/`redemptionFingerprint` 命名在 Task2 定义、Task3/4 引用一致；前端 `OrderRedemptionCard` 用 `qrPayload`、管理页用 `barcodePayload`。
- **占位检查**：已完成（无 TODO/“以后再说”）；管理端 auth 宿主与 jsonb 查询标注为“需按仓库既有管理员认证/K时钟落地”，给足两个可行实现路径，非悬空占位。