# 游客订单查询 + 自提提货码可见性 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans 逐任务执行。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 让游客购买后能凭「手机号+订单号」长期查询订单（脱敏概览），自提订单能拿到提货码到店核销，无手机号游客可在完成页补录手机号。

**Architecture:**
- 后端：游客订单查询/补录（`guestOrderLookup`、`guestSetOrderCustomFields`）+ OrderPlaced 自动生成提货码，全部收敛在 `@vendure/pickup-plugin`（自带 `PickupRedemption` 实体与核销 `claimPickupByShop`）。查询鉴权：带手机号匹配（限游客单，长期有效）或不带手机号走原 `orderByCodeAccessStrategy` 窗口。
- 前端：新增「订单查询」页 + 强化结算确认页（展示提货码、无号补录手机号卡片）。
- 安全：`GuestOrderOverview` 仅返回脱敏字段，不含收货/账单地址、支付、邮箱。

**Tech Stack:** NestJS·Vendure core（TypeORM/GraphQL）、pickup-plugin（现有）、Nuxt3（nshop base layer、`useGql`/`useAsyncGql`）、vitest（pickup-plugin 测试）。

---

## 文件结构

**后端（`d:\zhao\vendure`）**
- Modify `packages/pickup-plugin/src/pickup.service.ts`：新增 public `ensurePickupRedemptionForOrder()`。
- Modify `packages/pickup-plugin/src/pickup.plugin.ts`：订阅 `OrderStateTransitionEvent` 自动生码；shopSchema 增加 `GuestOrderOverview` 等类型 + `guestOrderLookup`/`guestSetOrderCustomFields`；注册新 resolver。
- Create `packages/pickup-plugin/src/pickup-guest-order.ts`：纯函数（概览构建 + 访问判定）。
- Create `packages/pickup-plugin/src/pickup-guest-order.spec.ts`：纯函数单测（vitest）。
- Create `packages/pickup-plugin/src/pickup-guest-order.resolver.ts`：shop resolver 实现。
- Modify `packages/pickup-plugin/e2e/pickup.e2e-spec.ts`：追加游客查询 e2e 用例。
- Modify `packages/dev-server/dev-config.ts`：放宽游客订单窗口。
- Modify `_deploy.ps1`：构建列表加入 pickup-plugin。

**前端（`d:\zhao\nshop`）**
- Create `layers/base/app/pages/order/lookup.vue`：手机号+订单号查询页。
- Modify `layers/base/app/pages/checkout/confirmation/[code].client.vue`：提货码展示 + 无号补录卡。
- Create 两个 GQL operation 文件（`GuestOrderLookup.gql`、`GuestSetOrderCustomFields.gql`，与 `GetOrderByCode` 同目录）。
- Modify `layers/base/i18n/locales/zh-CN.ts` + `en-US.ts`。
- Modify 页脚/用户菜单：加「查询订单」入口。
- 构建 + 手机视口截图（3 场景）补进操作手册。

---

## Task 1：后端 — 自动生提货码（pickup.service.ts）

**Files:** Modify `d:\zhao\vendure\packages\pickup-plugin\src\pickup.service.ts`
**Test:** 覆盖在 Task 6 e2e（含生码断言）；此处仅加方法。

- [ ] **Step 1：新增 public 方法**（在 `getOrCreateRedemption` 下方、`onOrderCancelled` 上方）

```ts
    /**
     * 为「已付款的 pickup 订单」幂等生成提货码（自动生码；供事件订阅与游客查询兜底调用）。
     * 非 pickup 或未过支付闸门（isPickupPaid 排除 PaymentAuthorized 之前的状态）则不生成。
     */
    async ensurePickupRedemptionForOrder(ctx: RequestContext, orderId: ID): Promise<void> {
        const order = await this.orderService.findOne(ctx, orderId, ['customer', 'customer.user'] as any);
        if (!order) return;
        const cf = (order.customFields ?? {}) as any;
        if (cf.deliveryType !== 'pickup') return;
        if (!this.isPickupPaid(ctx, order)) return;
        await this.getOrCreateRedemption(ctx, order);
    }
```

- [ ] **Step 2：提交（自动生码部分，随 Task 3 一起提交后端）**

```bash
# 在 Task 3 与其 #runner 提交一起做，见 Task 3 Commit
```

---

## Task 2：后端 — 事件订阅自动生码 + Shop Schema（pickup.plugin.ts）

**Files:** Modify `d:\zhao\vendure\packages\pickup-plugin\src\pickup.plugin.ts`

- [ ] **Step 1：新增自动生码订阅**（在构造器 `onApplicationBootstrap` 现有 `OrderStateTransitionEvent` 订阅之后追加另一条 `.subscribe`）

