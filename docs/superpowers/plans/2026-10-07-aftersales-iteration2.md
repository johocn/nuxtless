# 售后体系迭代二期（批量操作/状态历史/退货地址/C端分页）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现设计文档 `docs/superpowers/specs/2026-10-07-aftersales-iteration2-design.md` 的四项功能：A 后台批量同意/拒绝+CSV导出、B 状态历史事件表（时间线逐节点时间）、C 退货地址后台配置（C 端 Approved 地址卡）、D C 端列表加载更多分页。

**Architecture:** 后端零业务逻辑变化——新增历史实体逐点插桩 8 个状态写入点；批量复用单条方法逐条 try/catch；地址存渠道 customField。C 端利用 ListQueryBuilder 原生 skip/take 分页。后台新增批量条/地址弹窗/CSV 导出，详情改 Admin 单查。

**Tech Stack:** Vendure 3.6（SDL-first 插件 + TypeORM synchronize:true）、Nuxt/nshop（i18n 12 包）、uni-app/web-admin（zh-Hans/en 双包）。

**提交身份：** `johocn / johocn@163.com`；`git add` 精确枚举禁 `-A`；PowerShell 不支持 `&&`、heredoc；`git commit -F` 临时文件。

---

## Task 1: 后端 e2e 先行（写失败用例）

**Files:**
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\e2e\after-sales.e2e-spec.ts`

- [ ] **Step 1.1: 提升 asId 作用域**。describe 顶部加 `let mainAsId: string;`，第一个用例内 `const asId = created.createAfterSalesRequest.id;` 之后加 `mainAsId = asId;`。

- [ ] **Step 1.2: 文件末尾（describe 内、`}, TEST_SETUP_TIMEOUT_MS);` 之前）追加 4 个用例**：

```ts
    it('状态历史：单查 afterSalesRequestAdmin 返回逐节点 history，含 order/customer', async () => {
        const single = await adminClient.query(gql`
            query {
                afterSalesRequestAdmin(id: "${mainAsId}") {
                    id state
                    history { fromState toState createdAt }
                    order { id code }
                    customer { id }
                }
            }
        `);
        const row = single.afterSalesRequestAdmin;
        expect(row).toBeDefined();
        expect(row.history.map((h: any) => h.toState)).toEqual([
            'Pending', 'Approved', 'Returning', 'Received', 'Refunded',
        ]);
        expect(row.history[0].fromState).toBeNull();
        expect(row.history[0].createdAt).toBeTruthy();
        expect(row.order?.code).toBeTruthy();
        expect(row.customer?.id).toBeTruthy();
    }, TEST_SETUP_TIMEOUT_MS);

    it('Shop 详情 history：顾客端 afterSalesRequest 返回 history', async () => {
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
        const res = await shopClient.query(gql`
            query { afterSalesRequest(id: "${mainAsId}") { id state history { toState createdAt } } }
        `);
        expect(res.afterSalesRequest.history.length).toBeGreaterThanOrEqual(5);
    }, TEST_SETUP_TIMEOUT_MS);

    it('批量操作：全成功 / 部分失败（非法id+非法状态）/ 超 50 拒绝', async () => {
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
        // 主订单（已 Shipped）上创建 3 张整单售后（无 orderLineId 无重复限制）
        const ids: string[] = [];
        for (let i = 0; i < 3; i++) {
            const c = await shopClient.query(gql`
                mutation {
                    createAfterSalesRequest(input: { orderId: "${orderId}", type: refund_only, reason: "batch-${i}", refundAmount: 1 }) { id state }
                }
            `);
            ids.push(c.createAfterSalesRequest.id);
        }
        // 批量同意全成功
        const approved = await adminClient.query(gql`
            mutation { batchApproveAfterSalesRequests(ids: [${ids.map((i) => `"${i}"`).join(', ')}]) { id success state message } }
        `);
        expect(approved.batchApproveAfterSalesRequests.every((r: any) => r.success && r.state === 'Approved')).toBe(true);
        // 再建 3 张 Pending，批量拒绝：混入非法 id + 已 Approved 的 id → 部分失败
        const rejectIds: string[] = [];
        for (let i = 0; i < 3; i++) {
            const c = await shopClient.query(gql`
                mutation {
                    createAfterSalesRequest(input: { orderId: "${orderId}", type: refund_only, reason: "batch-rej-${i}", refundAmount: 1 }) { id state }
                }
            `);
            rejectIds.push(c.createAfterSalesRequest.id);
        }
        const mixed = await adminClient.query(gql`
            mutation { batchRejectAfterSalesRequests(ids: [${[...rejectIds, '999999', ids[0]].map((i) => `"${i}"`).join(', ')}], reason: "e2e-batch-reject") { id success state message } }
        `);
        const byId = Object.fromEntries(mixed.batchRejectAfterSalesRequests.map((r: any) => [r.id, r]));
        expect(rejectIds.every((id) => byId[id]?.success && byId[id]?.state === 'Rejected')).toBe(true);
        expect(byId['999999']?.success).toBe(false);
        expect(byId[ids[0]]?.success).toBe(false); // Approved 不可 reject
        // 超 50 条：后端 UserInputError
        const tooMany = Array.from({ length: 51 }, (_, i) => `"${i + 1}"`).join(', ');
        await expect(
            adminClient.query(gql`
                mutation { batchApproveAfterSalesRequests(ids: [${tooMany}]) { id success } }
            `),
        ).rejects.toThrow();
    }, TEST_SETUP_TIMEOUT_MS);

    it('退货地址：未登录 Shop 被拒 / Admin 写读回环 / Shop 只读', async () => {
        // 1. 未登录被拒
        await shopClient.asAnonymousUser();
        await expect(shopClient.query(gql`query { afterSalesReturnAddress }`)).rejects.toThrow();
        // 2. Admin 写 → 读回环
        await adminClient.query(gql`
            mutation { updateAfterSalesReturnAddress(address: "四川省成都市武侯区售后仓 1 号楼") }
        `);
        const adminRead = await adminClient.query(gql`query { afterSalesReturnAddress }`);
        expect(adminRead.afterSalesReturnAddress).toBe('四川省成都市武侯区售后仓 1 号楼');
        // 3. Shop 登录只读一致
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
        const shopRead = await shopClient.query(gql`query { afterSalesReturnAddress }`);
        expect(shopRead.afterSalesReturnAddress).toBe('四川省成都市武侯区售后仓 1 号楼');
    }, TEST_SETUP_TIMEOUT_MS);
