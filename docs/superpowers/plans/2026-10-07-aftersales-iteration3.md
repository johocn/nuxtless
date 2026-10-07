# 售后体系迭代三期实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现设计文档 `docs/superpowers/specs/2026-10-07-aftersales-iteration3-design.md` 的四项功能：A 双向站内信通知（事件解耦）、B 售后单内协商留言（双向）、C 超时自动化 + 换货闭环、D 后台售后数据看板。

**Architecture:** after-sales-plugin 在 `commitState` 统一出口（save + recordState + 发布事件）发布 Vendure 自定义事件 `AfterSalesStateTransitionEvent`；notification-plugin 订阅事件落 `InboxMessage`（复用现有实体，零新表）。留言为独立实体 `after_sales_message`。换货新增 `ExchangeShipped` 状态节点（Received→ExchangeShipped→Closed）。超时自动化复用 order-timeout-plugin 的「task 表 + delayed job + 补偿扫描」模式，阈值走渠道 customFields。看板用 TypeORM `getRawMany` 聚合一次往返。

**Tech Stack:** Vendure 3.6（SDL-first 插件 + TypeORM synchronize:true + DefaultJobQueuePlugin）、Nuxt/nshop（i18n 12 包）、uni-app/web-admin（zh-Hans/en 双包）。

**提交身份：** `johocn / johocn@163.com`（若仓未配置身份，commit 命令前加 `-c user.name=johocn -c user.email=johocn@163.com`）；`git add` 精确枚举禁 `-A`；PowerShell 不支持 `&&`、heredoc；提交信息一律 `Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "..."` 后 `git commit -F "$env:TEMP\as3-commit.txt"`。

**关键命令约定：**
- after-sales-plugin e2e：`cd d:\zhao\vendure\packages\after-sales-plugin; pnpm e2e`（Schema/实体有变更后先删缓存：`Remove-Item -Recurse -Force e2e\__data__, e2e\__data3__ -ErrorAction SilentlyContinue`）。
- vendure 本地构建：`cd d:\zhao\vendure\packages\after-sales-plugin; npm run build`（lib 产物入 git）。
- C 端构建：`cd d:\zhao\nshop; pnpm build`；部署 `node scripts/deploy.mjs`。
- web-admin 构建：`cd d:\zhao\vshop\web-admin; npm run build:h5`；部署 `node scripts/deploy.mjs`。
- 服务器上**绝不构建**，vendure 部署 = `git pull --ff-only && pm2 restart <vendure进程>`。

---

## Task 1: 后端事件发布（统一出口）+ notification-plugin 订阅落站内信

**Files:**
- Create: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales.events.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales.service.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\index.ts`
- Modify: `d:\zhao\vendure\packages\notification-plugin\src\notification.service.ts`
- Modify: `d:\zhao\vendure\packages\notification-plugin\src\plugin.ts`
- Modify: `d:\zhao\vendure\packages\notification-plugin\package.json`
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts`
- Create: `d:\zhao\vendure\packages\after-sales-plugin\e2e\after-sales-iteration3.e2e-spec.ts`

- [ ] **Step 1.1: 新建事件类** `after-sales-plugin/src/after-sales.events.ts`：

```ts
import { RequestContext, VendureEvent } from '@vendure/core';

/**
 * 售后单状态流转事件（AfterSalesService.commitState 统一出口发布）。
 * 人工操作 / 超时自动化 / 换货发货均经统一出口，事件自动全覆盖（三期设计 §一）。
 */
export class AfterSalesStateTransitionEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly requestId: number,
        public readonly orderId: number,
        public readonly type: string,
        public readonly fromState: string | null,
        public readonly toState: string,
        public readonly customerId: number | null,
        public readonly orderCode: string | null,
        public readonly createdAt: Date,
    ) {
        super();
    }
}
```

- [ ] **Step 1.2: service 统一出口改造** `after-sales.service.ts`：
  1. `@vendure/core` import 列表加 `EventBus`；文件顶部加 `import { AfterSalesStateTransitionEvent } from './after-sales.events';`
  2. 类字段区（`private channelService...` 后）加 `private eventBus: EventBus | null = null;`
  3. `init()` 内 channelService try/catch 块之后加：
```ts
        try {
            this.eventBus = injector.get(EventBus);
        } catch {
            this.eventBus = null;
        }
```
  4. `recordState` 方法之前新增 `commitState` 私有方法：
```ts
    /**
     * 状态变更统一出口：写状态 + 落历史 + 发布 AfterSalesStateTransitionEvent。
     * 所有状态写入点必须经此方法保证通知全覆盖；事件发布失败仅告警不阻断。
     */
    private async commitState(
        ctx: RequestContext,
        request: AfterSalesRequest,
        fromState: string | null,
        toState: AfterSalesState,
    ): Promise<AfterSalesRequest> {
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        request.state = toState;
        const saved = await repo.save(request);
        await this.recordState(ctx, Number(saved.id), fromState, toState);
        try {
            const full = await repo.findOne({ where: { id: saved.id as any }, relations: { order: true } });
            await this.eventBus?.publish(
                new AfterSalesStateTransitionEvent(
                    ctx,
                    Number(saved.id),
                    Number(saved.orderId),
                    saved.type,
                    fromState,
                    toState,
                    saved.customerId != null ? Number(saved.customerId) : null,
                    full?.order?.code ?? null,
                    new Date(),
                ),
            );
        } catch (e: any) {
            Logger.warn(`publish AfterSalesStateTransitionEvent failed for #${saved.id}: ${e?.message ?? e}`, loggerCtx);
        }
        return saved;
    }
```
  5. 8 个写入点全部改为经 `commitState`（`fromState` 捕获行保留不动）：
     - `createRequest`：`new AfterSalesRequest({...})` 构造参数中删除 `state: 'Pending',` 一行；`const saved = await repo.save(request);` 与 `await this.recordState(ctx, Number(saved.id), null, 'Pending');` 两行替换为 `const saved = await this.commitState(ctx, request, null, 'Pending');`
     - `cancelRequest`：`request.state = 'Closed';` 行删除；`const saved = await repo.save(request); await this.recordState(ctx, Number(saved.id), fromState, 'Closed'); return this.hydrate(...)` 中 save/recordState 两行替换为 `const saved = await this.commitState(ctx, request, fromState, 'Closed');`（保留 return hydrate）。
     - `updateReturnTracking`：`request.state = 'Returning';` 行删除，save/recordState 两行替换为 `const saved = await this.commitState(ctx, request, fromState, 'Returning');`
     - `rejectRequest`：`request.state = 'Rejected';` 行删除；`const saved = await repo.save(request); await this.recordState(...); return saved;` 三行替换为 `return this.commitState(ctx, request, fromState, 'Rejected');`
     - `confirmReceive`：`request.state = 'Received'; const saved = await repo.save(request); await this.recordState(txCtx, ...); return saved;` 四行替换为 `return this.commitState(txCtx, request, fromState, 'Received');`
     - `executeRefund` 三分支：refundOrder 拒绝分支 `request.state = 'RefundFailed'; await repo.save(request); await this.recordState(...RefundFailed);` 三行替换为 `await this.commitState(ctx, request, fromState, 'RefundFailed');`（后续 `updateOrderAfterSalesStatus` / commit / hydrate 保留）；Settled 分支同理替换为 `await this.commitState(ctx, request, fromState, 'Refunded');`；非 Settled 分支替换为 `await this.commitState(ctx, request, fromState, 'RefundFailed');`
     - `applyRefundFailed`：`if (fromState !== 'RefundFailed')` 守卫块改为包裹 `await this.commitState(ctx, request, fromState, 'RefundFailed');`，原 `await repo.save(request);` 删除（commitState 已保存）。
     - `transitionState`：整个方法体替换为：
```ts
    private async transitionState(ctx: RequestContext, id: ID, toState: AfterSalesState): Promise<AfterSalesRequest> {
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        const request = await repo.findOne({ where: { id: id as any } });
        if (!request) throw new Error('Request not found');
        const allowed = STATE_TRANSITIONS[request.state];
        if (!allowed?.includes(toState)) {
            throw new Error(`Invalid transition: ${request.state} -> ${toState}`);
        }
        return this.commitState(ctx, request, request.state, toState);
    }
```

- [ ] **Step 1.3: index.ts 导出事件** `after-sales-plugin/index.ts` 末尾追加：

```ts
export * from './src/after-sales.events';
```

- [ ] **Step 1.4: notification.service.ts 售后订阅处理**：
  1. import 区加 `import { AfterSalesRequest } from '@vendure/after-sales-plugin';`（`In` 已 import）。
  2. 类末尾（`administratorForUser` 方法后）追加三个方法：
```ts
    // ---------- 售后状态通知（迭代三期，通知矩阵见三期设计 §一） ----------

    /** 售后状态迁移 → 顾客/商家站内信。任何失败仅告警，绝不阻断主流程。 */
    async onAfterSalesStateTransition(ctx: RequestContext, e: {
        requestId: number;
        orderId: number;
        type: string;
        fromState: string | null;
        toState: string;
        customerId: number | null;
    }): Promise<void> {
        try {
            const customerLink = `/account/after-sales/${e.requestId}`;
            const cTitles: Record<string, string> = {
                Approved: '售后审核通过',
                Received: '商家已收货',
                Refunded: '退款已到账',
                RefundFailed: '退款异常',
            };
            const cContents: Record<string, string> = {
                Approved: '您的售后申请已审核通过，请按寄回地址寄回商品。',
                Received: '商家已确认收到您的退货，退款将原路退回。',
                Refunded: '您的退款已原路退回，请留意账户变动。',
                RefundFailed: '退款处理出现异常，商家正在处理，请耐心等待。',
            };
            // ---- 顾客侧 ----
            if (e.customerId != null) {
                if (e.toState === 'Rejected') {
                    const req = await this.afterSalesRequestRow(e.requestId);
                    const reason = (req?.rejectReason ?? '').slice(0, 50);
                    await this.deliver(ctx, {
                        scene: 'after_sales', title: '售后被拒绝',
                        content: `您的售后申请被拒绝${reason ? '：' + reason : '。'}`,
                        recipientType: 'customer', customerId: e.customerId, link: customerLink,
                    });
                } else if (e.toState === 'ExchangeShipped') {
                    const req = await this.afterSalesRequestRow(e.requestId);
                    await this.deliver(ctx, {
                        scene: 'after_sales', title: '换货已发货',
                        content: `商家已寄出换货新品${req?.exchangeTrackingNo ? `（运单号 ${req.exchangeTrackingNo}）` : ''}，请确认收货。`,
                        recipientType: 'customer', customerId: e.customerId, link: customerLink,
                    });
                } else if (e.toState === 'Closed' && e.fromState === 'ExchangeShipped') {
                    await this.deliver(ctx, {
                        scene: 'after_sales', title: '换货完成',
                        content: '换货已完成，感谢您的耐心等待。',
                        recipientType: 'customer', customerId: e.customerId, link: customerLink,
                    });
                } else if (cTitles[e.toState]) {
                    await this.deliver(ctx, {
                        scene: 'after_sales', title: cTitles[e.toState], content: cContents[e.toState],
                        recipientType: 'customer', customerId: e.customerId, link: customerLink,
                    });
                }
            }
            // ---- 商家侧（商品归属店铺管理员）----
            if (e.toState === 'Pending' && e.fromState === null) {
                await this.notifyAfterSalesMerchant(ctx, e.requestId, '新售后待处理',
                    `您有一笔新的售后申请（订单 ${e.orderCode ?? e.orderId}），请及时处理。`);
            } else if (e.toState === 'Returning') {
                await this.notifyAfterSalesMerchant(ctx, e.requestId, '顾客已寄回',
                    `顾客已填写退货物流（订单 ${e.orderCode ?? e.orderId}），请尽快确认收货。`);
            }
        } catch (err: any) {
            Logger.warn(`onAfterSalesStateTransition failed: ${err?.message ?? err}`, loggerCtx);
        }
    }

    /** 商家（商品归属店铺 administratorId）售后站内信；无店铺归属（自营）则不落。 */
    async notifyAfterSalesMerchant(ctx: RequestContext, requestId: number, title: string, content: string): Promise<void> {
        try {
            const request = await this.connection.rawConnection.getRepository(AfterSalesRequest).findOne({
                where: { id: requestId as any },
                relations: { order: true, order: { lines: { productVariant: true } } } as any,
            });
            if (!request?.order) return;
            const shopIds = await this.getOrderShopIds(ctx, request.order);
            if (shopIds.length === 0) return;
            const shops = await this.connection.getRepository(ctx, Shop).find({ where: { id: In(shopIds) } as any });
            for (const shop of shops) {
                if (shop.administratorId == null) continue;
                await this.createInbox(ctx, {
                    scene: 'after_sales', title, content, recipientType: 'admin',
                    link: `/after-sale/detail?id=${requestId}`,
                }, { recipientType: 'admin', administratorId: shop.administratorId });
            }
        } catch (err: any) {
            Logger.warn(`notifyAfterSalesMerchant failed: ${err?.message ?? err}`, loggerCtx);
        }
    }

    private async afterSalesRequestRow(id: number): Promise<AfterSalesRequest | null> {
        return this.connection.rawConnection.getRepository(AfterSalesRequest).findOne({ where: { id: id as any } });
    }
```

- [ ] **Step 1.5: notification-plugin/src/plugin.ts 订阅事件**：
  1. `@vendure/core` import 中追加不需要改动；文件 import 区加：
```ts
import { AfterSalesStateTransitionEvent } from '@vendure/after-sales-plugin';
```
  2. `onApplicationBootstrap()` 内 RefundStateTransitionEvent 订阅块之后追加：
```ts
        this.eventBus.ofType(AfterSalesStateTransitionEvent).subscribe((event) => {
            void this.notificationService.onAfterSalesStateTransition(event.ctx, {
                requestId: event.requestId,
                orderId: event.orderId,
                type: event.type,
                fromState: event.fromState,
                toState: event.toState,
                customerId: event.customerId,
            });
        });
```

- [ ] **Step 1.6: notification-plugin/package.json** `peerDependencies` 加一行（注意 JSON 逗号）：

```json
        "@vendure/after-sales-plugin": "^0.0.1"
```

- [ ] **Step 1.7: dev-config.ts 注册 NotificationPlugin**（当前未注册——现状缺陷，见 Self-Review）：
  - 第 69 行 `import { MessagePlugin } ...` 之后加 `import { NotificationPlugin } from '@vendure/notification-plugin';`
  - 第 509 行 `MessagePlugin.init(),` 之后加 `NotificationPlugin.init(),`

- [ ] **Step 1.8: 新建 e2e** `e2e/after-sales-iteration3.e2e-spec.ts`（Task 2/3/4/5 的用例后续追加到此文件）：

```ts
import { createTestEnvironment, registerInitializer, SqljsInitializer } from '@vendure/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import gql from 'graphql-tag';
import { mergeConfig } from '@vendure/core';
import { initialData } from '../../../e2e-common/e2e-initial-data';
import { TEST_SETUP_TIMEOUT_MS, testConfig } from '../../../e2e-common/test-config';
import { AfterSalesPlugin } from '../src/plugin';
import { InventoryPlugin } from '@vendure/inventory-plugin';
import { LogisticsPlugin } from '@vendure/logistics-plugin';
import { NotificationPlugin } from '@vendure/notification-plugin';
import { ShopPlugin } from '@vendure/shop-plugin';
import {
    singleStageRefundFailingPaymentMethod,
    singleStageRefundablePaymentMethod,
} from '../../core/e2e/fixtures/test-payment-methods';
import { addPaymentToOrder, proceedToArrangingPayment } from '../../core/e2e/utils/test-order-utils';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data3__')));

/** 简单轮询（事件订阅为异步落库，断言前 waitFor） */
async function waitFor(fn: () => Promise<boolean>, timeoutMs = 8000, intervalMs = 100): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await fn()) return;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('waitFor timeout');
}

describe('AfterSalesPlugin · 迭代三期（通知/留言/换货/超时/看板）', () => {
    const { server, adminClient, shopClient } = createTestEnvironment(
        mergeConfig(testConfig(), {
            plugins: [
                AfterSalesPlugin.init(),
                NotificationPlugin.init(),
                InventoryPlugin.init(),
                LogisticsPlugin.init(),
                ShopPlugin.init({}),
            ],
            paymentOptions: {
                paymentMethodHandlers: [
                    singleStageRefundablePaymentMethod,
                    singleStageRefundFailingPaymentMethod,
                ],
            },
        }),
    );

    let variantId: string;
    let orderId: string;
    let orderLineId: string;
    let asId: string;
    let ownerEmail: string;

    beforeAll(async () => {
        await server.init({
            initialData: {
                ...initialData,
                paymentMethods: [
                    {
                        name: singleStageRefundablePaymentMethod.code,
                        handler: { code: singleStageRefundablePaymentMethod.code, arguments: [] },
                    },
                ],
            },
            productsCsvPath: path.join(__dirname, '../../core/e2e/fixtures/e2e-products-minimal.csv'),
            customerCount: 1,
        });
        await adminClient.asSuperAdmin();
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');

        // 店主 + 店铺 + 商品归属（商家站内信收件人 = Shop.administratorId）
        const channels = await adminClient.query(gql`query { channels { items { id code } } }`);
        const shopName = `shop-${Date.now()}`;
        const s = await adminClient.query(gql`
            mutation { createShop(input: { name: "${shopName}", slug: "${shopName}", description: "t3" }) { id name slug } }
        `);
        await adminClient.query(gql`
            mutation { setShopStatus(id: "${s.createShop.id}", status: "active") { id status } }
        `);
        ownerEmail = `owner-${Date.now()}@test.com`;
        await adminClient.query(gql`
            mutation {
                provisionShopOwner(shopId: "${s.createShop.id}",
                    input: { emailAddress: "${ownerEmail}", password: "test", firstName: "店主", lastName: "三" }) { id }
            }
        `);
        const products = await adminClient.query(gql`
            query { products(options: { take: 1 }) { items { id variants { id sku } } } }
        `);
        const productId = products.products.items[0].id;
        variantId = products.products.items[0].variants[0].id;
        await adminClient.query(gql`
            mutation { assignProductsToShop(input: { productIds: ["${productId}"], shopId: "${s.createShop.id}" }) }
        `);
    }, TEST_SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await server.destroy();
    });

    /** 下单 → 支付 → 发货（Shipped），返回订单行 id */
    async function shipNewOrder(quantity = 1, paymentCode = singleStageRefundablePaymentMethod.code): Promise<void> {
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
        const added = await shopClient.query(gql`
            mutation { addItemToOrder(productVariantId: "${variantId}", quantity: ${quantity}) {
                ... on Order { id } ... on ErrorResult { errorCode message } } }
        `);
        expect(added.addItemToOrder.id).toBeDefined();
        await proceedToArrangingPayment(shopClient);
        const paid = await addPaymentToOrder(shopClient, paymentCode as any);
        orderId = paid.id;
        const detail = await adminClient.query(gql`
            query { order(id: "${orderId}") { id state lines { id quantity } } }
        `);
        const line = detail.order.lines[0];
        orderLineId = line.id;
        const f = await adminClient.query(gql`
            mutation { addFulfillmentToOrder(input: {
                lines: [{ orderLineId: "${orderLineId}", quantity: ${line.quantity} }]
                handler: { code: "manual-fulfillment" arguments: [
                    { name: "method", value: "standard" } { name: "trackingCode", value: "SF-T3" }] }
            }) { ... on Fulfillment { id } ... on ErrorResult { errorCode message } } }
        `);
        await adminClient.query(gql`
            mutation { transitionFulfillmentToState(id: "${f.addFulfillmentToOrder.id}", state: "Shipped") { ... on Fulfillment { id state } } }
        `);
        await adminClient.query(gql`
            mutation { transitionOrderToState(id: "${orderId}", state: "Shipped") { ... on Order { id state } } }
        `);
        const after = await adminClient.query(gql`query { order(id: "${orderId}") { id state } }`);
        expect(after.order.state).toBe('Shipped');
    }

    /** 店主客户端（admin API，查商家收件箱） */
    async function ownerClient() {
        const config = (server as any).__config ?? null;
        const { SimpleGraphQLClient } = await import('@vendure/testing');
        const c = new SimpleGraphQLClient((server as any).config ?? (server as any).__ctx, `http://localhost:1024/admin-api`);
        return c;
    }

    it('插件可加载', () => {
        expect(server.app).toBeDefined();
    });

    it('新建售后 → 店主收「新售后待处理」；approve → 顾客收「售后审核通过」', async () => {
        await shipNewOrder();
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: {
                orderId: "${orderId}" orderLineId: "${orderLineId}" type: return_refund reason: "t3-notify" refundAmount: 100
            }) { id state } }
        `);
        asId = created.createAfterSalesRequest.id;
        expect(created.createAfterSalesRequest.state).toBe('Pending');

        // 店主侧
        const { SimpleGraphQLClient } = await import('@vendure/testing');
        const owner = new SimpleGraphQLClient(server, `http://localhost:${(server as any).config.apiOptions.port}/admin-api`);
        await owner.asUserWithCredentials(ownerEmail, 'test');
        await waitFor(async () => {
            const inbox = await owner.query(gql`query { adminInbox { items { scene title link } } }`);
            return inbox.adminInbox.items.some((m: any) => m.scene === 'after_sales' && m.title === '新售后待处理');
        });
        const inbox = await owner.query(gql`query { adminInbox { items { scene title content link } } }`);
        const msg = inbox.adminInbox.items.find((m: any) => m.title === '新售后待处理');
        expect(msg.link).toBe(`/after-sale/detail?id=${asId.replace(/^T_/, '')}`);

        // 顾客侧：approve → 审核通过
        await adminClient.query(gql`mutation { approveAfterSalesRequest(id: "${asId}") { id state } }`);
        await waitFor(async () => {
            const mine = await shopClient.query(gql`query { myInbox { items { scene title } } }`);
            return mine.myInbox.items.some((m: any) => m.title === '售后审核通过');
        });
    }, TEST_SETUP_TIMEOUT_MS);

    it('reject → 顾客收「售后被拒绝」含原因摘要', async () => {
        await shipNewOrder();
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: { orderId: "${orderId}" type: refund_only reason: "t3-reject" refundAmount: 1 }) { id state } }
        `);
        const id2 = created.createAfterSalesRequest.id;
        await adminClient.query(gql`
            mutation { rejectAfterSalesRequest(id: "${id2}", reason: "凭证不足无法核实") { id state } }
        `);
        await waitFor(async () => {
            const mine = await shopClient.query(gql`query { myInbox { items { title content } } }`);
            return mine.myInbox.items.some((m: any) => m.title === '售后被拒绝');
        });
        const mine = await shopClient.query(gql`query { myInbox { items { title content } } }`);
        const msg = mine.myInbox.items.find((m: any) => m.title === '售后被拒绝');
        expect(msg.content).toContain('凭证不足');
    }, TEST_SETUP_TIMEOUT_MS);

    it('updateReturnTracking → 店主收「顾客已寄回」；confirmReceive → 顾客收「商家已收货」；processRefund → 顾客收「退款已到账」', async () => {
        await shipNewOrder();
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: {
                orderId: "${orderId}" orderLineId: "${orderLineId}" type: return_refund reason: "t3-flow" refundAmount: 100
            }) { id state } }
        `);
        const id3 = created.createAfterSalesRequest.id;
        await adminClient.query(gql`mutation { approveAfterSalesRequest(id: "${id3}") { id state } }`);
        await shopClient.query(gql`
            mutation { updateReturnTracking(id: "${id3}", trackingNo: "SF999", carrier: "顺丰") { id state } }
        `);
        const { SimpleGraphQLClient } = await import('@vendure/testing');
        const owner = new SimpleGraphQLClient(server, `http://localhost:${(server as any).config.apiOptions.port}/admin-api`);
        await owner.asUserWithCredentials(ownerEmail, 'test');
        await waitFor(async () => {
            const inbox = await owner.query(gql`query { adminInbox { items { title } } }`);
            return inbox.adminInbox.items.some((m: any) => m.title === '顾客已寄回');
        });
        await adminClient.query(gql`mutation { confirmReturnReceived(id: "${id3}") { id state } }`);
        await waitFor(async () => {
            const mine = await shopClient.query(gql`query { myInbox { items { title } } }`);
            return mine.myInbox.items.some((m: any) => m.title === '商家已收货');
        });
        await adminClient.query(gql`mutation { processAfterSalesRefund(id: "${id3}") { id state } }`);
        await waitFor(async () => {
            const mine = await shopClient.query(gql`query { myInbox { items { title } } }`);
            return mine.myInbox.items.some((m: any) => m.title === '退款已到账');
        });
    }, TEST_SETUP_TIMEOUT_MS);

    it('顾客主动取消 → Closed 不误发「换货完成」', async () => {
        await shipNewOrder();
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: { orderId: "${orderId}" type: refund_only reason: "t3-cancel" refundAmount: 1 }) { id state } }
        `);
        const id4 = created.createAfterSalesRequest.id;
        await shopClient.query(gql`mutation { cancelAfterSalesRequest(id: "${id4}") { id state } }`);
        await new Promise((r) => setTimeout(r, 500));
        const mine = await shopClient.query(gql`query { myInbox { items { title } } }`);
        expect(mine.myInbox.items.some((m: any) => m.title === '换货完成')).toBe(false);
    }, TEST_SETUP_TIMEOUT_MS);
});
```