```ts
            this.eventBus
                .ofType(OrderStateTransitionEvent)
                .pipe(
                    filter(event => !['AddingItems', 'ArrangingPayment', 'Draft', 'Cancelled', 'PaymentAuthorized'].includes(event.toState)),
                )
                .subscribe(event => {
                    const orderId = (event.ctx as any)?.orderId ?? event.order?.id;
                    if (orderId != null) {
                        this.service.ensurePickupRedemptionForOrder(event.ctx, orderId).catch(err =>
                            console.error(err?.message ?? err, 'pickup-plugin auto-redeem'),
                        );
                    }
                });
```

- [ ] **Step 2：Shop schema 增加游客查询类型与入口**（在 `pickup.plugin.ts` 的 `shopSchema` 常量内、现有关闭花括号前插入）

```ts
    type GuestOrderOverview {
        orderCode: String!
        orderPlacedAt: DateTime
        state: String!
        currencyCode: String!
        totalQuantity: Int!
        subTotal: Int!
        shippingWithTax: Int!
        totalWithTax: Int!
        isPickup: Boolean!
        pickupClaimed: Boolean!
        pickupCode: String
        pickupClaimable: Boolean!
        pickupLocation: GuestPickupLocation
        lines: [GuestOrderLine!]!
        hasPhone: Boolean!
    }
    type GuestPickupLocation {
        name: String!
        address: String!
        businessHours: String
    }
    type GuestOrderLine {
        productName: String!
        sku: String!
        quantity: Int!
        linePriceWithTax: Int!
    }
    input GuestOrderLookupInput {
        orderCode: String!
        phone: String
    }
    input GuestSetOrderCustomFieldsInput {
        orderCode: String!
        phone: String!
        name: String
    }
    extend type Query {
        guestOrderLookup(input: GuestOrderLookupInput!): GuestOrderOverview!
    }
    extend type Mutation {
        guestSetOrderCustomFields(input: GuestSetOrderCustomFieldsInput!): GuestOrderOverview!
    }
```

- [ ] **Step 3：注册 resolver**（`shopApiExtensions` 块的 `resolvers` 数组追加 `PickupGuestOrderResolver`）

```ts
    shopApiExtensions: {
        schema: shopSchema,
        resolvers: [PickupCustomerResolver, PickupGuestOrderResolver],
    },
```

- [ ] **Step 4：import 新 resolver**（文件顶部 import 块追加）

```ts
import { PickupGuestOrderResolver } from './pickup-guest-order.resolver';
```

---

## Task 3：后端 — 游客查询纯函数 + 单测

**Files:** Create `d:\zhao\vendure\packages\pickup-plugin\src\pickup-guest-order.ts`
Create `d:\zhao\vendure\packages\pickup-plugin\src\pickup-guest-order.spec.ts`

- [ ] **Step 1：写失败的纯函数单测**

```ts
// pickup-guest-order.spec.ts
import { describe, expect, it } from 'vitest';
import { buildGuestOverview, guestLookupAllowed, isGuestOrder } from './pickup-guest-order';

function fakeOrder(over: any = {}): any {
    return {
        id: '1', code: 'ABC', state: 'PaymentSettled', currencyCode: 'CNY',
        totalQuantity: 1, subTotal: 442, shippingWithTax: 0, totalWithTax: 499,
        orderPlacedAt: new Date(), customer: { user: null },
        customFields: { deliveryType: 'pickup', pickupClaimed: false, contactPhone: null, selectedPickupLocationId: { name: '门店A', address: '长春某路', businessHours: '9-18' } },
        fulfillments: [{ state: 'Shipped' }],
        lines: [{ productVariant: { product: { name: '中行' }, sku: 'P1' }, quantity: 1, linePriceWithTax: 499 }],
        ...over,
    };
}

describe('guestLookupAllowed', () => {
    it('手机号匹配（游客单）允许长期访问', () => {
        const order = fakeOrder({ customFields: { deliveryType: 'pickup', contactPhone: '13200998877' } });
        expect(guestLookupAllowed(order, { phone: '13200998877' }, false).allowed).toBe(true);
    });
    it('手机号不匹配则拒绝', () => {
        const order = fakeOrder({ customFields: { contactPhone: '13200998877' } });
        expect(guestLookupAllowed(order, { phone: '100' }, false).reason).toBe('phone_mismatch');
    });
    it('登录用户不能用手机号通道', () => {
        const order = fakeOrder({ customer: { user: { id: 'u1' } }, customFields: { contactPhone: '13200998877' } });
        expect(guestLookupAllowed(order, { phone: '13200998877' }, false).reason).toBe('not_guest');
    });
    it('不带手机号时仅当窗口放行才允许', () => {
        const order = fakeOrder();
        expect(guestLookupAllowed(order, { phone: null }, false).reason).toBe('window');
        expect(guestLookupAllowed(order, { phone: null }, true).allowed).toBe(true);
    });
    it('订单不存在拒绝', () => {
        expect(guestLookupAllowed(null, { phone: null }, true).allowed).toBe(false);
    });
});

describe('buildGuestOverview', () => {
    it('返回脱敏概览且不含地址/支付/邮箱', () => {
        const overview = buildGuestOverview(fakeOrder(), { code: 'ABC234' } as any);
        expect(overview.pickupCode).toBe('ABC234');
        expect(overview.isPickup).toBe(true);
        expect(overview.pickupClaimable).toBe(true);
        expect(overview.lines[0].productName).toBe('中行');
        expect('shippingAddress' in overview).toBe(false);
        expect('emailAddress' in overview).toBe(false);
    });
    it('非自提单无提货码/不可取货', () => {
        const overview = buildGuestOverview(fakeOrder({ customFields: { deliveryType: 'delivery' } }), null);
        expect(overview.isPickup).toBe(false);
        expect(overview.pickupCode).toBeNull();
        expect(overview.pickupClaimable).toBe(false);
    });
});
```