```

- [ ] **Step 1.3: 运行验证失败**

Run: `cd d:\zhao\vendure\packages\after-sales-plugin; npm run e2e`
Expected: 新用例 FAIL（SDL 无 afterSalesRequestAdmin / batch* / afterSalesReturnAddress）；旧用例 PASS。

---

## Task 2: 后端实现（历史表 + 插桩 + 批量 + 地址 + 单查 + SDL）

**Files:**
- Create: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-state-history.entity.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-request.entity.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales.service.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\plugin.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-shop.resolver.ts`

- [ ] **Step 2.1: 新建历史实体** `after-sales-state-history.entity.ts`：

```ts
import { Column, CreateDateColumn, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

import { AfterSalesRequest } from './after-sales-request.entity';

/** 售后单状态流转历史（每次状态变更落一行，供 C 端/后台时间线显示逐节点时间） */
@Entity('after_sales_state_history')
@Index(['requestId'])
export class AfterSalesStateHistory extends VendureEntity {
    constructor(input?: DeepPartial<AfterSalesStateHistory>) {
        super(input);
    }

    @ManyToOne(() => AfterSalesRequest, (r) => r.history, { onDelete: 'CASCADE' })
    request: AfterSalesRequest;

    @Column()
    requestId: number;

    /** 来源状态（创建时无来源态为 null） */
    @Column({ type: 'varchar', nullable: true })
    fromState: string | null;

    @Column({ type: 'varchar' })
    toState: string;

    /** 操作人 User 主键（顾客侧/系统兜底路径可为 null） */
    @Column({ type: 'int', nullable: true })
    operatorUserId: number | null;

    @CreateDateColumn()
    createdAt: Date;
}
```

- [ ] **Step 2.2: `after-sales-request.entity.ts` 加反向关系**：import 改为含 `OneToMany`，并 import `AfterSalesStateHistory`；在 `channels` 字段前加：

```ts
    @OneToMany(() => AfterSalesStateHistory, (h) => h.request)
    history: AfterSalesStateHistory[];
```

- [ ] **Step 2.3: service — import + init 注入 ChannelService**：
  - import 区加 `ChannelService`（from '@vendure/core'）与 `AfterSalesStateHistory`（from './after-sales-state-history.entity'）。
  - 类字段加 `private channelService: ChannelService | null = null;`
  - `init()` 内加 `this.channelService = injector.get(ChannelService);`

- [ ] **Step 2.4: service — recordState 私有方法**（放在 `hydrate` 前）：

```ts
    /** 状态流转历史落库：失败仅告警，绝不阻断主流程 */
    private async recordState(ctx: RequestContext, requestId: number, fromState: string | null, toState: string): Promise<void> {
        try {
            const repo = this.connection.getRepository(ctx, AfterSalesStateHistory);
            await repo.insert({ requestId, fromState: fromState ?? null, toState, operatorUserId: ctx.activeUserId ?? null });
        } catch (e: any) {
            Logger.warn(`recordState failed for after-sales #${requestId}: ${e?.message ?? e}`, loggerCtx);
        }
    }