- [ ] **Step 1.9: 运行 e2e**

Run: `cd d:\zhao\vendure\packages\after-sales-plugin; Remove-Item -Recurse -Force e2e\__data3__ -ErrorAction SilentlyContinue; pnpm e2e`
Expected: 新文件 5 个用例 PASS；旧 `after-sales.e2e-spec.ts` 9 个用例 PASS（commitState 重构后旧断言不变）。

- [ ] **Step 1.10: 提交 vendure**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(after-sales): 迭代三期——commitState统一出口发布AfterSalesStateTransitionEvent + notification-plugin订阅落站内信"
git -C d:\zhao\vendure add packages/after-sales-plugin/src/after-sales.events.ts packages/after-sales-plugin/src/after-sales.service.ts packages/after-sales-plugin/index.ts packages/after-sales-plugin/e2e/after-sales-iteration3.e2e-spec.ts packages/notification-plugin/src/notification.service.ts packages/notification-plugin/src/plugin.ts packages/notification-plugin/package.json packages/dev-server/dev-config.ts
git -C d:\zhao\vendure commit -F "$env:TEMP\as3-commit.txt"
```

---
## Task 2: 协商留言（after_sales_message 实体 + Shop/Admin 双端 API）

**Files:**
- Create: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-message.entity.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-request.entity.ts`（messageCount 非持久化属性）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales.service.ts`（addMessage/listMessages/attachMessageCounts + 出口统一 hydrate）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\plugin.ts`（实体注册 + Shop/Admin SDL）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-shop.resolver.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\e2e\after-sales-iteration3.e2e-spec.ts`

- [ ] **Step 2.1: 新建留言实体** `after-sales-plugin/src/after-sales-message.entity.ts`（完整文件）：

```ts
import { Column, CreateDateColumn, Entity, Index, ManyToOne, UpdateDateColumn } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

import { AfterSalesRequest } from './after-sales-request.entity';

/** 留言发送方类型：customer=顾客 / admin=商家管理员 */
export type AfterSalesMessageSenderType = 'customer' | 'admin';

/** 售后协商留言（顾客与商家在售后单内的双向沟通记录，Closed 后禁言） */
@Entity('after_sales_message')
@Index(['requestId'])
export class AfterSalesMessage extends VendureEntity {
    constructor(input?: DeepPartial<AfterSalesMessage>) {
        super(input);
    }

    @ManyToOne(() => AfterSalesRequest, { onDelete: 'CASCADE' })
    request: AfterSalesRequest;

    @Column()
    requestId: number;

    @Column({ type: 'varchar', default: 'customer' })
    senderType: AfterSalesMessageSenderType;

    /** 发送人 User 主键（系统路径可为 null） */
    @Column({ type: 'int', nullable: true })
    senderUserId: number | null;

    /** 发送人显示名（顾客=Customer 姓名拼接 / 管理员=Administrator 姓名拼接） */
    @Column({ type: 'varchar' })
    senderName: string;

    /** 留言正文（≤1000 字，service 层校验） */
    @Column({ type: 'text' })
    content: string;

    /** 留言图片 URL（≤3 张，复用 uploadAfterSalesEvidence 返回的绝对 URL） */
    @Column('simple-json', { nullable: true })
    images: string[] | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
```

- [ ] **Step 2.2: AfterSalesRequest 加 messageCount 非持久化属性** `after-sales-request.entity.ts`：在文件末尾 `channels: Channel[];`（87 行）之后、类结束 `}` 之前追加：

```ts
    /** 留言条数（非持久化：service.attachMessageCounts 批量附加，避免 N+1 field resolver） */
    messageCount?: number;
```

注意：该属性**不带任何装饰器**（TypeORM 不持久化），但必须声明在实体类上，GraphQL 自动解析才能读到。

- [ ] **Step 2.3: service 留言能力** `after-sales.service.ts`：
  1. `@vendure/core` import 列表加 `Administrator`（按字母序插在已有项中）。
  2. 文件顶部实体 import 区加：
```ts
import { AfterSalesMessage } from './after-sales-message.entity';
```
  3. 类末尾（`transitionState` 方法后、类结束 `}` 前）追加以下方法：
```ts
    // ===== 协商留言（迭代三期） =====

    private static readonly MESSAGE_MAX_IMAGES = 3;
    private static readonly MESSAGE_MAX_LENGTH = 1000;

    /**
     * 追加一条协商留言。senderType=customer 供顾客发送（addAfterSalesMessage），admin 供商家回复（replyAfterSalesMessage）。
     * 售后单关闭（Closed）后禁止继续留言；图片 ≤3 张、正文 ≤1000 字。
     */
    async addMessage(
        ctx: RequestContext,
        requestId: ID,
        senderType: AfterSalesMessageSenderType,
        content: string,
        images?: string[] | null,
    ): Promise<AfterSalesMessage> {
        if (!ctx.activeUserId) {
            throw new UnauthorizedError();
        }
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        const request = await repo.findOne({ where: { id: requestId as any } });
        if (!request) throw new UserInputError(`After-sales request ${requestId} not found`);
        if (request.state === 'Closed') {
            throw new ForbiddenError('After-sales request is closed: messaging disabled');
        }
        const trimmed = (content ?? '').trim();
        if (!trimmed) {
            throw new UserInputError('Message content is required');
        }
        if (trimmed.length > AfterSalesService.MESSAGE_MAX_LENGTH) {
            throw new UserInputError(`Message content exceeds ${AfterSalesService.MESSAGE_MAX_LENGTH} characters`);
        }
        const imgs = Array.isArray(images) ? images : [];
        if (imgs.length > AfterSalesService.MESSAGE_MAX_IMAGES) {
            throw new UserInputError(`Message images exceed limit of ${AfterSalesService.MESSAGE_MAX_IMAGES}`);
        }
        const senderName = await this.resolveSenderName(ctx, senderType);
        const msgRepo = this.connection.getRepository(ctx, AfterSalesMessage);
        const message = await msgRepo.save(
            new AfterSalesMessage({
                requestId: Number(requestId),
                senderType,
                senderUserId: Number(ctx.activeUserId),
                senderName,
                content: trimmed,
                images: imgs.length ? imgs : null,
            }),
        );
        Logger.info(
            `After-sales message added: request=${requestId} sender=${senderType} user=${ctx.activeUserId}`,
            loggerCtx,
        );
        return message;
    }

    /** 发送人显示名：管理员取 Administrator、顾客取 Customer（姓名拼接），失败兜底 'user' */
    private async resolveSenderName(ctx: RequestContext, senderType: AfterSalesMessageSenderType): Promise<string> {
        if (!ctx.activeUserId) return 'user';
        try {
            if (senderType === 'admin') {
                const adminRepo = this.connection.getRepository(ctx, Administrator);
                const admin = await adminRepo.findOne({
                    where: { user: { id: ctx.activeUserId as any } } as any,
                    relations: { user: true },
                });
                if (admin) return `${admin.firstName} ${admin.lastName}`.trim();
            } else if (this.customerService) {
                const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
                if (customer) return `${customer.firstName} ${customer.lastName}`.trim();
            }
        } catch (e: any) {
            Logger.warn(`resolveSenderName failed: ${e?.message ?? e}`, loggerCtx);
        }
        return 'user';
    }

    /**
     * 售后单留言列表（createdAt 正序，skip/take 常规分页）。
     * senderType=customer 时校验售后单归属当前顾客，防止越权读他人留言。
     */
    async listMessages(
        ctx: RequestContext,
        requestId: ID,
        senderType: AfterSalesMessageSenderType,
        options?: { skip?: number; take?: number },
    ): Promise<PaginatedList<AfterSalesMessage>> {
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        const request = await repo.findOne({ where: { id: requestId as any } });
        if (!request) throw new UserInputError(`After-sales request ${requestId} not found`);
        if (senderType === 'customer') {
            const customerId = await this.resolveCustomerId(ctx);
            if (!customerId || Number(request.customerId) !== customerId) {
                throw new ForbiddenError();
            }
        }
        const msgRepo = this.connection.getRepository(ctx, AfterSalesMessage);
        const take = Math.min(Math.max(options?.take ?? 50, 1), 100);
        const skip = Math.max(options?.skip ?? 0, 0);
        const [items, totalItems] = await msgRepo.findAndCount({
            where: { requestId: Number(requestId) },
            order: { createdAt: 'ASC' },
            skip,
            take,
        });
        return { items, totalItems };
    }

    /** 批量统计各售后单留言条数并附加到 messageCount 非持久化属性 */
    private async attachMessageCounts(ctx: RequestContext, requests: AfterSalesRequest[]): Promise<void> {
        if (!requests.length) return;
        const ids = requests.map((r) => Number(r.id));
        const msgRepo = this.connection.getRepository(ctx, AfterSalesMessage);
        const rows = await msgRepo
            .createQueryBuilder('m')
            .select('m.requestId', 'requestId')
            .addSelect('COUNT(*)', 'count')
            .where('m.requestId IN (:...ids)', { ids })
            .groupBy('m.requestId')
            .getRawMany<{ requestId: number; count: string }>();
        const map = new Map(rows.map((r) => [Number(r.requestId), Number(r.count)]));
        for (const r of requests) {
            r.messageCount = map.get(Number(r.id)) ?? 0;
        }
    }
```  4. **mutation 出口统一 hydrate**（满足 `messageCount: Int!` 非空约束——Task 1 改造后的三个直接 return 出口改为 hydrate）：
     - `rejectRequest` 末行 `return this.commitState(ctx, request, fromState, 'Rejected');` 替换为：
```ts
        const saved = await this.commitState(ctx, request, fromState, 'Rejected');
        return this.hydrate(ctx, saved.id);
```
     - `confirmReceive` 事务内末行 `return this.commitState(txCtx, request, fromState, 'Received');` 替换为：
```ts
            const saved = await this.commitState(txCtx, request, fromState, 'Received');
            return this.hydrate(txCtx, saved.id);
```
     - `transitionState` 末行 `return this.commitState(ctx, request, request.state, toState);` 替换为：
```ts
        const saved = await this.commitState(ctx, request, request.state, toState);
        return this.hydrate(ctx, saved.id);
```
  5. **查询出口 attach messageCount**（5 处）：
     - `hydrate` 方法内 `if (full) { return full; }` 替换为：
```ts
        if (full) {
            await this.attachMessageCounts(ctx, [full]);
            return full;
        }
```
     - `findMyRequests` 末尾 `.getManyAndCount().then(([items, totalItems]) => ({ items, totalItems }));` 替换为：
```ts
            .getManyAndCount()
            .then(async ([items, totalItems]) => {
                await this.attachMessageCounts(ctx, items);
                return { items, totalItems };
            });
```
     - `findAll` 末尾同上替换（代码与 findMyRequests 相同）。
     - `findOneForCustomer` 末行 `return result ?? undefined;` 替换为：
```ts
        if (result) {
            await this.attachMessageCounts(ctx, [result]);
        }
        return result ?? undefined;
```
     - `findOneForAdmin` 末行同上替换。

- [ ] **Step 2.4: plugin.ts 注册实体 + SDL**：
  1. import 区（`AfterSalesStateHistory` import 后）加：
```ts
import { AfterSalesMessage } from './after-sales-message.entity';
```
  2. `entities: [AfterSalesRequest, AfterSalesStateHistory]` 改为 `entities: [AfterSalesRequest, AfterSalesStateHistory, AfterSalesMessage]`。
  3. **Shop schema**：`type AfterSalesRequest` 内 `history: [AfterSalesStateHistoryEntry!]!`（58 行）之后加一行：
```graphql
                messageCount: Int!
```
     `input AfterSalesRequestListOptions`（77 行）之前插入完整类型块：
```graphql
            type AfterSalesMessage {
                id: ID!
                requestId: ID!
                senderType: String!
                senderUserId: ID
                senderName: String!
                content: String!
                images: [String!]
                createdAt: DateTime!
            }

            type AfterSalesMessageList implements PaginatedList {
                items: [AfterSalesMessage!]!
                totalItems: Int!
            }

            input AfterSalesMessageListOptions {

                skip: Int

                take: Int

            }
```
     `extend type Query` 块内 `afterSalesReturnAddress: String!` 之后加：
```graphql
                afterSalesMessages(id: ID!, options: AfterSalesMessageListOptions): AfterSalesMessageList!
```
     `extend type Mutation` 块内 `uploadAfterSalesEvidence(...)` 之后加：
```graphql
                """售后单内追加协商留言（Closed 后禁言；图片 ≤3 张、正文 ≤1000 字）"""
                addAfterSalesMessage(id: ID!, content: String!, images: [String!]): AfterSalesMessage!
```
  4. **Admin schema**：`type AfterSalesRequestAdmin` 内 `history: [AfterSalesStateHistoryEntry!]!`（137 行）之后加一行：
```graphql
                messageCount: Int!
```
     `input AfterSalesRequestAdminListOptions`（145 行）之前插入：
```graphql
            type AfterSalesMessageAdmin {
                id: ID!
                requestId: ID!
                senderType: String!
                senderUserId: ID
                senderName: String!
                content: String!
                images: [String!]
                createdAt: DateTime!
            }

            type AfterSalesMessageAdminList implements PaginatedList {
                items: [AfterSalesMessageAdmin!]!
                totalItems: Int!
            }

            input AfterSalesMessageAdminListOptions {

                skip: Int

                take: Int

            }
```
     `extend type Query` 块内加：
```graphql
                afterSalesMessages(id: ID!, options: AfterSalesMessageAdminListOptions): AfterSalesMessageAdminList!
```
     `extend type Mutation` 块内 `retryAfterSalesRefund(...)` 之后加：
```graphql
                """商家回复售后协商留言（Closed 后禁言；图片 ≤3 张、正文 ≤1000 字）"""
                replyAfterSalesMessage(id: ID!, content: String!, images: [String!]): AfterSalesMessageAdmin!
```

- [ ] **Step 2.5: 双端 resolver 追加**：
  - `after-sales-shop.resolver.ts` 类末尾追加：
```ts
    @Query()
    @Allow(Permission.Authenticated)
    async afterSalesMessages(
        @Ctx() ctx: RequestContext,
        @Args('id') id: number,
        @Args('options', { nullable: true }) options: any,
    ): Promise<any> {
        return this.afterSalesService.listMessages(ctx, id, 'customer', options);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async addAfterSalesMessage(
        @Ctx() ctx: RequestContext,
        @Args('id') id: number,
        @Args('content') content: string,
        @Args('images', { nullable: true, type: () => [String] }) images?: string[],
    ): Promise<any> {
        return this.afterSalesService.addMessage(ctx, id, 'customer', content, images);
    }
```
  - `after-sales-admin.resolver.ts` 类末尾追加：
```ts
    @Query()
    @Allow(Permission.ReadOrder)
    async afterSalesMessages(
        @Ctx() ctx: RequestContext,
        @Args('id') id: number,
        @Args('options', { nullable: true }) options: any,
    ): Promise<any> {
        return this.afterSalesService.listMessages(ctx, id, 'admin', options);
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async replyAfterSalesMessage(
        @Ctx() ctx: RequestContext,
        @Args('id') id: number,
        @Args('content') content: string,
        @Args('images', { nullable: true, type: () => [String] }) images?: string[],
    ): Promise<any> {
        return this.afterSalesService.addMessage(ctx, id, 'admin', content, images);
    }
```

- [ ] **Step 2.6: e2e 追加** `e2e/after-sales-iteration3.e2e-spec.ts`：
  1. 修正 Task 1 遗留：**删除** `ownerClient()` 辅助函数整段（其中 `(server as any).__config` 写法无效且未被任何用例调用；用例内统一 `new SimpleGraphQLClient(server, \`http://localhost:${(server as any).config.apiOptions.port}/admin-api\`)`）。
  2. 文件级 `waitFor` 函数之后追加宽松断言辅助（不依赖 assertThrowsWithMessage 的精确匹配语义）：
```ts
/** 断言 GraphQL 操作抛错且文案匹配（宽松子串，SimpleGraphQLClient 把 GraphQL error 拼进 Error.message） */
async function expectGqlError(fn: () => Promise<any>, pattern: RegExp): Promise<void> {
    let threw = false;
    try {
        await fn();
    } catch (e: any) {
        threw = true;
        expect(String(e?.message ?? e)).toMatch(pattern);
    }
    expect(threw).toBe(true);
}
```
  3. describe 内末尾（用例 4 之后、describe 结束 `});` 前）追加三个用例：```ts
    it('协商留言：顾客发 2 条 → 商家回复 1 条 → 正序 + messageCount=3', async () => {
        await shipNewOrder();
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: {
                orderId: "${orderId}" orderLineId: "${orderLineId}" type: return_refund reason: "t3-msg" refundAmount: 100
            }) { id state messageCount } }
        `);
        const id5 = created.createAfterSalesRequest.id;
        expect(created.createAfterSalesRequest.messageCount).toBe(0);

        await shopClient.query(gql`
            mutation { addAfterSalesMessage(id: "${id5}", content: "请问可以加快处理吗？") { id senderType senderName content } }
        `);
        await shopClient.query(gql`
            mutation { addAfterSalesMessage(id: "${id5}", content: "补充图片", images: ["https://cdn.example.com/a.png"]) { id images } }
        `);
        const { SimpleGraphQLClient } = await import('@vendure/testing');
        const owner = new SimpleGraphQLClient(server, `http://localhost:${(server as any).config.apiOptions.port}/admin-api`);
        await owner.asUserWithCredentials(ownerEmail, 'test');
        const reply = await owner.query(gql`
            mutation { replyAfterSalesMessage(id: "${id5}", content: "已加急，24小时内处理") { id senderType senderName content } }
        `);
        expect(reply.replyAfterSalesMessage.senderType).toBe('admin');

        // 顾客端：正序 + messageCount
        const list = await shopClient.query(gql`
            query { afterSalesMessages(id: "${id5}") { totalItems items { senderType content images createdAt } } }
        `);
        expect(list.afterSalesMessages.totalItems).toBe(3);
        expect(list.afterSalesMessages.items[0].senderType).toBe('customer');
        expect(list.afterSalesMessages.items[2].senderType).toBe('admin');
        expect(list.afterSalesMessages.items[0].content).toBe('请问可以加快处理吗？');
        const detail = await shopClient.query(gql`query { afterSalesRequest(id: "${id5}") { id messageCount } }`);
        expect(detail.afterSalesRequest.messageCount).toBe(3);

        // Admin 端同名 query（含回复人姓名）
        const adminList = await adminClient.query(gql`
            query { afterSalesMessages(id: "${id5}") { totalItems items { senderType senderName content } } }
        `);
        expect(adminList.afterSalesMessages.totalItems).toBe(3);
        expect(adminList.afterSalesMessages.items[2].senderName).toContain('店主');
    }, TEST_SETUP_TIMEOUT_MS);

    it('留言校验：图片 >3 拒绝；正文 >1000 拒绝；未登录拒绝', async () => {
        await shipNewOrder();
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: { orderId: "${orderId}" type: refund_only reason: "t3-msg-guard" refundAmount: 1 }) { id } }
        `);
        const id6 = created.createAfterSalesRequest.id;
        await expectGqlError(
            () => shopClient.query(gql`
                mutation { addAfterSalesMessage(id: "${id6}", content: "x", images: ["1", "2", "3", "4"]) { id } }
            `),
            /exceed limit of 3/,
        );
        await expectGqlError(
            () => shopClient.query(gql`
                mutation { addAfterSalesMessage(id: "${id6}", content: "${'长'.repeat(1001)}") { id } }
            `),
            /exceeds 1000 characters/,
        );
        const anon = new SimpleGraphQLClient(server, `http://localhost:${(server as any).config.apiOptions.port}/shop-api`);
        await expectGqlError(
            () => anon.query(gql`mutation { addAfterSalesMessage(id: "${id6}", content: "anon") { id } }`),
            /not authorized|forbidden/i,
        );
    }, TEST_SETUP_TIMEOUT_MS);

    it('Closed 禁言 + 顾客越权读他人留言被拒', async () => {
        await shipNewOrder();
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: { orderId: "${orderId}" type: refund_only reason: "t3-msg-closed" refundAmount: 1 }) { id } }
        `);
        const id7 = created.createAfterSalesRequest.id;
        await shopClient.query(gql`mutation { cancelAfterSalesRequest(id: "${id7}") { id state } }`);
        await expectGqlError(
            () => shopClient.query(gql`mutation { addAfterSalesMessage(id: "${id7}", content: "还能改吗") { id } }`),
            /messaging disabled/,
        );

        // 第二位顾客越权读留言
        const customer2Email = `other-${Date.now()}@test.com`;
        await adminClient.query(gql`
            mutation {
                createCustomer(input: { firstName: "O", lastName: "T", emailAddress: "${customer2Email}" }, password: "test") {
                    ... on Customer { id emailAddress }
                }
            }
        `);
        const other = new SimpleGraphQLClient(server, `http://localhost:${(server as any).config.apiOptions.port}/shop-api`);
        await other.asUserWithCredentials(customer2Email, 'test');
        await expectGqlError(
            () => other.query(gql`query { afterSalesMessages(id: "${id7}") { totalItems } }`),
            /forbidden|not authorized/i,
        );
    }, TEST_SETUP_TIMEOUT_MS);