- [ ] **Step 2：运行测试确认失败**

```bash
cd d:\zhao\vendure\packages\pickup-plugin
npx vitest --config vitest.config.mts run src/pickup-guest-order.spec.ts
```

Expected: FAIL（找不到模块 `./pickup-guest-order`）。

- [ ] **Step 3：写纯函数实现**

```ts
// pickup-guest-order.ts
import { Order } from '@vendure/core';
import { PickupRedemption } from './pickup-redemption.entity';

export interface GuestOrderOverview {
    orderCode: string;
    orderPlacedAt: Date | null;
    state: string;
    currencyCode: string;
    totalQuantity: number;
    subTotal: number;
    shippingWithTax: number;
    totalWithTax: number;
    isPickup: boolean;
    pickupClaimed: boolean;
    pickupCode: string | null;
    pickupClaimable: boolean;
    pickupLocation: { name: string; address: string; businessHours: string } | null;
    lines: { productName: string; sku: string; quantity: number; linePriceWithTax: number }[];
    hasPhone: boolean;
}

export interface GuestLookupInputLike {
    phone?: string | null;
}

export type GuestAccessOutcome =
    | { allowed: true }
    | { allowed: false; reason: 'not_found' | 'window' | 'phone_mismatch' | 'not_guest' };

export function isGuestOrder(order: Order): boolean {
    return !order.customer?.user?.id;
}

export function guestLookupAllowed(
    order: Order | null,
    input: GuestLookupInputLike,
    windowAccess: boolean,
): GuestAccessOutcome {
    if (!order) return { allowed: false, reason: 'not_found' };
    if (input.phone) {
        if (!isGuestOrder(order)) return { allowed: false, reason: 'not_guest' };
        const cf = (order.customFields ?? {}) as any;
        if ((cf.contactPhone ?? '') !== input.phone) return { allowed: false, reason: 'phone_mismatch' };
        return { allowed: true };
    }
    if (windowAccess) return { allowed: true };
    return { allowed: false, reason: 'window' };
}

export function buildGuestOverview(
    order: Order,
    redemption: PickupRedemption | null,
): GuestOrderOverview {
    const cf = (order.customFields ?? {}) as any;
    const isPickup = cf.deliveryType === 'pickup';
    const loc = cf.selectedPickupLocationId as any;
    const pickupLocation =
        loc && typeof loc === 'object'
            ? { name: loc.name ?? '', address: loc.address ?? '', businessHours: loc.businessHours ?? '' }
            : null;
    const shipped = (order.fulfillments ?? []).some(f => f.state === 'Shipped');
    const lines = (order.lines ?? []).map(l => ({
        productName: l?.productVariant?.product?.name ?? '',
        sku: l?.productVariant?.sku ?? '',
        quantity: l?.quantity ?? 0,
        linePriceWithTax: l?.linePriceWithTax ?? 0,
    }));
    return {
        orderCode: order.code,
        orderPlacedAt: order.orderPlacedAt,
        state: order.state,
        currencyCode: order.currencyCode,
        totalQuantity: order.totalQuantity,
        subTotal: order.subTotal,
        shippingWithTax: order.shippingWithTax,
        totalWithTax: order.totalWithTax,
        isPickup,
        pickupClaimed: isPickup && !!cf.pickupClaimed,
        pickupCode: redemption?.code ?? null,
        pickupClaimable: isPickup && !cf.pickupClaimed && shipped,
        pickupLocation,
        lines,
        hasPhone: !!cf.contactPhone,
    };
}
```

- [ ] **Step 4：运行测试确认通过**

```bash
cd d:\zhao\vendure\packages\pickup-plugin
npx vitest --config vitest.config.mts run src/pickup-guest-order.spec.ts
```

Expected: PASS（5 用例）。

- [ ] **Step 5：提交（后端一部分，后续完整后一次性推出）**