```

- [ ] **Step 2.5: service — 8 个写入点插桩**（模式：变更前 `const fromState = ...;`，save 后 `await this.recordState(...)`）：
  1. `createRequest`：`const saved = await repo.save(request);` 后加 `await this.recordState(ctx, Number(saved.id), null, 'Pending');`
  2. `cancelRequest`：`request.state = 'Closed';` 前加 `const fromState = request.state;`，`const saved = await repo.save(request);` 后加 `await this.recordState(ctx, Number(saved.id), fromState, 'Closed');`
  3. `updateReturnTracking`：同上（fromState→'Returning'）。
  4. `transitionState`：`request.state = toState;` 前捕获 fromState；`return repo.save(request);` 改为 `const saved = await repo.save(request); await this.recordState(ctx, Number(saved.id), fromState, toState); return saved;`
  5. `rejectRequest`：`request.state = 'Rejected';` 前捕获 fromState；`return repo.save(request);` 改为 save 后 recordState（fromState→'Rejected'）。
  6. `confirmReceive`：`request.state = 'Received';` 前加 `const fromState = request.state;`；`return repo.save(request);` 改为 `const saved = await repo.save(request); await this.recordState(txCtx, Number(saved.id), fromState, 'Received'); return saved;`
  7. `executeRefund`：方法体开头（payments 校验后）加 `const fromState = request.state;`；三处写点：
     - refundOrder 拒绝分支 `request.state = 'RefundFailed';` → `await repo.save(request);` 后加 `await this.recordState(ctx, Number(request.id), fromState, 'RefundFailed');`
     - Settled 分支 `request.state = 'Refunded';` → save 后加 `await this.recordState(ctx, Number(request.id), fromState, 'Refunded');`
     - 非 Settled 分支 `request.state = 'RefundFailed';` → save 后加 `await this.recordState(ctx, Number(request.id), fromState, 'RefundFailed');`
  8. `applyRefundFailed`：`request.state = 'RefundFailed';` 前加：
     ```ts
     const fromState = request.state;
     ```
     save 后加：
     ```ts
     if (fromState !== 'RefundFailed') {
         await this.recordState(ctx, Number(request.id), fromState, 'RefundFailed');
     }
     ```

- [ ] **Step 2.6: service — 详情查询加载 history**：`findOne`、`findOneForCustomer`、`hydrate` 的 relations 各加 `history: true`，并在 findOne options 加 `order: { history: { createdAt: 'ASC' } } as any`（hydrate/findOneForCustomer 同样）。`confirmReceive`/`executeRefund` 不需要。

- [ ] **Step 2.7: service — 新方法**（放在 `transitionState` 之前「Admin Operations」区末尾）：

```ts
    /** Admin 单查：加载 order/orderLine/customer/history（web-admin 详情页专用，替代列表过滤 hack） */
    async findOneForAdmin(ctx: RequestContext, id: ID): Promise<AfterSalesRequest | undefined> {
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        const result = await repo.findOne({
            where: { id: id as any },
            relations: { order: true, orderLine: true, customer: true, channels: true, history: true },
            order: { history: { createdAt: 'ASC' } } as any,
        });
        return result ?? undefined;
    }

    /** 批量同意：复用单条方法逐条执行，单条失败不中断整批。上限 50。 */
    async batchApprove(ctx: RequestContext, ids: ID[]): Promise<Array<{ id: string; success: boolean; state: string; message: string }>> {
        if (!Array.isArray(ids) || ids.length === 0) throw new UserInputError('ids is required');
        if (ids.length > 50) throw new UserInputError(`Batch limit is 50, got ${ids.length}`);
        const results: Array<{ id: string; success: boolean; state: string; message: string }> = [];
        for (const id of ids) {
            try {
                const r = await this.approveRequest(ctx, id);
                results.push({ id: String(id), success: true, state: r.state, message: '' });
            } catch (e: any) {
                results.push({ id: String(id), success: false, state: '', message: e?.message ?? String(e) });
            }
        }
        return results;
    }

    /** 批量拒绝：同 batchApprove，整批共用一个 reason。 */
    async batchReject(ctx: RequestContext, ids: ID[], reason: string): Promise<Array<{ id: string; success: boolean; state: string; message: string }>> {
        if (!Array.isArray(ids) || ids.length === 0) throw new UserInputError('ids is required');
        if (ids.length > 50) throw new UserInputError(`Batch limit is 50, got ${ids.length}`);
        const results: Array<{ id: string; success: boolean; state: string; message: string }> = [];
        for (const id of ids) {
            try {
                const r = await this.rejectRequest(ctx, id, reason);
                results.push({ id: String(id), success: true, state: r.state, message: '' });
            } catch (e: any) {
                results.push({ id: String(id), success: false, state: '', message: e?.message ?? String(e) });
            }
        }
        return results;
    }

    /** 读当前渠道售后寄回地址（Admin/Shop 共用；未配置返回空串） */
    async getReturnAddress(ctx: RequestContext): Promise<string> {
        const repo = this.connection.getRepository(ctx, Channel);
        const channel = await repo.findOne({ where: { id: ctx.channelId as any } });
        return (channel?.customFields as any)?.afterSalesReturnAddress ?? '';
    }

    /** 写当前渠道售后寄回地址（走 ChannelService.update，免开 ChannelService 权限） */
    async updateReturnAddress(ctx: RequestContext, address: string): Promise<boolean> {
        if (!this.channelService) throw new Error('ChannelService not initialized');
        await this.channelService.update(ctx, {
            id: ctx.channelId as any,
            customFields: { afterSalesReturnAddress: address },
        } as any);
        return true;
    }