```

- [ ] **Step 2.7: 运行 e2e**

Run: `cd d:\zhao\vendure\packages\after-sales-plugin; Remove-Item -Recurse -Force e2e\__data3__ -ErrorAction SilentlyContinue; pnpm e2e`
Expected: 迭代三文件 8 个用例 PASS（5 + 3）；旧 `after-sales.e2e-spec.ts` 9 个用例 PASS。

- [ ] **Step 2.8: 提交 vendure**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(after-sales): 迭代三期——售后协商留言 after_sales_message 实体 + Shop/Admin 双端 API（Closed 禁言、图片≤3、正文≤1000、messageCount 批量附加）"
git -C d:\zhao\vendure add packages/after-sales-plugin/src/after-sales-message.entity.ts packages/after-sales-plugin/src/after-sales-request.entity.ts packages/after-sales-plugin/src/after-sales.service.ts packages/after-sales-plugin/src/plugin.ts packages/after-sales-plugin/src/after-sales-shop.resolver.ts packages/after-sales-plugin/src/after-sales-admin.resolver.ts packages/after-sales-plugin/e2e/after-sales-iteration3.e2e-spec.ts
git -C d:\zhao\vendure commit -F "$env:TEMP\as3-commit.txt"
```

---
## Task 3: 换货闭环（ExchangeShipped 状态节点 + exchangeShip / exchangeReceive）

**Files:**
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\types.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-request.entity.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales.service.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\plugin.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-shop.resolver.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\e2e\after-sales-iteration3.e2e-spec.ts`

- [ ] **Step 3.1: types.ts 加状态与流转**：
  1. `AfterSalesState` 联合类型（7-15 行）在 `| 'Received'` 之后加一行 `| 'ExchangeShipped'`。
  2. `STATE_TRANSITIONS`（17-26 行）改为（两处变化：`Received` 数组加 `'ExchangeShipped'`；新增 `ExchangeShipped` 键）：
```ts
export const STATE_TRANSITIONS: Record<AfterSalesState, AfterSalesState[]> = {
    Pending: ['Approved', 'Rejected'],
    Approved: ['Returning', 'Closed'],
    Rejected: [],
    Returning: ['Received', 'Closed'],
    Received: ['Refunded', 'RefundFailed', 'ExchangeShipped'],
    ExchangeShipped: ['Closed'], // 换货已发货 → 顾客确认收货即关闭
    RefundFailed: ['Refunded'], // 退款失败后可重试
    Refunded: [],
    Closed: [],
};
```

- [ ] **Step 3.2: 实体加换货运单列** `after-sales-request.entity.ts`：`returnCarrier` 字段（54-55 行）之后追加：

```ts
    /** 换货发货运单号（exchangeShip 时落） */
    @Column({ type: 'varchar', nullable: true })
    exchangeTrackingNo: string | null;

    /** 换货发货承运商 */
    @Column({ type: 'varchar', nullable: true })
    exchangeCarrier: string | null;
```

- [ ] **Step 3.3: service 换货方法与退款防线** `after-sales.service.ts`：
  1. `processRefund` 方法内 `if (request.state !== 'Received') {...}` 块（484-486 行）之后追加（exchange 永不可退款；`retryRefund` 无需改——exchange 单经 STATE_TRANSITIONS 到不了 RefundFailed）：
```ts
        if (request.type === 'exchange') {
            throw new UserInputError('Cannot refund: exchange requests are not refundable');
        }
```
  2. Task 2 新增的留言方法区之后（`attachMessageCounts` 方法后）追加两个方法：
```ts
    // ===== 换货闭环（迭代三期） =====

    /** 换货发货（admin）：Received → ExchangeShipped，仅 exchange 类型、仅 Received 状态可走 */
    async exchangeShip(ctx: RequestContext, id: ID, trackingNo: string, carrier: string): Promise<AfterSalesRequest> {
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        const request = await repo.findOne({ where: { id: id as any } });
        if (!request) throw new UserInputError(`After-sales request ${id} not found`);
        if (request.type !== 'exchange') {
            throw new UserInputError('Only exchange requests can be exchange-shipped');
        }
        if (request.state !== 'Received') {
            throw new UserInputError(`Cannot exchange-ship from state: ${request.state}`);
        }
        request.exchangeTrackingNo = trackingNo;
        request.exchangeCarrier = carrier;
        // commitState 统一出口：落历史 + 发布事件（顾客收「换货已发货」站内信）
        return this.commitState(ctx, request, 'Received', 'ExchangeShipped');
    }

    /** 换货确认收货（shop 顾客）：ExchangeShipped → Closed，需校验售后单归属 */
    async exchangeReceive(ctx: RequestContext, id: ID): Promise<AfterSalesRequest> {
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        const request = await repo.findOne({ where: { id: id as any } });
        if (!request) throw new UserInputError(`After-sales request ${id} not found`);
        const customerId = await this.resolveCustomerId(ctx);
        if (!customerId || Number(request.customerId) !== customerId) {
            throw new ForbiddenError();
        }
        if (request.state !== 'ExchangeShipped') {
            throw new UserInputError(`Cannot exchange-receive from state: ${request.state}`);
        }
        // commitState 统一出口：fromState=ExchangeShipped 的 Closed 事件驱动「换货完成」站内信
        return this.commitState(ctx, request, 'ExchangeShipped', 'Closed');
    }
```

  3. 事实确认（无需改动）：`confirmReceive` 对 exchange 单本就只置 `Received`、不触发退款（407-470 行无 type 分支），「confirmReturnReceived 对 exchange 停在 Received」由 e2e 断言锁定。

- [ ] **Step 3.4: plugin.ts SDL**：
  1. **Shop schema** `enum AfterSalesState`（27 行）改为：
```graphql
            enum AfterSalesState { Pending Approved Rejected Returning Received ExchangeShipped Refunded RefundFailed Closed }
```
  2. Shop `type AfterSalesRequest` 内 `returnCarrier: String`（47 行）之后加：
```graphql
                exchangeTrackingNo: String
                exchangeCarrier: String
```
  3. Shop `extend type Mutation` 块内 `addAfterSalesMessage(...)` 之后加：
```graphql
                """顾客确认收到换货商品：ExchangeShipped → Closed"""
                exchangeReceiveAfterSalesRequest(id: ID!): AfterSalesRequest!
```
  4. Admin `type AfterSalesRequestAdmin` 内 `returnCarrier: String`（123 行）之后加：
```graphql
                exchangeTrackingNo: String
                exchangeCarrier: String
```
  5. Admin `extend type Mutation` 块内 `replyAfterSalesMessage(...)` 之后加：
```graphql
                """换货发货：Received → ExchangeShipped（仅 exchange 类型）"""
                exchangeShipAfterSalesRequest(id: ID!, trackingNo: String!, carrier: String!): AfterSalesRequestAdmin!
```

- [ ] **Step 3.5: 双端 resolver 追加**：
  - `after-sales-shop.resolver.ts` 类末尾追加：
```ts
    @Mutation()
    @Allow(Permission.Authenticated)
    async exchangeReceiveAfterSalesRequest(@Ctx() ctx: RequestContext, @Args('id') id: number): Promise<any> {
        return this.afterSalesService.exchangeReceive(ctx, id);
    }
```
  - `after-sales-admin.resolver.ts` 类末尾追加：
```ts
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async exchangeShipAfterSalesRequest(
        @Ctx() ctx: RequestContext,
        @Args('id') id: number,
        @Args('trackingNo') trackingNo: string,
        @Args('carrier') carrier: string,
    ): Promise<any> {
        return this.afterSalesService.exchangeShip(ctx, id, trackingNo, carrier);
    }
```- [ ] **Step 3.6: e2e 追加**（describe 内末尾、Task 2 三个用例之后）：

```ts
    it('换货闭环：confirmReceive 停在 Received；processRefund 被拒；exchangeShip → ExchangeShipped；顾客 exchangeReceive → Closed；全程站内信', async () => {
        await shipNewOrder();
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: {
                orderId: "${orderId}" orderLineId: "${orderLineId}" type: exchange reason: "t3-exchange" refundAmount: 0
            }) { id state } }
        `);
        const id8 = created.createAfterSalesRequest.id;
        await adminClient.query(gql`mutation { approveAfterSalesRequest(id: "${id8}") { id state } }`);
        await shopClient.query(gql`
            mutation { updateReturnTracking(id: "${id8}", trackingNo: "TH0001", carrier: "顺丰") { id state } }
        `);
        // confirmReceive 对 exchange 停在 Received（不触发退款）
        const received = await adminClient.query(gql`mutation { confirmReturnReceived(id: "${id8}") { id state } }`);
        expect(received.confirmReturnReceived.state).toBe('Received');

        // exchange 拒绝退款
        await expectGqlError(
            () => adminClient.query(gql`mutation { processAfterSalesRefund(id: "${id8}") { id state } }`),
            /exchange requests are not refundable/,
        );

        // 商家换货发货
        const shipped = await adminClient.query(gql`
            mutation { exchangeShipAfterSalesRequest(id: "${id8}", trackingNo: "EX9001", carrier: "京东") {
                id state exchangeTrackingNo exchangeCarrier } }
        `);
        expect(shipped.exchangeShipAfterSalesRequest.state).toBe('ExchangeShipped');
        expect(shipped.exchangeShipAfterSalesRequest.exchangeTrackingNo).toBe('EX9001');
        expect(shipped.exchangeShipAfterSalesRequest.exchangeCarrier).toBe('京东');

        // 顾客确认收货 → Closed
        const done = await shopClient.query(gql`
            mutation { exchangeReceiveAfterSalesRequest(id: "${id8}") { id state } }
        `);
        expect(done.exchangeReceiveAfterSalesRequest.state).toBe('Closed');

        // history 含 ExchangeShipped 节点
        const detail = await shopClient.query(gql`
            query { afterSalesRequest(id: "${id8}") { state history { fromState toState } } }
        `);
        const tos = detail.afterSalesRequest.history.map((h: any) => h.toState);
        expect(tos).toEqual(expect.arrayContaining(['ExchangeShipped', 'Closed']));

        // Task 1 通知链路：换货已发货 + 换货完成
        await waitFor(async () => {
            const mine = await shopClient.query(gql`query { myInbox { items { title } } }`);
            return mine.myInbox.items.some((m: any) => m.title === '换货已发货');
        });
        await waitFor(async () => {
            const mine = await shopClient.query(gql`query { myInbox { items { title } } }`);
            return mine.myInbox.items.some((m: any) => m.title === '换货完成');
        });
    }, TEST_SETUP_TIMEOUT_MS);

    it('exchangeShip 校验：非 exchange 类型拒绝；Pending 状态拒绝', async () => {
        await shipNewOrder();
        await expectGqlError(
            () => adminClient.query(gql`
                mutation { exchangeShipAfterSalesRequest(id: "${orderId}", trackingNo: "X", carrier: "Y") { id } }
            `),
            /not found/,
        );

        // Pending 的 exchange 单（未收货）不可发货
        const ex = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: {
                orderId: "${orderId}" orderLineId: "${orderLineId}" type: exchange reason: "t3-xg-pending" refundAmount: 0
            }) { id } }
        `);
        await expectGqlError(
            () => adminClient.query(gql`
                mutation { exchangeShipAfterSalesRequest(id: "${ex.createAfterSalesRequest.id}", trackingNo: "X", carrier: "Y") { id } }
            `),
            /Cannot exchange-ship from state: Pending/,
        );
    }, TEST_SETUP_TIMEOUT_MS);
```

- [ ] **Step 3.7: 运行 e2e**

Run: `cd d:\zhao\vendure\packages\after-sales-plugin; Remove-Item -Recurse -Force e2e\__data3__ -ErrorAction SilentlyContinue; pnpm e2e`
Expected: 迭代三文件 10 个用例 PASS（8 + 2）；旧 `after-sales.e2e-spec.ts` 9 个用例 PASS。

- [ ] **Step 3.8: 提交 vendure**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(after-sales): 迭代三期——换货闭环 ExchangeShipped 状态节点 + exchangeShip/exchangeReceive + exchange 拒绝退款"
git -C d:\zhao\vendure add packages/after-sales-plugin/src/types.ts packages/after-sales-plugin/src/after-sales-request.entity.ts packages/after-sales-plugin/src/after-sales.service.ts packages/after-sales-plugin/src/plugin.ts packages/after-sales-plugin/src/after-sales-shop.resolver.ts packages/after-sales-plugin/src/after-sales-admin.resolver.ts packages/after-sales-plugin/e2e/after-sales-iteration3.e2e-spec.ts
git -C d:\zhao\vendure commit -F "$env:TEMP\as3-commit.txt"
```

---
## Task 4: 超时自动化（JobQueue delayed job + 补偿扫描，照 order-timeout-plugin 模式）

**Files:**
- Create: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-timeout.entity.ts`
- Create: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-config.ts`
- Create: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-timeout.job.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\types.ts`（options 三阈值）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\plugin.ts`（实体/provider/ScheduledTask/事件订阅/渠道 customFields）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\index.ts`（导出）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\e2e\after-sales-iteration3.e2e-spec.ts`

- [ ] **Step 4.1: 新建任务实体** `after-sales-plugin/src/after-sales-timeout.entity.ts`（完整文件）：

```ts
import { Channel, ChannelAware, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinTable, ManyToMany, ManyToOne } from 'typeorm';

/** 售后自动化任务类型 */
export enum AfterSalesTimeoutType {
    /** Pending 超时提醒商家 */
    PENDING_REMIND = 'pending_remind',
    /** Pending 超时自动同意（0 小时配置 = 不创建） */
    PENDING_AUTO_APPROVE = 'pending_auto_approve',
    /** RefundFailed 自动重试（0 次配置 = 不创建） */
    REFUND_RETRY = 'refund_retry',
}

export enum AfterSalesTimeoutStatus {
    PENDING = 'pending',
    CANCELLED = 'cancelled',
    EXECUTED = 'executed',
    FAILED = 'failed',
}

/**
 * 售后超时自动化任务。
 * delayed job 模式（同 order-timeout-plugin）：SQL JobQueue 忽略 delay 选项，
 * 到期前执行直接跳过，由补偿 ScheduledTask 每 5 分钟扫描 dueAt 过期的 PENDING 任务重新入队；
 * 执行时校验 expectedState 与售后单实际状态一致，否则作废（防止过期动作）。
 */
@Entity()
@Index(['status', 'dueAt'])
export class AfterSalesTimeoutTask extends VendureEntity implements ChannelAware {
    constructor(input?: DeepPartial<AfterSalesTimeoutTask>) {
        super(input);
    }

    @Column({ type: 'varchar' }) type: AfterSalesTimeoutType;
    @Column() requestId: number;
    @Column() channelId: number;
    /** 期望状态（执行时 request.state 不一致即 CANCELLED） */
    @Column({ type: 'varchar' }) expectedState: string;
    @Column() dueAt: Date;
    @Column({ type: 'varchar', default: AfterSalesTimeoutStatus.PENDING }) status: AfterSalesTimeoutStatus;
    /** 业务次数（refund_retry 已执行重试次数） */
    @Column({ type: 'int', default: 0 }) attempt: number;
    /** 业务上限（refund_retry 最大重试次数，0=不限仅用于非重试类型） */
    @Column({ type: 'int', default: 0 }) maxAttempt: number;
    /** 执行失败重试次数（与 order-timeout 同义） */
    @Column({ type: 'int', default: 0 }) retryCount: number;
    @Column({ type: 'text', nullable: true }) lastError: string | null;
    @Column({ nullable: true }) executedAt?: Date;
    @ManyToOne(() => Channel) channel: Channel;
    @ManyToMany(() => Channel)
    @JoinTable()
    channels: Channel[];
}
```

- [ ] **Step 4.2: 新建阈值解析** `after-sales-plugin/src/after-sales-config.ts`（完整文件）：

```ts
import { ChannelService, Injector, RequestContext } from '@vendure/core';

import { AfterSalesPluginOptions } from './types';

export interface AfterSalesThresholds {
    /** Pending 超时提醒商家（小时） */
    timeoutHours: number;
    /** Pending 超时自动同意（小时，0 = 关闭） */
    autoApproveHours: number;
    /** RefundFailed 自动重试次数（0 = 关闭） */
    refundAutoRetry: number;
}

const DEFAULTS: AfterSalesThresholds = { timeoutHours: 48, autoApproveHours: 0, refundAutoRetry: 1 };

/**
 * 解析售后自动化阈值：渠道 customFields → 插件 options → 内建默认（48 / 0 / 1）。
 * 事件 ctx.channel 已加载 customFields 时直接取；否则回退查库。
 */
export async function resolveAfterSalesThresholds(
    injector: Injector,
    ctx: RequestContext | null,
    channelId: number | string,
    options: AfterSalesPluginOptions,
): Promise<AfterSalesThresholds> {
    let cf: any = ctx ? (ctx.channel as any)?.customFields : undefined;
    if (!cf) {
        try {
            const channelService = injector.get(ChannelService);
            const channel = await channelService.findOne(RequestContext.empty(), channelId as any);
            cf = (channel as any)?.customFields;
        } catch {
            cf = undefined;
        }
    }
    const pick = (v: unknown, o: unknown, d: number): number => {
        const n = Number(v ?? o ?? d);
        return Number.isFinite(n) && n >= 0 ? n : d;
    };
    return {
        timeoutHours: pick(cf?.afterSalesTimeoutHours, options.afterSalesTimeoutHours, DEFAULTS.timeoutHours),
        autoApproveHours: pick(cf?.afterSalesAutoApproveHours, options.afterSalesAutoApproveHours, DEFAULTS.autoApproveHours),
        refundAutoRetry: pick(cf?.afterSalesRefundAutoRetry, options.afterSalesRefundAutoRetry, DEFAULTS.refundAutoRetry),
    };
}
```

- [ ] **Step 4.3: options 扩展** `types.ts` 的 `AfterSalesPluginOptions`（1-4 行）改为：

```ts
export interface AfterSalesPluginOptions {
    /** Maximum days after delivery to allow after-sales request (default: 15) */
    maxDaysAfterDelivery?: number;
    /** Pending 超时提醒商家小时数（默认 48；渠道 customFields afterSalesTimeoutHours 优先） */
    afterSalesTimeoutHours?: number;
    /** Pending 超时自动同意小时数（0 = 关闭，默认 0；渠道 customFields afterSalesAutoApproveHours 优先） */
    afterSalesAutoApproveHours?: number;
    /** RefundFailed 自动重试次数（0 = 关闭，默认 1；渠道 customFields afterSalesRefundAutoRetry 优先） */
    afterSalesRefundAutoRetry?: number;
}
```
- [ ] **Step 4.4: 新建超时任务 Job** `after-sales-plugin/src/after-sales-timeout.job.ts`（完整文件；照 order-timeout-plugin 模式，附加退款重试指数退避与耗尽商家提醒）：