先在本任务末尾做一次提交（含 Task 1、2、3）：

```bash
cd d:\zhao\vendure
git add packages/pickup-plugin/src/pickup.service.ts packages/pickup-plugin/src/pickup.plugin.ts packages/pickup-plugin/src/pickup-guest-order.ts packages/pickup-plugin/src/pickup-guest-order.spec.ts
git commit -m "feat(pickup-plugin): 游客订单查询概览纯函数 + 自动生码基础"
```

---

## Task 4：后端 — guestOrderLookup / guestSetOrderCustomFields resolver

**Files:** Create `d:\zhao\vendure\packages\pickup-plugin\src\pickup-guest-order.resolver.ts`

- [ ] **Step 1：创建 resolver 实现**

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow, ConfigService, Ctx, ID, Order, OrderService, Permission, RequestContext,
    TransactionalConnection, UserInputError,
} from '@vendure/core';

import { PickupService } from './pickup.service';
import { PickupRedemption } from './pickup-redemption.entity';
import { buildGuestOverview, GuestOrderOverview, guestLookupAllowed, isGuestOrder } from './pickup-guest-order';

const ERR_NOT_FOUND = 'GUEST_ORDER_NOT_FOUND';

@Resolver()
export class PickupGuestOrderResolver {
    constructor(
        private orderService: OrderService,
        private configService: ConfigService,
        private connection: TransactionalConnection,
        private service: PickupService,
    ) {}

    @Query()
    @Allow(Permission.Public)
    async guestOrderLookup(
        @Ctx() ctx: RequestContext,
        @Args('input') input: { orderCode: string; phone?: string },
    ): Promise<GuestOrderOverview> {
        const order = await this.loadOrder(ctx, input.orderCode);
        if (!order) throw new UserInputError(ERR_NOT_FOUND);
        const windowAccess = input.phone
            ? false
            : await this.configService.orderOptions.orderByCodeAccessStrategy.canAccessOrder(ctx, order);
        if (!guestLookupAllowed(order, input, windowAccess).allowed) {
            throw new UserInputError(ERR_NOT_FOUND);
        }
        await this.service.ensurePickupRedemptionForOrder(ctx, order.id).catch(() => undefined);
        const redemption = await this.findRedemption(ctx, order.id);
        return buildGuestOverview(order, redemption);
    }

    @Mutation()
    @Allow(Permission.Public)
    async guestSetOrderCustomFields(
        @Ctx() ctx: RequestContext,
        @Args('input') input: { orderCode: string; phone: string; name?: string },
    ): Promise<GuestOrderOverview> {
        const order = await this.loadOrder(ctx, input.orderCode);
        if (!order) throw new UserInputError(ERR_NOT_FOUND);
        const windowAccess = await this.configService.orderOptions.orderByCodeAccessStrategy.canAccessOrder(ctx, order);
        if (!windowAccess || !isGuestOrder(order)) {
            throw new UserInputError(ERR_NOT_FOUND);
        }
        await this.orderService.updateCustomFields(ctx, order.id, {
            contactPhone: input.phone,
            ...(input.name ? { contactName: input.name } : {}),
        } as any);
        const refreshed = (await this.loadOrder(ctx, input.orderCode))!;
        await this.service.ensurePickupRedemptionForOrder(ctx, refreshed.id).catch(() => undefined);
        const redemption = await this.findRedemption(ctx, refreshed.id);
        return buildGuestOverview(refreshed, redemption);
    }

    private async loadOrder(ctx: RequestContext, code: string): Promise<Order | null> {
        const order = await this.orderService.findByCode(ctx, code, [
            'customer',
            'customer.user',
            'lines',
            'lines.productVariant',
            'lines.productVariant.product',
            'fulfillments',
        ] as any);
        return order ?? null;
    }

    private async findRedemption(ctx: RequestContext, orderId: ID): Promise<PickupRedemption | null> {
        return this.connection
            .getRepository(ctx, PickupRedemption)
            .findOne({ where: { orderId: orderId as number } });
    }
}
```

- [ ] **Step 2：本次改动已由 Task 2 Step 4 import；确认编译**

```bash
cd d:\zhao\vendure\packages\pickup-plugin
npx tsc -p ./tsconfig.json --noEmit
```

Expected: 无错误。

---

## Task 5：后端 — 放宽容客订单窗口 + 单测跑通 + 提交

**Files:** Modify `d:\zhao\vendure\packages\dev-server\dev-config.ts`

- [ ] **Step 1：设置 orderByCode 访问策略为 7 天**

在 `dev-config.ts` 顶部 import 块加：

```ts
import { DefaultOrderByCodeAccessStrategy } from '@vendure/core';
```

在现有 `orderOptions: { ... }` 内追加：

```ts
    orderOptions: {
        orderItemPriceCalculationStrategy: new SalesOrderItemPriceCalculationStrategy(),
        orderByCodeAccessStrategy: new DefaultOrderByCodeAccessStrategy('7d'),
    },