```

  import 区加 `Channel`（from '@vendure/core'）。

- [ ] **Step 2.8: plugin.ts**：
  - import 加 `LanguageCode`（from '@vendure/core'）与 `AfterSalesStateHistory`。
  - `entities: [AfterSalesRequest, AfterSalesStateHistory]`。
  - Shop SDL：在 `type AfterSalesRequest` 的 `orderLine: OrderLine` 之后加：
    ```graphql
                history: [AfterSalesStateHistoryEntry!]!
    ```
    在 `type AfterSalesRequestList` 之前加：
    ```graphql
            type AfterSalesStateHistoryEntry {
                fromState: AfterSalesState
                toState: AfterSalesState!
                operatorUserId: ID
                createdAt: DateTime!
            }
    ```
    Shop `extend type Query` 加 `afterSalesReturnAddress: String!`。
  - Admin SDL：`type AfterSalesRequestAdmin` 的 `customer: Customer` 后加 `history: [AfterSalesStateHistoryEntry!]!`；`type AfterSalesRequestAdminList` 前加：
    ```graphql
            type AfterSalesStateHistoryEntry {
                fromState: String
                toState: String!
                operatorUserId: ID
                createdAt: DateTime!
            }

            type AfterSalesBatchResult {
                id: ID!
                success: Boolean!
                state: String
                message: String
            }
    ```
    Admin `extend type Query` 加：
    ```graphql
                afterSalesRequestAdmin(id: ID!): AfterSalesRequestAdmin
                afterSalesReturnAddress: String!
    ```
    Admin `extend type Mutation` 加：
    ```graphql
                batchApproveAfterSalesRequests(ids: [ID!]!): [AfterSalesBatchResult!]!
                batchRejectAfterSalesRequests(ids: [ID!]!, reason: String!): [AfterSalesBatchResult!]!
                updateAfterSalesReturnAddress(address: String!): Boolean!
    ```
  - `configuration` 回调 Order 分支后追加 Channel customField：
    ```ts
            Channel: [
                ...(config.customFields?.Channel ?? []),
                {
                    name: 'afterSalesReturnAddress',
                    type: 'string',
                    nullable: true,
                    label: [{ languageCode: LanguageCode.zh_Hans, value: '售后寄回地址' }],
                },
            ],
    ```

- [ ] **Step 2.9: admin resolver** 追加：

```ts
    @Query()
    @Allow(Permission.ReadOrder)
    async afterSalesRequestAdmin(@Ctx() ctx: RequestContext, @Args('id') id: number): Promise<any> {
        return this.afterSalesService.findOneForAdmin(ctx, id);
    }

    @Query()
    @Allow(Permission.UpdateOrder)
    async afterSalesReturnAddress(@Ctx() ctx: RequestContext): Promise<string> {
        return this.afterSalesService.getReturnAddress(ctx);
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async updateAfterSalesReturnAddress(@Ctx() ctx: RequestContext, @Args('address') address: string): Promise<boolean> {
        return this.afterSalesService.updateReturnAddress(ctx, address);
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async batchApproveAfterSalesRequests(
        @Ctx() ctx: RequestContext,
        @Args('ids', { type: () => [ID] }) ids: number[],
    ): Promise<any> {
        return this.afterSalesService.batchApprove(ctx, ids);
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async batchRejectAfterSalesRequests(
        @Ctx() ctx: RequestContext,
        @Args('ids', { type: () => [ID] }) ids: number[],
        @Args('reason') reason: string,
    ): Promise<any> {
        return this.afterSalesService.batchReject(ctx, ids, reason);
    }
```
  import 加 `ID`（from '@nestjs/graphql'：`import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';`）。

- [ ] **Step 2.10: shop resolver** 追加：

```ts
    @Query()
    @Allow(Permission.Authenticated)
    async afterSalesReturnAddress(@Ctx() ctx: RequestContext): Promise<string> {
        return this.afterSalesService.getReturnAddress(ctx);
    }
```

- [ ] **Step 2.11: 运行 e2e 全绿**

Run: `cd d:\zhao\vendure\packages\after-sales-plugin; npm run e2e`
Expected: 全部 PASS（含原有 5 个用例）。

- [ ] **Step 2.12: 提交 vendure 仓**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as2-commit.txt" "feat(after-sales): 迭代二期后端——状态历史表/批量操作/退货地址/Admin单查"
git -C d:\zhao\vendure add packages/after-sales-plugin/src/after-sales-state-history.entity.ts packages/after-sales-plugin/src/after-sales-request.entity.ts packages/after-sales-plugin/src/after-sales.service.ts packages/after-sales-plugin/src/plugin.ts packages/after-sales-plugin/src/after-sales-admin.resolver.ts packages/after-sales-plugin/src/after-sales-shop.resolver.ts packages/after-sales-plugin/e2e/after-sales.e2e-spec.ts
git -C d:\zhao\vendure commit -F "$env:TEMP\as2-commit.txt"
```

---

## Task 3: C 端 — gql + 列表加载更多

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\after-sales.gql`
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\after-sales\index.vue`

- [ ] **Step 3.1: after-sales.gql**：`query AfterSalesRequest` 内 fragment 展开后加 history（fragment 本身不动，列表不带 history）：

```graphql
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
```
  并在文件末尾加：

```graphql
query AfterSalesReturnAddress {
  afterSalesReturnAddress
}
```

- [ ] **Step 3.2: 列表页 index.vue script 改造**：
  - 删除 `useAsyncGql`/`refresh`/`listData`/`requests`/`truncated`；改为：

```ts
const PAGE_SIZE = 20;
const requests = ref<any[]>([]);
const totalItems = ref(0);
const loadingMore = ref(false);
const loadMoreError = ref(false);
const hasMore = computed(() => requests.value.length < totalItems.value);
const shownText = computed(() =>
  t("messages.afterSales.shownCount")
    .replace("{n}", String(requests.value.length))
    .replace("{m}", String(totalItems.value)),
);

async function loadFirst() {
  listError.value = false;
  try {
    const res = await GqlMyAfterSalesRequests({ options: { take: PAGE_SIZE, skip: 0 } });
    requests.value = (res?.myAfterSalesRequests?.items ?? []) as any[];
    totalItems.value = res?.myAfterSalesRequests?.totalItems ?? 0;
  } catch {
    listError.value = true;
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  loadMoreError.value = false;
  try {
    const res = await GqlMyAfterSalesRequests({ options: { take: PAGE_SIZE, skip: requests.value.length } });
    const items = (res?.myAfterSalesRequests?.items ?? []) as any[];
    requests.value = requests.value.concat(items);
    totalItems.value = res?.myAfterSalesRequests?.totalItems ?? totalItems.value;
  } catch {
    loadMoreError.value = true; // 保留已加载内容，行内重试
  } finally {
    loadingMore.value = false;
  }
}

async function load() {
  await loadFirst();
}
```
  `matched` computed 中 `requests.value` 引用不变（requests 现为 ref，模板自动解包；computed 内已是 `.value`）。删除 `truncated` 相关。

- [ ] **Step 3.3: 模板改造**：`AfterSalesCard` 列表后、`onlyRecent100` 段删除，替换为：

```html
    <!-- 加载更多 -->
    <div v-if="hasMore" class="mt-6 text-center">
      <p v-if="loadMoreError" class="mb-2 text-xs text-error">
        {{ t("messages.afterSales.loadMoreFailed") }}
      </p>
      <UButton
        variant="soft"
        :loading="loadingMore"
        :label="loadMoreError ? t('messages.afterSales.retry') : t('messages.afterSales.loadMore')"
        @click="loadMore"
      />
    </div>
    <p v-else-if="requests.length" class="mt-6 text-center text-xs text-neutral-400">
      {{ t("messages.afterSales.allLoaded") }}
    </p>
    <p v-if="requests.length" class="mt-2 text-center text-xs text-neutral-400">{{ shownText }}</p>
```

- [ ] **Step 3.4: 构建/类型检查**

Run: `cd d:\zhao\nshop; npm run build` 或项目现有 dev 校验命令（若全量构建过重则 `npx nuxi typecheck` 或跑 dev 页面冒烟）。
Expected: 无类型错误（GqlMyAfterSalesRequests 已生成）。

- [ ] **Step 3.5: 提交 nshop**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as2-commit.txt" "feat(after-sales): C端列表加载更多分页 + 详情history/地址query"
git -C d:\zhao\nshop add layers/base/gql/queries/after-sales.gql layers/base/app/pages/account/after-sales/index.vue
git -C d:\zhao\nshop commit -F "$env:TEMP\as2-commit.txt"
```

---

## Task 4: C 端 — 详情页时间线时间 + 地址卡

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesTimeline.vue`
- Modify: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesNextStep.vue`
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\after-sales\[id].vue`
- Modify: `d:\zhao\nshop\layers\base\app\composables\useAfterSales.ts`

- [ ] **Step 4.1: AfterSalesTimeline.vue 接 history**：
  - `TimelineRequest` 接口加：
    ```ts
      history?: { fromState?: string | null; toState: string; createdAt: string }[] | null;
    ```
  - props 改为 `defineProps<{ request: TimelineRequest; returnAddress?: string | null }>();`
  - `fmt` 下加短格式：
    ```ts
    function fmtShort(value?: string | null): string | null {
      if (!value) return null;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      const p = (n: number) => String(n).padStart(2, "0");
      return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    /** 节点精确时间：取该状态最后一次历史行 */
    function historyTime(state: string): string | null {
      const rows = (props.request.history ?? []).filter((h) => h.toState === state);
      return rows.length ? fmtShort(rows[rows.length - 1].createdAt) : null;
    }
    ```
  - `nodes` computed 内每节点 time 逻辑改为：
    ```ts
    let time: string | null = null;
    const ht = historyTime(state);
    if (state === "Pending") time = ht ?? (r.createdAt ? fmt(r.createdAt) : null);
    else if (state === "Refunded") time = ht ?? (r.refundedAt ? fmt(r.refundedAt) : null);
    else if (ht) time = ht;
    if (!time && isCurrent && r.updatedAt) time = fmt(r.updatedAt);
    ```
    `timeIsRecent` 改为 `isCurrent && !!r.updatedAt && !ht`。
  - RefundFailed / Rejected / Closed 追加节点：`time: historyTime("RefundFailed") ?? fmt(r.updatedAt)`（Rejected/Closed 同理替换）。
  - Returning 节点 detail：地址卡存在时追加提示。`detail` 计算改为：
    ```ts
    detail:
      state === "Returning" && (r.returnCarrier || r.returnTrackingNo)
        ? `${r.returnCarrier ?? ""} ${r.returnTrackingNo ?? ""}`.trim()
        : state === "Approved" && props.returnAddress
          ? t("messages.afterSales.returnAddressSeeAbove")
          : null,
    ```

- [ ] **Step 4.2: AfterSalesNextStep.vue 加地址卡插槽**：template 末尾（`</p>` 后）加：

```html
    <slot />
```

- [ ] **Step 4.3: useAfterSales.ts 加地址读取**（return 语句前）：

```ts
  /** 读当前店铺售后寄回地址（未配置返回空串） */
  async function fetchReturnAddress(): Promise<string> {
    try {
      const res = await GqlAfterSalesReturnAddress();
      return res?.afterSalesReturnAddress ?? "";
    } catch {
      return "";
    }
  }
```
  return 改为 `return { loading, error, createRequest, cancelRequest, updateTracking, uploadEvidence, fetchReturnAddress };`

- [ ] **Step 4.4: [id].vue 地址卡 + 传参**：
  - script：`const { cancelRequest, fetchReturnAddress } = useAfterSales();`
  - onMounted 内并行拉地址：
    ```ts
    if (request.value?.state === "Approved") {
      void fetchReturnAddress().then((a) => (returnAddress.value = a));
    }
    ```
  - 顶部加 `const returnAddress = ref("");` 与复制函数：
    ```ts
    const toast = useToast();
    async function copyReturnAddress() {
      try {
        await navigator.clipboard.writeText(returnAddress.value);
        toast.add({ title: t("messages.afterSales.copied"), color: "success" });
      } catch {
        /* 剪贴板不可用忽略 */
      }
    }
    ```
  - 模板 `<AfterSalesNextStep :state="request.state" />` 改为：
    ```html
    <AfterSalesNextStep :state="request.state">
      <div
        v-if="returnAddress"
        class="mt-3 flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div class="min-w-0">
          <p class="text-xs text-neutral-500">{{ t("messages.afterSales.returnAddress") }}</p>
          <p class="mt-0.5 text-sm break-all">{{ returnAddress }}</p>
        </div>
        <UButton size="xs" variant="soft" icon="i-lucide-copy" :label="t('messages.afterSales.copyAddress')" @click="copyReturnAddress" />
      </div>
    </AfterSalesNextStep>
    ```
  - `<AfterSalesTimeline :request="request" />` 改为 `<AfterSalesTimeline :request="request" :return-address="returnAddress" />`

- [ ] **Step 4.5: 提交 nshop**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as2-commit.txt" "feat(after-sales): C端详情时间线逐节点时间 + Approved 寄回地址卡"
git -C d:\zhao\nshop add layers/base/app/components/afterSales/AfterSalesTimeline.vue layers/base/app/components/afterSales/AfterSalesNextStep.vue layers/base/app/pages/account/after-sales/[id].vue layers/base/app/composables/useAfterSales.ts
git -C d:\zhao\nshop commit -F "$env:TEMP\as2-commit.txt"
```

---

## Task 5: C 端 i18n 12 包

**Files:**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts` 及其余 11 包（bg-BG/de-DE/en-US/es-ES/fa-IR/fr-FR/it-IT/ja-JP/ko-KR/pt-BR/ru-RU）

- [ ] **Step 5.1: zh-CN.ts** `afterSales` 块内（`onlyRecent100` 行之后）追加：

```ts
      loadMore: "加载更多",
      loadMoreFailed: "加载失败，请重试",
      allLoaded: "已全部加载",
      shownCount: "已显示 {n} / {m} 条",
      returnAddress: "寄回地址",
      copyAddress: "复制",
      copied: "已复制",
      returnAddressSeeAbove: "寄回地址见上方引导",
```

- [ ] **Step 5.2: 其余 11 包**：各文件 `afterSales` 块内追加同 key 英文文案（缺失回退中文，merge.ts 兜底）：

```ts
      loadMore: "Load more",
      loadMoreFailed: "Failed to load, tap to retry",
      allLoaded: "All loaded",
      shownCount: "Showing {n} / {m}",
      returnAddress: "Return address",
      copyAddress: "Copy",
      copied: "Copied",
      returnAddressSeeAbove: "See return address above",
```

- [ ] **Step 5.3: 提交**

```powershell
git -C d:\zhao\nshop add layers/base/i18n/locales
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as2-commit.txt" "feat(after-sales): C端i18n 12包同步分页/地址卡词条"
git -C d:\zhao\nshop commit -F "$env:TEMP\as2-commit.txt"
```

---

## Task 6: web-admin — apis 封装

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\afterSale.ts`

- [ ] **Step 6.1: `AfterSaleRow` 接口加 `history`**：

```ts
  history?: { fromState: string | null; toState: string; createdAt: string }[] | null;
```

- [ ] **Step 6.2: 文件末尾追加**：

```ts
// ---- 迭代二期：单查 / 批量 / 退货地址 ----

export interface AfterSaleBatchResult {
  id: string;
  success: boolean;
  state?: string | null;
  message?: string | null;
}

/** 售后详情 Admin 单查（含逐节点 history） */
export async function fetchAfterSaleAdmin(id: string): Promise<AfterSaleRow | null> {
  const { afterSalesRequestAdmin } = await getAdminClient().request<{ afterSalesRequestAdmin: AfterSaleRow }>(
    `query AfterSaleAdmin($id: ID!) {
      afterSalesRequestAdmin(id: $id) {
        ${AFTER_SALE_FIELDS}
        history { fromState toState createdAt }
      }
    }`,
    { id },
  );
  return afterSalesRequestAdmin ?? null;
}

/** 批量同意（上限 50，后端逐条返回结果） */
export async function batchApproveAfterSales(ids: string[]): Promise<AfterSaleBatchResult[]> {
  const { batchApproveAfterSalesRequests } = await getAdminClient().request<{
    batchApproveAfterSalesRequests: AfterSaleBatchResult[];
  }>(
    `mutation BatchApproveAfterSales($ids: [ID!]!) {
      batchApproveAfterSalesRequests(ids: $ids) { id success state message }
    }`,
    { ids },
  );
  return batchApproveAfterSalesRequests ?? [];
}

/** 批量拒绝（整批共用 reason） */
export async function batchRejectAfterSales(ids: string[], reason: string): Promise<AfterSaleBatchResult[]> {
  const { batchRejectAfterSalesRequests } = await getAdminClient().request<{
    batchRejectAfterSalesRequests: AfterSaleBatchResult[];
  }>(
    `mutation BatchRejectAfterSales($ids: [ID!]!, $reason: String!) {
      batchRejectAfterSalesRequests(ids: $ids, reason: $reason) { id success state message }
    }`,
    { ids, reason },
  );
  return batchRejectAfterSalesRequests ?? [];
}

/** 读当前渠道售后寄回地址（未配置返回空串） */
export async function fetchReturnAddress(): Promise<string> {
  const { afterSalesReturnAddress } = await getAdminClient().request<{ afterSalesReturnAddress: string }>(
    `query AfterSalesReturnAddress { afterSalesReturnAddress }`,
  );
  return afterSalesReturnAddress ?? '';
}

/** 写当前渠道售后寄回地址 */
export async function updateReturnAddress(address: string): Promise<boolean> {
  const { updateAfterSalesReturnAddress } = await getAdminClient().request<{ updateAfterSalesReturnAddress: boolean }>(
    `mutation UpdateAfterSalesReturnAddress($address: String!) {
      updateAfterSalesReturnAddress(address: $address)
    }`,
    { address },
  );
  return updateAfterSalesReturnAddress;
}
```

- [ ] **Step 6.3: 提交**

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as2-commit.txt" "feat(after-sale): 后台api封装——Admin单查/批量/退货地址"
git -C d:\zhao\vshop add web-admin/src/apis/afterSale.ts
git -C d:\zhao\vshop commit -F "$env:TEMP\as2-commit.txt"
```
（注意 vshop 仓根在 `d:\zhao\vshop`，路径以实际 git root 为准。）

---

## Task 7: web-admin — 列表页批量条 + 地址弹窗 + CSV 导出

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\after-sale\list\index.vue`

- [ ] **Step 7.1: script 增加 import 与状态**：

```ts
import { batchApproveAfterSales, batchRejectAfterSales, fetchReturnAddress, updateReturnAddress } from '../../../apis/afterSale';
import { downloadCsv, fmtDateTime } from '../../../utils/csv';

const selected = ref<string[]>([]);
const BATCH_LIMIT = 50;

function togglePick(id: string) {
  const i = selected.value.indexOf(id);
  if (i >= 0) selected.value.splice(i, 1);
  else if (selected.value.length >= BATCH_LIMIT) toast(locale.t('afterSale.list.batchLimit'));
  else selected.value.push(id);
}

// 退货地址弹窗
const addressOpen = ref(false);
const addressText = ref('');
const addressSaving = ref(false);
async function onOpenAddress() {
  addressText.value = await fetchReturnAddress();
  addressOpen.value = true;
}
async function onSaveAddress() {
  addressSaving.value = true;
  try {
    await updateReturnAddress(addressText.value.trim());
    uni.showToast({ title: locale.t('afterSale.list.addressSaved'), icon: 'success' });
    addressOpen.value = false;
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.list.opFailed')); // 弹窗不关闭、内容保留
  } finally {
    addressSaving.value = false;
  }
}

// 批量操作
function summarize(results: { success: boolean }[]): string {
  const ok = results.filter((r) => r.success).length;
  const fail = results.length - ok;
  return fail ? locale.t('afterSale.list.batchPartial').replace('{ok}', String(ok)).replace('{fail}', String(fail)) : locale.t('afterSale.list.batchDone').replace('{n}', String(ok));
}
function onBatchApprove() {
  const ids = selected.value;
  if (!ids.length) return;
  uni.showModal({
    title: locale.t('afterSale.list.batchApproveTitle'),
    content: locale.t('afterSale.list.batchApproveContent').replace('{n}', String(ids.length)),
    success: async (res) => {
      if (!res.confirm) return;
      try {
        const results = await batchApproveAfterSales(ids);
        toast(summarize(results));
        selected.value = [];
        await reload();
      } catch (e: any) { toast(e?.message || locale.t('afterSale.list.opFailed')); }
    },
  });
}
function onBatchReject() {
  const ids = selected.value;
  if (!ids.length) return;
  uni.showModal({
    title: locale.t('afterSale.list.batchRejectTitle'),
    editable: true,
    placeholderText: locale.t('afterSale.detail.rejectReasonPlaceholder'),
    success: async (res) => {
      if (!res.confirm) return;
      const reason = (res.content || '').trim();
      if (!reason) { toast(locale.t('afterSale.detail.rejectReasonRequired')); return; }
      try {
        const results = await batchRejectAfterSales(ids, reason);
        toast(summarize(results));
        selected.value = [];
        await reload();
      } catch (e: any) { toast(e?.message || locale.t('afterSale.list.opFailed')); }
    },
  });
}

// CSV 导出（当前筛选，上限 500 条）
async function onExport() {
  try {
    const filter = combinedFilter();
    const sort = { [sortBy.value]: 'DESC' };
    const all: AfterSaleRow[] = [];
    for (let skip = 0; skip < 500; skip += 100) {
      const { items, total } = await fetchAfterSalePage({ skip, take: 100, filter, sort });
      all.push(...items);
      if (items.length === 0 || all.length >= total) break;
    }
    if (!all.length) { toast(locale.t('afterSale.list.exportEmpty')); return; }
    if (all.length >= 500) toast(locale.t('afterSale.list.exportTruncated'));
    const headers = ['售后单号', '订单号', '类型', '状态', '退款金额', '商品', '顾客', '手机', '申请时间'];
    const rows = all.slice(0, 500).map((a) => [
      a.id,
      a.order?.code || a.orderId,
      AFTER_SALE_TYPES[a.type] || a.type,
      st(a).label,
      money(a.refundAmount),
      productName(a),
      [a.customer?.firstName, a.customer?.lastName].filter(Boolean).join(' '),
      a.customer?.phoneNumber || '',
      fmtTime(a.createdAt),
    ]);
    downloadCsv(`after-sales-${fmtDateTime(new Date()).replace(/[: -]/g, '')}.csv`, headers, rows);
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.list.opFailed'));
  }
}
```

- [ ] **Step 7.2: 模板——卡片加复选框**。`.row` 内 `code` 文本前加（`@tap.stop` 防触发 goDetail）：

```html
        <view class="pickrow">
          <view class="pick" :class="{ on: selected.includes(a.id) }" @tap.stop="togglePick(a.id)">✓</view>
          <text class="code">{{ $t('afterSale.list.afterSalePrefix') }}{{ a.id }} · {{ $t('afterSale.list.orderPrefix') }}{{ a.order?.code || a.orderId }}</text>
        </view>
```
  样式追加（`.card` 内）：

```scss
    .pickrow { display: flex; align-items: center; gap: 12rpx; flex: 1; min-width: 0;
      .pick { width: 40rpx; height: 40rpx; border-radius: 8rpx; border: 2rpx solid $wa-muted;
        display: flex; align-items: center; justify-content: center; font-size: 24rpx; color: transparent; flex-shrink: 0;
        &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; } } }
```

- [ ] **Step 7.3: 模板——工具栏按钮行**（`.filters` 块后追加）：

```html
    <view class="tools">
      <button class="tool" @tap="onOpenAddress">{{ $t('afterSale.list.returnAddress') }}</button>
      <button class="tool" @tap="onExport">{{ $t('afterSale.list.export') }}</button>
    </view>
```
  样式：

```scss
  .tools { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    .tool { margin: 0; padding: 0 24rpx; height: 60rpx; line-height: 60rpx; font-size: 26rpx;
      border-radius: $wa-radius; background: $wa-card; color: $wa-ink; } }
```

- [ ] **Step 7.4: 模板——批量操作条**（`<view style="height: 160rpx" />` 前）：

```html
    <view class="batchbar" v-if="selected.length">
      <text class="bcount">{{ $t('afterSale.list.selectedCount').replace('{n}', String(selected.length)) }}</text>
      <button class="bop" @tap="onBatchApprove">{{ $t('afterSale.list.batchApprove') }}</button>
      <button class="bop" @tap="onBatchReject">{{ $t('afterSale.list.batchReject') }}</button>
      <button class="bop ghost" @tap="selected = []">{{ $t('afterSale.list.batchCancel') }}</button>
    </view>
```
  样式：

```scss
  .batchbar { position: fixed; left: 24rpx; right: 24rpx; bottom: 140rpx; z-index: 20;
    display: flex; align-items: center; gap: 16rpx; padding: 20rpx 24rpx;
    background: $wa-card; border-radius: $wa-radius; box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.12);
    .bcount { font-size: 26rpx; color: $wa-ink; flex: 1; }
    .bop { margin: 0; padding: 0 20rpx; height: 60rpx; line-height: 60rpx; font-size: 24rpx;
      border-radius: $wa-radius; background: $wa-accent; color: #fff;
      &.ghost { background: $wa-bg; color: $wa-ink; } } }
```

- [ ] **Step 7.5: 模板——退货地址弹窗**（page 根内末尾）：

```html
    <view class="mask" v-if="addressOpen" @tap="addressOpen = false">
      <view class="modal" @tap.stop>
        <text class="mtitle">{{ $t('afterSale.list.returnAddress') }}</text>
        <textarea class="marea" v-model="addressText" :placeholder="$t('afterSale.list.returnAddressPlaceholder')" :maxlength="500" />
        <view class="mbtns">
          <button class="mbtn" @tap="addressOpen = false">{{ $t('afterSale.list.addressCancel') }}</button>
          <button class="mbtn main" :disabled="addressSaving" @tap="onSaveAddress">{{ $t('afterSale.list.addressSave') }}</button>
        </view>
      </view>
    </view>
```
  样式：

```scss
  .mask { position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, 0.45);
    display: flex; align-items: center; justify-content: center; padding: 48rpx;
    .modal { width: 100%; background: $wa-card; border-radius: $wa-radius; padding: 32rpx;
      .mtitle { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; margin-bottom: 20rpx; }
      .marea { width: 100%; height: 200rpx; background: $wa-bg; border-radius: $wa-radius; padding: 20rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; }
      .mbtns { display: flex; gap: 16rpx; margin-top: 24rpx;
        .mbtn { flex: 1; margin: 0; height: 72rpx; line-height: 72rpx; font-size: 28rpx;
          border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
          &.main { background: $wa-accent; color: #fff; } } } } }
```

- [ ] **Step 7.6: 提交**（同 Task 6 模式，message：`feat(after-sale): 列表页批量操作/退货地址弹窗/CSV导出`）

---

## Task 8: web-admin — 详情页单查 + 时间线 history

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\after-sale\detail\index.vue`

- [ ] **Step 8.1: import 改**：`fetchAfterSale` → `fetchAfterSaleAdmin`（保留其余）。`refresh()` 与 `onLoad` 中 `fetchAfterSale(...)` 均改为 `fetchAfterSaleAdmin(...)`。

- [ ] **Step 8.2: timeline computed 接 history**。`TIMELINE_KEYS.map` 内 `time` 改为：

```ts
    time: (() => {
      const rows = (r.history ?? []).filter((h) => h.toState === k);
      if (rows.length) return fmtTime(rows[rows.length - 1].createdAt);
      return i === 0 ? fmtTime(r.createdAt) : i === idx ? fmtTime(r.updatedAt) : null;
    })(),
```
  追加节点（RefundFailed/Rejected/Closed）`time: fmtTime(r.updatedAt)` 改为：

```ts
time: (() => {
  const key = r.state;
  const rows = (r.history ?? []).filter((h) => h.toState === key);
  return rows.length ? fmtTime(rows[rows.length - 1].createdAt) : fmtTime(r.updatedAt);
})(),
```

- [ ] **Step 8.3: 提交**（message：`feat(after-sale): 详情页改Admin单查 + 时间线逐节点时间`）

---

## Task 9: web-admin i18n 双包

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 9.1: zh-Hans.json `afterSale.list` 内追加**：

```json
      "selectedCount": "已选 {n} 项",
      "batchApprove": "批量同意",
      "batchReject": "批量拒绝",
      "batchCancel": "取消",
      "batchLimit": "单次最多选择 50 项",
      "batchApproveTitle": "批量同意",
      "batchApproveContent": "确认批量同意 {n} 个售后单？",
      "batchRejectTitle": "批量拒绝",
      "batchPartial": "成功 {ok} 条，失败 {fail} 条",
      "batchDone": "批量操作成功 {n} 条",
      "returnAddress": "退货地址",
      "returnAddressPlaceholder": "请输入售后寄回地址（顾客端审核通过后展示）",
      "addressSave": "保存",
      "addressCancel": "取消",
      "addressSaved": "退货地址已保存",
      "export": "导出 CSV",
      "exportEmpty": "无可导出数据",
      "exportTruncated": "已达导出上限 500 条，仅导出前 500 条"
```

- [ ] **Step 9.2: en.json 同位置追加**：

```json
      "selectedCount": "{n} selected",
      "batchApprove": "Approve all",
      "batchReject": "Reject all",
      "batchCancel": "Cancel",
      "batchLimit": "Up to 50 items per batch",
      "batchApproveTitle": "Batch approve",
      "batchApproveContent": "Approve {n} after-sales requests?",
      "batchRejectTitle": "Batch reject",
      "batchPartial": "{ok} succeeded, {fail} failed",
      "batchDone": "{n} requests processed",
      "returnAddress": "Return address",
      "returnAddressPlaceholder": "Enter the return shipping address (shown to customers after approval)",
      "addressSave": "Save",
      "addressCancel": "Cancel",
      "addressSaved": "Return address saved",
      "export": "Export CSV",
      "exportEmpty": "No data to export",
      "exportTruncated": "Export limit of 500 reached, only first 500 exported"
```

- [ ] **Step 9.3: 提交**（message：`feat(after-sale): 后台i18n批量/地址/导出词条（zh-Hans/en）`）

---

## Task 10: 手机截图 + 操作手册「五期」章节

**Files:**
- Create: `d:\zhao\nshop\docs\manual\shots\2026-10-07-aftersales-iteration2\*.png`
- Modify: 手册文件（在 `d:\zhao\nshop\docs\superpowers\manual\` 下找售后操作手册，追加「五期：批量操作与迭代二期」章节）

- [ ] **Step 10.1: 启动本地环境**（nshop dev + web-admin dev + vendure 后端），用 Playwright **390×844 dpr=2** 截：
  - C 端：① 列表加载更多（含底部已显示 n/m）② 详情 Approved 地址卡 ③ 详情时间线逐节点时间
  - 后台（web-admin H5 移动视口）：④ 列表勾选批量条 ⑤ 退货地址弹窗 ⑥ 详情时间线时间
- [ ] **Step 10.2: 手册追加五期章节**：功能说明 + 六张截图 + 测试用例表（批量全成功/部分失败/超50、历史断言、地址读写回环、加载更多累计、导出 0 条/500 条上限）。
- [ ] **Step 10.3: 提交 nshop**（message：`docs(after-sales): 五期操作手册 + 手机截图`）

---

## Task 11: 三仓收口（提交→推送→部署）

- [ ] **Step 11.1: vendure**：`cd d:\zhao\vendure\packages\after-sales-plugin; npm run build`（重建 lib），`git add packages/after-sales-plugin/lib`（若有变化）追加提交 lib 产物；推送。
- [ ] **Step 11.2: vendure 服务器部署**：ssh 执行 `git pull --ff-only && pm2 restart <vendure进程>`（base64 编码整段传递，见 PowerShell 规范），`sleep 1` 后 curl 验证 admin/shop API 存活。
- [ ] **Step 11.3: nshop**：`node scripts/deploy.mjs`（本地构建产物 scp）。
- [ ] **Step 11.4: web-admin**：`node scripts/deploy.mjs`。
- [ ] **Step 11.5: 线上验收**：C 端列表加载更多/详情地址卡/时间线时间；后台批量同意、地址弹窗、导出 CSV、详情单查；全部以手机视口截图留档。

---

## Self-Review 记录

- 规格覆盖：A（Task 2/6/7）、B（Task 2/4/8）、C（Task 2/4/7）、D（Task 3）✔；i18n（Task 5/9）✔；e2e（Task 1/2）✔；截图手册（Task 10）✔；部署（Task 11）✔。
- 类型一致性：`AfterSalesBatchResult { id success state message }` 三端一致；history 字段名/结构三端一致；`fetchAfterSaleAdmin`/`batchApproveAfterSales`/`fetchReturnAddress` 命名前后一致。
- 占位符：无 TBD；Task 10 手册文件名以现场实际为准（spec 允许）。