```ts
import { Injectable, ModuleRef } from '@nestjs/common';
import {
    ChannelService,
    ID,
    Injector,
    JobQueue,
    JobQueueService,
    Logger,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { Repository } from 'typeorm';

import { AfterSalesRequest } from './after-sales-request.entity';
import { AfterSalesService } from './after-sales.service';
import {
    AfterSalesTimeoutStatus,
    AfterSalesTimeoutTask,
    AfterSalesTimeoutType,
} from './after-sales-timeout.entity';
import { loggerCtx } from './constants';

export interface AfterSalesTimeoutJobData {
    taskId: string;
    requestId: number;
    channelId: number;
    type: AfterSalesTimeoutType;
}

/** 执行失败重试上限（与 order-timeout-plugin 同义） */
const MAX_RETRY = 3;
/** 退款重试基础间隔：30min × 2^attempt（指数退避） */
const REFUND_RETRY_BASE_DELAY_MS = 30 * 60 * 1000;

@Injectable()
export class AfterSalesTimeoutJob {
    private jobQueue!: JobQueue<AfterSalesTimeoutJobData>;
    private taskRepo: Repository<AfterSalesTimeoutTask>;
    private requestRepo: Repository<AfterSalesRequest>;
    private injector!: Injector;

    constructor(
        private jobQueueService: JobQueueService,
        private connection: TransactionalConnection,
        private moduleRef: ModuleRef,
        private afterSalesService: AfterSalesService,
    ) {
        this.taskRepo = this.connection.rawConnection.getRepository(AfterSalesTimeoutTask);
        this.requestRepo = this.connection.rawConnection.getRepository(AfterSalesRequest);
    }

    async init(): Promise<void> {
        this.injector = new Injector(this.moduleRef);
        this.jobQueue = await this.jobQueueService.createQueue({
            name: 'after-sales-timeout',
            process: async (job) => {
                await this.process(job.data);
            },
        });
    }

    private async process(data: AfterSalesTimeoutJobData): Promise<void> {
        const { taskId } = data;
        const task = await this.taskRepo.findOne({ where: { id: taskId as any } });
        if (!task) {
            Logger.warn(`Task ${taskId} not found, skipping timeout job`, loggerCtx);
            return;
        }
        if (task.status !== AfterSalesTimeoutStatus.PENDING) {
            Logger.info(`Task ${taskId} status=${task.status}, skipping`, loggerCtx);
            return;
        }
        // SQL JobQueue（DefaultJobQueuePlugin）忽略 `delay` 选项，任务入队后可能立即执行。
        // 若未到 dueAt 则跳过执行，任务保持 PENDING，由补偿扫描任务在到期后重新入队。
        if (new Date() < task.dueAt) {
            Logger.debug(
                `Task ${taskId} not due until ${task.dueAt.toISOString()}, skipping (compensation will re-enqueue)`,
                loggerCtx,
            );
            return;
        }

        try {
            const ctx = await this.buildCtx(task.channelId);
            if (!ctx) {
                throw new Error(`Channel ${task.channelId} not found`);
            }
            const request = await this.requestRepo.findOne({ where: { id: task.requestId as any } });
            if (!request) {
                task.status = AfterSalesTimeoutStatus.CANCELLED;
                await this.taskRepo.save(task);
                Logger.warn(`AfterSalesRequest ${task.requestId} not found, task ${taskId} CANCELLED`, loggerCtx);
                return;
            }
            // 状态不一致即作废：防止过期动作（如 Pending 已被人工处理/取消）
            if (request.state !== task.expectedState) {
                task.status = AfterSalesTimeoutStatus.CANCELLED;
                await this.taskRepo.save(task);
                Logger.info(
                    `Request ${task.requestId} state=${request.state} no longer matches ${task.expectedState}, task ${taskId} CANCELLED`,
                    loggerCtx,
                );
                return;
            }

            switch (task.type) {
                case AfterSalesTimeoutType.PENDING_REMIND:
                    await this.notifyMerchant(
                        ctx,
                        task,
                        '售后处理超时提醒',
                        `您有一笔售后申请（#${task.requestId}）已超过处理时限仍未处理，请尽快登录后台处理。`,
                    );
                    break;
                case AfterSalesTimeoutType.PENDING_AUTO_APPROVE:
                    await this.afterSalesService.approveRequest(ctx, task.requestId as ID);
                    Logger.info(`Request ${task.requestId} auto-approved after timeout`, loggerCtx);
                    break;
                case AfterSalesTimeoutType.REFUND_RETRY:
                    // 退款重试的终态/重排逻辑全部在 executeRefundRetry 内自行落库
                    await this.executeRefundRetry(ctx, task);
                    break;
                default:
                    throw new Error(`Unknown timeout type: ${task.type}`);
            }
            if (task.type === AfterSalesTimeoutType.REFUND_RETRY) {
                return; // 已自行落 EXECUTED/CANCELLED，或重排 dueAt 保持 PENDING
            }
            task.status = AfterSalesTimeoutStatus.EXECUTED;
            task.executedAt = new Date();
            task.lastError = null;
            await this.taskRepo.save(task);
            Logger.info(`Timeout ${task.type} for request ${task.requestId} executed (task ${taskId})`, loggerCtx);
        } catch (e: any) {
            task.retryCount += 1;
            task.lastError = String(e?.message ?? e);
            if (task.retryCount >= MAX_RETRY) {
                task.status = AfterSalesTimeoutStatus.FAILED;
                Logger.error(
                    `Task ${taskId} marked FAILED after ${task.retryCount} retries: ${task.lastError}`,
                    loggerCtx,
                );
            } else {
                Logger.warn(
                    `Task ${taskId} failed (retry ${task.retryCount}/${MAX_RETRY}): ${task.lastError}`,
                    loggerCtx,
                );
            }
            await this.taskRepo.save(task);
            throw e;
        }
    }

    /**
     * RefundFailed 自动重试：调 retryRefund 复用退款核心；成功→EXECUTED；
     * 失败且未耗尽→指数退避重排（任务保持 PENDING）；耗尽→EXECUTED + 商家提醒。
     */
    private async executeRefundRetry(ctx: RequestContext, task: AfterSalesTimeoutTask): Promise<void> {
        const markExhausted = async () => {
            task.status = AfterSalesTimeoutStatus.EXECUTED;
            task.executedAt = new Date();
            await this.taskRepo.save(task);
            await this.notifyMerchant(
                ctx,
                task,
                '退款自动重试耗尽',
                `售后单 #${task.requestId} 退款自动重试已达上限（${task.maxAttempt} 次）仍未成功，请人工处理。`,
            );
            Logger.warn(`Refund auto-retry exhausted for request ${task.requestId} (task ${task.id})`, loggerCtx);
        };
        // 防御：补偿扫描重复入队等场景下 attempt 已达上限则直接终态
        if (task.maxAttempt > 0 && task.attempt >= task.maxAttempt) {
            await markExhausted();
            return;
        }
        const request = await this.requestRepo.findOne({ where: { id: task.requestId as any } });
        if (!request) {
            task.status = AfterSalesTimeoutStatus.CANCELLED;
            task.lastError = `AfterSalesRequest ${task.requestId} not found`;
            await this.taskRepo.save(task);
            return;
        }
        if (request.type === 'exchange') {
            // 换货单不走退款链路（与 EXCHANGE_NO_REFUND 约束同源）
            task.status = AfterSalesTimeoutStatus.CANCELLED;
            await this.taskRepo.save(task);
            Logger.info(`Exchange request ${task.requestId} skips refund retry, task ${task.id} CANCELLED`, loggerCtx);
            return;
        }

        const after = await this.afterSalesService.retryRefund(ctx, task.requestId as ID);
        task.attempt += 1;
        if (after.state === 'Refunded') {
            task.status = AfterSalesTimeoutStatus.EXECUTED;
            task.executedAt = new Date();
            task.lastError = null;
            await this.taskRepo.save(task);
            Logger.info(`Refund retry succeeded for request ${task.requestId} (task ${task.id})`, loggerCtx);
            return;
        }
        if (task.attempt >= task.maxAttempt) {
            await markExhausted();
            return;
        }
        // 未耗尽：指数退避登记下一次重试（任务保持 PENDING，等补偿扫描/延迟队列兜底）
        const delayMs = REFUND_RETRY_BASE_DELAY_MS * Math.pow(2, task.attempt);
        task.dueAt = new Date(Date.now() + delayMs);
        await this.taskRepo.save(task);
        await this.jobQueue.add(
            { taskId: String(task.id), requestId: task.requestId, channelId: task.channelId, type: task.type },
            { delay: delayMs, retries: MAX_RETRY } as any,
        );
        Logger.info(
            `Refund retry ${task.attempt}/${task.maxAttempt} rescheduled for request ${task.requestId} due at ${task.dueAt.toISOString()}`,
            loggerCtx,
        );
    }

    /**
     * 商家侧站内信提醒。notification-plugin 可能未注册（本插件可独立使用），
     * 因此 require + {strict:false} 可选解析并全程吞错：提醒失败仅告警，不影响任务状态落库。
     */
    private async notifyMerchant(
        ctx: RequestContext,
        task: AfterSalesTimeoutTask,
        title: string,
        content: string,
    ): Promise<void> {
        try {
            const { NotificationService } = require('@vendure/notification-plugin');
            const notificationService = this.injector.get(NotificationService, { strict: false }) as
                | undefined
                | {
                    notifyAfterSalesMerchant: (
                        ctx: RequestContext,
                        requestId: number,
                        title: string,
                        content: string,
                    ) => Promise<void>;
                };
            if (!notificationService?.notifyAfterSalesMerchant) {
                Logger.warn(`NotificationService not available, skip merchant notify for request ${task.requestId}`, loggerCtx);
                return;
            }
            await notificationService.notifyAfterSalesMerchant(ctx, task.requestId, title, content);
        } catch (e: any) {
            Logger.warn(`Merchant notify failed for request ${task.requestId}: ${e?.message ?? e}`, loggerCtx);
        }
    }

    private async buildCtx(channelId: number | string): Promise<RequestContext | null> {
        try {
            const channelService = this.injector.get(ChannelService);
            const emptyCtx = RequestContext.empty();
            const channel = await channelService.findOne(emptyCtx, channelId as ID);
            if (!channel) return null;
            return new RequestContext({
                apiType: 'admin',
                channel,
                isAuthorized: true,
                authorizedAsOwnerOnly: false,
            });
        } catch (e: any) {
            Logger.warn(`AfterSalesTimeoutJob buildCtx failed: ${e?.message ?? e}`, loggerCtx);
            return null;
        }
    }

    /** 登记超时任务：落库 + 入 delayed job（SQL JobQueue 忽略 delay 时由补偿扫描兜底） */
    async scheduleTimeout(
        type: AfterSalesTimeoutType,
        requestId: number,
        channelId: number,
        delayMs: number,
        expectedState: string,
        maxAttempt = 0,
    ): Promise<void> {
        const dueAt = new Date(Date.now() + delayMs);
        const task = this.taskRepo.create({
            type,
            requestId,
            channelId,
            dueAt,
            status: AfterSalesTimeoutStatus.PENDING,
            expectedState,
            attempt: 0,
            maxAttempt,
            retryCount: 0,
        });
        const saved = await this.taskRepo.save(task);
        // BullMQ backend persists `delay` option; default SQL strategy ignores it.
        // Reliability is guaranteed by the compensation ScheduledTask scanning `dueAt`.
        await this.jobQueue.add(
            { taskId: String(saved.id), requestId, channelId, type },
            { delay: delayMs, retries: MAX_RETRY } as any,
        );
        Logger.info(
            `Scheduled ${type} timeout for after-sales request ${requestId} due at ${dueAt.toISOString()}`,
            loggerCtx,
        );
    }

    /**
     * 补偿扫描：捡起 dueAt 已过但未执行的 PENDING 任务重新入队
     * （进程重启 / SQL JobQueue 忽略 delay / Pod 漂移兜底），由标准 handler 带完整状态校验执行。
     */
    async runCompensation(): Promise<void> {
        const now = new Date();
        const overdue = await this.taskRepo.find({ where: { status: AfterSalesTimeoutStatus.PENDING } });
        let requeued = 0;
        for (const task of overdue) {
            if (task.dueAt > now || task.retryCount >= MAX_RETRY) continue;
            await this.jobQueue.add(
                { taskId: String(task.id), requestId: task.requestId, channelId: task.channelId, type: task.type },
                { retries: MAX_RETRY } as any,
            );
            requeued++;
        }
        if (requeued > 0) {
            Logger.info(`After-sales timeout compensation re-enqueued ${requeued} overdue task(s)`, loggerCtx);
        }
    }
}
```

- [ ] **Step 4.5: 接线 plugin.ts**（实体/provider/渠道 customFields 三阈值/补偿 ScheduledTask/事件订阅登记超时任务）：
  1. 第 3 行 `@vendure/core` 合并导入（EventBus、ScheduledTask）：
```ts
import { EventBus, Injector, LanguageCode, Logger, PluginCommonModule, ScheduledTask, VendurePlugin } from '@vendure/core';
```
  2. `import { afterSalesOrderCustomFields } from './order-custom-fields';` 之后追加：
```ts
import { AfterSalesStateTransitionEvent } from './after-sales.events';
import { resolveAfterSalesThresholds } from './after-sales-config';
import { AfterSalesTimeoutJob } from './after-sales-timeout.job';
import { AfterSalesTimeoutTask, AfterSalesTimeoutType } from './after-sales-timeout.entity';
```
  3. 模块级常量（`const { gql } = require('graphql-tag');` 之后），照 order-timeout-plugin 模式：
```ts
const COMPENSATION_TASK_ID = 'after-sales-timeout-compensation';

const compensationTask = new ScheduledTask({
    id: COMPENSATION_TASK_ID,
    description: 'Scan overdue AfterSalesTimeoutTask records and re-enqueue them',
    schedule: cron => cron.every(5).minutes(),
    async execute({ injector }) {
        const job = injector.get(AfterSalesTimeoutJob);
        await job.runCompensation();
    },
});
```
  4. `entities` 数组（Task 2 已加入 AfterSalesMessage）追加 `AfterSalesTimeoutTask`；`providers` 数组 `AfterSalesService,` 之后追加 `AfterSalesTimeoutJob,`：
```ts
    entities: [AfterSalesRequest, AfterSalesStateHistory, AfterSalesMessage, AfterSalesTimeoutTask],
    providers: [
        { provide: AFTER_SALES_PLUGIN_OPTIONS, useFactory: () => AfterSalesPlugin.options },
        AfterSalesService,
        AfterSalesTimeoutJob,
    ],
```
  5. `configuration` 的 `Channel` 数组（afterSalesReturnAddress 条目之后）追加三个 int customFields（幂等合并沿用现有 spread 模式）：
```ts
            Channel: [
                ...(config.customFields?.Channel ?? []),
                {
                    name: 'afterSalesReturnAddress',
                    type: 'string',
                    nullable: true,
                    label: [{ languageCode: LanguageCode.zh_Hans, value: '售后寄回地址' }],
                },
                {
                    name: 'afterSalesTimeoutHours',
                    type: 'int',
                    defaultValue: 48,
                    label: [{ languageCode: LanguageCode.zh_Hans, value: '售后待处理超时提醒（小时）' }],
                },
                {
                    name: 'afterSalesAutoApproveHours',
                    type: 'int',
                    defaultValue: 0,
                    label: [{ languageCode: LanguageCode.zh_Hans, value: '售后超时自动同意（小时，0=关闭）' }],
                },
                {
                    name: 'afterSalesRefundAutoRetry',
                    type: 'int',
                    defaultValue: 1,
                    label: [{ languageCode: LanguageCode.zh_Hans, value: '退款失败自动重试次数（0=关闭）' }],
                },
            ],
```
  6. `configuration` 内 `return config;` 之前追加补偿任务幂等注册（schedulerOptions 为全局共享，order-timeout-plugin 也在 push，必须按 id 去重）：
```ts
        const exists = config.schedulerOptions.tasks.some(t => t.id === COMPENSATION_TASK_ID);
        if (!exists) {
            config.schedulerOptions.tasks.push(compensationTask);
        }
```
  7. 构造函数注入（`private moduleRef: ModuleRef,` 之前）：
```ts
        private afterSalesTimeoutJob: AfterSalesTimeoutJob,
        private eventBus: EventBus,
```
  8. `onApplicationBootstrap` 全量替换 + 新增私有方法（类体末尾）：
```ts
    async onApplicationBootstrap(): Promise<void> {
        this.injector = new Injector(this.moduleRef);
        this.afterSalesService.init(this.injector);
        await this.afterSalesTimeoutJob.init();

        // 状态流转 → 登记超时任务（Pending 提醒 / Pending 自动同意 / RefundFailed 重试）
        this.eventBus.ofType(AfterSalesStateTransitionEvent).subscribe((e) => {
            void this.onAfterSalesStateTransition(e);
        });

        Logger.info('AfterSalesPlugin initialized', loggerCtx);
    }

    private async onAfterSalesStateTransition(e: AfterSalesStateTransitionEvent): Promise<void> {
        try {
            const thresholds = await resolveAfterSalesThresholds(
                this.injector,
                e.ctx,
                e.ctx.channelId,
                AfterSalesPlugin.options,
            );
            if (e.toState === 'Pending' && e.fromState === null) {
                await this.afterSalesTimeoutJob.scheduleTimeout(
                    AfterSalesTimeoutType.PENDING_REMIND,
                    e.requestId,
                    Number(e.ctx.channelId),
                    thresholds.timeoutHours * 60 * 60 * 1000,
                    'Pending',
                );
                if (thresholds.autoApproveHours > 0) {
                    await this.afterSalesTimeoutJob.scheduleTimeout(
                        AfterSalesTimeoutType.PENDING_AUTO_APPROVE,
                        e.requestId,
                        Number(e.ctx.channelId),
                        thresholds.autoApproveHours * 60 * 60 * 1000,
                        'Pending',
                    );
                }
            } else if (
                e.toState === 'RefundFailed' &&
                // 重试再失败会经 commitState 再发布 RefundFailed→RefundFailed，必须去重，防无限登记重试
                e.fromState !== 'RefundFailed' &&
                thresholds.refundAutoRetry > 0
            ) {
                await this.afterSalesTimeoutJob.scheduleTimeout(
                    AfterSalesTimeoutType.REFUND_RETRY,
                    e.requestId,
                    Number(e.ctx.channelId),
                    30 * 60 * 1000,
                    'RefundFailed',
                    thresholds.refundAutoRetry,
                );
            }
        } catch (err: any) {
            Logger.error(
                `Schedule after-sales timeout failed for request #${e.requestId}: ${err?.message ?? err}`,
                loggerCtx,
            );
        }
    }
```

- [ ] **Step 4.6: index.ts 导出**（Task 2/3 已追加 message/events 导出之后，包根再追加三行）：

```ts
export * from './src/after-sales-timeout.entity';
export * from './src/after-sales-timeout.job';
export * from './src/after-sales-config';
```

- [ ] **Step 4.7: e2e 追加** `e2e/after-sales-iteration3.e2e-spec.ts`：
  1. 文件头部 import 区追加（`TransactionalConnection` 合并进现有 `@vendure/core` 的 mergeConfig 导入行）：
```ts
import { TransactionalConnection } from '@vendure/core';
import { AfterSalesTimeoutJob } from '../src/after-sales-timeout.job';
import { AfterSalesTimeoutTask, AfterSalesTimeoutType } from '../src/after-sales-timeout.entity';
```
  2. describe 内末尾（用例 10 之后、describe 结束 `});` 前）追加三个用例：
```ts
    it('超时自动化：Pending 默认 48h 商家提醒；autoApprove=0 不自动同意', async () => {
        await shipNewOrder();
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: {
                orderId: "${orderId}" orderLineId: "${orderLineId}" type: return_refund reason: "t3-timeout" refundAmount: 100
            }) { id state } }
        `);
        const id11 = created.createAfterSalesRequest.id;

        const job = server.app.get(AfterSalesTimeoutJob);
        const conn = server.app.get(TransactionalConnection);
        const taskRepo = conn.rawConnection.getRepository(AfterSalesTimeoutTask);

        // 默认配置：只登记提醒任务（48h）；autoApproveHours=0 不登记自动同意任务
        const remind = await taskRepo.findOne({
            where: { requestId: Number(id11), type: AfterSalesTimeoutType.PENDING_REMIND },
        });
        expect(remind).toBeDefined();
        expect(remind!.expectedState).toBe('Pending');
        const spanH = (remind!.dueAt.getTime() - Date.now()) / 3600000;
        expect(spanH).toBeGreaterThan(47);
        expect(spanH).toBeLessThan(49);
        const auto = await taskRepo.findOne({
            where: { requestId: Number(id11), type: AfterSalesTimeoutType.PENDING_AUTO_APPROVE },
        });
        expect(auto).toBeNull();

        // dueAt 改为过去 → 补偿扫描触发 → 店主收超时提醒
        await taskRepo.update({ id: remind!.id as any }, { dueAt: new Date(Date.now() - 1000) });
        await job.runCompensation();
        const { SimpleGraphQLClient } = await import('@vendure/testing');
        const owner = new SimpleGraphQLClient(server, `http://localhost:${(server as any).config.apiOptions.port}/admin-api`);
        await owner.asUserWithCredentials(ownerEmail, 'test');
        await waitFor(async () => {
            const inbox = await owner.query(gql`query { adminInbox { items { title } } }`);
            return inbox.adminInbox.items.some((m: any) => m.title === '售后处理超时提醒');
        });

        // autoApproveHours=0：状态不被自动同意
        const after = await shopClient.query(gql`query { afterSalesRequest(id: "${id11}") { id state } }`);
        expect(after.afterSalesRequest.state).toBe('Pending');
    }, TEST_SETUP_TIMEOUT_MS);

    it('超时自动化：afterSalesAutoApproveHours=1 到期自动同意 + 顾客收通知', async () => {
        // 调低渠道阈值：提醒 1h、自动同意 1h
        await adminClient.query(gql`
            mutation { updateChannel(id: "T_1", input: { customFields: {
                afterSalesTimeoutHours: 1, afterSalesAutoApproveHours: 1
            } }) { id } }
        `);
        await shipNewOrder();
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: {
                orderId: "${orderId}" orderLineId: "${orderLineId}" type: return_refund reason: "t3-auto-approve" refundAmount: 100
            }) { id state } }
        `);
        const id12 = created.createAfterSalesRequest.id;

        const job = server.app.get(AfterSalesTimeoutJob);
        const conn = server.app.get(TransactionalConnection);
        const taskRepo = conn.rawConnection.getRepository(AfterSalesTimeoutTask);
        // 两个任务都已登记（提醒 + 自动同意）
        const remind = await taskRepo.findOne({
            where: { requestId: Number(id12), type: AfterSalesTimeoutType.PENDING_REMIND },
        });
        const auto = await taskRepo.findOne({
            where: { requestId: Number(id12), type: AfterSalesTimeoutType.PENDING_AUTO_APPROVE },
        });
        expect(remind).toBeDefined();
        expect(auto).toBeDefined();
        await taskRepo.update({ id: remind!.id as any }, { dueAt: new Date(Date.now() - 1000) });
        await taskRepo.update({ id: auto!.id as any }, { dueAt: new Date(Date.now() - 1000) });
        await job.runCompensation();

        // 自动同意 → Approved（经 commitState → 顾客收「售后审核通过」）
        await waitFor(async () => {
            const r = await shopClient.query(gql`query { afterSalesRequest(id: "${id12}") { id state } }`);
            return r.afterSalesRequest.state === 'Approved';
        });
        await waitFor(async () => {
            const mine = await shopClient.query(gql`query { myInbox { items { title } } }`);
            return mine.myInbox.items.some((m: any) => m.title === '售后审核通过');
        });
        // 恢复默认阈值，避免污染后续用例
        await adminClient.query(gql`
            mutation { updateChannel(id: "T_1", input: { customFields: {
                afterSalesTimeoutHours: 48, afterSalesAutoApproveHours: 0
            } }) { id } }
        `);
    }, TEST_SETUP_TIMEOUT_MS);

    it('退款自动重试耗尽 → 商家提醒；autoRetry=0 不登记任务', async () => {
        // 创建首退失败支付方式（照旧 e2e 退款失败用例模式）
        await adminClient.query(gql`
            mutation { createPaymentMethod(input: {
                code: "${singleStageRefundFailingPaymentMethod.code}"
                enabled: true
                translations: [{ languageCode: zh_Hans, name: "${singleStageRefundFailingPaymentMethod.code}" }]
                handler: { code: "${singleStageRefundFailingPaymentMethod.code}" arguments: [] }
            }) { id code } }
        `);
        await adminClient.query(gql`
            mutation { updateChannel(id: "T_1", input: { customFields: { afterSalesRefundAutoRetry: 1 } }) { id } }
        `);
        await shipNewOrder(1, singleStageRefundFailingPaymentMethod.code);
        const created = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: {
                orderId: "${orderId}" orderLineId: "${orderLineId}" type: return_refund reason: "t3-retry" refundAmount: 100
            }) { id state } }
        `);
        const id13 = created.createAfterSalesRequest.id;
        await adminClient.query(gql`mutation { approveAfterSalesRequest(id: "${id13}") { id state } }`);
        await shopClient.query(gql`mutation { updateReturnTracking(id: "${id13}", trackingNo: "RT13", carrier: "顺丰") { id state } }`);
        await adminClient.query(gql`mutation { confirmReturnReceived(id: "${id13}") { id state } }`);
        const failed = await adminClient.query(gql`mutation { processAfterSalesRefund(id: "${id13}") { id state } }`);
        expect(failed.processAfterSalesRefund.state).toBe('RefundFailed');

        const job = server.app.get(AfterSalesTimeoutJob);
        const conn = server.app.get(TransactionalConnection);
        const taskRepo = conn.rawConnection.getRepository(AfterSalesTimeoutTask);
        // RefundFailed（首入）→ 登记重试任务（30min 后）
        await waitFor(async () => {
            const t = await taskRepo.findOne({ where: { requestId: Number(id13), type: AfterSalesTimeoutType.REFUND_RETRY } });
            return !!t;
        });
        const retry = await taskRepo.findOne({ where: { requestId: Number(id13), type: AfterSalesTimeoutType.REFUND_RETRY } });
        expect(retry!.expectedState).toBe('RefundFailed');
        expect(retry!.maxAttempt).toBe(1);
        await taskRepo.update({ id: retry!.id as any }, { dueAt: new Date(Date.now() - 1000) });
        await job.runCompensation();

        // 重试一次仍失败（首退失败处理器）→ attempt=1 达上限 → EXECUTED + 商家「退款自动重试耗尽」
        await waitFor(async () => {
            const t = await taskRepo.findOne({ where: { id: retry!.id as any } });
            return t!.status === 'executed';
        });
        const done = await taskRepo.findOne({ where: { id: retry!.id as any } });
        expect(done!.attempt).toBe(1);
        const { SimpleGraphQLClient } = await import('@vendure/testing');
        const owner = new SimpleGraphQLClient(server, `http://localhost:${(server as any).config.apiOptions.port}/admin-api`);
        await owner.asUserWithCredentials(ownerEmail, 'test');
        await waitFor(async () => {
            const inbox = await owner.query(gql`query { adminInbox { items { title } } }`);
            return inbox.adminInbox.items.some((m: any) => m.title === '退款自动重试耗尽');
        });

        // 关闭重试（0=关闭）→ 新 RefundFailed 单不再登记任务
        await adminClient.query(gql`
            mutation { updateChannel(id: "T_1", input: { customFields: { afterSalesRefundAutoRetry: 0 } }) { id } }
        `);
        await shipNewOrder(1, singleStageRefundFailingPaymentMethod.code);
        const created2 = await shopClient.query(gql`
            mutation { createAfterSalesRequest(input: {
                orderId: "${orderId}" orderLineId: "${orderLineId}" type: return_refund reason: "t3-retry-off" refundAmount: 100
            }) { id state } }
        `);
        const id13b = created2.createAfterSalesRequest.id;
        await adminClient.query(gql`mutation { approveAfterSalesRequest(id: "${id13b}") { id state } }`);
        await shopClient.query(gql`mutation { updateReturnTracking(id: "${id13b}", trackingNo: "RT14", carrier: "顺丰") { id state } }`);
        await adminClient.query(gql`mutation { confirmReturnReceived(id: "${id13b}") { id state } }`);
        const failed2 = await adminClient.query(gql`mutation { processAfterSalesRefund(id: "${id13b}") { id state } }`);
        expect(failed2.processAfterSalesRefund.state).toBe('RefundFailed');
        await new Promise((r) => setTimeout(r, 500));
        const none = await taskRepo.findOne({ where: { requestId: Number(id13b), type: AfterSalesTimeoutType.REFUND_RETRY } });
        expect(none).toBeNull();
        // 恢复默认阈值
        await adminClient.query(gql`
            mutation { updateChannel(id: "T_1", input: { customFields: { afterSalesRefundAutoRetry: 1 } }) { id } }
        `);
    }, TEST_SETUP_TIMEOUT_MS);