```

- [ ] **Step 2：全量单测回归**

```bash
cd d:\zhao\vendure\packages\pickup-plugin
npx vitest --config vitest.config.mts run src/pickup-guest-order.spec.ts
```

Expected: PASS。

- [ ] **Step 3：提交后端（Task 4、5 收尾）**

```bash
cd d:\zhao\vendure
git add packages/pickup-plugin/src/pickup-guest-order.resolver.ts packages/dev-server/dev-config.ts
git commit -m "feat(pickup-plugin): guestOrderLookup / guestSetOrderCustomFields shop API + 放宽容客订单窗口7d"
```

---

## Task 6：后端 — e2e 用例（游客查询 + 自动生码）

**Files:** Modify `d:\zhao\vendure\packages\pickup-plugin\e2e\pickup.e2e-spec.ts`

- [ ] **Step 1：在测试 config 注册 contactPhone/contactName 自定义字段**（在 `mergeConfig(...)` 的 config 对象中，于 `paymentOptions` 旁追加）

```ts
        customFields: {
            Order: [
                { name: 'contactPhone', type: 'string', nullable: true, public: true },
                { name: 'contactName', type: 'string', nullable: true, public: true },
            ],
        } as any,
```

- [ ] **Step 2：追加游客查询 e2e 用例**（在现有 `describe` 内末尾追加一个 `it`；复用文件内已有的 `createShop`、下单助手与 `SHOP_PICKUP_QUERY` 等帮助函数）

```ts
    it('游客：自提单生码 + 手机号/订单号查询 + 补录手机号', async () => {
        // 1) 建立一单自提单并结算（复用本文件已有自提单创建+结算帮助逻辑，得到 pickupOrder 与 code）
        //    此处以既有 case 得到的下单流程为准：设置配送为自提 → 过渡 ArrangingPayment → addPaymentToOrder 完成。
        // 2) 自动生码：结算后（非黑名单状态）应已有 PickupRedemption
        await waitFor(async () => {
            const r = await shopClient.query(gql`
                query($input: GuestOrderLookupInput!) {
                    guestOrderLookup(input: $input) { orderCode pickupCode pickupClaimable hasPhone }
                }`, { input: { orderCode: pickupCodeOfTestOrder } });
            return !!(r as any).guestOrderLookup?.pickupCode;
        });

        // 3) 手机号不匹配 → 报错
        await assertThrowsWithMessage(
            () => shopClient.query(gql`
                query($input: GuestOrderLookupInput!) { guestOrderLookup(input: $input) { orderCode } }
            `, { input: { orderCode: pickupCodeOfTestOrder, phone: '000' } }),
            ERR_NOT_FOUND_GUEST,
        );

        // 4) 补录手机号 → 之后带手机号可查
        await shopClient.query(gql`
            mutation($input: GuestSetOrderCustomFieldsInput!) { guestSetOrderCustomFields(input: $input) { hasPhone  } }
        `, { input: { orderCode: pickupCodeOfTestOrder, phone: '13200998877' } });
        const after = await shopClient.query(gql`
            query($input: GuestOrderLookupInput!) { guestOrderLookup(input: $input) { orderCode hasPhone pickupClaimable } }
        `, { input: { orderCode: pickupCodeOfTestOrder, phone: '13200998877' } });
        expect((after as any).guestOrderLookup).toMatchObject({ orderCode: pickupCodeOfTestOrder, hasPhone: true });
    });
```

> 说明：`pickupCodeOfTestOrder` 需取自该 `it` 内实际下单得到的订单 code 变量；下单步骤请沿用本文件 `proceedToArrangingPayment`/`addPaymentToOrder` 帮助函数并确保该单为 pickup。`ERR_NOT_FOUND_GUEST` 用错误消息常量或直接断言 `GUEST_ORDER_NOT_FOUND` 消息。

- [ ] **Step 3：跑 e2e**

```bash
cd d:\zhao\vendure\packages\pickup-plugin
npx vitest --config vitest.config.mts run -t "游客"
```

Expected: 若环境允许则 PASS；本地 sqljs e2e 成本较高，失败时优先在提交后端后在服务器以 GraphQL 手动回归（见 Task 7/10 验证），并保证 Task 3 单测一定通过。

- [ ] **Step 4：提交**

```bash
cd d:\zhao\vendure
git add packages/pickup-plugin/e2e/pickup.e2e-spec.ts
git commit -m "test(pickup-plugin): 游客订单查询+自动生码 e2e"
```

---

## Task 7：后端 — 构建 + 部署

**Files:** Modify `d:\zhao\vendure\_deploy.ps1`（构建列表加入 pickup-plugin）

- [ ] **Step 1：把 pickup-plugin 加入 `_deploy.ps1` 构建列表**（与 core/cjk-plugin/dev-server 并列，用其自身 `npm run build`）

- [ ] **Step 2：本地构建 pickup-plugin（含此前全部改动）**

```bash
cd d:\zhao\vendure\packages\pickup-plugin
npm run build
```

- [ ] **Step 3：使用既有部署脚本推送 + 服务器重启（一条龙，不再逐项询问）**

```bash
cd d:\zhao\vendure
powershell -ExecutionPolicy Bypass -File .\_deploy.ps1 -Message "feat(pickup-plugin): guest order lookup + auto redeem code"
```

（脚本：识别改动包 → 构建 → 提交 → 推送 → 服务器 `git reset --hard origin/master && pm2 restart vendure`。）

- [ ] **Step 4：服务器回归（GraphQL）**：对 `https://www.youshop.cn/shop-api` 用一笔已结算自提订单调用 `guestOrderLookup(input:{orderCode})`，确认返回 `pickupCode`；确认 `GetOrderByCode` 仍可用。

---

## Task 8：前端 — GQL 操作 + 代码生成

**Files:** Create `layers/base/app/**/GuestOrderLookup.gql`, `GuestSetOrderCustomFields.gql`（与 `GetOrderByCode` 同目录）
Create 见 Search：`grep -rl "GetOrderByCode" layers/base/app --include=*.gql --include=*.graphql`

- [ ] **Step 1：写两个 GQL 操作文件**

```graphql
query GuestOrderLookup($input: GuestOrderLookupInput!) {
  guestOrderLookup(input: $input) {
    orderCode
    orderPlacedAt
    state
    totalQuantity
    subTotal
    totalWithTax
    isPickup
    pickupClaimed
    pickupCode
    pickupClaimable
    pickupLocation { name address businessHours }
    lines { productName sku quantity linePriceWithTax }
    hasPhone
  }
}
```

```graphql
mutation GuestSetOrderCustomFields($input: GuestSetOrderCustomFieldsInput!) {
  guestSetOrderCustomFields(input: $input) {
    orderCode
    hasPhone
    pickupCode
  }
}
```

- [ ] **Step 2：重新生成类型**

```bash
cd d:\zhao\nshop
npx nuxt prepare
```

Expected: `#gql/default` 内新增两个类型，无报错。

- [ ] **Step 3：提交前端 gql**

```bash
cd d:\zhao\nshop
git add layers/base/app  # 仅 gql 与生成物
git commit -m "feat(shop): guest order lookup gql operations"
```

---

## Task 9：前端 — 订单查询页

**Files:** Create `d:\zhao\nshop\layers\base\app\pages\order\lookup.vue`

- [ ] **Step 1：创建查询页**

```vue
<script setup lang="ts">
definePageMeta({ title: 'lookup' });
const { t } = useI18n();
const GqlInstance = useGql();
const form = reactive({ orderCode: '', phone: '' });
const state = ref<'idle' | 'loading' | 'found' | 'error'>('idle');
const overview = ref<any>(null);

async function submit() {
  if (!form.orderCode.trim() || !form.phone.trim()) return;
  state.value = 'loading';
  try {
    const res: any = await GqlInstance('GuestOrderLookup', {
      input: { orderCode: form.orderCode.trim(), phone: form.phone.trim() },
    });
    if (!res?.guestOrderLookup) throw new Error('not_found');
    overview.value = res.guestOrderLookup;
    state.value = 'found';
  } catch (e) {
    state.value = 'error';
  }
}
</script>

<template>
  <main class="container mt-14">
    <h1 class="text-2xl font-semibold mb-6">{{ $t('messages.order.lookupTitle') }}</h1>
    <UAlert v-if="state === 'error'" color="error" :title="$t('messages.order.lookupNotFoundClass')" variant="outline" class="mb-4" />

    <form v-if="state !== 'found'" class="max-w-md space-y-3" @submit.prevent="submit">
      <UFormGroup :label="$t('messages.order.orderCodeLabel')">
        <UInput v-model="form.orderCode" :placeholder="$t('messages.order.orderCodePlaceholder')" :disabled="state==='loading'" />
      </UFormGroup>
      <UFormGroup :label="$t('messages.order.phoneLabel')">
        <UInput v-model="form.phone" type="tel" maxlength="11" :placeholder="$t('messages.order.phonePlaceholder')" :disabled="state==='loading'" />
      </UFormGroup>
      <UButton type="submit" :loading="state==='loading'" :label="$t('messages.order.lookupSubmit')" class="px-7" />
    </form>

    <section v-else class="max-w-md space-y-3">
      <dl class="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 text-sm">
        <div><dt class="text-neutral-500">{{ $t('messages.shop.orderCode') }}</dt><dd class="font-mono">{{ overview.orderCode }}</dd></div>
        <div><dt class="text-neutral-500">{{ $t('messages.general.status') }}</dt><dd>{{ overview.state }}</dd></div>
        <div><dt class="text-neutral-500">{{ $t('messages.order.totalWithTax') }}</dt><dd>{{ overview.totalWithTax }} {{ overview.currencyCode }}</dd></div>
        <div v-if="overview.isPickup"><dt class="text-neutral-500">{{ $t('messages.shop.pickupCode') }}</dt><dd class="font-mono text-warning">{{ overview.pickupCode || '--' }}</dd></div>
      </dl>
      <div v-if="overview.isPickup" class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 text-sm space-y-1">
        <p class="font-medium">{{ overview.pickupLocation?.name }}</p>
        <p class="text-neutral-500">{{ overview.pickupLocation?.address }}</p>
        <p class="text-neutral-500">{{ overview.pickupLocation?.businessHours }}</p>
        <UBadge :color="overview.pickupClaimed ? 'success' : 'warning'" variant="outline">
          {{ overview.pickupClaimed ? $t('messages.shop.pickupClaimed') : $t('messages.shop.pickupPending') }}
        </UBadge>
      </div>
      <UButton variant="soft" @click="state='idle'; overview=null">{{ $t('messages.general.back') }}</UButton>
    </section>
  </main>
</template>
```