```

- [ ] **Step 4.8: 运行 e2e**

Run: `cd d:\zhao\vendure\packages\after-sales-plugin; Remove-Item -Recurse -Force e2e\__data3__ -ErrorAction SilentlyContinue; pnpm e2e`
Expected: 迭代三文件 13 个用例 PASS（10 + 3）；旧 `after-sales.e2e-spec.ts` 9 个用例 PASS。

- [ ] **Step 4.9: 提交 vendure**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(after-sales): 迭代三期——售后超时自动化 JobQueue（48h 提醒 / 超时自动同意 / 退款失败指数退避重试，渠道 customFields 阈值）"
git -C d:\zhao\vendure add packages/after-sales-plugin/src/after-sales-timeout.entity.ts packages/after-sales-plugin/src/after-sales-timeout.job.ts packages/after-sales-plugin/src/after-sales-config.ts packages/after-sales-plugin/src/types.ts packages/after-sales-plugin/src/plugin.ts packages/after-sales-plugin/index.ts packages/after-sales-plugin/e2e/after-sales-iteration3.e2e-spec.ts
git -C d:\zhao\vendure commit -F "$env:TEMP\as3-commit.txt"
```

---
## Task 5: afterSalesStats 售后数据看板聚合查询（Admin）

**Files:**
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\plugin.ts`（admin SDL 加 3 个 type + Query）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales.service.ts`（stats 聚合）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-admin.resolver.ts`（Query 解析器）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\e2e\after-sales-iteration3.e2e-spec.ts`（用例 14）

- [ ] **Step 5.1: admin SDL**（plugin.ts `adminApiExtensions.schema` 内）：
  1. `input AfterSalesRequestAdminListOptions` 之后插入：
```graphql
            type AfterSalesDaily {
                date: String!
                total: Int!
            }

            type AfterSalesBucket {
                key: String!
                count: Int!
                amount: Int!
            }

            type AfterSalesStats {
                totalRequests: Int!
                pendingCount: Int!
                totalRefundAmount: Int!
                avgHandleHours: Float
                daily: [AfterSalesDaily!]!
                byState: [AfterSalesBucket!]!
                byType: [AfterSalesBucket!]!
            }
```
  2. `extend type Query` 内 `afterSalesReturnAddress: String!` 之后加一行：
```graphql
                afterSalesStats(from: String!, to: String!): AfterSalesStats!
```

- [ ] **Step 5.2: service.stats**（after-sales.service.ts，`updateReturnAddress` 方法之后、类末尾追加）：

```ts
    /**
     * 售后数据看板聚合（三期设计 §四）：窗口申请总数 / 仍 Pending / 实退总额 / 平均处理时长 / 按日 / 按状态 / 按类型。
     * from/to 接受 'YYYY-MM-DD' 或完整 ISO 串（纯日期的 to 按当日 23:59:59.999 收口）。
     * 分日聚合用 SUBSTR(createdAt,1,10)（sqlite/mysql 均支持）；平均处理时长用 JS 计算避免跨库 AVG 精度差异。
     */
    async stats(ctx: RequestContext, from: string, to: string): Promise<any> {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            throw new UserInputError('Invalid from/to date');
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(to).trim())) {
            toDate.setHours(23, 59, 59, 999);
        }
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);

        const totalRequests = await repo
            .createQueryBuilder('r')
            .where('r.createdAt >= :from', { from: fromDate })
            .andWhere('r.createdAt <= :to', { to: toDate })
            .getCount();

        const pendingCount = await repo
            .createQueryBuilder('r')
            .where('r.state = :state', { state: 'Pending' })
            .andWhere('r.createdAt <= :to', { to: toDate })
            .getCount();

        const refundRow = await repo
            .createQueryBuilder('r')
            .select('COALESCE(SUM(r.actualRefundAmount), 0)', 'total')
            .where("r.state = 'Refunded'")
            .andWhere('r.refundedAt >= :from', { from: fromDate })
            .andWhere('r.refundedAt <= :to', { to: toDate })
            .getRawOne();
        const totalRefundAmount = Number(refundRow?.total ?? 0);

        const dailyRows = await repo
            .createQueryBuilder('r')
            .select('SUBSTR(r.createdAt, 1, 10)', 'date')
            .addSelect('COUNT(*)', 'total')
            .where('r.createdAt >= :from', { from: fromDate })
            .andWhere('r.createdAt <= :to', { to: toDate })
            .groupBy('SUBSTR(r.createdAt, 1, 10)')
            .orderBy('SUBSTR(r.createdAt, 1, 10)', 'ASC')
            .getRawMany();

        const stateRows = await repo
            .createQueryBuilder('r')
            .select('r.state', 'key')
            .addSelect('COUNT(*)', 'count')
            .addSelect('COALESCE(SUM(r.actualRefundAmount), 0)', 'amount')
            .where('r.createdAt >= :from', { from: fromDate })
            .andWhere('r.createdAt <= :to', { to: toDate })
            .groupBy('r.state')
            .getRawMany();

        const typeRows = await repo
            .createQueryBuilder('r')
            .select('r.type', 'key')
            .addSelect('COUNT(*)', 'count')
            .addSelect('COALESCE(SUM(r.actualRefundAmount), 0)', 'amount')
            .where('r.createdAt >= :from', { from: fromDate })
            .andWhere('r.createdAt <= :to', { to: toDate })
            .groupBy('r.type')
            .getRawMany();

        // 平均处理时长（小时）：窗口内 Refunded 行 refundedAt - createdAt 的均值，保留两位；无数据为 null
        const refunded = await repo.find({ where: { state: 'Refunded' as any } });
        const hours = refunded
            .filter(
                (r) =>
                    r.refundedAt &&
                    new Date(r.createdAt as any) >= fromDate &&
                    new Date(r.createdAt as any) <= toDate,
            )
            .map((r) => (r.refundedAt!.getTime() - new Date(r.createdAt as any).getTime()) / 3600000)
            .filter((h) => h >= 0);
        const avgHandleHours = hours.length
            ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 100) / 100
            : null;

        return {
            totalRequests,
            pendingCount,
            totalRefundAmount,
            avgHandleHours,
            daily: dailyRows.map((row: any) => ({ date: String(row.date), total: Number(row.total) })),
            byState: stateRows.map((row: any) => ({
                key: String(row.key),
                count: Number(row.count),
                amount: Number(row.amount),
            })),
            byType: typeRows.map((row: any) => ({
                key: String(row.key),
                count: Number(row.count),
                amount: Number(row.amount),
            })),
        };
    }
```

- [ ] **Step 5.3: resolver**（after-sales-admin.resolver.ts，`afterSalesRequestAdmin` 方法之后追加）：

```ts
    @Query()
    @Allow(Permission.ReadOrder)
    async afterSalesStats(
        @Ctx() ctx: RequestContext,
        @Args('from') from: string,
        @Args('to') to: string,
    ): Promise<any> {
        return this.afterSalesService.stats(ctx, from, to);
    }
```

- [ ] **Step 5.4: e2e 追加用例 14**（describe 内末尾、用例 13 之后追加）：

```ts
    it('afterSalesStats 聚合：窗口内计数/分组正确；空窗口返回 0/[]', async () => {
        const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const to = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const { afterSalesStats } = await adminClient.query(gql`
            query { afterSalesStats(from: "${from}", to: "${to}") {
                totalRequests pendingCount totalRefundAmount avgHandleHours
                daily { date total }
                byState { key count amount }
                byType { key count amount }
            } }
        `);
        expect(afterSalesStats.totalRequests).toBeGreaterThan(0);
        expect(afterSalesStats.pendingCount).toBeGreaterThan(0); // 用例 11 的单仍 Pending
        expect(afterSalesStats.totalRefundAmount).toBeGreaterThan(0); // 用例 4 已产生 Refunded 单
        expect(afterSalesStats.avgHandleHours).not.toBeNull();
        const stateKeys = afterSalesStats.byState.map((b: any) => b.key);
        expect(stateKeys).toContain('Pending');
        expect(stateKeys).toContain('Refunded');
        const typeKeys = afterSalesStats.byType.map((b: any) => b.key);
        expect(typeKeys).toContain('return_refund');
        expect(afterSalesStats.daily.length).toBeGreaterThan(0);

        // 空窗口：不伪造数据
        const empty = await adminClient.query(gql`
            query { afterSalesStats(from: "2000-01-01", to: "2000-01-02") {
                totalRequests pendingCount totalRefundAmount avgHandleHours
                daily { date total } byState { key count } byType { key count }
            } }
        `);
        expect(empty.afterSalesStats.totalRequests).toBe(0);
        expect(empty.afterSalesStats.totalRefundAmount).toBe(0);
        expect(empty.afterSalesStats.daily).toEqual([]);
        expect(empty.afterSalesStats.byState).toEqual([]);
        expect(empty.afterSalesStats.byType).toEqual([]);
        expect(empty.afterSalesStats.avgHandleHours).toBeNull();
    }, TEST_SETUP_TIMEOUT_MS);
```

- [ ] **Step 5.5: 运行 e2e**

Run: `cd d:\zhao\vendure\packages\after-sales-plugin; Remove-Item -Recurse -Force e2e\__data3__ -ErrorAction SilentlyContinue; pnpm e2e`
Expected: 迭代三文件 14 个用例 PASS（13 + 1）；旧 `after-sales.e2e-spec.ts` 9 个用例 PASS。

- [ ] **Step 5.6: 提交 vendure**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(after-sales): 迭代三期——afterSalesStats 聚合查询（窗口计数/实退总额/平均处理时长/按日/按状态/按类型）"
git -C d:\zhao\vendure add packages/after-sales-plugin/src/plugin.ts packages/after-sales-plugin/src/after-sales.service.ts packages/after-sales-plugin/src/after-sales-admin.resolver.ts packages/after-sales-plugin/e2e/after-sales-iteration3.e2e-spec.ts
git -C d:\zhao\vendure commit -F "$env:TEMP\as3-commit.txt"
```

---

## Task 6：C 端数据层（nshop）——schema 补丁 + gql 文档 + composables + 消息中心双源合并 + 账户页消息入口

对应设计 §二留言（C 端读取）、§三换货闭环（`exchangeReceive`）、§五消息中心售后消息跳转与账户页入口。
后端（Task 1-5）部署前，本地 codegen 依赖 graphql.schema.json 补丁；通知域类型（notification-plugin）不在本地 schema，收件箱走运行时字符串查询（与 useMessages 同模式）。

**Files**
- Create: `d:\zhao\nshop\scripts\_patch_schema_aftersales3.mjs`
- Modify: `d:\zhao\nshop\layers\base\gql\queries\after-sales.gql`
- Modify: `d:\zhao\nshop\layers\base\app\composables\useAfterSales.ts`
- Modify: `d:\zhao\nshop\layers\base\app\composables\useMessages.ts`（`resolveClient` 加 `export`，供 useInbox 复用，DRY）
- Create: `d:\zhao\nshop\layers\base\app\composables\useInbox.ts`
- Modify: `d:\zhao\nshop\layers\base\app\pages\messages\index.vue`
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\index.vue`

- [ ] **Step 6.1: 创建 schema 补丁脚本** `scripts/_patch_schema_aftersales3.mjs`（照 `_patch_schema_aftersales2.mjs` 模式；幂等可重跑）：

```js
// 临时脚本：本地 graphql.schema.json 补售后三期字段（后端部署完成前 codegen 用）
// - AfterSalesState 枚举追加 ExchangeShipped
// - AfterSalesRequest 追加 exchangeTrackingNo / exchangeCarrier / messageCount
// - 新类型 AfterSalesMessage / AfterSalesMessageList / AfterSalesMessageListOptions（含 skip/take）
// - Query.afterSalesMessages；Mutation.addAfterSalesMessage / exchangeReceiveAfterSalesRequest
// 用法：node scripts/_patch_schema_aftersales3.mjs
import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../graphql.schema.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const schema = JSON.parse(readFileSync(p, "utf8"));

const nonNull = (kind, name) => ({ kind: "NON_NULL", name: null, ofType: { kind, name, ofType: null } });
const nullable = (kind, name) => ({ kind, name, ofType: null });
const listOfString = { kind: "LIST", name: null, ofType: { kind: "NON_NULL", name: null, ofType: { kind: "SCALAR", name: "String", ofType: null } } };

const field = (name, type, args = []) => ({
  name, description: null, args, isDeprecated: false, deprecationReason: null, type,
});
const arg = (name, type) => ({ name, description: null, type, defaultValue: null, isDeprecated: false, deprecationReason: null });

let touched = 0;
for (const tp of schema.__schema.types) {
  if (tp.name === "AfterSalesState" && tp.kind === "ENUM" && tp.enumValues) {
    if (!tp.enumValues.some((v) => v.name === "ExchangeShipped")) {
      tp.enumValues.push({ name: "ExchangeShipped", description: null, isDeprecated: false, deprecationReason: null });
      touched++;
    }
  }
  if (tp.name === "AfterSalesRequest" && tp.fields) {
    let added = false;
    if (!tp.fields.some((f) => f.name === "exchangeTrackingNo")) { tp.fields.push(field("exchangeTrackingNo", nullable("SCALAR", "String"))); added = true; }
    if (!tp.fields.some((f) => f.name === "exchangeCarrier")) { tp.fields.push(field("exchangeCarrier", nullable("SCALAR", "String"))); added = true; }
    if (!tp.fields.some((f) => f.name === "messageCount")) { tp.fields.push(field("messageCount", nonNull("SCALAR", "Int"))); added = true; }
    if (added) touched++;
  }
  if (tp.name === "Query" && tp.fields && !tp.fields.some((f) => f.name === "afterSalesMessages")) {
    tp.fields.push(
      field("afterSalesMessages", nonNull("OBJECT", "AfterSalesMessageList"), [
        arg("id", nonNull("SCALAR", "ID")),
        arg("options", nullable("INPUT_OBJECT", "AfterSalesMessageListOptions")),
      ]),
    );
    touched++;
  }
  if (tp.name === "Mutation" && tp.fields && !tp.fields.some((f) => f.name === "addAfterSalesMessage")) {
    tp.fields.push(
      field("addAfterSalesMessage", nonNull("OBJECT", "AfterSalesMessage"), [
        arg("id", nonNull("SCALAR", "ID")),
        arg("content", nonNull("SCALAR", "String")),
        arg("images", listOfString),
      ]),
    );
    touched++;
  }
  if (tp.name === "Mutation" && tp.fields && !tp.fields.some((f) => f.name === "exchangeReceiveAfterSalesRequest")) {
    tp.fields.push(
      field("exchangeReceiveAfterSalesRequest", nonNull("OBJECT", "AfterSalesRequest"), [
        arg("id", nonNull("SCALAR", "ID")),
      ]),
    );
    touched++;
  }
}

if (!schema.__schema.types.some((tp) => tp.name === "AfterSalesMessage")) {
  schema.__schema.types.push(
    {
      kind: "OBJECT",
      name: "AfterSalesMessage",
      description: null,
      fields: [
        field("id", nonNull("SCALAR", "ID")),
        field("requestId", nonNull("SCALAR", "ID")),
        field("senderType", nonNull("SCALAR", "String")),
        field("senderUserId", nullable("SCALAR", "ID")),
        field("senderName", nonNull("SCALAR", "String")),
        field("content", nonNull("SCALAR", "String")),
        field("images", listOfString),
        field("createdAt", nonNull("SCALAR", "DateTime")),
      ],
      inputFields: null,
      interfaces: [],
      enumValues: null,
      possibleTypes: null,
    },
    {
      kind: "OBJECT",
      name: "AfterSalesMessageList",
      description: null,
      fields: [
        field("items", { kind: "NON_NULL", name: null, ofType: { kind: "LIST", name: null, ofType: { kind: "NON_NULL", name: null, ofType: { kind: "OBJECT", name: "AfterSalesMessage", ofType: null } } } }),
        field("totalItems", nonNull("SCALAR", "Int")),
      ],
      inputFields: null,
      interfaces: [],
      enumValues: null,
      possibleTypes: null,
    },
    {
      kind: "INPUT_OBJECT",
      name: "AfterSalesMessageListOptions",
      description: null,
      fields: null,
      inputFields: [
        { name: "skip", description: null, type: nullable("SCALAR", "Int"), defaultValue: null, isDeprecated: false, deprecationReason: null },
        { name: "take", description: null, type: nullable("SCALAR", "Int"), defaultValue: null, isDeprecated: false, deprecationReason: null },
      ],
      interfaces: null,
      enumValues: null,
      possibleTypes: null,
    },
  );
  touched++;
}

writeFileSync(p, JSON.stringify(schema, null, 2) + "\n");
console.log(`patched ${touched} locations`);
```

- [ ] **Step 6.2: 执行补丁**

Run: `node scripts/_patch_schema_aftersales3.mjs`（cwd `d:\zhao\nshop`）
Expected: 输出 `patched 6 locations`（枚举 1 + Request 1 + Query 1 + Mutation 2 + 新类型块 1）；重跑输出 `patched 0 locations`（幂等）。

- [ ] **Step 6.3: 修改 after-sales.gql**（完整新文件如下；fragment 加 3 字段，新增 1 个 query、2 个 mutation）：

```graphql
fragment AfterSalesFragment on AfterSalesRequest {
  id
  orderId
  orderLineId
  type
  state
  reason
  description
  evidenceImages
  refundAmount
  returnTrackingNo
  returnCarrier
  rejectReason
  receivedQuantity
  actualRefundAmount
  refundedAt
  refundError
  exchangeTrackingNo
  exchangeCarrier
  messageCount
  createdAt
  updatedAt
  order {
    code
    state
  }
  orderLine {
    id
    quantity
    proratedLinePrice
    featuredAsset {
      id
      preview
    }
    productVariant {
      id
      name
      featuredAsset {
        id
        preview
      }
    }
  }
}

query MyAfterSalesRequests($options: AfterSalesRequestListOptions) {
  myAfterSalesRequests(options: $options) {
    items {
      ...AfterSalesFragment
    }
    totalItems
  }
}

query AfterSalesRequest($id: ID!) {
  afterSalesRequest(id: $id) {
    ...AfterSalesFragment
    history {
      fromState
      toState
      createdAt
    }
  }
}

query AfterSalesReturnAddress {
  afterSalesReturnAddress
}

query AfterSalesMessages($id: ID!, $options: AfterSalesMessageListOptions) {
  afterSalesMessages(id: $id, options: $options) {
    totalItems
    items {
      id
      requestId
      senderType
      senderName
      content
      images
      createdAt
    }
  }
}

mutation CreateAfterSalesRequest($input: CreateAfterSalesRequestInput!) {
  createAfterSalesRequest(input: $input) {
    ...AfterSalesFragment
  }
}

mutation CancelAfterSalesRequest($id: ID!) {
  cancelAfterSalesRequest(id: $id) {
    ...AfterSalesFragment
  }
}

mutation UpdateReturnTracking($id: ID!, $trackingNo: String!, $carrier: String!) {
  updateReturnTracking(id: $id, trackingNo: $trackingNo, carrier: $carrier) {
    ...AfterSalesFragment
  }
}

mutation UploadAfterSalesEvidence($images: [String!]!) {
  uploadAfterSalesEvidence(images: $images)
}

mutation AddAfterSalesMessage($id: ID!, $content: String!, $images: [String!]) {
  addAfterSalesMessage(id: $id, content: $content, images: $images) {
    id
  }
}

mutation ExchangeReceiveAfterSalesRequest($id: ID!) {
  exchangeReceiveAfterSalesRequest(id: $id) {
    ...AfterSalesFragment
  }
}
```

- [ ] **Step 6.4: useAfterSales.ts 追加三个方法**（`fetchReturnAddress` 函数之后、`return` 之前插入；并整行替换文件末尾的 `return`）：

```ts
  /** 售后单协商留言（createdAt 正序；skip/take 分页，默认 take=50 上限 100） */
  async function fetchMessages(id: string, skip?: number, take?: number) {
    const res = await GqlAfterSalesMessages({ id, options: { skip: skip ?? undefined, take: take ?? undefined } });
    return res?.afterSalesMessages ?? { items: [], totalItems: 0 };
  }

  /** 顾客追加协商留言（Closed 后服务端拒绝；图片 ≤3、正文 ≤1000 由服务端校验） */
  async function addMessage(id: string, content: string, images?: string[]): Promise<AfterSalesResult> {
    loading.value = true;
    error.value = null;
    try {
      await GqlAddAfterSalesMessage({ id, content, images: images && images.length ? images : undefined });
      return { ok: true, id };
    } catch (e: any) {
      const msg = e?.gqlErrors?.[0]?.message ?? e?.message ?? "add message failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  /** 顾客确认收到换货商品（ExchangeShipped → Closed） */
  async function exchangeReceive(id: string): Promise<AfterSalesResult> {
    loading.value = true;
    error.value = null;
    try {
      await GqlExchangeReceiveAfterSalesRequest({ id });
      toast.add({ title: t("messages.afterSales.exchangeReceiveSuccess"), color: "success" });
      return { ok: true, id };
    } catch (e: any) {
      const msg = e?.gqlErrors?.[0]?.message ?? e?.message ?? "exchange receive failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, createRequest, cancelRequest, updateTracking, uploadEvidence, fetchReturnAddress, fetchMessages, addMessage, exchangeReceive };
```

- [ ] **Step 6.5: useMessages.ts 导出客户端工厂**（`function resolveClient(): GraphQLClient {` 整行替换为）：

```ts
export function resolveClient(): GraphQLClient {
```

- [ ] **Step 6.6: 创建 useInbox.ts**（notification-plugin 的 InboxMessage 类型不在本地 graphql.schema.json，与 useMessages 同一套运行时 graphql-request 模式，不走 codegen）：