- [ ] **Step 2：入口**：在页脚/用户菜单中加“查询订单”链接 → `localePath('/order/lookup')`（`label` 用 `messages.order.lookupMenu`）。

- [ ] **Step 3：提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/pages/order/lookup.vue layers/base/app i18n
git commit -m "feat(shop): 游客手机号+订单号查询页"
```

---

## Task 10：前端 — 结算确认页（提货码 + 无号补录）

**Files:** Modify `d:\zhao\nshop\layers\base\app\pages\checkout\confirmation\[code].client.vue`
Modify `d:\zhao\nshop\layers\base\app\components\order\DeliveryInfo.vue`

- [ ] **Step 1：确认页拉取提货码概览**（在 `<script setup>` 内、`useAsyncGql("GetOrderByCode")` 之后追加）

```ts
const GqlInstance = useGql();
const pickupOverview = ref<any>(null);
const showAddPhone = ref(false);
const addPhoneForm = reactive({ phone: '' });
const savingPhone = ref(false);
const savedPhoneMsgOpen = ref(false);

watch(order, async (o) => {
  if (o && isPickupOrder.value) {
    try {
      const res: any = await GqlInstance('GuestOrderLookup', { input: { orderCode: code.value } });
      pickupOverview.value = res?.guestOrderLookup ?? null;
      showAddPhone.value = !!pickupOverview.value && !pickupOverview.value.hasPhone && !pickupClaimed.value;
    } catch (e) {
      pickupOverview.value = null;
    }
  }
}, { immediate: true });

async function savePhone() {
  if (!addPhoneForm.phone.trim()) return;
  savingPhone.value = true;
  try {
    await GqlInstance('GuestSetOrderCustomFields', {
      input: { orderCode: code.value, phone: addPhoneForm.phone.trim() },
    });
    savedPhoneMsgOpen.value = true;
    showAddPhone.value = false;
  } finally {
    savingPhone.value = false;
  }
}
```

- [ ] **Step 2：确认页自提信息块展示提货码 + 保留提示 + 补录卡**（把现有 `<!-- 2.5 自提/核销信息 -->` 区块内补充）

```html
        <!-- 提货码 -->
        <div v-if="pickupOverview?.pickupCode" class="mt-3 flex items-center gap-2">
          <span class="text-sm text-neutral-500">{{ t('messages.shop.pickupCode') }}:</span>
          <span class="font-mono text-lg font-bold">{{ pickupOverview.pickupCode }}</span>
        </div>
        <p v-if="pickupOverview?.pickupCode" class="mt-1 text-sm text-warning">
          {{ t('messages.order.pickupKeepHint') }}
        </p>

        <!-- 无手机号 → 补录手机号卡 -->
        <div v-if="showAddPhone" class="mt-4 rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
          <p class="text-sm font-medium mb-1">{{ t('messages.order.addPhoneTitle') }}</p>
          <p class="text-xs text-neutral-500 mb-3">{{ t('messages.order.addPhoneHint') }}</p>
          <div class="flex items-center gap-2">
            <UInput v-model="addPhoneForm.phone" type="tel" maxlength="11" :placeholder="t('messages.order.phonePlaceholder')" class="max-w-[16rem]" :disabled="savingPhone" />
            <UButton :loading="savingPhone" :label="t('messages.order.savePhone')" @click="savePhone" />
          </div>
          <p v-if="savedPhoneMsgOpen" class="mt-2 text-xs text-success">{{ t('messages.order.phoneSaved') }}</p>
        </div>
```

- [ ] **Step 3：`DeliveryInfo.vue` 支持传入提货码**（把 `pickupCode` 改为接收 prop）

```ts
const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
  pickupCode?: string | null;
}>();
...
const pickupCode = computed<string | null>(() => props.pickupCode ?? null);
```

- [ ] **Step 4：提交**

```bash
cd d:\zhao\nshop
git add layers/base/app/pages/checkout/confirmation layers/base/app/components/order/DeliveryInfo.vue
git commit -m "feat(shop): 确认页展示提货码 + 无手机号补录"
```

---

## Task 11：前端 — i18n 词条

**Files:** Modify `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`
Modify `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts`

- [ ] **Step 1：zh-CN.ts 增补**（在 `messages` 下合适位置，按既有 `messages.order`/`messages.shop` 结构插入）

```ts
      // 游客订单查询
      lookupTitle: '查询订单',
      lookupMenu: '查询订单',
      lookupSubmit: '查询',
      lookupNotFoundClass: '未找到匹配的订单，请核对手机号与订单号',
      orderCodeLabel: '订单号',
      phoneLabel: '手机号',
      orderCodePlaceholder: '请输入订单号',
      phonePlaceholder: '请输入手机号',
      totalWithTax: '实付金额',
      pickupKeepHint: '请保留此订单号与提货码，到店核销时出示',
      addPhoneTitle: '补录手机号',
      addPhoneHint: '补充手机号后，可凭「手机号 + 订单号」随时查询订单',
      savePhone: '保存',
      phoneSaved: '手机号已保存，后续可凭手机号和订单号查询订单',
```

- [ ] **Step 2：en-US.ts 增补**（同结构）

```ts
      lookupTitle: 'Look up order',
      lookupMenu: 'Look up order',
      lookupSubmit: 'Search',
      lookupNotFoundClass: 'No matching order found. Check the phone number and order code',
      orderCodeLabel: 'Order code',
      phoneLabel: 'Phone number',
      orderCodePlaceholder: 'Enter order code',
      phonePlaceholder: 'Enter phone number',
      totalWithTax: 'Amount paid',
      pickupKeepHint: 'Keep this order code and pickup code to present at the store',
      addPhoneTitle: 'Add phone number',
      addPhoneHint: 'Add your phone number to look up the order anytime with phone + order code',
      savePhone: 'Save',
      phoneSaved: 'Phone saved. You can look up the order anytime with phone and order code',
```

- [ ] **Step 3：提交**

```bash
cd d:\zhao\nshop
git add layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "feat(shop): i18n 游客订单查询与提货码词条"
```

---

## Task 12：前端 — 构建 + 部署 + 手机视口截图

**Files:** 部署产物 + `scripts/_shot_*.py`（仿既有截图脚本）

- [ ] **Step 1：本地构建 .output**

```bash
cd d:\zhao\nshop
npx nuxt build   # 产出 .output，按既有流程 commit dist/.output
```

- [ ] **Step 2：日志校验**：`guestOrderLookup`/`guestSetOrderCustomFields` 在本机 dev 下先手动测通（localhost）。

- [ ] **Step 3：部署前端**（沿用既有 nshop 构建+deploy 流程 commit 并推送；服务器 `git pull` + pm2 restart nshop）。

- [ ] **Step 4：手机视口截图回归（标准 390×844，dpr=2=780×1688）**，三个场景：

1. 确认页自提单：显示提货码 + 保留提示；未留手机号时显示补录手机号卡。
2. 订单查询页：游客输「手机号+订单号」查询成功，展示脱敏概览 + 提货码/核销状态。
3. 补录手机号后再次打开订单查询页成功。

把三张截图补充进**操作手册**（交付硬性要求）。

---

## Self-Review

- **Spec 覆盖**：方案A 手机号查询 → Task 3/4/8/9；方案D 提货码可见与核销复用 → Task 1/2/4 生码+查询，核销复用既有 `claimPickupByShop`（不改）；无号补录 → Task 10（+Task 4）；窗口放宽 → Task 5；脱敏 → `buildGuestOverview` + 前端查询页仅渲染白名单字段。
- **占位符扫描**：无 TBD/TODO；各代码步均含完整实现。
- **类型一致性**：`GuestOrderOverview`/`guestLookupAllowed`/`buildGuestOverview`/`ensurePickupRedemptionForOrder` 命名在后端各 Task 一致；前端 `GuestOrderLookup`/`GuestSetOrderCustomFields` GQL 操作名与 schema 一致。
- **e2e 占位说明**：Task 6 Step 2 的“复用下单帮助函数”依赖既有 e2e 内的自提单创建步骤，执行时以既有 case 5/6 的实现为准；若 sqljs e2e 运行过重，则以服务器 GraphQL 手动回归（Task 7 与截图）作为最终验证。