```ts
/**
 * 站内通知（notification-plugin shop API：myInbox / inboxUnreadCount / markInboxRead）。
 * 复用 useMessages 的运行时客户端（鉴权/渠道/语言头约定一致）；
 * notification 类型不在本地 graphql.schema.json，故用字符串查询而非 codegen。
 */
import { resolveClient } from "./useMessages";

export interface InboxItem {
  id: string;
  scene: string;
  title: string;
  content: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

/** 顾客收件箱（myInbox 无 options 入参，服务端返回全部） */
export async function getMyInbox(): Promise<InboxItem[]> {
  const client = resolveClient();
  const data = await client.request<{ myInbox: { items: InboxItem[]; totalItems: number } }>(
    `query MyInbox { myInbox { items { id scene title content link isRead createdAt } totalItems } }`,
  );
  return data.myInbox.items;
}

export async function getInboxUnreadCount(): Promise<number> {
  const client = resolveClient();
  const data = await client.request<{ inboxUnreadCount: number }>(`query InboxUnreadCount { inboxUnreadCount }`);
  return data.inboxUnreadCount ?? 0;
}

export async function markInboxRead(id: string): Promise<void> {
  const client = resolveClient();
  await client.request(`mutation MarkInboxRead($id: ID!) { markInboxRead(id: $id) }`, { id });
}
```

- [ ] **Step 6.7: 消息中心双源合并**（pages/messages/index.vue 完整新文件如下；myInbox（售后通知，带 link）+ myMessages（旧 message-plugin）按 createdAt 倒序合并，带 link 的通知点击直达）：

```vue
<script setup lang="ts">
import {
  getMyMessages,
  markMessageRead,
  type MyMessage,
} from "~~/layers/base/app/composables/useMessages";
import {
  getMyInbox,
  markInboxRead,
  type InboxItem,
} from "~~/layers/base/app/composables/useInbox";

definePageMeta({ title: "消息中心" });

const { t } = useI18n();
const localePath = useTenantLocalePath();
const router = useRouter();
const { isAuthenticated } = storeToRefs(useAuthStore());

interface FeedItem {
  key: string; // inbox:<id> | msg:<id>
  source: "inbox" | "msg";
  id: string;
  title: string;
  body: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

const list = ref<FeedItem[]>([]);
const loading = ref(false);

function toFeed(messages: MyMessage[], inbox: InboxItem[]): FeedItem[] {
  const items: FeedItem[] = [
    ...inbox.map((m) => ({
      key: `inbox:${m.id}`, source: "inbox" as const, id: m.id,
      title: m.title, body: m.content, link: m.link ?? null, isRead: m.isRead, createdAt: m.createdAt,
    })),
    ...messages.map((m) => ({
      key: `msg:${m.id}`, source: "msg" as const, id: m.id,
      title: m.title, body: m.body, link: null, isRead: !!m.readAt, createdAt: m.createdAt,
    })),
  ];
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function load() {
  if (!isAuthenticated.value) return;
  loading.value = true;
  try {
    const [messages, inbox] = await Promise.all([
      getMyMessages().catch(() => [] as MyMessage[]),
      getMyInbox().catch(() => [] as InboxItem[]),
    ]);
    list.value = toFeed(messages, inbox);
  } finally {
    loading.value = false;
  }
}

async function markRead(item: FeedItem) {
  item.isRead = true;
  try {
    if (item.source === "inbox") await markInboxRead(item.id);
    else await markMessageRead(item.id);
  } catch {
    /* 标记已读失败不打断浏览 */
  }
}

async function read(item: FeedItem) {
  // 售后等带跳转链接的通知：直达目标页（如 /account/after-sales/{id}）
  if (item.link) {
    if (!item.isRead) void markRead(item);
    router.push(localePath(item.link));
    return;
  }
  if (item.isRead) return;
  await markRead(item);
}

onMounted(load);
</script>

<template>
  <main class="container my-14">
    <template v-if="!isAuthenticated">
      <div class="flex flex-col items-center gap-4 py-16">
        <p class="text-(--ui-text-muted)">{{ t("messages.coupon.loginPrompt") }}</p>
        <UButton :to="localePath('/account/login')">{{ t("messages.coupon.goLogin") }}</UButton>
      </div>
    </template>
    <div v-else class="mx-auto max-w-2xl">
      <h1 class="mb-6 text-2xl font-semibold">{{ t("messages.account.messages") }}</h1>
      <div v-if="list.length" class="space-y-3">
        <div
          v-for="m in list"
          :key="m.key"
          class="rounded-xl border p-4"
          :class="m.isRead ? 'border-(--ui-border)' : 'border-(--ui-primary)'"
          @click="read(m)"
        >
          <div class="flex items-center justify-between">
            <p class="font-semibold">{{ m.title }}</p>
            <span v-if="!m.isRead" class="h-2 w-2 shrink-0 rounded-full bg-(--ui-error)" />
          </div>
          <p class="mt-1 whitespace-pre-line text-sm text-(--ui-text-muted)">{{ m.body }}</p>
          <p class="mt-2 text-xs text-(--ui-text-muted)">
            {{ m.createdAt?.slice(0, 16).replace("T", " ") }}
          </p>
        </div>
      </div>
      <p v-else>{{ t("messages.account.noMessages") }}</p>
    </div>
  </main>
</template>
```

- [ ] **Step 6.8: 账户页「我的消息」入口 + 未读红点**（pages/account/index.vue，三处修改）：
  1. script 头部（`import { isActiveCustomerDetail } ...` 之后）加：

```ts
import { getInboxUnreadCount } from "~~/layers/base/app/composables/useInbox";
```

  2. `const loading = ref(true);` 之后加：

```ts
const { isAuthenticated } = storeToRefs(useAuthStore());
const inboxUnread = ref(0);
```

  3. onMounted 内 `loading.value = false;` 之前加（已登录才拉未读数，失败静默）：

```ts
  if (isAuthenticated.value) {
    try {
      inboxUnread.value = await getInboxUnreadCount();
    } catch {
      /* 未读数失败不影响页面 */
    }
  }
```

  4. 模板 fallback 菜单（`/coupon` UButton 之后、`</template>` 之前）追加：

```vue
        <UButton
          :to="localePath('/messages')"
          variant="soft"
          class="relative px-7"
        >
          {{ t("messages.account.messages") }}
          <span
            v-if="inboxUnread > 0"
            class="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 min-w-5 items-center justify-center rounded-full bg-(--ui-error) px-1 text-xs text-white"
          >
            {{ inboxUnread > 99 ? "99+" : inboxUnread }}
          </span>
        </UButton>
```

- [ ] **Step 6.9: 运行验证**

Run: `node scripts/_patch_schema_aftersales3.mjs; pnpm postinstall`（cwd `d:\zhao\nshop`；nuxt prepare 触发 nuxt-graphql-client 依据补丁后的 graphql.schema.json 重新生成 Gql* 声明）
Expected: `patched 6 locations`；prepare 完成无 `Unknown type AfterSalesMessageListOptions` 等报错；`.nuxt/gql` 下出现 `GqlAfterSalesMessages` / `GqlAddAfterSalesMessage` / `GqlExchangeReceiveAfterSalesRequest` 声明。（`graphql.schema.json` 为生成物，若被 .gitignore 忽略则不入库。）

- [ ] **Step 6.10: 提交 nshop**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(after-sales): 迭代三期 C 端数据层——留言/换货收货 gql+composable、收件箱 useInbox、消息中心双源合并、账户页消息入口+未读红点"
git -C d:\zhao\nshop add scripts/_patch_schema_aftersales3.mjs layers/base/gql/queries/after-sales.gql layers/base/app/composables/useAfterSales.ts layers/base/app/composables/useMessages.ts layers/base/app/composables/useInbox.ts layers/base/app/pages/messages/index.vue layers/base/app/pages/account/index.vue
git -C d:\zhao\nshop commit -F "$env:TEMP\as3-commit.txt"
```

---

## Task 7：C 端详情 UI——ExchangeShipped 状态字典 / 时间线换货节点 / 确认收货 + 协商留言卡

对应设计 §三换货闭环（C 端确认收货）、§二留言卡、§五时间线换货节点。
组件命名遵循 Nuxt 目录前缀去重规则：`components/afterSales/AfterSalesMessages.vue` 注册名为 `AfterSalesMessages`；复用 `EvidenceUploader.vue` 须写完整注册名 `AfterSalesEvidenceUploader`。

**Files**
- Modify: `d:\zhao\nshop\layers\base\app\utils\after-sales-state.ts`
- Modify: `d:\zhao\nshop\layers\base\app\utils\__tests__\after-sales-state.spec.ts`
- Create: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesMessages.vue`
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\after-sales\[id].vue`
- Modify: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesTimeline.vue`

- [ ] **Step 7.1: after-sales-state.ts 扩展**（6 处修改，逐处给出完整代码）：
  1. `AfterSalesState` union（`"RefundFailed"` 行后）加：

```ts
  | "ExchangeShipped"
```

  2. `AFTER_SALES_PROGRESS` 常量之后新增换货节点表：

```ts
/** 换货流程节点：第 5 节点为「换货已发货」而非退款（exchange 单不走 Refunded） */
export const AFTER_SALES_EXCHANGE_PROGRESS: AfterSalesState[] = [
  "Pending",
  "Approved",
  "Returning",
  "Received",
  "ExchangeShipped",
];
```

  3. `AFTER_SALES_ACTIVE_STATES` 集合（`"RefundFailed",` 行后）加：

```ts
  "ExchangeShipped",
```

  4. `afterSalesStateInfo` switch（`case "RefundFailed"` 分支后）加：

```ts
    case "ExchangeShipped":
      return { labelKey: "messages.afterSales.stateExchangeShipped", color: "info" };
```

  5. `afterSalesProgressIndex` 函数整体替换为（双节点表索引；RefundFailed/Rejected/Closed 分支不变）：

```ts
export function afterSalesProgressIndex(state: string): number {
  const i = AFTER_SALES_PROGRESS.indexOf(state as AfterSalesState);
  if (i >= 0) return i;
  const j = AFTER_SALES_EXCHANGE_PROGRESS.indexOf(state as AfterSalesState);
  if (j >= 0) return j;
  if (state === "RefundFailed") return 3;
  if (state === "Rejected" || state === "Closed") return 0;
  return -1;
}
```

  6. `afterSalesNextStep` switch（`case "Closed"` 分支后）加：

```ts
    case "ExchangeShipped":
      return {
        titleKey: "messages.afterSales.nextExchangeShippedTitle",
        descKey: "messages.afterSales.nextExchangeShippedDesc",
        tone: "info",
      };
```

  7. 主行动：`AfterSalesPrimaryAction` 类型改为（加 `exchangeReceive`）：

```ts
export type AfterSalesPrimaryAction = "cancel" | "tracking" | "service" | "detail" | "exchangeReceive" | "none";
```

     `afterSalesPrimaryAction` switch（`case "RefundFailed":` 前后任意稳定位置，加分支）：

```ts
    case "ExchangeShipped":
      return "exchangeReceive";
```

     `afterSalesPrimaryActionLabelKey` switch 加分支：

```ts
    case "exchangeReceive":
      return "messages.afterSales.actionConfirmExchange";
```

  8. 文件末尾（`canFillTracking` 之后）加：

```ts
/** 换货单顾客确认收货（ExchangeShipped → Closed） */
export function canConfirmExchange(state: string): boolean {
  return state === "ExchangeShipped";
}
```

- [ ] **Step 7.2: 单测同步** `utils/__tests__/after-sales-state.spec.ts`（4 处修改）：
  1. import 列表加 `canConfirmExchange`（`canFillTracking,` 行后）。
  2. 用例「进行中收纳 Pending/Approved/Returning/Received/RefundFailed」的循环数组改为（并用例名同步加 `/ExchangeShipped`）：

```ts
    for (const s of ["Pending", "Approved", "Returning", "Received", "RefundFailed", "ExchangeShipped"]) {
```

  3. 用例「进度索引覆盖 8 态」内追加断言（`Refunded` 断言行后）：

```ts
    expect(afterSalesProgressIndex("ExchangeShipped")).toBe(4);
```

  4. 文件末尾（`it("申请入口白名单与类型标签" ...)` 之后、describe 结束前）加：

```ts
  it("ExchangeShipped：徽标文案 + 主行动确认收货 + 时间线换货节点", () => {
    const info = afterSalesStateInfo("ExchangeShipped");
    expect(info.labelKey).toBe("messages.afterSales.stateExchangeShipped");
    expect(info.color).toBe("info");
    expect(canConfirmExchange("ExchangeShipped")).toBe(true);
    expect(canConfirmExchange("Received")).toBe(false);
    expect(afterSalesPrimaryAction("ExchangeShipped")).toBe("exchangeReceive");
    expect(afterSalesNextStep("ExchangeShipped").titleKey).toBe("messages.afterSales.nextExchangeShippedTitle");
  });
```

- [ ] **Step 7.3: 创建协商留言卡组件** `components/afterSales/AfterSalesMessages.vue`（完整新文件；顾客右/商家左气泡、附图缩略、≤3 张图复用申请凭证上传通道；Closed 只读）：

```vue
<script setup lang="ts">
/**
 * 售后单协商留言卡（三期 §二）：留言按 createdAt 正序气泡展示，顾客右/商家左。
 * Closed 后只读（隐藏输入区）；图片复用 EvidenceUploader（≤3 张，同一上传通道）。
 */
const props = defineProps<{ request: { id: string; state: string } }>();
const { t } = useI18n();
const { fetchMessages, addMessage } = useAfterSales();
const toast = useToast();

interface Msg {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  images?: string[] | null;
  createdAt: string;
}

const TAKE = 50;
const items = ref<Msg[]>([]);
const total = ref(0);
const listLoading = ref(false);
const readonly = computed(() => props.request.state === "Closed");

async function load() {
  listLoading.value = true;
  try {
    const res = await fetchMessages(props.request.id);
    items.value = res.items as Msg[];
    total.value = res.totalItems;
  } finally {
    listLoading.value = false;
  }
}

/** 加载更多：正序排列，已有条数即 skip 向后翻页 */
const hasMore = computed(() => items.value.length < total.value);
async function loadMore() {
  const res = await fetchMessages(props.request.id, items.value.length, TAKE);
  items.value = [...items.value, ...(res.items as Msg[])];
  total.value = res.totalItems;
}

const content = ref("");
const images = ref<string[]>([]);
const sending = ref(false);
// 与 AfterSalesCreateModal 相同的 exposed 访问模式（defineExpose 已解包 ref）
const uploaderRef = ref<{ hasPending: boolean; hasFailed: boolean } | null>(null);

async function onSend() {
  if (!content.value.trim() && !images.value.length) return;
  if (uploaderRef.value?.hasPending) {
    toast.add({ title: t("messages.afterSales.errUploading"), color: "warning" });
    return;
  }
  if (uploaderRef.value?.hasFailed) {
    toast.add({ title: t("messages.afterSales.errUploadFailed"), color: "warning" });
    return;
  }
  sending.value = true;
  try {
    const res = await addMessage(props.request.id, content.value.trim(), images.value);
    if (res.ok) {
      content.value = "";
      images.value = [];
      await load();
    }
  } finally {
    sending.value = false;
  }
}

function fmt(v: string): string {
  return v?.slice(0, 16).replace("T", " ") ?? "";
}

onMounted(load);
</script>

<template>
  <section class="mb-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
    <h2 class="mb-3 text-sm font-medium text-neutral-500">{{ t("messages.afterSales.messagesTitle") }}</h2>

    <p v-if="!items.length && !listLoading" class="py-2 text-sm text-neutral-400">
      {{ t("messages.afterSales.messagesEmpty") }}
    </p>

    <div class="space-y-3">
      <div
        v-for="m in items"
        :key="m.id"
        class="flex flex-col"
        :class="m.senderType === 'customer' ? 'items-end' : 'items-start'"
      >
        <p class="mb-1 text-xs text-neutral-400">{{ m.senderName }} · {{ fmt(m.createdAt) }}</p>
        <div
          class="max-w-[80%] rounded-xl px-3 py-2 text-sm"
          :class="m.senderType === 'customer'
            ? 'bg-primary text-white'
            : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100'"
        >
          <p class="whitespace-pre-line break-all">{{ m.content }}</p>
          <div v-if="m.images?.length" class="mt-2 flex flex-wrap gap-2">
            <img
              v-for="(img, i) in m.images"
              :key="i"
              :src="img"
              :alt="t('messages.afterSales.messagesTitle')"
              class="h-16 w-16 rounded object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>

    <UButton
      v-if="hasMore"
      variant="ghost"
      block
      class="mt-3"
      :label="t('messages.afterSales.messagesLoadMore')"
      @click="loadMore"
    />

    <template v-if="!readonly">
      <div class="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <UTextarea
          v-model="content"
          :placeholder="t('messages.afterSales.messagesPlaceholder')"
          :rows="2"
          autoresize
          class="w-full"
        />
        <div class="mt-2 flex items-end justify-between gap-3">
          <div class="w-40">
            <AfterSalesEvidenceUploader ref="uploaderRef" v-model="images" :max="3" />
          </div>
          <UButton
            :loading="sending"
            :disabled="!content.trim() && !images.length"
            :label="t('messages.afterSales.messagesSend')"
            @click="onSend"
          />
        </div>
      </div>
    </template>
    <p v-else class="mt-3 text-xs text-neutral-400">{{ t("messages.afterSales.messagesClosedReadonly") }}</p>
  </section>
</template>
```

- [ ] **Step 7.4: 详情页接入** `pages/account/after-sales/[id].vue`（5 处修改）：
  1. import 块（`utils/after-sales-state` 导入列表）加 `canConfirmExchange`：

```ts
import {
  afterSalesPrimaryAction,
  afterSalesPrimaryActionLabelKey,
  afterSalesStateInfo,
  afterSalesTypeLabelKey,
  canCancelAfterSales,
  canConfirmExchange,
  canFillTracking,
} from "../../../utils/after-sales-state";
```

  2. `const { cancelRequest, fetchReturnAddress } = useAfterSales();` 整行替换为：

```ts
const { cancelRequest, fetchReturnAddress, exchangeReceive } = useAfterSales();
```

  3. script「取消确认弹窗」块（`onCancelConfirm` 函数之后、`onPrimary` 之前）加：

```ts
// 换货确认收货（ExchangeShipped → Closed）
const exchangeConfirmOpen = ref(false);
const receiving = ref(false);
async function onExchangeReceive() {
  if (!request.value) return;
  receiving.value = true;
  try {
    const res = await exchangeReceive(request.value.id);
    exchangeConfirmOpen.value = false;
    if (res.ok) await refresh();
  } finally {
    receiving.value = false;
  }
}
```

  4. `onPrimary` 函数整体替换为：

```ts
function onPrimary() {
  if (primaryAction.value === "cancel") cancelConfirmOpen.value = true;
  else if (primaryAction.value === "tracking") trackingOpen.value = true;
  else if (primaryAction.value === "exchangeReceive") {
    if (request.value && canConfirmExchange(request.value.state)) exchangeConfirmOpen.value = true;
  }
}
```

  5. 模板三处：
     a. 「处理进度」`</section>`（`<AfterSalesTimeline ... />` 所在 section 的闭合标签）之后、「申请信息」`<dl>` 之前插入留言卡：

```vue
    <!-- 协商留言（时间线下方） -->
    <AfterSalesMessages :request="request" />
```

     b. 吸底动作区主按钮的 `v-if` 整行替换为（加 exchangeReceive）：

```vue
        <UButton
          v-if="primaryAction === 'cancel' || primaryAction === 'tracking' || primaryAction === 'exchangeReceive'"
          color="primary"
          :label="primaryLabel"
          @click="onPrimary"
        />
```

     c. 「取消确认」UModal 之后、`</main>` 之前插入换货确认弹窗：

```vue
    <!-- 换货确认收货 -->
    <UModal v-model:open="exchangeConfirmOpen" :ui="{ content: 'sm:max-w-sm' }">
      <template #body>
        <div class="p-5 text-center">
          <h2 class="text-base font-medium">{{ t("messages.afterSales.exchangeConfirmTitle") }}</h2>
          <p class="mt-1 text-sm text-neutral-500">{{ t("messages.afterSales.exchangeConfirmBody") }}</p>
          <div class="mt-5 flex justify-center gap-3">
            <UButton variant="soft" :label="t('messages.afterSales.cancel')" @click="exchangeConfirmOpen = false" />
            <UButton color="primary" :loading="receiving" :label="t('messages.afterSales.actionConfirmExchange')" @click="onExchangeReceive" />
          </div>
        </div>
      </template>
    </UModal>
```

- [ ] **Step 7.5: 时间线换货节点** `components/afterSales/AfterSalesTimeline.vue`（4 处修改）：
  1. import 行整体替换为：

```ts
import { AFTER_SALES_PROGRESS, AFTER_SALES_EXCHANGE_PROGRESS, afterSalesProgressIndex } from "../../utils/after-sales-state";
```

  2. `TimelineRequest` 接口（`receivedQuantity` 行后）加：

```ts
  type?: string | null;
  exchangeTrackingNo?: string | null;
  exchangeCarrier?: string | null;
```

  3. `STEP_LABEL_KEY` 加节点（`Refunded` 行后）：

```ts
  ExchangeShipped: "messages.afterSales.timelineExchangeShipped",
```

  4. `nodes` computed 内两处修改：
     a. `const doneIndex = afterSalesProgressIndex(r.state);` 之后、`const list: Node[] = AFTER_SALES_PROGRESS.map(...)` 之前加：

```ts
    // 换货单第 5 节点显示「换货已发货」而非「已退款」
    const progress = r.type === "exchange" ? AFTER_SALES_EXCHANGE_PROGRESS : AFTER_SALES_PROGRESS;
```

     并把该 map 的遍历源改为 `progress.map((state, i) => {`。
     b. `detail` 三元链中 `state === "Returning" && (...)` 分支之前加换货物流分支：

```ts
        state === "ExchangeShipped" && (r.exchangeCarrier || r.exchangeTrackingNo)
          ? `${r.exchangeCarrier ?? ""} ${r.exchangeTrackingNo ?? ""}`.trim()
          :
```

     （即 detail 变为：换货单号 → 回寄单号 → 寄回地址提示 → null 的四元链。）

- [ ] **Step 7.6: 运行单测**

Run: `pnpm test`（cwd `d:\zhao\nshop`）
Expected: `after-sales-state.spec.ts` 全绿（含新增 ExchangeShipped 用例）；其余用例无回归。

- [ ] **Step 7.7: 提交 nshop**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(after-sales): 迭代三期 C 端详情——ExchangeShipped 状态字典/时间线换货节点/确认收货弹窗 + 协商留言卡（Closed 只读）"
git -C d:\zhao\nshop add layers/base/app/utils/after-sales-state.ts layers/base/app/utils/__tests__/after-sales-state.spec.ts layers/base/app/components/afterSales/AfterSalesMessages.vue layers/base/app/pages/account/after-sales/[id].vue layers/base/app/components/afterSales/AfterSalesTimeline.vue
git -C d:\zhao\nshop commit -F "$env:TEMP\as3-commit.txt"
```

---

## Task 8：C 端 i18n——12 语言包同步新增留言/换货词条

对应设计 §五「12 语言包同步新增留言/换货/通知跳转词条（禁止单语言硬编码）」。
新词条全部挂在 `messages.afterSales.*` 下；zh-CN 为基准，其余 11 包按表翻译。`merge.ts` 无需改动。消息中心/账户页入口复用既有 `messages.account.messages` / `noMessages`，不新增词条。

**Files**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`（基准）
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\bg-BG.ts` / `de-DE.ts` / `en-US.ts` / `es-ES.ts` / `fa-IR.ts` / `fr-FR.ts` / `it-IT.ts` / `ja-JP.ts` / `ko-KR.ts` / `pt-BR.ts` / `ru-RU.ts`

- [ ] **Step 8.1: zh-CN.ts**（afterSales 块内 `retry: "重试",` 行后插入）：

```ts
      stateExchangeShipped: "换货已发货",
      timelineExchangeShipped: "换货已发货",
      nextExchangeShippedTitle: "商家已换货发货",
      nextExchangeShippedDesc: "请确认已收到新商品，确认后本次售后完成",
      actionConfirmExchange: "确认收货",
      exchangeConfirmTitle: "确认已收到换货商品？",
      exchangeConfirmBody: "确认后本次售后将完成关闭。",
      exchangeReceiveSuccess: "换货已确认收货",
      messagesTitle: "协商留言",
      messagesPlaceholder: "输入留言…",
      messagesSend: "发送",
      messagesEmpty: "暂无留言",
      messagesLoadMore: "加载更多留言",
      messagesClosedReadonly: "售后已关闭，留言已停用",
```

- [ ] **Step 8.2: 11 个语言包同步**（每个文件 afterSales 块内 `retry:` 行后插入同名字段，译文按下表；key 名与 zh-CN 完全一致）：

| key | bg-BG | de-DE | en-US | es-ES | fa-IR | fr-FR | it-IT | ja-JP | ko-KR | pt-BR | ru-RU |
|---|---|---|---|---|---|---|---|---|---|---|---|
| stateExchangeShipped | Изпратена подмяна | Austausch versendet | Exchange shipped | Cambio enviado | ارسال کالای جایگزین | Échange expédié | Sostituzione spedita | 交換商品発送済み | 교환 상품 발송됨 | Troca enviada | Обмен отправлен |
| timelineExchangeShipped | Подмяната е изпратена | Austausch versendet | Exchange shipped | Cambio enviado | کالای جایگزین ارسال شد | Échange expédié | Sostituzione spedita | 交換商品の発送 | 교환 상품 발송 | Troca enviada | Обмен отправлен |
| nextExchangeShippedTitle | Новият артикул е изпратен | Neuer Artikel versendet | New item shipped | Nuevo producto enviado | کالای جدید ارسال شد | Nouvel article expédié | Nuovo articolo spedito | 新しい商品を発送しました | 새 상품이 발송되었습니다 | Novo produto enviado | Новый товар отправлен |
| nextExchangeShippedDesc | Потвърдете получаването на новия артикул, за да завършите заявката | Bestätigen Sie den Erhalt des Ersatzartikels, um den Vorgang abzuschließen | Confirm receipt of the new item to complete this request | Confirma la recepción del nuevo producto para finalizar la solicitud | لطفاً دریافت کالای جدید را تأیید کنید تا درخواست تکمیل شود | Veuillez confirmer la réception du nouvel article pour finaliser la demande | Conferma la ricezione del nuovo articolo per completare la richiesta | 新しい商品の受取を確認すると本申請が完了します | 새 상품 수령을 확인하면 본 신청이 완료됩니다 | Confirme o recebimento do novo produto para concluir o pedido | Подтвердите получение нового товара, чтобы завершить обращение |
| actionConfirmExchange | Потвърди получаване | Empfang bestätigen | Confirm receipt | Confirmar recepción | تأیید دریافت | Confirmer la réception | Conferma ricezione | 受取確認 | 수령 확인 | Confirmar recebimento | Подтвердить получение |
| exchangeConfirmTitle | Получихте ли заместващия артикул? | Haben Sie den Ersatzartikel erhalten? | Have you received the replacement item? | ¿Has recibido el producto de reemplazo? | آیا کالای جایگزین را دریافت کرده‌اید؟ | Avez-vous reçu l'article de remplacement ? | Hai ricevuto l'articolo sostitutivo? | 交換商品を受け取りましたか？ | 교환 상품을 받으셨나요? | Você recebeu o produto de substituição? | Вы получили товар для замены? |
| exchangeConfirmBody | При потвърждение тази заявка ще бъде приключена. | Nach der Bestätigung wird dieser Vorgang abgeschlossen. | Confirming will close this after-sales request. | Al confirmar se cerrará esta solicitud. | با تأیید، این درخواست تکمیل می‌شود. | La confirmation clôturera cette demande. | La conferma chiuderà questa richiesta. | 確認すると本申請は完了します。 | 확인하면 본 신청이 완료됩니다. | Ao confirmar, esta solicitação será concluída. | После подтверждения обращение будет закрыто. |
| exchangeReceiveSuccess | Получаването е потвърдено | Empfang bestätigt | Exchange receipt confirmed | Recepción confirmada | دریافت تأیید شد | Réception confirmée | Ricezione confermata | 受取を確認しました | 수령이 확인되었습니다 | Recebimento confirmado | Получение подтверждено |
| messagesTitle | Съобщения | Nachrichten | Messages | Mensajes | پیام‌ها | Messages | Messaggi | メッセージ | 메시지 | Mensagens | Сообщения |
| messagesPlaceholder | Въведете съобщение… | Nachricht eingeben… | Type a message… | Escribe un mensaje… | پیام خود را بنویسید… | Saisir un message… | Scrivi un messaggio… | メッセージを入力… | 메시지를 입력하세요… | Digite uma mensagem… | Введите сообщение… |
| messagesSend | Изпрати | Senden | Send | Enviar | ارسال | Envoyer | Invia | 送信 | 보내기 | Enviar | Отправить |
| messagesEmpty | Още няма съобщения | Noch keine Nachrichten | No messages yet | Aún no hay mensajes | هنوز پیامی نیست | Aucun message | Nessun messaggio | メッセージはまだありません | 아직 메시지가 없습니다 | Nenhuma mensagem ainda | Сообщений пока нет |
| messagesLoadMore | Зареди още съобщения | Weitere Nachrichten laden | Load more messages | Cargar más mensajes | بارگذاری پیام‌های بیشتر | Charger plus de messages | Carica altri messaggi | さらに読み込む | 더 불러오기 | Carregar mais mensagens | Загрузить ещё сообщения |
| messagesClosedReadonly | Заявката е затворена: съобщенията са деактивирани | Vorgang geschlossen: Nachrichten deaktiviert | Request closed: messaging is disabled | Solicitud cerrada: mensajería deshabilitada | درخواست بسته شد: ارسال پیام غیرفعال است | Demande clôturée : messagerie désactivée | Richiesta chiusa: messaggistica disattivata | 申請完了のためメッセージは無効です | 신청이 종료되어 메시지를 사용할 수 없습니다 | Solicitação encerrada: mensagens desativadas | Обращение закрыто: сообщения отключены |

- [ ] **Step 8.3: 运行验证**

Run: `pnpm test`（cwd `d:\zhao\nshop`）
Expected: 全绿（i18n 词条为纯数据增量，不影响断言）；随后 `pnpm dev` 人工抽查 `/account/after-sales/{id}` 切 3 种语言无缺 key 告警。

- [ ] **Step 8.4: 提交 nshop**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(i18n): 售后三期留言/换货词条 12 语言包同步（zh 基准 + 11 翻译）"
git -C d:\zhao\nshop add layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/bg-BG.ts layers/base/i18n/locales/de-DE.ts layers/base/i18n/locales/en-US.ts layers/base/i18n/locales/es-ES.ts layers/base/i18n/locales/fa-IR.ts layers/base/i18n/locales/fr-FR.ts layers/base/i18n/locales/it-IT.ts layers/base/i18n/locales/ja-JP.ts layers/base/i18n/locales/ko-KR.ts layers/base/i18n/locales/pt-BR.ts layers/base/i18n/locales/ru-RU.ts
git -C d:\zhao\nshop commit -F "$env:TEMP\as3-commit.txt"
```

---

## Task 9：web-admin 数据层——售后留言/换货发货/看板聚合 API + 状态常量扩展

对应设计 §二（后台留言读取/回复）、§三换货闭环（exchangeShip）、§四看板数据源、§六后台状态字典。
GraphQL 均为裸字符串查询（与现有 fetchAfterSaleAdmin 模式一致，web-admin 无 codegen）。

**Files**
- Modify: `d:\zhao\vshop\web-admin\src\apis\afterSale.ts`
- Modify: `d:\zhao\vshop\web-admin\src\constants\afterSaleActions.ts`
- Modify: `d:\zhao\vshop\web-admin\src\constants\orderState.ts`

- [ ] **Step 9.1: afterSale.ts 字段扩展**（2 处修改）：
  1. `AfterSaleRow` 接口内 `refundedAt?: string | null;` 行后加：

```ts
  exchangeTrackingNo?: string | null;
  exchangeCarrier?: string | null;
  messageCount?: number | null;
```

  2. `AFTER_SALE_FIELDS` 模板串内 `refundedAt refundError createdAt updatedAt` 行整体替换为：

```ts
  refundedAt refundError exchangeTrackingNo exchangeCarrier messageCount
  createdAt updatedAt
```

- [ ] **Step 9.2: afterSale.ts 追加 4 个 API**（文件末尾 `updateReturnAddress` 之后追加）：

```ts
// ---- 迭代三期：协商留言 / 换货发货 / 数据看板 ----

export interface AfterSaleMessage {
  id: string;
  requestId: string;
  senderType: string;
  senderName: string;
  content: string;
  images?: string[] | null;
  createdAt: string;
}

/** 售后留言分页列表（createdAt 正序；skip/take 均可选，服务端默认 take=50 上限 100） */
export async function fetchAfterSaleMessages(id: string, skip?: number, take?: number): Promise<{ items: AfterSaleMessage[]; total: number }> {
  const { afterSalesMessages } = await getAdminClient().request<{
    afterSalesMessages: { items: AfterSaleMessage[]; totalItems: number };
  }>(
    `query AfterSaleMessages($id: ID!, $skip: Int, $take: Int) {
      afterSalesMessages(id: $id, options: { skip: $skip, take: $take }) {
        totalItems
        items { id requestId senderType senderName content images createdAt }
      }
    }`,
    { id, skip, take },
  );
  return { items: afterSalesMessages?.items ?? [], total: afterSalesMessages?.totalItems ?? 0 };
}

/** 商家回复售后留言（Closed 后服务端拒绝） */
export async function replyAfterSaleMessage(id: string, content: string, images?: string[]): Promise<AfterSaleMessage> {
  const { replyAfterSalesMessage } = await getAdminClient().request<{ replyAfterSalesMessage: AfterSaleMessage }>(
    `mutation ReplyAfterSaleMessage($id: ID!, $content: String!, $images: [String!]) {
      replyAfterSalesMessage(id: $id, content: $content, images: $images) {
        id requestId senderType senderName content images createdAt
      }
    }`,
    { id, content, images },
  );
  return replyAfterSalesMessage;
}

/** 换货发货（exchange 单 Received 态 → ExchangeShipped，需新品运单号 + 承运商） */
export async function exchangeShipAfterSale(id: string, trackingNo: string, carrier: string): Promise<AfterSaleRow> {
  const { exchangeShipAfterSalesRequest } = await getAdminClient().request<{ exchangeShipAfterSalesRequest: AfterSaleRow }>(
    `mutation ExchangeShipAfterSale($id: ID!, $trackingNo: String!, $carrier: String!) {
      exchangeShipAfterSalesRequest(id: $id, trackingNo: $trackingNo, carrier: $carrier) { ${AFTER_SALE_FIELDS} }
    }`,
    { id, trackingNo, carrier },
  );
  return exchangeShipAfterSalesRequest;
}

export interface AfterSalesStats {
  totalRequests: number;
  pendingCount: number;
  totalRefundAmount: number;
  avgHandleHours: number | null;
  daily: { date: string; total: number }[];
  byState: { key: string; count: number; amount: number }[];
  byType: { key: string; count: number; amount: number }[];
}

/** 售后看板聚合（from/to 接受 'yyyy-MM-dd' 或完整 ISO 串；纯日期 to 按当日 23:59:59.999 收口） */
export async function fetchAfterSalesStats(from: string, to: string): Promise<AfterSalesStats> {
  const { afterSalesStats } = await getAdminClient().request<{ afterSalesStats: AfterSalesStats }>(
    `query AfterSalesStats($from: String!, $to: String!) {
      afterSalesStats(from: $from, to: $to) {
        totalRequests pendingCount totalRefundAmount avgHandleHours
        daily { date total }
        byState { key count amount }
        byType { key count amount }
      }
    }`,
    { from, to },
  );
  return afterSalesStats;
}
```

- [ ] **Step 9.3: afterSaleActions.ts 扩展**（3 处修改）：
  1. `AfterSaleActionAvailability` 接口整体替换为：

```ts
export interface AfterSaleActionAvailability {
  approve: boolean;
  reject: boolean;
  receive: boolean;
  refund: boolean;
  retry: boolean;
  /** 换货发货（仅 exchange 单 Received 态；三期新增） */
  exchangeShip: boolean;
}
```

  2. `afterSaleActions` 与 `hasAfterSaleActions` 整体替换为（第二参可选，向后兼容）：

```ts
export function afterSaleActions(state?: string | null, type?: string | null): AfterSaleActionAvailability {
  const s = state ?? '';
  return {
    approve: s === 'Pending',
    reject: s === 'Pending',
    receive: s === 'Returning',
    refund: s === 'Received',
    retry: s === 'RefundFailed',
    exchangeShip: s === 'Received' && type === 'exchange',
  };
}

export function hasAfterSaleActions(state?: string | null, type?: string | null): boolean {
  const a = afterSaleActions(state, type);
  return a.approve || a.reject || a.receive || a.refund || a.retry || a.exchangeShip;
}
```

  3. `afterSaleProgressIndex` 内 `if (s === 'RefundFailed') return 3;` 行后加：

```ts
  if (s === 'ExchangeShipped') return 4;
```

- [ ] **Step 9.4: orderState.ts 状态字典扩展**（`AFTER_SALE_STATES` 内 `Refunded:` 行前插入）：

```ts
  ExchangeShipped: { label: '换货已发货', color: '#2563eb' },
```

- [ ] **Step 9.5: 提交 web-admin**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(after-sale): 迭代三期数据层——留言分页/回复/换货发货/看板聚合 API + ExchangeShipped 状态字典与动作位"
git -C d:\zhao\vshop\web-admin add src/apis/afterSale.ts src/constants/afterSaleActions.ts src/constants/orderState.ts
git -C d:\zhao\vshop\web-admin commit -F "$env:TEMP\as3-commit.txt"
```

---

## Task 10：web-admin 售后详情——换货发货（运单号弹层）+ 协商留言区块

对应设计 §六「协商留言区块」「exchange 单 Received 态出现换货发货（弹运单号表单）」。
uni-app 环境无多输入 showModal，换货发货用页面内自绘弹层（mask + dialog）；运单号/承运商均必填。

**Files**
- Modify: `d:\zhao\vshop\web-admin\src\pages\after-sale\detail\index.vue`

- [ ] **Step 10.1: script 修改**（6 处）：
  1. API import 块整体替换为：

```ts
import {
  fetchAfterSaleAdmin,
  approveAfterSale,
  rejectAfterSale,
  confirmAfterSaleReceived,
  processAfterSaleRefund,
  retryAfterSaleRefund,
  exchangeShipAfterSale,
  fetchAfterSaleMessages,
  replyAfterSaleMessage,
  AfterSaleRow,
  AfterSaleMessage,
} from '../../../apis/afterSale';
```

  2. 动作可用性两行整体替换为（透传 type）：

```ts
const can = computed(() => afterSaleActions(detail.value?.state, detail.value?.type));
const hasOps = computed(() => hasAfterSaleActions(detail.value?.state, detail.value?.type));
```

  3. `primaryLabel` computed 内 `if (c.refund)` 行之前插入（exchange 单 Received 主操作是换货发货而非退款——服务端对 exchange 退款抛 EXCHANGE_NO_REFUND）：

```ts
  if (c.exchangeShip) return locale.t('afterSale.detail.exchangeShipTitle');
```

  4. `onPrimary` 内 `if (c.refund) onRefund();` 行之前插入：

```ts
  else if (c.exchangeShip) onExchangeShip();
```

  5. `onRetry` 函数之后追加换货发货与协商留言两组状态：

```ts
// ---- 换货发货（三期）：弹层填新品运单号 + 承运商，均必填 ----
const shipOpen = ref(false);
const shipTrackingNo = ref('');
const shipCarrier = ref('');

function onExchangeShip() {
  shipTrackingNo.value = detail.value?.exchangeTrackingNo || '';
  shipCarrier.value = detail.value?.exchangeCarrier || '';
  shipOpen.value = true;
}

async function onExchangeShipConfirm() {
  if (!detail.value) return;
  const no = shipTrackingNo.value.trim();
  const carrier = shipCarrier.value.trim();
  if (!no || !carrier) { toast(locale.t('afterSale.detail.exchangeShipRequired')); return; }
  try {
    await exchangeShipAfterSale(detail.value.id, no, carrier);
    shipOpen.value = false;
    uni.showToast({ title: locale.t('afterSale.detail.exchangeShipDone'), icon: 'success' });
    await refresh();
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.detail.opFailed'));
  }
}

// ---- 协商留言（三期）：气泡列表 + 回复输入；Closed 只读 ----
const msgs = ref<AfterSaleMessage[]>([]);
const msgTotal = ref(0);
const msgContent = ref('');
const MSG_TAKE = 20;

async function loadMessages() {
  if (!detail.value?.id) return;
  try {
    const r = await fetchAfterSaleMessages(detail.value.id, 0, MSG_TAKE);
    msgs.value = r.items;
    msgTotal.value = r.total;
  } catch (e) { console.error('loadMessages failed', e); }
}

const msgHasMore = computed(() => msgs.value.length < msgTotal.value);
async function loadMoreMessages() {
  if (!detail.value?.id) return;
  const r = await fetchAfterSaleMessages(detail.value.id, msgs.value.length, MSG_TAKE);
  msgs.value = [...msgs.value, ...r.items];
  msgTotal.value = r.total;
}

const msgReadonly = computed(() => detail.value?.state === 'Closed');
async function sendMessage() {
  if (!detail.value || !msgContent.value.trim()) return;
  try {
    await replyAfterSaleMessage(detail.value.id, msgContent.value.trim());
    msgContent.value = '';
    await loadMessages();
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.detail.opFailed'));
  }
}
```

  6. `onLoad` 内 `detail.value = await fetchAfterSaleAdmin(id);` 行后加：

```ts
    void loadMessages();
```

- [ ] **Step 10.2: 模板修改**（3 处）：
  1. 时间线 computed：`const list = TIMELINE_KEYS.map((k, i) => ({` 行整体替换为（换货单第 5 节点换为 ExchangeShipped）：

```ts
  const baseKeys = isExchange.value ? ['Pending', 'Approved', 'Returning', 'Received', 'ExchangeShipped'] : TIMELINE_KEYS;
  const list = baseKeys.map((k, i) => ({
```

     并在同一 map 的 `detail:` 三元链中 `k === 'Returning' && (...)` 分支前插入换货物流分支：

```ts
      : k === 'ExchangeShipped' && (r.exchangeCarrier || r.exchangeTrackingNo)
        ? `${r.exchangeCarrier || ''} ${r.exchangeTrackingNo || ''}`.trim()
```

  2. 「顾客凭证」card 之后、「库存回补」card 之前插入协商留言卡片：

```vue
    <!-- 协商留言（三期） -->
    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.messages') }}</text>
      <view v-if="!msgs.length" class="muted">{{ $t('afterSale.detail.messagesEmpty') }}</view>
      <view class="msg" v-for="m in msgs" :key="m.id" :class="{ mine: m.senderType === 'admin' }">
        <text class="msg-meta">{{ m.senderName }} · {{ fmtTime(m.createdAt) }}</text>
        <view class="bubble">{{ m.content }}</view>
        <view class="msg-imgs" v-if="m.images && m.images.length">
          <image v-for="(u, i) in m.images" :key="i" class="shot" :src="u" mode="aspectFill" />
        </view>
      </view>
      <text class="loadmore" v-if="msgHasMore" @tap="loadMoreMessages">{{ $t('afterSale.detail.messagesLoadMore') }}</text>
      <template v-if="!msgReadonly">
        <textarea class="msg-input" v-model="msgContent" :placeholder="$t('afterSale.detail.messagesPlaceholder')" :maxlength="1000" />
        <button class="op main send" :disabled="msgSending || !msgContent.trim()" @tap="sendMessage">{{ $t('afterSale.detail.messagesSend') }}</button>
      </template>
      <text v-else class="muted small">{{ $t('afterSale.detail.messagesClosed') }}</text>
    </view>
```

     注意：本步需在 Step 10.1 第 5 组状态中补一个 `msgSending`（`const msgSending = ref(false);`），`sendMessage` 的 try 外层用 `msgSending.value = true` / `finally { msgSending.value = false; }` 包裹，最终函数体为：

```ts
async function sendMessage() {
  if (!detail.value || !msgContent.value.trim()) return;
  msgSending.value = true;
  try {
    await replyAfterSaleMessage(detail.value.id, msgContent.value.trim());
    msgContent.value = '';
    await loadMessages();
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.detail.opFailed'));
  } finally {
    msgSending.value = false;
  }
}
```

  3. `<view style="height: 200rpx" />` 之前插入换货发货弹层：

```vue
    <!-- 换货发货弹层（运单号 + 承运商均必填） -->
    <view class="mask" v-if="shipOpen" @tap="shipOpen = false">
      <view class="dialog" @tap.stop>
        <text class="dlg-title">{{ $t('afterSale.detail.exchangeShipTitle') }}</text>
        <input class="dlg-input" v-model="shipTrackingNo" :placeholder="$t('afterSale.detail.exchangeTrackingNo')" />
        <input class="dlg-input" v-model="shipCarrier" :placeholder="$t('afterSale.detail.exchangeCarrier')" />
        <view class="dlg-btns">
          <button class="op" @tap="shipOpen = false">{{ $t('afterSale.list.addressCancel') }}</button>
          <button class="op main" :disabled="false" @tap="onExchangeShipConfirm">{{ $t('afterSale.detail.exchangeShipTitle') }}</button>
        </view>
      </view>
    </view>
```

- [ ] **Step 10.3: 样式追加**（`<style>` 内 `.empty` 行之前）：

```scss
  .mask { position: fixed; inset: 0; z-index: 99; background: rgba(0, 0, 0, 0.45);
    display: flex; align-items: center; justify-content: center;
    .dialog { width: 600rpx; background: $wa-card; border-radius: $wa-radius; padding: 36rpx 32rpx;
      .dlg-title { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; margin-bottom: 24rpx; }
      .dlg-input { height: 72rpx; border: 1rpx solid $wa-rule; border-radius: $wa-radius; padding: 0 20rpx;
        font-size: 28rpx; color: $wa-ink; margin-bottom: 20rpx; }
      .dlg-btns { display: flex; gap: 20rpx; margin-top: 8rpx;
        .op { flex: 1; margin: 0; height: 72rpx; line-height: 72rpx; font-size: 28rpx;
          border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
          &.main { background: $wa-accent; color: #fff; } } } } }
  .msg { display: flex; flex-direction: column; align-items: flex-start; padding: 12rpx 0;
    &.mine { align-items: flex-end; }
    .msg-meta { font-size: 22rpx; color: $wa-muted; margin-bottom: 6rpx; }
    .bubble { max-width: 80%; background: $wa-bg; border-radius: 12rpx; padding: 14rpx 20rpx;
      font-size: 26rpx; color: $wa-ink; word-break: break-all; }
    &.mine .bubble { background: rgba(37, 99, 235, 0.1); }
    .msg-imgs { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 10rpx;
      .shot { width: 120rpx; height: 120rpx; border-radius: $wa-radius; background: $wa-bg; } } }
  .loadmore { display: block; text-align: center; font-size: 24rpx; color: $wa-accent; padding: 12rpx 0; }
  .msg-input { width: 100%; min-height: 120rpx; border: 1rpx solid $wa-rule; border-radius: $wa-radius;
    padding: 16rpx 20rpx; font-size: 26rpx; color: $wa-ink; margin-top: 16rpx; box-sizing: border-box; }
  .send { width: 100%; margin-top: 16rpx; }
  .small { font-size: 22rpx; }
```

- [ ] **Step 10.4: 运行验证**

Run: `npm run build:h5`（cwd `d:\zhao\vshop\web-admin`）
Expected: 构建绿（TS/模板编译无错）。

- [ ] **Step 10.5: 提交 web-admin**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(after-sale): 迭代三期后台详情——换货发货弹层（必填校验）+ 协商留言区块（回复/分页/Closed 只读）"
git -C d:\zhao\vshop\web-admin add src/pages/after-sale/detail/index.vue
git -C d:\zhao\vshop\web-admin commit -F "$env:TEMP\as3-commit.txt"
```

---

## Task 11：web-admin 数据看板——「售后」页签

对应设计 §四前端：顶部第三页签（与经营/作业同级），KPI 三卡 + 近 N 日申请量条形（复用 .trow/.tbar/.tfill 自绘模式，不引第三方图表库）+ 状态分布横条 + 类型分布；空数据显示 `—`，不伪造。

**Files**
- Modify: `d:\zhao\vshop\web-admin\src\pages\data\dashboard\index.vue`

- [ ] **Step 11.1: script 修改**（5 处）：
  1. import 区（`import { fetchStockDocOperatorStats } ...` 行后）加：

```ts
import { fetchAfterSalesStats, type AfterSalesStats } from '../../../apis/afterSale';
import { AFTER_SALE_STATES, AFTER_SALE_TYPES, stateLabel } from '../../../constants/orderState';
```

  2. `const view = ref<'biz' | 'ops'>('biz');` 整行替换为：

```ts
const view = ref<'biz' | 'ops' | 'as'>('biz');
```

  3. `varRows` 声明之后追加售后看板状态：

```ts
// ---- 售后页签（三期）：null = 拉取失败显示 "—"；条形图与作业差异趋势同款自绘 ----
const asStats = ref<AfterSalesStats | null>(null);
const asDailyRows = computed(() => (asStats.value?.daily ?? []).map((d) => ({ day: d.date, count: d.total })));
const asBarMax = computed(() => {
  const daily = asDailyRows.value.reduce((m, r) => Math.max(m, r.count), 0);
  const state = (asStats.value?.byState ?? []).reduce((m, b) => Math.max(m, b.count), 0);
  return Math.max(daily, state);
});

/** 条宽归一：0 不画条（不伪造最小长度） */
function asBarWidth(v: number): string {
  if (asBarMax.value <= 0 || v <= 0) return '0%';
  return `${Math.max(2, Math.round((v / asBarMax.value) * 100))}%`;
}

async function loadAs(): Promise<void> {
  // 近 7/30 天窗口（本地时区）：from = 窗口首日，to = 今天；纯日期 to 由服务端按当日末收口
  const end = new Date();
  const start = new Date(end.getTime() - (days.value - 1) * 24 * 60 * 60 * 1000);
  const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  try {
    asStats.value = await fetchAfterSalesStats(ymdLocal(start), ymdLocal(end));
  } catch (e) { console.error('fetchAfterSalesStats failed', e); asStats.value = null; }
}

function switchAs(): void {
  if (view.value === 'as') return;
  view.value = 'as';
  loadAs();
}
```

  4. `switchDays` 内分支整体替换为：

```ts
  if (days.value === d) return;
  days.value = d;
  if (view.value === 'biz') loadDynamic();
  else if (view.value === 'ops') loadOps();
  else loadAs();
```

- [ ] **Step 11.2: 模板修改**（3 处）：
  1. 视图分段 seg（views）内 `<view class="seg-item" ... @tap="switchOps">...` 行后加：

```vue
      <view class="seg-item" :class="{ on: view === 'as' }" @tap="switchAs">{{ $t('dataDashboard.view.as') }}</view>
```

  2. 作业视图 `<template v-else>` 整行替换为：

```vue
    <template v-else-if="view === 'ops'">
```

  3. 作业视图 `</template>` 之后（`<view style="height: 140rpx" />` 之前）插入售后视图：

```vue
    <template v-else-if="view === 'as'">
      <view class="stat">
        <view class="stat-card">
          <text class="num">{{ asStats ? asStats.totalRequests : '—' }}</text>
          <text class="lbl">{{ $t('dataDashboard.asRequests') }}</text>
        </view>
        <view class="stat-card">
          <text class="num">{{ asStats ? '¥' + (asStats.totalRefundAmount / 100).toFixed(2) : '—' }}</text>
          <text class="lbl">{{ $t('dataDashboard.asRefundAmount') }}</text>
        </view>
        <view class="stat-card">
          <text class="num">{{ asStats && asStats.avgHandleHours != null ? asStats.avgHandleHours.toFixed(1) + 'h' : '—' }}</text>
          <text class="lbl">{{ $t('dataDashboard.asAvgHandleHours') }}</text>
        </view>
      </view>

      <!-- 近 N 日申请量趋势（css 条形，与差异趋势同款） -->
      <view class="card">
        <text class="sec">{{ $t('dataDashboard.asDaily') }}</text>
        <view v-if="asDailyRows.length">
          <view v-for="r in asDailyRows" :key="r.day" class="trow">
            <text class="tday">{{ r.day }}</text>
            <view class="tbar"><view class="tfill as" :style="{ width: asBarWidth(r.count) }" /></view>
            <text class="tval">{{ r.count }}</text>
          </view>
        </view>
        <text v-else class="muted">{{ $t('dataDashboard.empty') }}</text>
      </view>

      <!-- 状态分布（AFTER_SALE_STATES 中文文案 + 状态色） -->
      <view class="card">
        <text class="sec">{{ $t('dataDashboard.asByState') }}</text>
        <view v-if="asStats && asStats.byState.length">
          <view v-for="b in asStats.byState" :key="b.key" class="trow">
            <text class="tday">{{ stateLabel(AFTER_SALE_STATES, b.key).label }}</text>
            <view class="tbar"><view class="tfill" :style="{ width: asBarWidth(b.count), background: stateLabel(AFTER_SALE_STATES, b.key).color }" /></view>
            <text class="tval">{{ b.count }}</text>
          </view>
        </view>
        <text v-else class="muted">{{ $t('dataDashboard.empty') }}</text>
      </view>

      <!-- 类型分布 -->
      <view class="card">
        <text class="sec">{{ $t('dataDashboard.asByType') }}</text>
        <view v-if="asStats && asStats.byType.length">
          <view v-for="b in asStats.byType" :key="b.key" class="top-row">
            <text class="name">{{ AFTER_SALE_TYPES[b.key] || b.key }}</text>
            <text class="cnt">{{ b.count }} {{ $t('dataDashboard.asUnit') }}</text>
            <text class="gmv" v-if="b.amount">¥{{ (b.amount / 100).toFixed(0) }}</text>
          </view>
        </view>
        <text v-else class="muted">{{ $t('dataDashboard.empty') }}</text>
      </view>
    </template>
```

- [ ] **Step 11.3: 样式追加**（`.trow` 块的 `.tfill` 规则行后、同级追加一条修饰类）：

```scss
      .tfill.as { background: $wa-accent; }
```

- [ ] **Step 11.4: 提交 web-admin**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(dashboard): 数据看板新增售后页签——KPI 三卡 + 申请量/状态/类型分布（自绘条形，空数据不伪造）"
git -C d:\zhao\vshop\web-admin add src/pages/data/dashboard/index.vue
git -C d:\zhao\vshop\web-admin commit -F "$env:TEMP\as3-commit.txt"
```

---

## Task 12：web-admin i18n——zh-Hans / en 同步（看板售后页签 + 详情留言/换货）

对应设计 §六「i18n zh-Hans/en 同步」。JSON 编辑注意上一行补逗号。

**Files**
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 12.1: zh-Hans.json**（4 处）：
  1. `dataDashboard` 段 `"view"` 块内 `"ops": "作业分析"` 行改为（补逗号 + 加 as）：

```json
      "ops": "作业分析",
      "as": "售后"
```

  2. `"view"` 块结束后（`"ops": {` 之前）插入：

```json
    "asRequests": "申请数",
    "asRefundAmount": "退款总额",
    "asAvgHandleHours": "平均处理时长",
    "asDaily": "申请量趋势",
    "asByState": "状态分布",
    "asByType": "类型分布",
    "asUnit": "单",
```

  3. `afterSale.detail` 段末尾 `"statusClosed": "已关闭"` 行改为（补逗号 + 追加）：

```json
      "statusClosed": "已关闭",
      "messages": "协商留言",
      "messagesEmpty": "暂无留言",
      "messagesPlaceholder": "输入回复内容…",
      "messagesSend": "发送",
      "messagesClosed": "售后已关闭，留言停用",
      "messagesLoadMore": "加载更多",
      "exchangeShipTitle": "换货发货",
      "exchangeTrackingNo": "新品运单号",
      "exchangeCarrier": "承运商",
      "exchangeShipRequired": "请填写运单号与承运商",
      "exchangeShipDone": "换货已发货"
```

  4. `afterSale.timeline` 段 `"stepRefunded": "退款完成"` 行改为（补逗号 + 追加）：

```json
      "stepRefunded": "退款完成",
      "stepExchangeShipped": "换货已发货"
```

- [ ] **Step 12.2: en.json**（同样 4 处，键名一致）：
  1. `dataDashboard.view` 块：

```json
      "ops": "Operations",
      "as": "After-sales"
```

  2. view 块后插入：

```json
    "asRequests": "Requests",
    "asRefundAmount": "Refund Total",
    "asAvgHandleHours": "Avg Handling Time",
    "asDaily": "Daily Requests",
    "asByState": "By State",
    "asByType": "By Type",
    "asUnit": "reqs",
```

  3. `afterSale.detail` 段 `"statusClosed": "Closed"` 行改后追加：

```json
      "statusClosed": "Closed",
      "messages": "Messages",
      "messagesEmpty": "No messages yet",
      "messagesPlaceholder": "Type a reply…",
      "messagesSend": "Send",
      "messagesClosed": "Request closed: messaging disabled",
      "messagesLoadMore": "Load more",
      "exchangeShipTitle": "Ship Exchange",
      "exchangeTrackingNo": "New tracking No.",
      "exchangeCarrier": "Carrier",
      "exchangeShipRequired": "Tracking No. and carrier are required",
      "exchangeShipDone": "Exchange shipped"
```

  4. `afterSale.timeline` 段：

```json
      "stepRefunded": "Refunded",
      "stepExchangeShipped": "Exchange shipped"
```

- [ ] **Step 12.3: 运行验证**

Run: `npm run build:h5`（cwd `d:\zhao\vshop\web-admin`）
Expected: 构建绿；JSON 无语法错误（构建期即校验）。

- [ ] **Step 12.4: 提交 web-admin**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "feat(i18n): 看板售后页签 + 售后详情留言/换货词条（zh-Hans/en 同步）"
git -C d:\zhao\vshop\web-admin add src/locale/zh-Hans.json src/locale/en.json
git -C d:\zhao\vshop\web-admin commit -F "$env:TEMP\as3-commit.txt"
```

---

## Task 13：构建验证与三仓收口（vendure → 服务器 → nshop → web-admin → 截图手册）

对应设计「测试与验收」：单测/构建两端绿、既有 e2e 全绿（Task 2-5 各自已跑）、手机截图补操作手册、部署铁律（一律本地构建，服务器只解压/restart，绝不服务器构建）。
顺序：后端先上线（C 端/后台新前端依赖新 API），再前端。执行身份 johocn / johocn@163.com（新克隆仓库若报 Author identity unknown，先 `git config user.name johocn; git config user.email johocn@163.com`）。

**Files**
- Create: `d:\zhao\nshop\docs\manual\shots\2026-10-07-aftersales-iteration3\*.png`
- Modify: `d:\zhao\nshop\docs\superpowers\manual\` 下售后操作手册（追加「六期」章节）

- [ ] **Step 13.1: vendure 构建**

Run: `cd d:\zhao\vendure\packages\after-sales-plugin; npm run build`
Expected: tsc 编译无错，`lib/` 产物更新（含 AfterSalesMessage 实体/事件/stats）。notification-plugin 源码由 vendure 主工程编译，无需单独 build。

- [ ] **Step 13.2: lib 产物入库**（若该仓库将 lib 纳入版本管理）

```powershell
git -C d:\zhao\vendure status --short packages/after-sales-plugin/lib
# 有输出（lib 未被 .gitignore 忽略且已变更）则：
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "chore(after-sales): 构建迭代三期 lib 产物"
git -C d:\zhao\vendure add packages/after-sales-plugin/lib
git -C d:\zhao\vendure commit -F "$env:TEMP\as3-commit.txt"
# 无输出（lib 被忽略或无变化）则跳过本步
```

- [ ] **Step 13.3: 推送并部署 vendure 后端**

```powershell
git -C d:\zhao\vendure push
# 服务器侧：探明 vendure 应用名与运行目录后拉取重启（远端命令不含本地变量，可直接执行）
$apps = ssh qing "pm2 jlist" | ConvertFrom-Json
$app = $apps | Where-Object { $_.name -match 'vendure' } | Select-Object -First 1
$dir = $app.pm2_env.pm_cwd
ssh qing "cd $dir && git pull --ff-only && pm2 restart $($app.name) && sleep 1 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3020/admin-api"
```

Expected: push 成功；服务器 `git pull --ff-only` 快进、pm2 restart 成功；curl 输出 `200`（nginx -t/reload 生效瞬间旧 worker 可能应答旧配置，已 `sleep 1` 规避；如仍异常隔轮再验）。

- [ ] **Step 13.4: nshop 收口**

Run: `pnpm test`（全绿）→ `node scripts/deploy.mjs`（cwd `d:\zhao\nshop`；本地 build → scp `.output/` → pm2 restart nshop）
Expected: 部署脚本输出上传与重启成功；线上验证 `ssh qing "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/account/after-sales"` 输出 `200`。

- [ ] **Step 13.5: web-admin 收口**

Run: `npm run build:h5` → `node scripts/deploy.mjs`（cwd `d:\zhao\vshop\web-admin`）
Expected: 部署脚本输出上传与重启成功；线上后台打开售后详情与数据看板可见新功能。

- [ ] **Step 13.6: 手机截图 + 操作手册「六期」章节**（照五期惯例，Playwright **390×844 dpr=2** 移动视口）：
  - C 端截图：① 详情页协商留言卡（气泡+输入区）② ExchangeShipped 吸底「确认收货」+ 确认弹窗 ③ 消息中心售后通知点击直达售后详情 ④ 账户页「我的消息」未读红点
  - 后台截图（web-admin H5 移动视口）：⑤ 详情协商留言区块（回复气泡）⑥ 换货发货弹层（运单号+承运商）⑦ 看板「售后」页签（KPI 三卡 + 分布条形）
  - 手册：在 `d:\zhao\nshop\docs\superpowers\manual\` 下售后操作手册追加「六期：状态通知 · 协商留言 · 超时自动化与换货闭环 · 数据看板」章节——功能说明 + 上述截图 + 测试用例表（留言双向/Closed 禁言/图片≤3、换货 ship→receive 闭环、exchange 退款被拒、超时提醒/自动同意/重试耗尽、看板空窗口显示 —）。

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as3-commit.txt" "docs(after-sales): 六期操作手册 + 手机截图（留言/换货/通知/看板）"
git -C d:\zhao\nshop add docs/manual/shots/2026-10-07-aftersales-iteration3 docs/superpowers/manual
git -C d:\zhao\nshop commit -F "$env:TEMP\as3-commit.txt"
git -C d:\zhao\nshop push
```

- [ ] **Step 13.7: 最终回归核对**（汇总声明，不重复执行）

| 验收项 | 执行处 | 结果要求 |
|---|---|---|
| vendure e2e（迭代三 14 例 + 旧 9 例） | Task 2/3/4/5 Step e2e | 全绿 |
| nshop vitest（状态字典扩展） | Task 7 Step 7.6 | 全绿 |
| 两端构建 | Task 13.4 / 13.5 | 构建绿 |
| 手机截图 + 手册 | Task 13.6 | 七张截图入库 |

---

## Self-Review

### 1. 设计文档 §一~§六 与任务映射（100% 覆盖核对）

| 设计章节 | 内容 | 覆盖任务 |
|---|---|---|
| §一 状态变更通知 | AfterSalesStateTransitionEvent 事件 + notification-plugin 订阅落 InboxMessage + 通知矩阵 11 行 + 消息体带单号/C 端直达 | Task 1（统一出口 commitState + 事件 + 双端通知）；Task 6/7（C 端消息中心双源合并 + link 直达 + 账户页红点） |
| §二 协商留言 | after_sales_message 实体、双端 add/reply + 分页查询、messageCount、≤3 图/≤1000 字/Closed 禁言 | Task 2（实体/SDL/resolver/service/e2e）；Task 6（C 端 gql+composable）；Task 7（留言卡）；Task 9/10（后台 API+区块） |
| §三 超时自动化 + 换货闭环 | 渠道 customFields 三阈值 + delayed job 三类；ExchangeShipped 状态 + exchangeShip/exchangeReceive + EXCHANGE_NO_REFUND + 批量不含发货 | Task 3（换货）；Task 4（超时）；Task 6/7（exchangeReceive）；Task 9/10（exchangeShip）；Task 12（后台状态字典） |
| §四 数据看板 | afterSalesStats 聚合（getRawMany，空窗口 0/null）+ web-admin「售后」页签（KPI/趋势/分布，自绘条形，不伪造） | Task 5（后端）；Task 11（前端页签） |
| §五 C 端 | 详情留言卡（气泡/附图/≤3/Closed 隐藏输入）、时间线换货节点 + 确认收货、消息中心跳转 + 账户页入口 + 未读红点、12 语言包 | Task 6/7/8 |
| §六 后台 | 详情留言区块、Received+exchange 换货发货弹运单号、看板页签、zh-Hans/en 同步 | Task 9/10/11/12 |
| 测试与验收 | e2e 留言/换货/超时/统计、nshop vitest、两端构建、手机截图 390×844 补手册六期章节、既有 e2e 回归 | Task 2-5（e2e）、Task 7（vitest）、Task 13（构建/截图/手册/收口） |
| 非目标 | 短信/微信外发、留言撤回删除、未读分离、看板导出——均未纳入任何任务 ✔ | — |

### 2. 与设计文档有出入的实现决策（已在正文标注，共 4 条）

1. **afterSalesStats 入参类型**：设计 §四写 `from: DateTime!, to: DateTime!`，实现为 `String!`（ISO 日期串/纯 `yyyy-MM-dd`，纯日期 to 按当日 23:59:59.999 收口，见 Task 5 Step 5.2）——规避 Vendure `DateTime` 标量的调用方时区歧义，服务端解析。
2. **退款重试防重入护栏**：设计未提。自动重试再失败会再次经 commitState 发布 RefundFailed→RefundFailed 事件，若不拦截将无限重试。Task 4 Step 4.5 在 REFUND_RETRY 登记处加 `e.fromState !== 'RefundFailed'` 护栏，重试次数以 attempt 计数为准。
3. **留言分页 SDL 前向修订**：Task 2 初稿的 `AfterSalesMessageListOptions`/`AfterSalesMessageAdminListOptions` 为空 input，GraphQL 会拒绝 `{skip, take}` 变量导致两端无法分页；本文档已在定稿时修订为含 `skip: Int, take: Int`（Task 2 Step 2.4），Task 6 补丁脚本与之一致。
4. **C 端留言分页步长**：设计未规定步长；C 端首页取默认 take=50、「加载更多」按 skip=已有条数续拉（Task 7），后台页长 20（Task 10）。

### 3. 跨任务类型/命名一致性核对

| 项 | 值 | 出现任务 |
|---|---|---|
| 事件名 / payload | `AfterSalesStateTransitionEvent`：requestId, orderId, type, fromState, toState, customerId, orderCode, createdAt | Task 1/4（发布+订阅） |
| 留言实体/类型 | `AfterSalesMessage`：senderType `'customer'\|'admin'`、senderName、images `string[]\|null` | Task 2/6/9/10 |
| 留言 SDL | Shop `addAfterSalesMessage` / Admin `replyAfterSalesMessage` / 双端 `afterSalesMessages(id, options)`；`AfterSalesMessage{List,Admin,AdminList,ListOptions,AdminListOptions}` | Task 2/6/9 |
| 换货 SDL | Admin `exchangeShipAfterSalesRequest(id, trackingNo, carrier)` / Shop `exchangeReceiveAfterSalesRequest(id)` | Task 3/6/9/10 |
| 状态流转 | `Received --exchangeShip--> ExchangeShipped --exchangeReceive--> Closed`；STATE_TRANSITIONS 增量；confirmReturnReceived 对 exchange 停在 Received | Task 3/7/9/10 |
| 新字段 | `exchangeTrackingNo`/`exchangeCarrier`（nullable String）、`messageCount: Int!` 两端一致 | Task 2/3/6/9 |
| 通知标题 | 顾客：售后审核通过/商家已收货/退款已到账/退款异常/售后被拒绝/换货已发货/换货完成；商家：新售后待处理/顾客已寄回/售后处理超时提醒/退款自动重试耗尽 | Task 1/4 |
| i18n key | `messages.afterSales.stateExchangeShipped/timelineExchangeShipped/nextExchangeShipped*/actionConfirmExchange/exchangeConfirm*/exchangeReceiveSuccess/messages*`；后台 `afterSale.detail.messages*/exchangeShip*/timeline.stepExchangeShipped`、`dataDashboard.view.as/as*` | Task 7/8/10/11/12 |
| 组件注册名 | Nuxt 目录前缀去重：`AfterSalesMessages`（新）、`AfterSalesEvidenceUploader`（复用 EvidenceUploader.vue） | Task 7 |

### 4. 完整性声明

- 全文 13 个 Task、每步均含完整代码/命令与 Run/Expected，无 TBD、无「实现略」、无待填占位符。
- 部署目标值（PM2 应用名/目录）不在代码中硬编码，Task 13.3 以 `pm2 jlist` 程序化解析（符合「动态配置优先」项目规范）。
