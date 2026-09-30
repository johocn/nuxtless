# 售后服务页面优化（nshop C 端 + web-admin 后台）— 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已定稿设计文档，把 C 端（nshop）与后台（web-admin）的售后服务页面从「能用」提升到「好找、看得懂、看得全、处理快」，并在过程中根除后台动作可用性与服务端状态机不一致的缺陷。

**Architecture:** 分三步推进 —— **R0 后端最小增强**（Admin 类型补 3 个只读嵌套字段 + 新增 1 个最小顾客端上传端点，零新业务逻辑）→ **一期 C 端**（状态工具层补 `RefundFailed` 与 5 页签，列表页本地搜索/排序，详情页引导条 + 纵向时间线 + 吸底动作，申请表单类型联动 + 元金额 + 凭证上传）→ **二期后台**（动作可用性收敛为 `constants/afterSaleActions.ts` 单一来源，列表页 8 页签 + 卡上操作，详情页补顾客/商品/凭证/时间线 + 吸底）。每端「动作可用性判断」只保留一处纯函数入口。

**Tech Stack:** Vendure 3.6.4（NestJS + graphql-tag SDL + vitest e2e）、Nuxt 3 `layers/base`（Vue 3 + Nuxt UI + nuxt-graphql-client + vitest）、uni-app H5（web-admin）、Playwright（手机视口截图）。

**唯一输入（勿重新调研设计）：** `d:\zhao\nshop\docs\superpowers\specs\2026-09-30-aftersales-page-optimization-design.md`
**参考先例：** `d:\zhao\nshop\docs\superpowers\plans\2026-08-18-nshop-after-sales.md`

**约定：** 仓库 `d:\zhao\nshop`（分支 `nshop`）、`d:\zhao\vendure`（分支以现状为准）、`d:\zhao\vshop\web-admin`；PowerShell 环境（无 heredoc、`&&` 不可用，改用 `;`）；`git add` 精确枚举文件，**禁 `git add -A` / `git add .`**；`_` 前缀脚本与 `scripts/shots/` 已被 gitignore，仅本地留存。

**已核实的关键事实（勿再假设）：**
1. 插件状态机 `STATE_TRANSITIONS` 在 `src/types.ts` L17-25，共 8 态含 `RefundFailed`。
2. Vendure 3.6.4 **没有 `AssetService.createFromBuffer`**，只有 `createFromFileStream(stream: Readable, filePath: string, ctx?)`。
3. `Asset.preview` 存的是相对 identifier；**只有 GraphQL 返回类型为 `Asset` 的字段**才会被 `AssetInterceptorPlugin` 补成绝对 URL。`[String!]!` 不会被补 → 上传端点必须自行调用 `assetStorageStrategy.toAbsoluteUrl(ctx.req, preview)`。
4. `RequestContext` 有公开 getter `req: Request | undefined`。
5. Admin 类型 `AfterSalesRequestAdmin` 无 `order`/`orderLine`/`customer`；`AfterSalesService.findAll()` 已 `relations: ['order','orderLine','customer','channels']`。
6. 后台 `filter.id` / `filter.orderId` 后端为 `String` 类型（GraphQL 变量必须声明 `$id: String!`）。
7. C 端 i18n 是「zh-CN 为完整基底 + 其余 11 包部分覆盖」（`merge.ts` 的 `zhFallbackLocale`）→ 新词条必须进 `zh-CN.ts`，其余 11 包按需翻译。

---

## 文件结构

### 后端 `d:\zhao\vendure\packages\after-sales-plugin`

**改**
- `src/plugin.ts` — Admin 类型补 3 个可空关系字段；Shop 补上传 mutation SDL
- `src/after-sales-shop.resolver.ts` — 新增上传 mutation resolver
- `src/after-sales.service.ts` — 新增 `uploadEvidence()` + `AssetService`/`ConfigService` 注入
- `e2e/after-sales.e2e-spec.ts` — 新增 2 个测试

（`src/after-sales-request.entity.ts` **不改**：`order` / `orderLine` / `customer` 关系已齐备。）

### C 端 `d:\zhao\nshop`（均在 `layers/base/`）

**改**
- `gql/queries/after-sales.gql` — fragment 补 3 字段 + 上传 mutation
- `app/utils/after-sales-state.ts` — 补 `RefundFailed`、5 页签、进度、引导文案、动作判断
- `app/composables/useAfterSales.ts` — 新增 `uploadEvidence`
- `app/components/afterSales/AfterSalesCard.vue` — 补申请时间 / 进度 / 下一步动作
- `app/components/afterSales/AfterSalesCreateModal.vue` — 重写（类型联动 / 元金额 / 上传 / 重置 / 校验）
- `app/pages/account/after-sales/index.vue` — 5 页签 + 本地搜索/排序 + 空态三分
- `app/pages/account/after-sales/[id].vue` — 引导条 + 时间线 + 吸底动作
- `i18n/locales/zh-CN.ts` + 其余 11 个语言包 + `en-US.ts`

**新**
- `app/components/afterSales/EvidenceUploader.vue` — 凭证图上传（压缩 + 四态格子）
- `app/components/afterSales/AfterSalesTimeline.vue` — 纵向时间线
- `app/components/afterSales/AfterSalesNextStep.vue` — 「你需要做什么」引导条
- `app/utils/__tests__/after-sales-state.spec.ts` — 状态工具层单测

### 后台 `d:\zhao\vshop\web-admin`

**改**
- `src/apis/afterSale.ts` — `AFTER_SALE_FIELDS` 补 `order` / `orderLine` / `customer` + `AfterSaleRow` 扩类型
- `src/pages/after-sale/list/index.vue` — 8 页签 + 卡片补信息 + 卡上操作 + 筛选折叠
- `src/pages/after-sale/detail/index.vue` — 修正动作可用性 + 顾客/商品/凭证/时间线 + 吸底
- `src/locale/zh-Hans.json`、`src/locale/en.json` — 同步新增词条

**新**
- `src/constants/afterSaleActions.ts` — 动作可用性 + 状态标签/色的单一来源

### 交付物（详见 Task 16）
- `d:\zhao\nshop\docs\superpowers\manual\aftersales-page-optimization\index.html`（操作手册 + 测试用例）
- `d:\zhao\nshop\docs\superpowers\manual\aftersales-page-optimization\shots\*.png`（390×844 dpr=2 手机视图截图）
- `d:\zhao\nshop\scripts\_shot_after_sales.py`（C 端截图探针，gitignore 不提交）
- `d:\zhao\vshop\web-admin\scripts\_shot_after_sales_admin.py`（后台截图探针，gitignore 不提交）

---

# 阶段 R0：后端最小增强

### Task 1: R0-1 Admin 类型补只读嵌套字段

**Files:**
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\plugin.ts:86-108`
- Test: `d:\zhao\vendure\packages\after-sales-plugin\e2e\after-sales.e2e-spec.ts`

- [ ] **Step 1: 先写失败的 e2e 断言**

在 `e2e/after-sales.e2e-spec.ts` 的 `describe` 内、最后一个 `it(...)` 之后追加：

```ts
    it('Admin 类型暴露 order / orderLine / customer 只读嵌套字段', async () => {
        // 复用第 1 个用例已创建的售后单：列表取一条即可（findAll 已预加载 relations）
        const res = await adminClient.query(gql`
            query {
                afterSalesRequests(options: { take: 1 }) {
                    items {
                        id
                        state
                        order { id code }
                        orderLine { id quantity }
                        customer { id firstName lastName }
                    }
                }
            }
        `);
        const row = res.afterSalesRequests.items[0];
        expect(row).toBeDefined();
        expect(row.order?.code).toBeTruthy();
        expect(row.orderLine?.id).toBeTruthy();
        expect(row.customer?.id).toBeTruthy();
    }, TEST_SETUP_TIMEOUT_MS);
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm e2e -t "Admin 类型暴露"
```

cwd：`d:\zhao\vendure\packages\after-sales-plugin`

Expected: FAIL，GraphQL 校验报 `Cannot query field "order" on type "AfterSalesRequestAdmin"`。

- [ ] **Step 3: 补 SDL**

在 [plugin.ts](file:///d:/zhao/vendure/packages/after-sales-plugin/src/plugin.ts) 的 `adminApiExtensions.schema` 里，`AfterSalesRequestAdmin` 类型的 `updatedAt: DateTime!` 之后追加三行：

```graphql
                customerId: ID!
                createdAt: DateTime!
                updatedAt: DateTime!
                order: Order
                orderLine: OrderLine
                customer: Customer
            }
```

**必须可空（不加 `!`）**：审批/退款等 mutation 返回实体时未预加载关系，非空字段会触发 `Cannot return null for non-nullable field`。

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm e2e -t "Admin 类型暴露"
```

Expected: PASS。

- [ ] **Step 5: 全量 e2e 回归**

```bash
pnpm e2e
```

Expected: 3 passed（原 2 个 + 新增 1 个）。

- [ ] **Step 6: Commit**

```bash
git add packages/after-sales-plugin/src/plugin.ts packages/after-sales-plugin/e2e/after-sales.e2e-spec.ts
git commit -m "feat(after-sales): Admin 类型补 order/orderLine/customer 只读嵌套字段"
```

cwd：`d:\zhao\vendure`

---

### Task 2: R0-2 最小顾客端凭证上传端点

**Files:**
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\plugin.ts`（Shop SDL 的 `extend type Mutation`）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales.service.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-shop.resolver.ts`
- Test: `d:\zhao\vendure\packages\after-sales-plugin\e2e\after-sales.e2e-spec.ts`

- [ ] **Step 1: 先写失败的 e2e 断言**

在 `e2e/after-sales.e2e-spec.ts` 末尾追加（`1x1 透明 PNG`）：

```ts
    const PNG_1PX =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

    it('uploadAfterSalesEvidence：未登录被拒 / 合法图片返回 URL / 非法类型与超大图片被拒', async () => {
        // 1. 未登录（新开一个匿名 shopClient 状态）
        await shopClient.asAnonymousUser();
        const unauth = await shopClient.query(
            gql`
                mutation {
                    uploadAfterSalesEvidence(images: ["${PNG_1PX}"]) { __typename }
                }
            `,
            { muteError: true } as any,
        );
        expect(unauth.uploadAfterSalesEvidence ?? null).toBeNull();

        // 2. 登录后：合法图片 → 返回 1 条非空 URL
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
        const ok = await shopClient.query(gql`
            mutation {
                uploadAfterSalesEvidence(images: ["${PNG_1PX}"])
            }
        `);
        expect(ok.uploadAfterSalesEvidence).toHaveLength(1);
        expect(typeof ok.uploadAfterSalesEvidence[0]).toBe('string');
        expect(ok.uploadAfterSalesEvidence[0].length).toBeGreaterThan(0);

        // 3. 非法 MIME（gif 不在白名单）
        const badMime = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';
        const mimeRes = await shopClient.query(
            gql`
                mutation {
                    uploadAfterSalesEvidence(images: ["${badMime}"])
                }
            `,
            { muteError: true } as any,
        );
        expect(mimeRes.uploadAfterSalesEvidence ?? null).toBeNull();

        // 4. 单张解码后 > 5MB
        const huge = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1024).toString('base64')}`;
        const bigRes = await shopClient.query(
            gql`
                mutation {
                    uploadAfterSalesEvidence(images: ["${huge}"])
                }
            `,
            { muteError: true } as any,
        );
        expect(bigRes.uploadAfterSalesEvidence ?? null).toBeNull();
    }, TEST_SETUP_TIMEOUT_MS);
```

> 若本仓库的 `SimpleGraphQLClient.query` 不支持 `muteError` 选项，改为 `await expect(shopClient.query(...)).rejects.toThrow()` 的写法（保持「断言被拒」的语义不变）。

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm e2e -t "uploadAfterSalesEvidence"
```

Expected: FAIL，`Cannot query field "uploadAfterSalesEvidence" on type "Mutation"`。

- [ ] **Step 3: 补 SDL**

在 [plugin.ts](file:///d:/zhao/vendure/packages/after-sales-plugin/src/plugin.ts) 的 `shopApiExtensions.schema` 里，`extend type Mutation` 块内 `updateReturnTracking` 之后追加：

```graphql
                updateReturnTracking(id: ID!, trackingNo: String!, carrier: String!): AfterSalesRequest!
                """顾客端上传售后凭证图：入参为 base64 data URL 数组，返回图片 URL 数组（不创建售后单）"""
                uploadAfterSalesEvidence(images: [String!]!): [String!]!
            }
```

- [ ] **Step 4: service 新增 `uploadEvidence()`**

在 [after-sales.service.ts](file:///d:/zhao/vendure/packages/after-sales-plugin/src/after-sales.service.ts) 顶部 import 中补充（与现有 import 合并，勿重复引入）：

```ts
import { Readable } from 'node:stream';
```

在 `@vendure/core` 的 import 列表中追加 `AssetService`、`ConfigService`（保持字母序插入即可）。

类字段区（`private options` 之后）追加：

```ts
    private assetService: AssetService | null = null;
    private configService: ConfigService | null = null;
```

`init(injector)` 内、现有 `try { this.options = ... }` 之后追加：

```ts
        this.assetService = injector.get(AssetService);
        this.configService = injector.get(ConfigService);
```

在 `updateReturnTracking()` 之后、`hydrate()` 之前插入：

```ts
    /** 凭证图白名单 MIME 及其扩展名（扩展名用于 createFromFileStream 判定 MIME） */
    private static readonly EVIDENCE_MIME_EXT: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
    };

    /** 单张凭证图解码后大小上限（5MB），边界校验，非业务规则 */
    private static readonly EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

    /**
     * 顾客端上传售后凭证图。
     * 仅做「边界校验 + 落 Asset」，不创建售后单、不写售后业务数据。
     * 返回绝对值 URL：AssetInterceptorPlugin 只对 GraphQL 类型为 Asset 的字段补绝对前缀，
     * 这里是 [String!]!，必须自行调用 storageStrategy.toAbsoluteUrl（与 Vendure 自身行为一致）。
     */
    async uploadEvidence(ctx: RequestContext, images: string[]): Promise<string[]> {
        if (!ctx.activeUserId) {
            throw new UnauthorizedError();
        }
        if (!Array.isArray(images) || images.length === 0) {
            throw new UserInputError('No evidence image provided');
        }
        if (!this.assetService || !this.configService) {
            throw new Error('AssetService not initialized');
        }
        const urls: string[] = [];
        for (const dataUrl of images) {
            const parsed = AfterSalesService.parseImageDataUrl(dataUrl);
            if (!parsed) {
                throw new UserInputError('Invalid evidence image: only png/jpeg/webp data URL is allowed');
            }
            if (parsed.buffer.length > AfterSalesService.EVIDENCE_MAX_BYTES) {
                throw new UserInputError(
                    `Evidence image too large: ${parsed.buffer.length} bytes exceeds ${AfterSalesService.EVIDENCE_MAX_BYTES} bytes`,
                );
            }
            const filename = `after-sales-evidence-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${parsed.ext}`;
            const asset = await this.assetService.createFromFileStream(Readable.from(parsed.buffer), filename, ctx);
            if (isGraphQlErrorResult(asset)) {
                throw new UserInputError(`Failed to create asset: ${asset.message}`);
            }
            urls.push(this.toAbsoluteAssetUrl(ctx, (asset as any).preview));
        }
        Logger.info(`Uploaded ${urls.length} after-sales evidence image(s) by user ${ctx.activeUserId}`, loggerCtx);
        return urls;
    }

    /** 解析 `data:image/(png|jpeg|webp);base64,xxx`，非法返回 null */
    private static parseImageDataUrl(dataUrl: string): { buffer: Buffer; ext: string } | null {
        if (typeof dataUrl !== 'string') return null;
        const match = /^data:(image\/[a-z+.-]+);base64,([\s\S]+)$/i.exec(dataUrl.trim());
        if (!match) return null;
        const mime = match[1].toLowerCase();
        const ext = AfterSalesService.EVIDENCE_MIME_EXT[mime];
        if (!ext) return null;
        try {
            const buffer = Buffer.from(match[2], 'base64');
            if (buffer.length === 0) return null;
            return { buffer, ext };
        } catch {
            return null;
        }
    }

    /** 与 AssetInterceptorPlugin 同源：用 assetStorageStrategy.toAbsoluteUrl 补绝对前缀 */
    private toAbsoluteAssetUrl(ctx: RequestContext, preview: string | null | undefined): string {
        if (!preview) return '';
        const strategy = this.configService?.assetOptions.assetStorageStrategy as any;
        if (strategy?.toAbsoluteUrl && ctx.req) {
            return strategy.toAbsoluteUrl(ctx.req, preview);
        }
        return preview;
    }
```

- [ ] **Step 5: resolver 新增上传 mutation**

在 [after-sales-shop.resolver.ts](file:///d:/zhao/vendure/packages/after-sales-plugin/src/after-sales-shop.resolver.ts) 的类内、`updateReturnTracking` 之后追加：

```ts
    @Mutation()
    @Allow(Permission.Authenticated)
    async uploadAfterSalesEvidence(@Ctx() ctx: RequestContext, @Args('images') images: string[]): Promise<string[]> {
        return this.afterSalesService.uploadEvidence(ctx, images);
    }
```

- [ ] **Step 6: 运行测试，确认通过**

```bash
pnpm e2e -t "uploadAfterSalesEvidence"
```

Expected: PASS。

> 应急：若因测试环境缺少 asset preview strategy 导致 `createFromFileStream` 抛错，在 e2e 的 `mergeConfig(...)` 里补 `AssetServerPlugin.init({ route: 'assets', assetUploadDir: path.join(__dirname, '__data__/assets') })` 并 `import { AssetServerPlugin } from '@vendure/asset-server-plugin'`，重跑。

- [ ] **Step 7: 全量 e2e + 构建**

```bash
pnpm e2e ; pnpm build
```

Expected: 4 passed；`tsc` 无错误、`lib/` 产出。

- [ ] **Step 8: Commit**

```bash
git add packages/after-sales-plugin/src/plugin.ts packages/after-sales-plugin/src/after-sales.service.ts packages/after-sales-plugin/src/after-sales-shop.resolver.ts packages/after-sales-plugin/e2e/after-sales.e2e-spec.ts
git commit -m "feat(after-sales): 新增顾客端凭证图上传端点 uploadAfterSalesEvidence"
```

cwd：`d:\zhao\vendure`

---

# 阶段一期：C 端（nshop）

### Task 3: 状态工具层（唯一动作判断入口）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\utils\after-sales-state.ts`（整文件替换）
- Test: `d:\zhao\nshop\layers\base\app\utils\__tests__\after-sales-state.spec.ts`（新建）

- [ ] **Step 1: 先写失败的测试**

新建 `layers/base/app/utils/__tests__/after-sales-state.spec.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  AFTER_SALES_TABS,
  AFTER_SALES_ACTIVE_STATES,
  afterSalesNextStep,
  afterSalesPrimaryAction,
  afterSalesProgressIndex,
  afterSalesStateInfo,
  afterSalesTypeLabelKey,
  canApplyAfterSales,
  canCancelAfterSales,
  canFillTracking,
  tabOfAfterSales,
} from "../after-sales-state";

describe("after-sales-state", () => {
  it("5 个页签，默认第一个是「进行中」", () => {
    expect(AFTER_SALES_TABS.map((t) => t.key)).toEqual([
      "ACTIVE",
      "ALL",
      "DONE",
      "REJECTED",
      "CLOSED",
    ]);
  });

  it("进行中收纳 Pending/Approved/Returning/Received/RefundFailed", () => {
    for (const s of ["Pending", "Approved", "Returning", "Received", "RefundFailed"]) {
      expect(AFTER_SALES_ACTIVE_STATES.has(s)).toBe(true);
      expect(tabOfAfterSales(s)).toBe("ACTIVE");
    }
    expect(tabOfAfterSales("Refunded")).toBe("DONE");
    expect(tabOfAfterSales("Rejected")).toBe("REJECTED");
    expect(tabOfAfterSales("Closed")).toBe("CLOSED");
    expect(tabOfAfterSales("WhoKnows")).toBe("ALL");
  });

  it("RefundFailed 有独立文案与 error 色（不再落到 stateUnknown）", () => {
    const info = afterSalesStateInfo("RefundFailed");
    expect(info.labelKey).toBe("messages.afterSales.stateRefundFailed");
    expect(info.color).toBe("error");
  });

  it("进度索引覆盖 8 态", () => {
    expect(afterSalesProgressIndex("Pending")).toBe(0);
    expect(afterSalesProgressIndex("Approved")).toBe(1);
    expect(afterSalesProgressIndex("Returning")).toBe(2);
    expect(afterSalesProgressIndex("Received")).toBe(3);
    expect(afterSalesProgressIndex("Refunded")).toBe(4);
    expect(afterSalesProgressIndex("RefundFailed")).toBe(3);
    expect(afterSalesProgressIndex("Rejected")).toBe(0);
    expect(afterSalesProgressIndex("Closed")).toBe(0);
  });

  it("每个状态都有引导文案", () => {
    for (const s of [
      "Pending",
      "Approved",
      "Returning",
      "Received",
      "Refunded",
      "Rejected",
      "RefundFailed",
      "Closed",
      "WhoKnows",
    ]) {
      expect(afterSalesNextStep(s).titleKey.startsWith("messages.afterSales.next")).toBe(true);
      expect(afterSalesNextStep(s).descKey.startsWith("messages.afterSales.next")).toBe(true);
    }
  });

  it("动作可用性严格对齐服务端：取消仅 Pending，填单仅 Approved", () => {
    expect(canCancelAfterSales("Pending")).toBe(true);
    expect(canCancelAfterSales("Approved")).toBe(false);
    expect(canFillTracking("Approved")).toBe(true);
    expect(canFillTracking("Returning")).toBe(false);
  });

  it("卡片主行动映射", () => {
    expect(afterSalesPrimaryAction("Pending")).toBe("cancel");
    expect(afterSalesPrimaryAction("Approved")).toBe("tracking");
    expect(afterSalesPrimaryAction("Returning")).toBe("service");
    expect(afterSalesPrimaryAction("Received")).toBe("service");
    expect(afterSalesPrimaryAction("RefundFailed")).toBe("service");
    expect(afterSalesPrimaryAction("Refunded")).toBe("detail");
    expect(afterSalesPrimaryAction("Rejected")).toBe("detail");
    expect(afterSalesPrimaryAction("Closed")).toBe("none");
  });

  it("申请入口白名单与类型标签", () => {
    expect(canApplyAfterSales("Shipped")).toBe(true);
    expect(canApplyAfterSales("Cancelled")).toBe(true);
    expect(canApplyAfterSales("PaymentSettled")).toBe(false);
    expect(afterSalesTypeLabelKey("exchange")).toBe("messages.afterSales.typeExchange");
    expect(afterSalesTypeLabelKey("nope")).toBe("messages.afterSales.typeUnknown");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm exec vitest run layers/base/app/utils/__tests__/after-sales-state.spec.ts
```

cwd：`d:\zhao\nshop`

Expected: FAIL — `afterSalesNextStep is not a function` / `AFTER_SALES_TABS` 键不符。

- [ ] **Step 3: 整文件替换 `after-sales-state.ts`**

```ts
export type AfterSalesState =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Returning"
  | "Received"
  | "Refunded"
  | "RefundFailed"
  | "Closed";

export type AfterSalesType = "return_refund" | "refund_only" | "exchange";

/** 5 个页签：进行中（默认）/ 全部 / 已完成 / 已拒绝 / 已取消 */
export type AfterSalesTabKey = "ACTIVE" | "ALL" | "DONE" | "REJECTED" | "CLOSED";

export const AFTER_SALES_TABS: { key: AfterSalesTabKey; labelKey: string }[] = [
  { key: "ACTIVE", labelKey: "messages.afterSales.tabActive" },
  { key: "ALL", labelKey: "messages.afterSales.tabAll" },
  { key: "DONE", labelKey: "messages.afterSales.tabDone" },
  { key: "REJECTED", labelKey: "messages.afterSales.tabRejected" },
  { key: "CLOSED", labelKey: "messages.afterSales.tabClosed" },
];

/** 「进行中」收纳的状态集合（与服务端 STATE_TRANSITIONS 的非终态一致） */
export const AFTER_SALES_ACTIVE_STATES = new Set<string>([
  "Pending",
  "Approved",
  "Returning",
  "Received",
  "RefundFailed",
]);

const TYPE_LABEL_KEY: Record<AfterSalesType, string> = {
  return_refund: "messages.afterSales.typeReturnRefund",
  refund_only: "messages.afterSales.typeRefundOnly",
  exchange: "messages.afterSales.typeExchange",
};

export function afterSalesTypeLabelKey(type: string): string {
  return TYPE_LABEL_KEY[type as AfterSalesType] ?? "messages.afterSales.typeUnknown";
}

export interface AfterSalesStateInfo {
  labelKey: string;
  color: "neutral" | "warning" | "info" | "success" | "error";
}

export function afterSalesStateInfo(state: string): AfterSalesStateInfo {
  switch (state) {
    case "Pending":
      return { labelKey: "messages.afterSales.statePending", color: "warning" };
    case "Approved":
      return { labelKey: "messages.afterSales.stateApproved", color: "info" };
    case "Rejected":
      return { labelKey: "messages.afterSales.stateRejected", color: "error" };
    case "Returning":
      return { labelKey: "messages.afterSales.stateReturning", color: "info" };
    case "Received":
      return { labelKey: "messages.afterSales.stateReceived", color: "warning" };
    case "Refunded":
      return { labelKey: "messages.afterSales.stateRefunded", color: "success" };
    case "RefundFailed":
      return { labelKey: "messages.afterSales.stateRefundFailed", color: "error" };
    case "Closed":
      return { labelKey: "messages.afterSales.stateClosed", color: "neutral" };
    default:
      return { labelKey: "messages.afterSales.stateUnknown", color: "neutral" };
  }
}

/** 主流程 5 节点（时间线 / 进度条共用） */
export const AFTER_SALES_PROGRESS: AfterSalesState[] = [
  "Pending",
  "Approved",
  "Returning",
  "Received",
  "Refunded",
];

/**
 * 当前处于主流程第几节点。
 * RefundFailed 落在「商家收货」之上（退款在收货后失败）；Rejected / Closed 落在「提交申请」。
 */
export function afterSalesProgressIndex(state: string): number {
  const i = AFTER_SALES_PROGRESS.indexOf(state as AfterSalesState);
  if (i >= 0) return i;
  if (state === "RefundFailed") return 3;
  if (state === "Rejected" || state === "Closed") return 0;
  return -1;
}

export function tabOfAfterSales(state: string): AfterSalesTabKey {
  if (AFTER_SALES_ACTIVE_STATES.has(state)) return "ACTIVE";
  if (state === "Refunded") return "DONE";
  if (state === "Rejected") return "REJECTED";
  if (state === "Closed") return "CLOSED";
  return "ALL";
}

export interface AfterSalesNextStep {
  titleKey: string;
  descKey: string;
  tone: "info" | "warning" | "success" | "error" | "neutral";
}

/** 「你需要做什么」引导条：按状态给一句话主行动 + 一条说明 */
export function afterSalesNextStep(state: string): AfterSalesNextStep {
  switch (state) {
    case "Pending":
      return {
        titleKey: "messages.afterSales.nextPendingTitle",
        descKey: "messages.afterSales.nextPendingDesc",
        tone: "info",
      };
    case "Approved":
      return {
        titleKey: "messages.afterSales.nextApprovedTitle",
        descKey: "messages.afterSales.nextApprovedDesc",
        tone: "warning",
      };
    case "Returning":
      return {
        titleKey: "messages.afterSales.nextReturningTitle",
        descKey: "messages.afterSales.nextReturningDesc",
        tone: "info",
      };
    case "Received":
      return {
        titleKey: "messages.afterSales.nextReceivedTitle",
        descKey: "messages.afterSales.nextReceivedDesc",
        tone: "info",
      };
    case "Refunded":
      return {
        titleKey: "messages.afterSales.nextRefundedTitle",
        descKey: "messages.afterSales.nextRefundedDesc",
        tone: "success",
      };
    case "Rejected":
      return {
        titleKey: "messages.afterSales.nextRejectedTitle",
        descKey: "messages.afterSales.nextRejectedDesc",
        tone: "error",
      };
    case "RefundFailed":
      return {
        titleKey: "messages.afterSales.nextRefundFailedTitle",
        descKey: "messages.afterSales.nextRefundFailedDesc",
        tone: "error",
      };
    case "Closed":
      return {
        titleKey: "messages.afterSales.nextClosedTitle",
        descKey: "messages.afterSales.nextClosedDesc",
        tone: "neutral",
      };
    default:
      return {
        titleKey: "messages.afterSales.nextUnknownTitle",
        descKey: "messages.afterSales.nextUnknownDesc",
        tone: "neutral",
      };
  }
}

/** 卡片 / 详情页主行动 */
export type AfterSalesPrimaryAction = "cancel" | "tracking" | "service" | "detail" | "none";

export function afterSalesPrimaryAction(state: string): AfterSalesPrimaryAction {
  switch (state) {
    case "Pending":
      return "cancel";
    case "Approved":
      return "tracking";
    case "Returning":
    case "Received":
    case "RefundFailed":
      return "service";
    case "Refunded":
    case "Rejected":
      return "detail";
    default:
      return "none";
  }
}

/** 主行动按钮的 i18n key（卡片与详情页吸底共用） */
export function afterSalesPrimaryActionLabelKey(action: AfterSalesPrimaryAction): string {
  switch (action) {
    case "cancel":
      return "messages.afterSales.cancel";
    case "tracking":
      return "messages.afterSales.fillTracking";
    case "service":
      return "messages.afterSales.customerService";
    case "detail":
      return "messages.afterSales.viewDetail";
    default:
      return "messages.afterSales.viewDetail";
  }
}

export function canCancelAfterSales(state: string): boolean {
  return state === "Pending";
}

export function canFillTracking(state: string): boolean {
  return state === "Approved";
}

export const AFTER_SALES_ELIGIBLE_ORDER_STATES = new Set([
  "Shipped",
  "Delivered",
  "PartiallyDelivered",
  "Cancelled",
]);

export function canApplyAfterSales(orderState: string): boolean {
  return AFTER_SALES_ELIGIBLE_ORDER_STATES.has(orderState);
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm exec vitest run layers/base/app/utils/__tests__/after-sales-state.spec.ts
```

Expected: 8 passed。

- [ ] **Step 5: Commit**

```bash
git add layers/base/app/utils/after-sales-state.ts layers/base/app/utils/__tests__/after-sales-state.spec.ts
git commit -m "feat(after-sales): 状态工具层补 RefundFailed/5 页签/引导文案/唯一动作判断入口"
```

---

### Task 4: gql fragment 扩展 + 上传 mutation + composable

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\after-sales.gql`
- Modify: `d:\zhao\nshop\layers\base\app\composables\useAfterSales.ts`

- [ ] **Step 1: 扩 fragment**

在 [after-sales.gql](file:///d:/zhao/nshop/layers/base/gql/queries/after-sales.gql) 的 `AfterSalesFragment` 中，`receivedQuantity` 之后、`createdAt` 之前插入三行：

```graphql
  receivedQuantity
  actualRefundAmount
  refundedAt
  refundError
  createdAt
```

- [ ] **Step 2: 追加上传 mutation**

在文件末尾追加：

```graphql
mutation UploadAfterSalesEvidence($images: [String!]!) {
  uploadAfterSalesEvidence(images: $images)
}
```

- [ ] **Step 3: 重新生成 gql 类型**

```bash
pnpm nuxt prepare
```

cwd：`d:\zhao\nshop`

Expected: 无错误；`.nuxt` 下生成 `GqlUploadAfterSalesEvidence`。若 introspection 因网络失败，先确认 `.env` 的 `GQL_HOST` 指向可达的 shop-api。

- [ ] **Step 4: composable 新增 `uploadEvidence`**

在 [useAfterSales.ts](file:///d:/zhao/nshop/layers/base/app/composables/useAfterSales.ts) 中：

`CreateAfterSalesInput` 接口补 `evidenceImages`、`receivedQuantity`：

```ts
export interface CreateAfterSalesInput {
  orderId: string;
  orderLineId?: string | null;
  type?: string;
  reason: string;
  description?: string | null;
  evidenceImages?: string[] | null;
  refundAmount: number;
}
```

`createRequest` 里 `GqlCreateAfterSalesRequest` 的入参补一行：

```ts
          description: input.description ?? null,
          evidenceImages: input.evidenceImages && input.evidenceImages.length ? input.evidenceImages : null,
          refundAmount: input.refundAmount,
```

在 `updateTracking` 之后、`return` 之前插入：

```ts
  /** 上传单张凭证图（data URL → 服务端 asset），返回绝对 URL；失败返回 null */
  async function uploadEvidence(dataUrl: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const { uploadAfterSalesEvidence } = await GqlUploadAfterSalesEvidence({ images: [dataUrl] });
      return uploadAfterSalesEvidence?.[0] ?? null;
    } catch (e: any) {
      if (signal?.aborted) return null;
      const msg = e?.gqlErrors?.[0]?.message ?? e?.message ?? "upload evidence failed";
      error.value = msg;
      return null;
    }
  }
```

`return` 语句改为：

```ts
  return { loading, error, createRequest, cancelRequest, updateTracking, uploadEvidence };
```

- [ ] **Step 5: 单张上传冒烟（手动，本地 dev）**

```bash
pnpm dev
```

在浏览器控制台执行（确认端点连通）：

```js
await $fetch("/api/_nuxt/graphql", { method: "POST" })
```

> 该步骤仅确认 dev 起得来；真正的上传在 Task 6 的 UI 里验证。

- [ ] **Step 6: Commit**

```bash
git add layers/base/gql/queries/after-sales.gql layers/base/app/composables/useAfterSales.ts
git commit -m "feat(after-sales): fragment 补实退金额/时间/失败原因，composable 新增凭证上传"
```

---

### Task 5: 新增 `EvidenceUploader.vue`（压缩 + 四态格子）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\afterSales\EvidenceUploader.vue`

- [ ] **Step 1: 建组件**

```vue
<script setup lang="ts">
const props = defineProps<{ max?: number }>();
const urls = defineModel<string[]>({ default: () => [] });

const { t } = useI18n();
const { uploadEvidence } = useAfterSales();

const MAX = props.max ?? 3;

type CellStatus = "compressing" | "uploading" | "done" | "failed";

interface Cell {
  id: number;
  status: CellStatus;
  /** 本地预览（blob / data URL） */
  localSrc: string;
  /** 上传成功后的服务端 URL */
  remoteUrl?: string;
  error?: string;
}

let seed = 0;
const cells = ref<Cell[]>([]);
const controllers = new Map<number, AbortController>();

const reachedMax = computed(() => cells.value.length >= MAX);
const hasPending = computed(() =>
  cells.value.some((c) => c.status === "compressing" || c.status === "uploading"),
);
const hasFailed = computed(() => cells.value.some((c) => c.status === "failed"));

function syncUrls() {
  urls.value = cells.value.filter((c) => c.status === "done" && c.remoteUrl).map((c) => c.remoteUrl!);
}

// ---- 客户端压缩：长边 ≤1280，webp q0.8；仍 >500KB 用 q0.6 重压一次 ----
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), type, quality));

  let blob = (await encode("image/webp", 0.8)) ?? (await encode("image/jpeg", 0.8));
  if (!blob) throw new Error("encode failed");
  if (blob.size > 500 * 1024) {
    const smaller = (await encode("image/webp", 0.6)) ?? (await encode("image/jpeg", 0.6));
    if (smaller) blob = smaller;
  }
  if (blob.size > 500 * 1024) throw new Error(t("messages.afterSales.evidenceTooLarge"));
  return blob;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function runCell(cell: Cell, file: File) {
  const controller = new AbortController();
  controllers.set(cell.id, controller);
  try {
    cell.status = "compressing";
    const blob = await compress(file);
    cell.status = "uploading";
    const dataUrl = await blobToDataUrl(blob);
    const url = await uploadEvidence(dataUrl, controller.signal);
    if (controller.signal.aborted) return;
    if (!url) {
      cell.status = "failed";
      cell.error = t("messages.afterSales.evidenceUploadFailed");
      return;
    }
    cell.remoteUrl = url;
    cell.status = "done";
  } catch (e: any) {
    if (controller.signal.aborted) return;
    cell.status = "failed";
    cell.error = e?.message ?? t("messages.afterSales.evidenceUploadFailed");
  } finally {
    controllers.delete(cell.id);
    syncUrls();
  }
}

/** 并发上限 2 */
async function pump(queue: { cell: Cell; file: File }[]) {
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const job = queue.shift();
      if (!job) return;
      await runCell(job.cell, job.file);
    }
  });
  await Promise.all(workers);
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  const picked = Array.from(input.files ?? []);
  input.value = "";
  if (!picked.length) return;

  const room = MAX - cells.value.length;
  const accepted = picked.slice(0, room);
  if (picked.length > room) {
    useToast().add({ title: t("messages.afterSales.evidenceMax", { n: MAX }), color: "warning" });
  }
  const queue = accepted.map((file) => {
    const cell: Cell = { id: ++seed, status: "compressing", localSrc: URL.createObjectURL(file) };
    cells.value.push(cell);
    return { cell, file };
  });
  await pump(queue);
}

function removeCell(cell: Cell) {
  // 仅移除本地引用，不调后端删除（未引用的 asset 残留属已知取舍）
  cells.value = cells.value.filter((c) => c.id !== cell.id);
  syncUrls();
}

async function retryCell(cell: Cell) {
  const controller = controllers.get(cell.id);
  if (controller) return;
  const res = await fetch(cell.localSrc);
  const blob = await res.blob();
  const file = new File([blob], "retry.webp", { type: blob.type || "image/webp" });
  await runCell(cell, file);
}

defineExpose({ hasPending, hasFailed });

onBeforeUnmount(() => {
  controllers.forEach((c) => c.abort());
  controllers.clear();
  cells.value.forEach((c) => URL.revokeObjectURL(c.localSrc));
});
</script>

<template>
  <div>
    <div class="grid grid-cols-3 gap-3">
      <div
        v-for="cell in cells"
        :key="cell.id"
        class="relative aspect-square overflow-hidden rounded-md border"
        :class="cell.status === 'failed' ? 'border-error' : 'border-neutral-200 dark:border-neutral-800'"
      >
        <img
          :src="cell.status === 'done' && cell.remoteUrl ? cell.remoteUrl : cell.localSrc"
          :alt="t('messages.afterSales.evidence')"
          class="h-full w-full object-cover"
          :class="{ 'opacity-50': cell.status === 'compressing' || cell.status === 'uploading' }"
        />
        <div
          v-if="cell.status === 'compressing' || cell.status === 'uploading'"
          class="absolute inset-0 flex items-center justify-center text-xs text-white"
        >
          <UIcon name="i-lucide-loader-circle" class="animate-spin" />
        </div>
        <button
          v-if="cell.status === 'done'"
          type="button"
          class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-error text-white"
          :aria-label="t('messages.afterSales.removeEvidence')"
          @click="removeCell(cell)"
        >
          ×
        </button>
        <button
          v-if="cell.status === 'failed'"
          type="button"
          class="absolute inset-0 flex items-center justify-center bg-white/70 text-xs text-error dark:bg-neutral-900/70"
          @click="retryCell(cell)"
        >
          {{ t("messages.afterSales.evidenceRetry") }}
        </button>
      </div>

      <label
        v-if="!reachedMax"
        class="flex aspect-square cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-700"
      >
        <UIcon name="i-lucide-plus" class="text-xl" />
        <input type="file" accept="image/*" multiple class="hidden" @change="onPick" />
      </label>
    </div>
    <p class="mt-2 text-xs text-neutral-500">
      {{ t("messages.afterSales.evidenceHint", { n: MAX }) }}
    </p>
  </div>
</template>
```

- [ ] **Step 2: 父组件（Task 6）能拿到 `hasPending` / `hasFailed`**

在 Task 6 中通过 `ref` 调用 `evidenceRef.value?.hasPending` / `hasFailed`——**是 computed 而非函数**，调用处不要加括号。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/components/afterSales/EvidenceUploader.vue
git commit -m "feat(after-sales): 新增凭证图上传组件（客户端压缩 + 四态格子 + 并发上限2）"
```

---

### Task 6: 重写 `AfterSalesCreateModal.vue`

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesCreateModal.vue`（整文件替换）

- [ ] **Step 1: 整文件替换**

```vue
<script setup lang="ts">
import { useAfterSales } from "../../composables/useAfterSales";

const props = defineProps<{
  orderId: string;
  orderLine: { id: string; proratedLinePrice?: number; productVariant?: { name?: string } | null };
  maxAmount: number;
}>();

const isOpen = defineModel<boolean>("open", { default: false });
const { loading, createRequest } = useAfterSales();
const { t } = useI18n();
const localePath = useTenantLocalePath();

type TypeKey = "return_refund" | "refund_only" | "exchange";

const MAX_EVIDENCE = 3;
const MAX_DESC = 200;

const TYPE_OPTIONS: { value: TypeKey; labelKey: string; descKey: string; hintKey: string }[] = [
  {
    value: "return_refund",
    labelKey: "messages.afterSales.typeReturnRefund",
    descKey: "messages.afterSales.typeReturnRefundDesc",
    hintKey: "messages.afterSales.hintReturnRefund",
  },
  {
    value: "refund_only",
    labelKey: "messages.afterSales.typeRefundOnly",
    descKey: "messages.afterSales.typeRefundOnlyDesc",
    hintKey: "messages.afterSales.hintRefundOnly",
  },
  {
    value: "exchange",
    labelKey: "messages.afterSales.typeExchange",
    descKey: "messages.afterSales.typeExchangeDesc",
    hintKey: "messages.afterSales.hintExchange",
  },
];

const REASON_KEYS = [
  "quality",
  "damaged",
  "sizeMismatch",
  "notAsDescribed",
  "wrongItem",
  "missingItem",
  "noLongerNeeded",
  "other",
] as const;

const selectedType = ref<TypeKey>("return_refund");
/** 对外单位：元（字符串，避免 number 输入框吃掉小数位） */
const amountText = ref("");
const reasonKey = ref<string>("");
const reasonOther = ref("");
const description = ref("");
const evidenceUrls = ref<string[]>([]);
const formError = ref<string | null>(null);
const submitting = ref(false);
const evidenceRef = ref<{ hasPending: boolean; hasFailed: boolean } | null>(null);
const discardConfirmOpen = ref(false);

const maxYuan = computed(() => props.maxAmount / 100);
const isExchange = computed(() => selectedType.value === "exchange");
const isOther = computed(() => reasonKey.value === "other");
const productName = computed(() => props.orderLine.productVariant?.name ?? "");

const amountNumber = computed(() => Number(amountText.value));

const amountError = computed(() => {
  if (isExchange.value) return null;
  if (!amountText.value.trim()) return t("messages.afterSales.errAmountRequired");
  if (!Number.isFinite(amountNumber.value) || amountNumber.value <= 0)
    return t("messages.afterSales.errAmountPositive");
  if (amountNumber.value > maxYuan.value + 1e-9)
    return t("messages.afterSales.errAmountMax", { amount: maxYuan.value.toFixed(2) });
  return null;
});

const reasonValue = computed(() =>
  isOther.value ? reasonOther.value.trim() : reasonKey.value ? t(`messages.afterSales.reason_${reasonKey.value}`) : "",
);

const busy = computed(() => !!evidenceRef.value?.hasPending);
const failed = computed(() => !!evidenceRef.value?.hasFailed);

const canSubmit = computed(
  () =>
    !loading.value &&
    !submitting.value &&
    !busy.value &&
    !failed.value &&
    !!reasonValue.value &&
    (isExchange.value || !amountError.value),
);

const disabledReason = computed(() => {
  if (busy.value) return t("messages.afterSales.errUploading");
  if (failed.value) return t("messages.afterSales.errUploadFailed");
  if (!reasonValue.value) return t("messages.afterSales.errReasonRequired");
  if (!isExchange.value && amountError.value) return amountError.value;
  return null;
});

const hasDraft = computed(
  () =>
    !!reasonKey.value ||
    !!reasonOther.value.trim() ||
    !!description.value.trim() ||
    !!amountText.value.trim() ||
    evidenceUrls.value.length > 0,
);

function resetForm() {
  selectedType.value = "return_refund";
  amountText.value = maxYuan.value > 0 ? maxYuan.value.toFixed(2) : "";
  reasonKey.value = "";
  reasonOther.value = "";
  description.value = "";
  evidenceUrls.value = [];
  formError.value = null;
  submitting.value = false;
}

// 打开时重置全部字段（修掉「重开表单残留上次填写内容」）
watch(isOpen, (open) => {
  if (open) resetForm();
});

// 类型切换：换货 → 退款类，金额按上限重新预填（不清空原因/描述）
watch(selectedType, (next, prev) => {
  if (next !== "exchange" && prev === "exchange") {
    amountText.value = maxYuan.value > 0 ? maxYuan.value.toFixed(2) : "";
  }
});

function onAmountInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  // 自动截断到两位小数
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [int, ...rest] = cleaned.split(".");
  amountText.value = rest.length ? `${int}.${rest.join("").slice(0, 2)}` : int;
}

function fillFullAmount() {
  amountText.value = maxYuan.value.toFixed(2);
}

function pickReason(key: string) {
  reasonKey.value = key;
  if (key !== "other") reasonOther.value = "";
}

function requestClose() {
  if (submitting.value) return;
  if (hasDraft.value) {
    discardConfirmOpen.value = true;
    return;
  }
  isOpen.value = false;
}

const SERVER_ERROR_MAP: { match: RegExp; key: string }[] = [
  { match: /After-sales already exists/i, key: "messages.afterSales.errDuplicate" },
  { match: /exceeds max/i, key: "messages.afterSales.errAmountMaxServer" },
  { match: /days limit/i, key: "messages.afterSales.errExpired" },
];

function mapServerError(msg: string): string {
  const hit = SERVER_ERROR_MAP.find((m) => m.match.test(msg));
  return hit ? t(hit.key) : `${t("messages.afterSales.errGeneric")}`;
}

async function onSubmit() {
  formError.value = null;
  if (!canSubmit.value) return;
  submitting.value = true;
  const res = await createRequest({
    orderId: props.orderId,
    orderLineId: props.orderLine.id,
    type: selectedType.value,
    reason: reasonValue.value,
    description: description.value.trim() || null,
    evidenceImages: evidenceUrls.value.length ? evidenceUrls.value : null,
    // 换货不产生退款：后端 refundAmount 为必填 Int!，固定提交 0
    refundAmount: isExchange.value ? 0 : Math.round(amountNumber.value * 100),
  });
  submitting.value = false;
  if (res.ok && res.id) {
    isOpen.value = false;
    useToast().add({ title: t("messages.afterSales.createSuccess"), color: "success" });
    navigateTo(localePath(`/account/after-sales/${res.id}`));
    return;
  }
  // 失败时弹层不关闭，保留全部已填内容与已上传图片
  formError.value = mapServerError(res.message ?? "");
}
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'sm:max-w-lg' }" :close="false">
    <template #body>
      <div class="max-h-[80vh] overflow-y-auto">
        <h3 class="mb-3 text-lg font-semibold">{{ t("messages.afterSales.applyTitle") }}</h3>

        <!-- ① 商品行（只读） -->
        <div class="mb-4 flex items-center gap-3 rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ productName }}</p>
            <p class="text-xs text-neutral-500">
              {{ t("messages.afterSales.maxRefundable", { amount: maxYuan.toFixed(2) }) }}
            </p>
          </div>
        </div>

        <!-- ② 售后类型 -->
        <p class="mb-2 text-sm font-medium">{{ t("messages.afterSales.type") }}</p>
        <div class="mb-4 grid grid-cols-3 gap-2">
          <button
            v-for="opt in TYPE_OPTIONS"
            :key="opt.value"
            type="button"
            class="rounded-md border p-2 text-left text-xs"
            :class="
              selectedType === opt.value
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300'
            "
            @click="selectedType = opt.value"
          >
            <span class="block text-sm font-medium">{{ t(opt.labelKey) }}</span>
            <span class="mt-0.5 block text-[11px] text-neutral-500">{{ t(opt.descKey) }}</span>
          </button>
        </div>
        <p class="mb-4 text-xs text-neutral-500">
          {{ t(TYPE_OPTIONS.find((o) => o.value === selectedType)!.hintKey) }}
        </p>

        <!-- ③ 退款金额（换货隐藏） -->
        <template v-if="!isExchange">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-sm font-medium">{{ t("messages.afterSales.refundAmount") }}</span>
            <button type="button" class="text-xs text-primary" @click="fillFullAmount">
              {{ t("messages.afterSales.fullAmount") }}
            </button>
          </div>
          <div class="mb-1 flex items-center gap-2">
            <span class="text-sm">¥</span>
            <input
              :value="amountText"
              inputmode="decimal"
              class="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
              @input="onAmountInput"
            />
          </div>
          <p v-if="amountError" class="mb-4 text-xs text-error">{{ amountError }}</p>
          <div v-else class="mb-4" />
        </template>

        <!-- ④ 申请原因 -->
        <p class="mb-2 text-sm font-medium">
          {{ t("messages.afterSales.reason") }} <span class="text-error">*</span>
        </p>
        <div class="mb-2 flex flex-wrap gap-2">
          <button
            v-for="k in REASON_KEYS"
            :key="k"
            type="button"
            class="rounded-full border px-3 py-1.5 text-xs"
            :class="
              reasonKey === k
                ? 'border-primary bg-primary text-white'
                : 'border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300'
            "
            @click="pickReason(k)"
          >
            {{ t(`messages.afterSales.reason_${k}`) }}
          </button>
        </div>
        <input
          v-if="isOther"
          v-model="reasonOther"
          :placeholder="t('messages.afterSales.reasonOtherPlaceholder')"
          class="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div v-else class="mb-4" />

        <!-- ⑤ 问题描述 -->
        <p class="mb-2 text-sm font-medium">{{ t("messages.afterSales.description") }}</p>
        <div class="relative mb-4">
          <textarea
            v-model="description"
            :maxlength="MAX_DESC"
            rows="3"
            :placeholder="t('messages.afterSales.descPlaceholder')"
            class="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span class="absolute bottom-2 right-2 text-xs text-neutral-400">
            {{ description.length }}/{{ MAX_DESC }}
          </span>
        </div>

        <!-- ⑥ 凭证图 -->
        <p class="mb-2 text-sm font-medium">{{ t("messages.afterSales.evidence") }}</p>
        <AfterSalesEvidenceUploader ref="evidenceRef" v-model="evidenceUrls" :max="MAX_EVIDENCE" />

        <p v-if="formError" class="mt-4 text-sm text-error">{{ formError }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-neutral-500">{{ disabledReason }}</span>
        <div class="flex gap-3">
          <UButton variant="ghost" :label="t('messages.afterSales.cancel')" @click="requestClose" />
          <UButton
            color="primary"
            :loading="submitting"
            :disabled="!canSubmit"
            :label="submitting ? t('messages.afterSales.submitting') : t('messages.afterSales.submit')"
            @click="onSubmit"
          />
        </div>
      </div>
    </template>
  </UModal>

  <!-- 放弃填写二次确认 -->
  <UModal v-model:open="discardConfirmOpen" :ui="{ content: 'sm:max-w-sm' }">
    <div class="p-5 text-center">
      <h2 class="text-base font-medium">{{ t("messages.afterSales.discardTitle") }}</h2>
      <p class="mt-1 text-sm text-neutral-500">{{ t("messages.afterSales.discardDesc") }}</p>
      <div class="mt-5 flex justify-center gap-3">
        <UButton variant="soft" :label="t('messages.afterSales.keepEditing')" @click="discardConfirmOpen = false" />
        <UButton
          color="error"
          :label="t('messages.afterSales.discard')"
          @click="
            () => {
              discardConfirmOpen = false;
              isOpen = false;
            }
          "
        />
      </div>
    </div>
  </UModal>
</template>
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

Expected: 全绿。若 `AfterSalesEvidenceUploader` 的 `ref` 类型报错，把 `evidenceRef` 类型改为 `InstanceType<typeof AfterSalesEvidenceUploader> | null`。

- [ ] **Step 3: 本地手测（dev）**

```bash
pnpm dev
```

访问 `/zh-CN/account/orders/<已发货订单code>` → 点某行「申请售后」，逐项确认：类型切换联动金额显隐、金额上限红字、「全额」按钮、原因胶囊 + 其他展开、描述计数、选 4 张图只收 3 张并提示、提交后跳转售后详情。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/components/afterSales/AfterSalesCreateModal.vue
git commit -m "refactor(after-sales): 申请表单重写（类型联动/元金额/凭证上传/重开重置/服务端报错映射）"
```

---

### Task 7: 新增 `AfterSalesTimeline.vue` 与 `AfterSalesNextStep.vue`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesNextStep.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesTimeline.vue`

- [ ] **Step 1: 建引导条**

`AfterSalesNextStep.vue`：

```vue
<script setup lang="ts">
import { afterSalesNextStep } from "../../utils/after-sales-state";

const props = defineProps<{ state: string }>();
const { t } = useI18n();
const step = computed(() => afterSalesNextStep(props.state));

const toneClass = computed(() => {
  switch (step.value.tone) {
    case "warning":
      return "border-warning/40 bg-warning/5";
    case "success":
      return "border-success/40 bg-success/5";
    case "error":
      return "border-error/40 bg-error/5";
    case "info":
      return "border-primary/40 bg-primary/5";
    default:
      return "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900";
  }
});
</script>

<template>
  <section class="mb-6 rounded-lg border p-4" :class="toneClass">
    <p class="text-sm font-medium">{{ t(step.titleKey) }}</p>
    <p class="mt-1 text-xs text-neutral-500">{{ t(step.descKey) }}</p>
  </section>
</template>
```

- [ ] **Step 2: 建纵向时间线**

`AfterSalesTimeline.vue`：

```vue
<script setup lang="ts">
import { AFTER_SALES_PROGRESS, afterSalesProgressIndex } from "../../utils/after-sales-state";

interface TimelineRequest {
  state: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  refundedAt?: string | null;
  refundAmount: number;
  actualRefundAmount?: number | null;
  rejectReason?: string | null;
  returnCarrier?: string | null;
  returnTrackingNo?: string | null;
  receivedQuantity?: number | null;
}

const props = defineProps<{ request: TimelineRequest }>();
const { t, locale } = useI18n();

const STEP_LABEL_KEY: Record<string, string> = {
  Pending: "messages.afterSales.stepPending",
  Approved: "messages.afterSales.stepApproved",
  Returning: "messages.afterSales.stepReturning",
  Received: "messages.afterSales.stepReceived",
  Refunded: "messages.afterSales.stepRefunded",
};

interface Node {
  key: string;
  label: string;
  time: string | null;
  timeIsRecent: boolean;
  detail: string | null;
  reached: boolean;
  current: boolean;
  failed: boolean;
}

function fmt(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(locale.value);
}

const nodes = computed<Node[]>(() => {
  const r = props.request;
  const doneIndex = afterSalesProgressIndex(r.state);
  const list: Node[] = AFTER_SALES_PROGRESS.map((state, i) => {
    const isCurrent = i === doneIndex && r.state === state;
    let time: string | null = null;
    if (state === "Pending" && r.createdAt) time = fmt(r.createdAt);
    if (state === "Refunded" && r.refundedAt) time = fmt(r.refundedAt);
    if (isCurrent && r.updatedAt) time = fmt(r.updatedAt);
    return {
      key: state,
      label: t(STEP_LABEL_KEY[state]),
      time,
      timeIsRecent: isCurrent && !!r.updatedAt,
      detail:
        state === "Returning" && (r.returnCarrier || r.returnTrackingNo)
          ? `${r.returnCarrier ?? ""} ${r.returnTrackingNo ?? ""}`.trim()
          : null,
      reached: i <= doneIndex,
      current: isCurrent,
      failed: false,
    };
  });

  if (r.state === "RefundFailed") {
    list.push({
      key: "RefundFailed",
      label: t("messages.afterSales.stateRefundFailed"),
      time: fmt(r.updatedAt),
      timeIsRecent: true,
      detail: null,
      reached: true,
      current: true,
      failed: true,
    });
  } else if (r.state === "Rejected") {
    list.push({
      key: "Rejected",
      label: t("messages.afterSales.stateRejected"),
      time: fmt(r.updatedAt),
      timeIsRecent: true,
      detail: r.rejectReason ?? null,
      reached: true,
      current: true,
      failed: true,
    });
  } else if (r.state === "Closed") {
    list.push({
      key: "Closed",
      label: t("messages.afterSales.stateClosed"),
      time: fmt(r.updatedAt),
      timeIsRecent: true,
      detail: null,
      reached: true,
      current: true,
      failed: false,
    });
  }
  return list;
});
</script>

<template>
  <ol class="mb-6">
    <li v-for="(n, i) in nodes" :key="n.key" class="flex gap-3">
      <div class="flex flex-col items-center">
        <span
          class="mt-1 h-3 w-3 shrink-0 rounded-full"
          :class="
            n.failed
              ? 'bg-error'
              : n.reached
                ? 'bg-primary'
                : 'border border-neutral-300 bg-transparent dark:border-neutral-700'
          "
        />
        <span
          v-if="i < nodes.length - 1"
          class="w-px flex-1"
          :class="n.reached && nodes[i + 1].reached ? 'bg-primary' : 'bg-neutral-200 dark:bg-neutral-800'"
        />
      </div>
      <div class="pb-5">
        <p
          class="text-sm"
          :class="n.reached ? 'font-medium' : 'text-neutral-400'"
        >
          {{ n.label }}
        </p>
        <p v-if="n.time" class="mt-0.5 text-xs text-neutral-500">
          {{ n.time }}
          <span v-if="n.timeIsRecent" class="ml-1 text-neutral-400">
            （{{ t("messages.afterSales.updatedAt") }}）
          </span>
        </p>
        <p v-if="n.detail" class="mt-0.5 text-xs" :class="n.failed ? 'text-error' : 'text-neutral-500'">
          {{ n.detail }}
        </p>
      </div>
    </li>
  </ol>
</template>
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/components/afterSales/AfterSalesNextStep.vue layers/base/app/components/afterSales/AfterSalesTimeline.vue
git commit -m "feat(after-sales): 新增引导条与纵向时间线组件"
```

---

### Task 8: 改造 `AfterSalesCard.vue`

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesCard.vue`（整文件替换）

- [ ] **Step 1: 整文件替换**

```vue
<script setup lang="ts">
import type { MyAfterSalesRequestsQuery } from "#gql/default";
import { formatMoney } from "../../utils/format-money";
import {
  AFTER_SALES_PROGRESS,
  afterSalesPrimaryAction,
  afterSalesPrimaryActionLabelKey,
  afterSalesProgressIndex,
  afterSalesStateInfo,
  afterSalesTypeLabelKey,
} from "../../utils/after-sales-state";
import { assetSrc } from "../../utils/image";

const props = defineProps<{
  request: NonNullable<MyAfterSalesRequestsQuery["myAfterSalesRequests"]>["items"][number];
}>();

const request = props.request;
const { t, locale } = useI18n();
const localePath = useTenantLocalePath();

const stateInfo = computed(() => afterSalesStateInfo(request.state));
const typeKey = computed(() => afterSalesTypeLabelKey(request.type));
const amount = computed(() => formatMoney(request.refundAmount, "CNY", locale.value));
const productName = computed(() => request.orderLine?.productVariant?.name);
const preview = computed(() =>
  assetSrc(
    request.orderLine?.featuredAsset?.preview ??
      request.orderLine?.productVariant?.featuredAsset?.preview ??
      "",
    128,
  ),
);
const createdAtText = computed(() =>
  request.createdAt ? new Date(request.createdAt).toLocaleDateString(locale.value) : "",
);
const progressIndex = computed(() => afterSalesProgressIndex(request.state));
const stepLabel = computed(() =>
  progressIndex.value >= 0 ? t(`messages.afterSales.step${AFTER_SALES_PROGRESS[progressIndex.value]}`) : "",
);

const action = computed(() => afterSalesPrimaryAction(request.state));
const actionLabel = computed(() => t(afterSalesPrimaryActionLabelKey(action.value)));
const actionTarget = computed(() => {
  const base = `/account/after-sales/${request.id}`;
  if (action.value === "cancel") return `${base}?action=cancel`;
  if (action.value === "tracking") return `${base}?action=tracking`;
  return base;
});
</script>

<template>
  <div class="rounded-lg border border-neutral-200 transition hover:border-primary dark:border-neutral-800">
    <ULink :to="localePath(`/account/after-sales/${request.id}`)" class="block p-4">
      <div class="flex items-center gap-4">
        <NuxtImg :src="preview" :alt="productName ?? ''" class="h-16 w-16 rounded object-cover" format="webp" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ t(typeKey) }}</span>
            <UBadge :color="stateInfo.color" variant="outline" :label="t(stateInfo.labelKey)" />
          </div>
          <p class="truncate text-sm text-neutral-500">{{ productName ?? request.id }}</p>
          <p class="text-xs text-neutral-400">
            {{ t("messages.afterSales.orderCode") }}: {{ request.order?.code }} ·
            {{ t("messages.afterSales.amount") }}: {{ amount }}
          </p>
          <p v-if="createdAtText" class="text-xs text-neutral-400">
            {{ t("messages.afterSales.createdAt") }}: {{ createdAtText }}
          </p>
        </div>
      </div>

      <!-- 五段进度 + 当前步骤 -->
      <div class="mt-3 flex items-center gap-1">
        <span
          v-for="(s, i) in AFTER_SALES_PROGRESS"
          :key="s"
          class="h-1 flex-1 rounded-full"
          :class="i <= progressIndex ? 'bg-primary' : 'bg-neutral-200 dark:bg-neutral-800'"
        />
      </div>
      <p v-if="stepLabel" class="mt-1 text-xs text-neutral-500">
        {{ t("messages.afterSales.currentStep") }}: {{ stepLabel }}
      </p>
    </ULink>

    <div v-if="action !== 'none'" class="flex justify-end border-t border-neutral-100 px-4 py-2 dark:border-neutral-800">
      <UButton size="xs" variant="soft" color="primary" :label="actionLabel" :to="localePath(actionTarget)" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

Expected: 全绿。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/components/afterSales/AfterSalesCard.vue
git commit -m "feat(after-sales): 卡片补申请时间/进度条/下一步动作"
```

---

### Task 9: C 端列表页（5 页签 + 本地搜索/排序 + 空态三分）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\after-sales\index.vue`（整文件替换）

- [ ] **Step 1: 整文件替换**

```vue
<script setup lang="ts">
definePageMeta({ middleware: "account" });

import {
  AFTER_SALES_TABS,
  tabOfAfterSales,
  type AfterSalesTabKey,
} from "../../../utils/after-sales-state";

const { t } = useI18n();
const localePath = useTenantLocalePath();
const activeTab = ref<AfterSalesTabKey>("ACTIVE");
const keyword = ref("");
const sortBy = ref<"newest" | "amount">("newest");
const loading = ref(true);
const listError = ref(false);

const { data: listData, refresh } = await useAsyncGql(
  "MyAfterSalesRequests",
  { options: { take: 100 } },
  { immediate: false, server: false },
);

const requests = computed(() => listData.value?.myAfterSalesRequests?.items ?? []);
const truncated = computed(() => requests.value.length >= 100);

// 搜索/排序/筛选全部本地完成：
// 插件 SDL 的 AfterSalesRequestListOptions 是空声明（无 filter / sort），列表本就走 take:100 全量拉取。
const matched = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  let list = requests.value;
  if (activeTab.value !== "ALL") {
    list = list.filter((r) => tabOfAfterSales(r.state) === activeTab.value);
  }
  if (kw) {
    list = list.filter((r) => {
      const code = r.order?.code?.toLowerCase() ?? "";
      const id = String(r.id).toLowerCase();
      const name = r.orderLine?.productVariant?.name?.toLowerCase() ?? "";
      return code.includes(kw) || id.includes(kw) || name.includes(kw);
    });
  }
  return [...list].sort((a, b) => {
    if (sortBy.value === "amount") return (b.refundAmount ?? 0) - (a.refundAmount ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
});

const tabItems = computed(() =>
  AFTER_SALES_TABS.map((tb) => ({ value: tb.key, label: t(tb.labelKey) })),
);

async function load() {
  listError.value = false;
  try {
    await refresh();
  } catch {
    listError.value = true;
  }
}

onMounted(async () => {
  await load();
  loading.value = false;
});
</script>

<template>
  <BaseLoader v-if="loading" width="sm:w-xs md:w-md" />
  <main v-else class="container">
    <header class="my-14">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{{ t("messages.afterSales.title") }}</h1>
        <UButton
          icon="i-lucide-refresh-cw"
          variant="ghost"
          size="sm"
          :label="t('messages.afterSales.refresh')"
          @click="load"
        />
      </div>
      <ULink :to="localePath('/account')" class="mt-2 text-sm">
        {{ t("messages.account.backToAccount") }}
      </ULink>
    </header>

    <UTabs v-model="activeTab" :items="tabItems" class="mb-4" />

    <!-- 工具栏：搜索 + 排序 -->
    <div class="mb-6 flex items-center gap-2">
      <input
        v-model="keyword"
        :placeholder="t('messages.afterSales.searchPlaceholder')"
        class="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
      <select
        v-model="sortBy"
        class="shrink-0 rounded-md border border-neutral-300 px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        <option value="newest">{{ t("messages.afterSales.sortNewest") }}</option>
        <option value="amount">{{ t("messages.afterSales.sortAmount") }}</option>
      </select>
    </div>

    <!-- 空态三分 -->
    <div v-if="listError" class="rounded-lg border border-error/30 p-8 text-center">
      <p class="text-sm text-neutral-500">{{ t("messages.afterSales.loadFailed") }}</p>
      <UButton class="mt-4" variant="soft" :label="t('messages.afterSales.retry')" @click="load" />
    </div>
    <p v-else-if="!requests.length" class="py-16 text-center text-neutral-500">
      {{ t("messages.afterSales.empty") }}
    </p>
    <p v-else-if="!matched.length" class="py-16 text-center text-neutral-500">
      {{ t("messages.afterSales.emptySearch") }}
    </p>
    <div v-else class="flex flex-col gap-4">
      <AfterSalesCard v-for="r in matched" :key="r.id" :request="r" />
    </div>

    <p v-if="truncated && matched.length" class="mt-4 text-center text-xs text-neutral-400">
      {{ t("messages.afterSales.onlyRecent100") }}
    </p>

    <div class="mt-10">
      <CustomerServiceCard />
    </div>
  </main>
</template>
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

Expected: 全绿。

- [ ] **Step 3: 本地手测**

`pnpm dev` → `/zh-CN/account/after-sales`：切 5 个页签、输入订单号/售后单号/商品名搜索、切换「退款金额（高→低）」、把搜索词输成不存在的值确认出现「搜索无结果」文案。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/pages/account/after-sales/index.vue
git commit -m "feat(after-sales): 列表页 5 页签 + 本地搜索/排序 + 空态三分"
```

---

### Task 10: C 端详情页（引导条 + 纵向时间线 + 吸底动作）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\after-sales\[id].vue`（整文件替换）

- [ ] **Step 1: 整文件替换**

```vue
<script setup lang="ts">
definePageMeta({ middleware: "account" });

import {
  afterSalesPrimaryAction,
  afterSalesPrimaryActionLabelKey,
  afterSalesStateInfo,
  afterSalesTypeLabelKey,
  canCancelAfterSales,
  canFillTracking,
} from "../../../utils/after-sales-state";
import { formatMoney } from "../../../utils/format-money";
import { assetSrc } from "../../../utils/image";

const { t, locale } = useI18n();
const localePath = useTenantLocalePath();
const id = useRouteParam("id");
const route = useRoute();

// 该查询需登录态 session 认证，SSR 阶段拿不到登录 cookie，改由客户端 onMounted 拉取
const { data, error, refresh } = await useAsyncGql(
  "AfterSalesRequest",
  { id },
  { immediate: false, server: false },
);
const request = computed(() => data.value?.afterSalesRequest ?? null);
const pageLoading = ref(true);
const hasError = computed(() => !!error.value || !request.value);
const { cancelRequest } = useAfterSales();

onMounted(async () => {
  try {
    await refresh();
  } catch {
    /* hasError 已覆盖 */
  } finally {
    pageLoading.value = false;
  }
  // 从列表卡片带过来的动作直达参数
  const action = route.query.action;
  if (action === "tracking" && request.value && canFillTracking(request.value.state)) trackingOpen.value = true;
  if (action === "cancel" && request.value && canCancelAfterSales(request.value.state)) cancelConfirmOpen.value = true;
});

const stateInfo = computed(() => (request.value ? afterSalesStateInfo(request.value.state) : null));
const typeKey = computed(() => (request.value ? afterSalesTypeLabelKey(request.value.type) : ""));
const isExchange = computed(() => request.value?.type === "exchange");
const amount = computed(() =>
  request.value ? formatMoney(request.value.refundAmount, "CNY", locale.value) : "",
);
const actualAmount = computed(() =>
  request.value?.actualRefundAmount != null
    ? formatMoney(request.value.actualRefundAmount, "CNY", locale.value)
    : "",
);
const refundedAtText = computed(() =>
  request.value?.refundedAt ? new Date(request.value.refundedAt).toLocaleString(locale.value) : "",
);
const preview = computed(() =>
  assetSrc(
    request.value?.orderLine?.featuredAsset?.preview ??
      request.value?.orderLine?.productVariant?.featuredAsset?.preview ??
      "",
    128,
  ),
);

const evidenceImages = computed(() => request.value?.evidenceImages ?? []);

const primaryAction = computed(() =>
  request.value ? afterSalesPrimaryAction(request.value.state) : "none",
);
const primaryLabel = computed(() => t(afterSalesPrimaryActionLabelKey(primaryAction.value)));

// 凭证图灯箱
const lightboxOpen = ref(false);
const activeEvidence = ref<string>("");
function openEvidence(src: string) {
  activeEvidence.value = src;
  lightboxOpen.value = true;
}

// 填写退货单号弹层
const trackingOpen = ref(false);

// 取消确认弹窗
const cancelConfirmOpen = ref(false);
const canceling = ref(false);
async function onCancelConfirm() {
  if (!request.value) return;
  canceling.value = true;
  try {
    const res = await cancelRequest(request.value.id);
    cancelConfirmOpen.value = false;
    if (res.ok) await refresh();
  } finally {
    canceling.value = false;
  }
}

function onPrimary() {
  if (primaryAction.value === "cancel") cancelConfirmOpen.value = true;
  else if (primaryAction.value === "tracking") trackingOpen.value = true;
}
</script>

<template>
  <BaseLoader v-if="pageLoading" width="sm:w-xs md:w-sm" />
  <UError
    v-else-if="hasError"
    :error="{ statusCode: 404, statusMessage: t('messages.afterSales.notFound'), message: t('messages.afterSales.notFound') }"
  />
  <main v-else-if="request" class="container mb-32">
    <header class="my-14">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{{ t("messages.afterSales.detailTitle") }}</h1>
        <UBadge v-if="stateInfo" :color="stateInfo.color" variant="outline" :label="t(stateInfo.labelKey)" />
      </div>
      <ULink :to="localePath('/account/after-sales')" class="mt-2 text-sm">{{ t("messages.afterSales.backToList") }}</ULink>
      <ULink
        v-if="request.order?.code"
        :to="localePath(`/account/orders/${request.order.code}`)"
        class="mt-1 block text-sm text-primary"
      >
        {{ t("messages.afterSales.orderCode") }}: {{ request.order.code }}
      </ULink>
    </header>

    <!-- 你需要做什么 -->
    <AfterSalesNextStep :state="request.state" />

    <!-- 商品卡 -->
    <section class="mb-6 flex items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <NuxtImg
        :src="preview"
        :alt="request.orderLine?.productVariant?.name ?? ''"
        class="h-20 w-20 rounded object-cover"
        loading="lazy"
      />
      <div class="min-w-0">
        <p class="font-medium">{{ t(typeKey) }}</p>
        <p class="truncate text-sm text-neutral-500">{{ request.orderLine?.productVariant?.name }}</p>
        <p v-if="!isExchange" class="text-sm">{{ t("messages.afterSales.amount") }}: {{ amount }}</p>
        <p v-if="actualAmount" class="text-sm">
          {{ t("messages.afterSales.actualRefundAmount") }}: {{ actualAmount }}
        </p>
      </div>
    </section>

    <!-- 处理进度 -->
    <section class="mb-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 class="mb-3 text-sm font-medium text-neutral-500">{{ t("messages.afterSales.progressTitle") }}</h2>
      <AfterSalesTimeline :request="request" />
    </section>

    <!-- 申请信息 -->
    <dl class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.reason") }}</dt>
        <dd class="mt-1">{{ request.reason }}</dd>
      </div>
      <div v-if="request.description">
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.description") }}</dt>
        <dd class="mt-1 whitespace-pre-line">{{ request.description }}</dd>
      </div>
      <div v-if="request.rejectReason">
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.rejectReason") }}</dt>
        <dd class="mt-1 text-error">{{ request.rejectReason }}</dd>
      </div>
      <div v-if="request.refundedAt && refundedAtText">
        <dt class="text-sm text-neutral-500">{{ t("messages.afterSales.refundedAt") }}</dt>
        <dd class="mt-1">{{ refundedAtText }}</dd>
      </div>
    </dl>

    <!-- 凭证图片 -->
    <section v-if="evidenceImages.length" class="mb-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 class="mb-3 text-sm font-medium text-neutral-500">{{ t("messages.afterSales.evidence") }}</h2>
      <div class="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <button
          v-for="(img, i) in evidenceImages"
          :key="i"
          type="button"
          class="aspect-square overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800"
          @click="openEvidence(img)"
        >
          <NuxtImg :src="assetSrc(img, 256)" :alt="t('messages.afterSales.evidence')" class="h-full w-full object-cover" loading="lazy" format="webp" />
        </button>
      </div>
    </section>
    <p v-else class="mb-6 text-xs text-neutral-400">{{ t("messages.afterSales.noEvidence") }}</p>

    <CustomerServiceCard class="mb-6" />

    <!-- 吸底动作区 -->
    <div
      class="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      <div class="container flex items-center justify-between gap-3 py-3">
        <UButton
          icon="i-lucide-headset"
          variant="soft"
          :label="t('messages.afterSales.customerService')"
          @click="() => $el?.scrollIntoView?.()"
        />
        <UButton
          v-if="primaryAction === 'cancel' || primaryAction === 'tracking'"
          color="primary"
          :label="primaryLabel"
          @click="onPrimary"
        />
      </div>
    </div>

    <!-- 填写退货单号 -->
    <UModal v-model:open="trackingOpen" :ui="{ content: 'sm:max-w-md' }">
      <template #body>
        <h3 class="mb-3 text-base font-medium">{{ t("messages.afterSales.trackTitle") }}</h3>
        <AfterSalesTrackForm :id="request.id" :embedded="true" @updated="refresh" />
      </template>
    </UModal>

    <!-- 凭证图灯箱 -->
    <UModal v-model:open="lightboxOpen" :ui="{ content: 'sm:max-w-xl' }">
      <div class="p-3">
        <img v-if="activeEvidence" :src="activeEvidence" :alt="t('messages.afterSales.evidence')" class="w-full rounded-md object-contain" />
      </div>
    </UModal>

    <!-- 取消确认 -->
    <UModal v-model:open="cancelConfirmOpen" :ui="{ content: 'sm:max-w-sm' }">
      <div class="p-5 text-center">
        <h2 class="text-base font-medium">{{ t("messages.afterSales.cancelConfirm") }}</h2>
        <p class="mt-1 text-sm text-neutral-500">{{ t("messages.afterSales.cancelConfirmDesc") }}</p>
        <div class="mt-5 flex justify-center gap-3">
          <UButton variant="soft" :label="t('messages.afterSales.keepRequest')" @click="cancelConfirmOpen = false" />
          <UButton color="error" :loading="canceling" :label="t('messages.afterSales.confirmCancel')" @click="onCancelConfirm" />
        </div>
      </div>
    </UModal>
  </main>
</template>
```

- [ ] **Step 2: `AfterSalesTrackForm` 支持嵌入模式**

在 [AfterSalesTrackForm.vue](file:///d:/zhao/nshop/layers/base/app/components/afterSales/AfterSalesTrackForm.vue) 中，把 `defineProps<{ id: string }>()` 改为：

```ts
const props = withDefaults(defineProps<{ id: string; embedded?: boolean }>(), { embedded: false });
```

并把模板最外层 `<div class="rounded-lg border ...">` 改为：

```vue
  <div :class="props.embedded ? '' : 'rounded-lg border border-neutral-200 p-4 dark:border-neutral-800'">
```

提交成功后（`res.ok` 分支）追加一行，让弹层能关：

```ts
    emit("updated");
```

（`emit("updated")` 已在原实现中，保持不动即可；弹层由详情页的 `refresh` 触发重渲染，用户手动关闭。）

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

Expected: 全绿。

- [ ] **Step 4: 局部手测**

`pnpm dev`：
1. `/zh-CN/account/after-sales/<Pending单>` → 引导条显示「等待商家审核」，吸底主按钮「取消」。
2. 带 `?action=cancel` 打开 → 取消确认弹层自动弹出。
3. `/zh-CN/account/after-sales/<Approved单>?action=tracking` → 填写退货单号弹层自动弹出。
4. `Rejected` / `RefundFailed` 单 → 时间线末端出现终止节点。

- [ ] **Step 5: Commit**

```bash
git add "layers/base/app/pages/account/after-sales/[id].vue" layers/base/app/components/afterSales/AfterSalesTrackForm.vue
git commit -m "feat(after-sales): 详情页引导条/纵向时间线/吸底动作，填单改弹层"
```

---

### Task 11: C 端 i18n 12 包同步

**Files:**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`（及另外 11 个语言包）

- [ ] **Step 1: 在 `zh-CN.ts` 的 `messages.afterSales` 内追加/改写词条**

保留现有键，删除已废弃的 `tabPending` / `tabToReturn` / `tabReturning` / `tabRefunded`，新增以下键（值用中文）：

```ts
      // 页签（5 个）
      tabActive: "进行中",
      tabAll: "全部",
      tabDone: "已完成",
      tabRejected: "已拒绝",
      tabClosed: "已取消",
      // 状态
      stateRefundFailed: "退款异常",
      // 新增状态文案
      searchPlaceholder: "搜索订单号 / 售后单号 / 商品名",
      sortNewest: "最新申请",
      sortAmount: "退款金额（高→低）",
      emptySearch: "没有匹配的售后记录",
      onlyRecent100: "仅显示最近 100 条",
      createdAt: "申请时间",
      updatedAt: "最近更新",
      refundedAt: "退款到账时间",
      actualRefundAmount: "实退金额",
      currentStep: "当前步骤",
      progressTitle: "处理进度",
      viewDetail: "查看详情",
      fillTracking: "填写退货单号",
      // 引导条
      nextPendingTitle: "等待商家审核",
      nextPendingDesc: "暂无需操作，审核结果将通过站内通知告知",
      nextApprovedTitle: "寄回商品并填写退货单号",
      nextApprovedDesc: "请在 7 天内寄回；寄回地址请联系客服",
      nextReturningTitle: "已寄出，等待商家收货",
      nextReturningDesc: "商家收到并确认后将发起退款",
      nextReceivedTitle: "商家已收货，退款处理中",
      nextReceivedDesc: "通常 1-3 个工作日到账",
      nextRefundedTitle: "退款已到账",
      nextRefundedDesc: "已退回原支付账户，请留意账户变动",
      nextRejectedTitle: "申请被拒绝",
      nextRejectedDesc: "可查看拒绝原因，或联系客服进一步沟通",
      nextRefundFailedTitle: "退款异常，商家正在处理",
      nextRefundFailedDesc: "可联系客服催促处理",
      nextClosedTitle: "申请已关闭",
      nextClosedDesc: "如需售后请重新发起申请",
      nextUnknownTitle: "处理中",
      nextUnknownDesc: "如有疑问请联系客服",
      // 申请表单
      typeReturnRefundDesc: "寄回后退款",
      typeRefundOnlyDesc: "无需寄回",
      typeExchangeDesc: "寄回后重发",
      hintReturnRefund: "需寄回商品，商家同意后请在 7 天内寄回",
      hintRefundOnly: "无需寄回，商家同意后直接退款",
      hintExchange: "换货不产生退款，需寄回原商品",
      maxRefundable: "最多可退 ¥{amount}",
      fullAmount: "全额",
      reason_quality: "质量问题",
      reason_damaged: "商品破损",
      reason_sizeMismatch: "尺寸不符",
      reason_notAsDescribed: "与描述不符",
      reason_wrongItem: "发错货",
      reason_missingItem: "少件漏发",
      reason_noLongerNeeded: "不想要了",
      reason_other: "其他",
      reasonOtherPlaceholder: "请填写申请原因",
      submitting: "提交中…",
      discardTitle: "放弃本次填写？",
      discardDesc: "已填写的内容与已上传的图片将一并作废。",
      keepEditing: "继续填写",
      discard: "放弃",
      // 凭证上传
      evidenceHint: "最多上传 {n} 张",
      evidenceMax: "最多上传 {n} 张",
      evidenceRetry: "重试",
      removeEvidence: "移除",
      evidenceTooLarge: "图片过大，请重新选择",
      evidenceUploadFailed: "图片上传失败，请重试",
      // 校验与错误
      errAmountRequired: "请填写退款金额",
      errAmountPositive: "退款金额需大于 0",
      errAmountMax: "最多可退 ¥{amount}",
      errReasonRequired: "请选择或填写申请原因",
      errUploading: "有图片正在上传，请稍候",
      errUploadFailed: "有图片上传失败，请重试",
      errDuplicate: "该商品已有进行中的售后申请",
      errAmountMaxServer: "退款金额超过可退上限",
      errExpired: "已超过售后申请期限（交易完成后 22 天内可申请）",
      errGeneric: "提交失败，建议联系客服",
```

- [ ] **Step 2: 其余 11 包同步**

对 `en-US.ts` 写英文值；`ja-JP` / `ko-KR` / `de-DE` / `fr-FR` / `es-ES` / `it-IT` / `pt-BR` / `ru-RU` / `bg-BG` / `fa-IR` 按各自语言翻译；若某键暂缺翻译，**必须显式写入英文值**（`zhFallbackLocale` 会兜底到中文，但这 12 包的 `afterSales` 块要么完整覆盖、要么整体不写——不要只写一半，避免同一区块中英混排）。

最少要求：**12 个包都出现同一个键集合**。用下面命令核对：

```bash
pnpm exec node -e "const fs=require('fs');const d='layers/base/i18n/locales';const keys=['tabActive','nextApprovedTitle','evidenceHint','errDuplicate'];for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.ts')&&x!=='merge.ts')){const s=fs.readFileSync(d+'/'+f,'utf8');const miss=keys.filter(k=>!s.includes(k+':'));console.log(f, miss.length?('MISSING '+miss.join(',')):'ok');}"
```

Expected: 12 行全部 `ok`。

- [ ] **Step 3: 词条引用自检**

```bash
pnpm exec node -e "const fs=require('fs');const files=['layers/base/app/pages/account/after-sales/index.vue','layers/base/app/pages/account/after-sales/[id].vue','layers/base/app/components/afterSales/AfterSalesCard.vue','layers/base/app/components/afterSales/AfterSalesCreateModal.vue','layers/base/app/components/afterSales/EvidenceUploader.vue','layers/base/app/components/afterSales/AfterSalesNextStep.vue','layers/base/app/utils/after-sales-state.ts'];const zh=fs.readFileSync('layers/base/i18n/locales/zh-CN.ts','utf8');const used=new Set();for(const f of files){const s=fs.readFileSync(f,'utf8');for(const m of s.matchAll(/messages\.afterSales\.([A-Za-z_]+)/g))used.add(m[1]);}const miss=[...used].filter(k=>!zh.includes(k+':'));console.log(miss.length?('MISSING '+miss.join(',')):'all keys present');"
```

Expected: `all keys present`。

- [ ] **Step 4: Commit**

```bash
git add layers/base/i18n/locales
git commit -m "feat(after-sales): i18n 12 包同步新增售后优化词条"
```

---

# 阶段二期：后台（web-admin）

### Task 12: `afterSaleActions.ts` 单一来源 + admin-api 扩字段

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\constants\afterSaleActions.ts`
- Modify: `d:\zhao\vshop\web-admin\src\apis\afterSale.ts`

- [ ] **Step 1: 新建动作可用性单一来源**

```ts
// 售后动作可用性与状态展示的**唯一来源**（列表页与详情页共用）。
// 严格对齐服务端状态机 vendure/packages/after-sales-plugin/src/types.ts 的 STATE_TRANSITIONS：
//   approve / reject          : Pending
//   confirmReturnReceived     : Returning
//   processAfterSalesRefund   : Received
//   retryAfterSalesRefund     : RefundFailed
import { AFTER_SALE_STATES, stateLabel, type StateLabel } from './orderState';

export interface AfterSaleActionAvailability {
  approve: boolean;
  reject: boolean;
  receive: boolean;
  refund: boolean;
  retry: boolean;
}

export function afterSaleActions(state?: string | null): AfterSaleActionAvailability {
  const s = state ?? '';
  return {
    approve: s === 'Pending',
    reject: s === 'Pending',
    receive: s === 'Returning',
    refund: s === 'Received',
    retry: s === 'RefundFailed',
  };
}

export function hasAfterSaleActions(state?: string | null): boolean {
  const a = afterSaleActions(state);
  return a.approve || a.reject || a.receive || a.refund || a.retry;
}

export function afterSaleStateLabel(state?: string | null): StateLabel {
  return stateLabel(AFTER_SALE_STATES, state);
}

/** 列表页签：key 为服务端 state（'' = 全部），label 为 afterSale.list.* 下的词条名 */
export const AFTER_SALE_TABS: { key: string; label: string }[] = [
  { key: 'Pending', label: 'tabPending' },
  { key: 'Approved', label: 'tabToReturn' },
  { key: 'Returning', label: 'tabToReceive' },
  { key: 'Received', label: 'tabToRefund' },
  { key: 'RefundFailed', label: 'tabRefundFailed' },
  { key: '', label: 'tabAll' },
  { key: 'Rejected', label: 'tabRejected' },
  { key: 'Closed', label: 'tabClosed' },
];

/** 主流程 5 节点（与 C 端同一套划分） */
export const AFTER_SALE_PROGRESS: string[] = [
  'Pending',
  'Approved',
  'Returning',
  'Received',
  'Refunded',
];

export function afterSaleProgressIndex(state?: string | null): number {
  const s = state ?? '';
  const i = AFTER_SALE_PROGRESS.indexOf(s);
  if (i >= 0) return i;
  if (s === 'RefundFailed') return 3;
  if (s === 'Rejected' || s === 'Closed') return 0;
  return -1;
}

export interface AfterSaleWaiting {
  text: string;
  over24h: boolean;
}

/** 已等待时长文案：{d} 天 {h} 小时 / {h} 小时 / {m} 分钟 */
export function afterSaleWaiting(
  createdAt: string | null | undefined,
  t: (key: string) => string,
  now: number = Date.now(),
): AfterSaleWaiting {
  if (!createdAt) return { text: '', over24h: false };
  const start = new Date(createdAt).getTime();
  if (Number.isNaN(start)) return { text: '', over24h: false };
  const ms = Math.max(0, now - start);
  const over24h = ms > 24 * 60 * 60 * 1000;
  const d = Math.floor(ms / (24 * 60 * 60 * 1000));
  const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const text = d > 0
    ? t('afterSale.list.waitingDays').replace('{d}', String(d)).replace('{h}', String(h))
    : h > 0
      ? t('afterSale.list.waitingHours').replace('{h}', String(h))
      : t('afterSale.list.waitingMinutes').replace('{m}', String(m));
  return { text, over24h };
}
```

- [ ] **Step 2: 扩 `AfterSaleRow` 类型与查询字段**

在 [afterSale.ts](file:///d:/zhao/vshop/web-admin/src/apis/afterSale.ts) 的 `AfterSaleRow` 接口中，`updatedAt` 之前插入：

```ts
  order?: {
    id: string;
    code: string;
  } | null;
  orderLine?: {
    id: string;
    quantity: number;
    sku?: string | null;
    featuredAsset?: { id: string; preview: string } | null;
    productVariant?: {
      id: string;
      name: string;
      sku: string;
      featuredAsset?: { id: string; preview: string } | null;
    } | null;
  } | null;
  customer?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    phoneNumber?: string | null;
    emailAddress?: string | null;
  } | null;
```

把 `AFTER_SALE_FIELDS` 常量替换为：

```ts
const AFTER_SALE_FIELDS = `
  id orderId orderLineId customerId type state reason description
  evidenceImages refundAmount returnTrackingNo returnCarrier rejectReason
  receivedQuantity restockJson refundTransactionId actualRefundAmount
  refundedAt refundError createdAt updatedAt
  order { id code }
  orderLine { id quantity sku featuredAsset { id preview } productVariant { id name sku featuredAsset { id preview } } }
  customer { id firstName lastName phoneNumber emailAddress }
`;
```

- [ ] **Step 3: 构建校验**

```bash
npx vue-tsc --noEmit -p tsconfig.json
```

cwd：`d:\zhao\vshop\web-admin`

Expected: 无类型错误（若仓库未配置 `vue-tsc`，跳过，改用 `npm run build:h5` 兜底）。

- [ ] **Step 4: Commit**

```bash
git add src/constants/afterSaleActions.ts src/apis/afterSale.ts
git commit -m "feat(after-sale): 动作可用性收敛为单一路径 + admin 查询补 order/orderLine/customer"
```

cwd：`d:\zhao\vshop\web-admin`

---

### Task 13: 后台列表页（8 页签 + 卡片补信息 + 卡上操作 + 筛选折叠）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\after-sale\list\index.vue`

- [ ] **Step 1: 替换 `<script setup>` 部分**

用以下代码替换原 `<script lang="ts" setup>` 到 `</script>` 之间的全部内容：

```ts
import { ref, onMounted } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import {
  fetchAfterSalePage,
  buildAfterSaleFilter,
  approveAfterSale,
  rejectAfterSale,
  confirmAfterSaleReceived,
  processAfterSaleRefund,
  retryAfterSaleRefund,
  AfterSaleRow,
  type AfterSaleSortBy,
} from '../../../apis/afterSale';
import { useListPage } from '../../../composables/useListPage';
import { AFTER_SALE_TYPES } from '../../../constants/orderState';
import {
  AFTER_SALE_TABS,
  afterSaleActions,
  afterSaleStateLabel,
  afterSaleWaiting,
} from '../../../constants/afterSaleActions';

const locale = useLocaleStore();
const typeKeys = Object.keys(AFTER_SALE_TYPES);

// 页签全量化为 8 个，默认落在「待处理」（真正的待办入口）
const tabs = AFTER_SALE_TABS;
const cur = ref('Pending');

// 筛选态（逻辑保留不动，仅默认收起）
const filtersOpen = ref(false);
const kw = ref('');
const typeFilter = ref('');
const from = ref('');
const to = ref('');
const minRefund = ref('');
const maxRefund = ref('');
const sortBy = ref<AfterSaleSortBy>('createdAt');

const page = useListPage<AfterSaleRow>({
  take: 20,
  immediate: false,
  fetcher: ({ skip, take, filter, sort }) => fetchAfterSalePage({ skip, take, filter, sort }),
});

function currentFilter(): Record<string, unknown> {
  return buildAfterSaleFilter({
    keyword: kw.value,
    type: typeFilter.value,
    from: from.value,
    to: to.value,
    minRefund: minRefund.value ? Math.round(Number(minRefund.value) * 100) : undefined,
    maxRefund: maxRefund.value ? Math.round(Number(maxRefund.value) * 100) : undefined,
  });
}

function combinedFilter(): Record<string, unknown> {
  const base = currentFilter();
  if (!cur.value) return base;
  const stateClause = { state: { eq: cur.value } };
  return base._and
    ? { _and: [...(base._and as unknown[]), stateClause] }
    : { _and: [stateClause] };
}

async function reload() {
  page.filter.value = combinedFilter();
  page.sort.value = { [sortBy.value]: 'DESC' };
  await page.refresh();
}

function onApply() { void reload(); }
function onType(k: string) {
  typeFilter.value = typeFilter.value === k ? '' : k;
  void reload();
}
function onDate(which: 'from' | 'to', v: string) {
  if (which === 'from') from.value = v; else to.value = v;
  void reload();
}
function onSort(k: AfterSaleSortBy) {
  if (sortBy.value === k) return;
  sortBy.value = k;
  void reload();
}
function onClear() {
  kw.value = ''; typeFilter.value = ''; from.value = ''; to.value = ''; minRefund.value = ''; maxRefund.value = '';
  void reload();
}
function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  void reload();
}

const st = (a: AfterSaleRow) => afterSaleStateLabel(a.state);

function money(n?: number | null): string {
  return ((n ?? 0) / 100).toFixed(2);
}

function productName(a: AfterSaleRow): string {
  return a.orderLine?.productVariant?.name ?? '';
}

function productThumb(a: AfterSaleRow): string {
  return (
    a.orderLine?.featuredAsset?.preview ??
    a.orderLine?.productVariant?.featuredAsset?.preview ??
    ''
  );
}

function customerText(a: AfterSaleRow): string {
  const c = a.customer;
  if (!c) return '';
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  const phone = c.phoneNumber ? c.phoneNumber.replace(/^(\d{3})\d{4}(\d+)$/, '$1****$2') : '';
  return [name, phone].filter(Boolean).join(' · ');
}

function waitingText(a: AfterSaleRow): string {
  return afterSaleWaiting(a.createdAt, locale.t).text;
}
function waitingOver24h(a: AfterSaleRow): boolean {
  return afterSaleWaiting(a.createdAt, locale.t).over24h;
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

function stop(e: Event) {
  e.stopPropagation();
}

async function run(action: () => Promise<unknown>, okMsg: string) {
  try {
    await action();
    uni.showToast({ title: okMsg, icon: 'success' });
    await reload();
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.list.opFailed'));
  }
}

function onCardApprove(a: AfterSaleRow) {
  uni.showModal({
    title: locale.t('afterSale.detail.approveTitle'),
    content: locale.t('afterSale.detail.approveContent').replace('{amount}', money(a.refundAmount)),
    success: (res) => { if (res.confirm) void run(() => approveAfterSale(a.id), locale.t('afterSale.detail.approved')); },
  });
}

function onCardReject(a: AfterSaleRow) {
  uni.showModal({
    title: locale.t('afterSale.detail.rejectTitle'),
    editable: true,
    placeholderText: locale.t('afterSale.detail.rejectReasonPlaceholder'),
    success: (res) => {
      if (!res.confirm) return;
      const reason = (res.content || '').trim();
      if (!reason) { toast(locale.t('afterSale.detail.rejectReasonRequired')); return; }
      void run(() => rejectAfterSale(a.id, reason), locale.t('afterSale.detail.rejected'));
    },
  });
}

function onCardReceive(a: AfterSaleRow) {
  uni.showModal({
    title: locale.t('afterSale.detail.receiveTitle'),
    content: locale.t('afterSale.detail.receiveContent'),
    success: (res) => { if (res.confirm) void run(() => confirmAfterSaleReceived(a.id), locale.t('afterSale.detail.received')); },
  });
}

function onCardRefund(a: AfterSaleRow) {
  uni.showModal({
    title: locale.t('afterSale.detail.refundTitle'),
    content: locale.t('afterSale.detail.refundContent').replace('{amount}', money(a.refundAmount)),
    success: (res) => { if (res.confirm) void run(() => processAfterSaleRefund(a.id), locale.t('afterSale.detail.refundInitiated')); },
  });
}

function onCardRetry(a: AfterSaleRow) {
  uni.showModal({
    title: locale.t('afterSale.detail.retryTitle'),
    content: locale.t('afterSale.detail.retryContent'),
    success: (res) => { if (res.confirm) void run(() => retryAfterSaleRefund(a.id), locale.t('afterSale.detail.retryInitiated')); },
  });
}

function goDetail(a: AfterSaleRow) {
  uni.navigateTo({ url: `/pages/after-sale/detail/index?id=${a.id}` });
}

onLoad((query) => {
  page.syncFromQuery((query ?? {}) as Record<string, string>);
  void reload();
});
onMounted(() => { /* onLoad 已触发首屏 */ });
onShow(() => { if (page.items.value.length) void reload(); });
```

> 注意：`onMounted` 里原来那句注释保留，不要在 setup 顶层再发一次请求。

- [ ] **Step 2: 替换模板**

用以下内容替换原 `<template>` 到 `</template>` 之间的全部内容：

```vue
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key || 'all'" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ $t('afterSale.list.' + s.label) }}
      </text>
    </view>

    <!-- 首屏只留搜索框 + 筛选开关；详细筛选默认折叠 -->
    <view class="filters">
      <view class="kwrow">
        <input
          class="kw"
          :value="kw"
          :placeholder="$t('afterSale.list.filterKeyword')"
          confirm-type="search"
          @input="(e:any) => (kw = e.detail.value)"
          @confirm="onApply"
        />
        <text class="toggle" @tap="filtersOpen = !filtersOpen">
          {{ filtersOpen ? $t('afterSale.list.filterHide') : $t('afterSale.list.filterApply') }}
        </text>
      </view>

      <template v-if="filtersOpen">
        <view class="chips">
          <text class="chip" :class="{ on: !typeFilter }" @tap="onType('')">{{ $t('afterSale.list.filterTypeAll') }}</text>
          <text
            class="chip"
            v-for="k in typeKeys"
            :key="k"
            :class="{ on: typeFilter === k }"
            @tap="onType(k)"
          >{{ $t('afterSale.list.typeLabel').replace('{type}', AFTER_SALE_TYPES[k] || k) }}</text>
        </view>
        <view class="ranges">
          <picker mode="date" :value="from" @change="(e:any) => onDate('from', e.detail.value)">
            <text class="range">{{ $t('afterSale.list.filterDateFrom') }}：{{ from || '—' }}</text>
          </picker>
          <picker mode="date" :value="to" @change="(e:any) => onDate('to', e.detail.value)">
            <text class="range">{{ $t('afterSale.list.filterDateTo') }}：{{ to || '—' }}</text>
          </picker>
        </view>
        <view class="ranges">
          <input class="num" type="digit" :value="minRefund" :placeholder="$t('afterSale.list.filterRefundMin')"
            @input="(e:any) => (minRefund = e.detail.value)" @blur="onApply" />
          <input class="num" type="digit" :value="maxRefund" :placeholder="$t('afterSale.list.filterRefundMax')"
            @input="(e:any) => (maxRefund = e.detail.value)" @blur="onApply" />
        </view>
        <view class="chips">
          <text class="chip" :class="{ on: sortBy === 'createdAt' }" @tap="onSort('createdAt')">{{ $t('afterSale.list.sortCreated') }}</text>
          <text class="chip" :class="{ on: sortBy === 'refundAmount' }" @tap="onSort('refundAmount')">{{ $t('afterSale.list.sortRefund') }}</text>
          <text class="chip" @tap="onClear">{{ $t('afterSale.list.filterClear') }}</text>
        </view>
      </template>
    </view>

    <view class="card" v-for="a in page.items.value" :key="a.id" @tap="goDetail(a)">
      <view class="row">
        <text class="code">{{ $t('afterSale.list.afterSalePrefix') }}{{ a.id }} · {{ $t('afterSale.list.orderPrefix') }}{{ a.order?.code || a.orderId }}</text>
        <text class="st" :style="{ color: st(a).color }">{{ st(a).label }}</text>
      </view>
      <view class="prod">
        <image v-if="productThumb(a)" class="thumb" :src="productThumb(a)" mode="aspectFill" />
        <view class="pmeta">
          <text class="pname">{{ productName(a) }}</text>
          <text class="line">{{ $t('afterSale.list.typeLabel').replace('{type}', AFTER_SALE_TYPES[a.type] || a.type) }}<template v-if="a.type !== 'exchange'"> · {{ $t('afterSale.list.refundAmountLabel').replace('{amount}', money(a.refundAmount)) }}</template></text>
          <text class="line" v-if="customerText(a)">{{ customerText(a) }}</text>
        </view>
      </view>
      <text class="line" :class="{ danger: waitingOver24h(a) }">
        {{ waitingText(a) }} · {{ $t('afterSale.list.createdAtLabel') }}{{ fmtTime(a.createdAt) }}
      </text>
      <text class="line" v-if="a.reason">{{ $t('afterSale.list.reasonLabel').replace('{reason}', a.reason) }}</text>
      <text class="line" v-if="a.rejectReason">{{ $t('afterSale.list.rejectLabel').replace('{reason}', a.rejectReason) }}</text>

      <view class="ops" v-if="afterSaleActions(a.state).approve || afterSaleActions(a.state).reject || afterSaleActions(a.state).receive || afterSaleActions(a.state).refund || afterSaleActions(a.state).retry">
        <button v-if="afterSaleActions(a.state).approve" class="op main" @tap="stop" @click="onCardApprove(a)">{{ $t('afterSale.detail.approve') }}</button>
        <button v-if="afterSaleActions(a.state).reject" class="op" @tap="stop" @click="onCardReject(a)">{{ $t('afterSale.detail.reject') }}</button>
        <button v-if="afterSaleActions(a.state).receive" class="op main" @tap="stop" @click="onCardReceive(a)">{{ $t('afterSale.detail.receive') }}</button>
        <button v-if="afterSaleActions(a.state).refund" class="op main" @tap="stop" @click="onCardRefund(a)">{{ $t('afterSale.detail.refund') }}</button>
        <button v-if="afterSaleActions(a.state).retry" class="op" @tap="stop" @click="onCardRetry(a)">{{ $t('afterSale.detail.retry') }}</button>
        <button class="op" @tap="stop" @click="goDetail(a)">{{ $t('afterSale.list.detailBtn') }}</button>
      </view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ $t('afterSale.list.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('afterSale.list.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">{{ cur === 'Pending' ? $t('afterSale.list.emptyPending') : $t('afterSale.list.empty') }}</view>

    <view class="empty" v-if="page.loadingMore.value">{{ $t('afterSale.list.loadMore') }}</view>
    <view class="empty" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('afterSale.list.noMore') }}</view>
    <view class="progress" v-if="page.total.value">
      {{ $t('afterSale.list.shown').replace('{n}', String(page.shown.value)).replace('{m}', String(page.total.value)) }}
    </view>

    <view style="height: 160rpx" />
    <BottomBar current="order" />
  </view>
```

- [ ] **Step 3: 补样式**

在 `<style lang="scss" scoped>` 的 `.card { ... }` 内追加（保持既有规则不动）：

```scss
    .prod { display: flex; gap: 16rpx; margin-top: 12rpx; align-items: center;
      .thumb { width: 96rpx; height: 96rpx; border-radius: $wa-radius; background: $wa-bg; flex-shrink: 0; }
      .pmeta { flex: 1; min-width: 0;
        .pname { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      }
    }
    .ops { display: flex; gap: 12rpx; flex-wrap: wrap; margin-top: 16rpx;
      .op { min-width: 128rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; } }
    }
```

在 `.line` 规则加一个修饰（若 `.line` 已有 `&.danger` 则跳过）：

```scss
    .line.danger { color: $wa-danger; }
```

在 `.filters` 内追加：

```scss
    .kwrow { display: flex; align-items: center; gap: 16rpx;
      .kw { flex: 1; }
      .toggle { font-size: 24rpx; color: $wa-accent; flex-shrink: 0; } }
```

- [ ] **Step 4: 构建校验**

```bash
npm run build:h5
```

cwd：`d:\zhao\vshop\web-admin`

Expected: 构建成功，无模板编译错误。

- [ ] **Step 5: Commit**

```bash
git add src/pages/after-sale/list/index.vue
git commit -m "feat(after-sale): 列表页 8 页签 + 卡片补商品/顾客/等待时长 + 卡上直接处理 + 筛选折叠"
```

---

### Task 14: 后台详情页（修正动作可用性 + 顾客/商品/凭证/时间线 + 吸底）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\after-sale\detail\index.vue`

- [ ] **Step 1: 替换 `<script lang="ts" setup>` 部分**

```ts
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchAfterSale,
  approveAfterSale,
  rejectAfterSale,
  confirmAfterSaleReceived,
  processAfterSaleRefund,
  retryAfterSaleRefund,
  AfterSaleRow,
} from '../../../apis/afterSale';
import { AFTER_SALE_TYPES } from '../../../constants/orderState';
import {
  afterSaleActions,
  afterSaleProgressIndex,
  afterSaleStateLabel,
  hasAfterSaleActions,
} from '../../../constants/afterSaleActions';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const detail = ref<AfterSaleRow | null>(null);
const loading = ref(false);

const money = (n?: number | null): string => ((n ?? 0) / 100).toFixed(2);

const stLabel = computed(() => afterSaleStateLabel(detail.value?.state).label);
const stColor = computed(() => afterSaleStateLabel(detail.value?.state).color);

// 动作可用性：唯一来源 constants/afterSaleActions.ts，严格对齐服务端状态机
const can = computed(() => afterSaleActions(detail.value?.state));
const hasOps = computed(() => hasAfterSaleActions(detail.value?.state));

// 吸底主按钮文案（主流程动作在任一状态下最多命中一个）
const primaryLabel = computed(() => {
  const c = can.value;
  if (c.approve) return locale.t('afterSale.detail.approve');
  if (c.receive) return locale.t('afterSale.detail.receive');
  if (c.refund) return locale.t('afterSale.detail.refund');
  if (c.retry) return locale.t('afterSale.detail.retry');
  return '';
});

// 库存回补明细折叠态
const restockOpen = ref(false);

const isExchange = computed(() => detail.value?.type === 'exchange');
const productName = computed(() => detail.value?.orderLine?.productVariant?.name ?? '');
const productSku = computed(
  () => detail.value?.orderLine?.sku ?? detail.value?.orderLine?.productVariant?.sku ?? '',
);
const productThumb = computed(
  () =>
    detail.value?.orderLine?.featuredAsset?.preview ??
    detail.value?.orderLine?.productVariant?.featuredAsset?.preview ??
    '',
);
const customerName = computed(() => {
  const c = detail.value?.customer;
  if (!c) return '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
});

// 时间线（与 C 端同一套 5 节点划分）
const TIMELINE_KEYS = ['Pending', 'Approved', 'Returning', 'Received', 'Refunded'];
const timeline = computed(() => {
  const r = detail.value;
  if (!r) return [] as { key: string; label: string; time: string | null; reached: boolean; current: boolean; failed: boolean; detail?: string | null }[];
  const idx = afterSaleProgressIndex(r.state);
  const list = TIMELINE_KEYS.map((k, i) => ({
    key: k,
    label: locale.t(`afterSale.timeline.step${k}`),
    time: i === 0 ? fmtTime(r.createdAt) : i === idx ? fmtTime(r.updatedAt) : null,
    reached: i <= idx,
    current: i === idx && r.state === k,
    failed: false,
    detail: k === 'Returning' && (r.returnCarrier || r.returnTrackingNo)
      ? `${r.returnCarrier || ''} ${r.returnTrackingNo || ''}`.trim()
      : null,
  }));
  if (r.state === 'RefundFailed') {
    list.push({ key: 'RefundFailed', label: locale.t('afterSale.detail.statusFailed'), time: fmtTime(r.updatedAt), reached: true, current: true, failed: true, detail: null });
  } else if (r.state === 'Rejected') {
    list.push({ key: 'Rejected', label: locale.t('afterSale.detail.statusRejected'), time: fmtTime(r.updatedAt), reached: true, current: true, failed: true, detail: r.rejectReason ?? null });
  } else if (r.state === 'Closed') {
    list.push({ key: 'Closed', label: locale.t('afterSale.detail.statusClosed'), time: fmtTime(r.updatedAt), reached: true, current: true, failed: false, detail: null });
  }
  return list;
});

// 库存回补明细（restockJson: [{ stockLocationId, quantity }]）
const restockRows = computed(() => {
  const raw = detail.value?.restockJson;
  if (!raw) return [] as { stockLocationId: string; quantity: number }[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
});

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function refresh() {
  if (!detail.value?.id) return;
  loading.value = true;
  try {
    detail.value = await fetchAfterSale(detail.value.id);
  } finally {
    loading.value = false;
  }
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

async function run(action: () => Promise<AfterSaleRow>, okMsg: string) {
  try {
    await action();
    uni.showToast({ title: okMsg, icon: 'success' });
    await refresh();
  } catch (e: any) {
    // 失败不改本地状态，刷新后以服务端为准
    toast(e?.message || locale.t('afterSale.detail.opFailed'));
  }
}

function onApprove() {
  uni.showModal({
    title: locale.t('afterSale.detail.approveTitle'),
    content: locale.t('afterSale.detail.approveContent').replace('{amount}', money(detail.value?.refundAmount)),
    success: (res) => { if (res.confirm && detail.value) void run(() => approveAfterSale(detail.value!.id), locale.t('afterSale.detail.approved')); },
  });
}

function onReject() {
  uni.showModal({
    title: locale.t('afterSale.detail.rejectTitle'),
    editable: true,
    placeholderText: locale.t('afterSale.detail.rejectReasonPlaceholder'),
    success: (res) => {
      if (!res.confirm || !detail.value) return;
      const reason = (res.content || '').trim();
      if (!reason) { toast(locale.t('afterSale.detail.rejectReasonRequired')); return; }
      void run(() => rejectAfterSale(detail.value!.id, reason), locale.t('afterSale.detail.rejected'));
    },
  });
}

function onReceive() {
  uni.showModal({
    title: locale.t('afterSale.detail.receiveTitle'),
    content: locale.t('afterSale.detail.receiveContent'),
    success: (res) => { if (res.confirm && detail.value) void run(() => confirmAfterSaleReceived(detail.value!.id), locale.t('afterSale.detail.received')); },
  });
}

function onRefund() {
  uni.showModal({
    title: locale.t('afterSale.detail.refundTitle'),
    content: locale.t('afterSale.detail.refundContent').replace('{amount}', money(detail.value?.refundAmount)),
    success: (res) => { if (res.confirm && detail.value) void run(() => processAfterSaleRefund(detail.value!.id), locale.t('afterSale.detail.refundInitiated')); },
  });
}

function onRetry() {
  uni.showModal({
    title: locale.t('afterSale.detail.retryTitle'),
    content: locale.t('afterSale.detail.retryContent'),
    success: (res) => { if (res.confirm && detail.value) void run(() => retryAfterSaleRefund(detail.value!.id), locale.t('afterSale.detail.retryInitiated')); },
  });
}

function callCustomer() {
  const phone = detail.value?.customer?.phoneNumber;
  if (phone) uni.makePhoneCall({ phoneNumber: phone });
}

function previewEvidence(url: string) {
  uni.previewImage({ urls: detail.value?.evidenceImages ?? [], current: url });
}

function goOrder() {
  const code = detail.value?.order?.code;
  if (code) uni.navigateTo({ url: `/pages/order/detail/index?code=${code}` });
}

function onPrimary() {
  const c = can.value;
  if (c.approve) onApprove();
  else if (c.receive) onReceive();
  else if (c.refund) onRefund();
  else if (c.retry) onRetry();
}

function secondaryAction(): (() => void) | null {
  const c = can.value;
  if (c.reject) return onReject;
  if (c.approve && (c.receive || c.refund || c.retry)) return onReject;
  return null;
}

onLoad(async (q) => {
  const id: string = (q && (q.id as string)) || '';
  loading.value = true;
  try {
    detail.value = await fetchAfterSale(id);
  } finally {
    loading.value = false;
  }
});
```

- [ ] **Step 2: 替换模板**

用以下内容替换原 `<template>` 到 `</template>` 之间的全部内容：

```vue
  <view class="page">
    <!-- 头部：状态徽章 + 订单号（可跳订单详情） -->
    <view v-if="detail" class="head card">
      <view class="row">
        <text class="code">{{ $t('afterSale.detail.afterSalePrefix') }}{{ detail.id }}</text>
        <text class="st" :style="{ color: stColor }">{{ stLabel }}</text>
      </view>
      <text class="sub">{{ $t('afterSale.detail.orderPrefix') }}{{ detail.order?.code || detail.orderId }}</text>
      <text class="sub link" v-if="detail.order?.code" @tap="goOrder">{{ $t('afterSale.detail.viewOrder') }} ›</text>
    </view>

    <!-- 顾客卡 -->
    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.customerTitle') }}</text>
      <view class="cust">
        <view class="cmeta">
          <text class="cname">{{ customerName || '—' }}</text>
          <text class="line muted" v-if="detail.customer?.phoneNumber">{{ detail.customer.phoneNumber }}</text>
          <text class="line muted" v-if="detail.customer?.emailAddress">{{ detail.customer.emailAddress }}</text>
        </view>
        <button v-if="detail.customer?.phoneNumber" class="op" @tap="callCustomer">{{ $t('afterSale.detail.callCustomer') }}</button>
      </view>
    </view>

    <!-- 商品卡 -->
    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.productTitle') }}</text>
      <view class="prod">
        <image v-if="productThumb" class="thumb" :src="productThumb" mode="aspectFill" />
        <view class="pmeta">
          <text class="pname">{{ productName || '—' }}</text>
          <text class="line muted" v-if="productSku">{{ $t('afterSale.detail.skuLabel') }}{{ productSku }}</text>
          <text class="line muted">{{ $t('afterSale.detail.typeLabel').replace('{type}', AFTER_SALE_TYPES[detail.type] || detail.type) }}</text>
        </view>
      </view>
    </view>

    <!-- 售后信息 -->
    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.infoTitle') }}</text>
      <view class="cell"><text>{{ $t('afterSale.detail.status') }}</text><text class="val">{{ stLabel }}</text></view>
      <view class="cell" v-if="!isExchange">
        <text>{{ $t('afterSale.detail.refundAmount') }}</text>
        <text class="val danger">¥ {{ money(detail.refundAmount) }}</text>
      </view>
      <view class="cell" v-if="detail.actualRefundAmount != null">
        <text>{{ $t('afterSale.detail.actualRefundAmount') }}</text>
        <text class="val">¥ {{ money(detail.actualRefundAmount) }}</text>
      </view>
      <view class="cell" v-if="detail.refundedAt"><text>{{ $t('afterSale.detail.refundedAt') }}</text><text class="val">{{ fmtTime(detail.refundedAt) }}</text></view>
      <view class="cell" v-if="detail.receivedQuantity != null"><text>{{ $t('afterSale.detail.receivedQuantity') }}</text><text class="val">{{ detail.receivedQuantity }}</text></view>
      <view class="cell" v-if="detail.reason"><text>{{ $t('afterSale.detail.reason') }}</text><text class="val break">{{ detail.reason }}</text></view>
      <view class="cell" v-if="detail.description"><text>{{ $t('afterSale.detail.description') }}</text><text class="val break">{{ detail.description }}</text></view>
      <view class="cell" v-if="detail.rejectReason"><text>{{ $t('afterSale.detail.rejectReason') }}</text><text class="val break">{{ detail.rejectReason }}</text></view>
      <view class="cell" v-if="detail.refundError"><text>{{ $t('afterSale.detail.refundError') }}</text><text class="val break refund-err">{{ detail.refundError }}</text></view>
      <view class="cell" v-if="detail.returnCarrier || detail.returnTrackingNo">
        <text>{{ $t('afterSale.detail.returnLogistics') }}</text>
        <text class="val break">{{ detail.returnCarrier || $t('afterSale.detail.express') }} {{ detail.returnTrackingNo }}</text>
      </view>
      <view class="cell"><text>{{ $t('afterSale.detail.createdAt') }}</text><text class="val">{{ fmtTime(detail.createdAt) }}</text></view>
      <view class="cell" v-if="detail.updatedAt"><text>{{ $t('afterSale.detail.updatedAt') }}</text><text class="val">{{ fmtTime(detail.updatedAt) }}</text></view>
    </view>

    <!-- 处理进度时间线（与 C 端同一套 5 节点划分） -->
    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.progressTitle') }}</text>
      <view class="tl" v-for="(t, i) in timeline" :key="t.key + i" :class="{ on: t.reached, fail: t.failed, cur: t.current }">
        <view class="dot" />
        <view class="tmeta">
          <text class="tlabel">{{ t.label }}</text>
          <text class="line muted" v-if="t.time">{{ t.time }}</text>
          <text class="line fail-text" v-if="t.detail">{{ t.detail }}</text>
        </view>
      </view>
    </view>

    <!-- 顾客凭证 -->
    <view class="card" v-if="detail && detail.evidenceImages && detail.evidenceImages.length">
      <text class="sec-title">{{ $t('afterSale.detail.evidenceTitle') }}</text>
      <view class="grid">
        <image v-for="(u, i) in detail.evidenceImages" :key="i" class="shot" :src="u" mode="aspectFill" @tap="previewEvidence(u)" />
      </view>
    </view>

    <!-- 库存回补明细（折叠） -->
    <view class="card" v-if="detail && restockRows.length">
      <view class="fold" @tap="restockOpen = !restockOpen">
        <text class="sec-title no-mb">{{ $t('afterSale.detail.restockTitle') }}</text>
        <text class="fold-x">{{ restockOpen ? '−' : '+' }}</text>
      </view>
      <template v-if="restockOpen">
        <view class="cell" v-for="(r, i) in restockRows" :key="i">
          <text>{{ $t('afterSale.detail.stockLocation') }}{{ r.stockLocationId }}</text>
          <text class="val">× {{ r.quantity }}</text>
        </view>
      </template>
    </view>

    <view v-if="loading" class="empty">{{ $t('afterSale.detail.loading') }}</view>
    <view v-else-if="!detail" class="empty">{{ $t('afterSale.detail.notFound') }}</view>

    <view style="height: 200rpx" />

    <!-- 吸底操作区：主操作 + （若同时可拒绝）次操作 -->
    <view class="footbar" v-if="detail && hasOps">
      <button v-if="secondaryAction()" class="op" @tap="secondaryAction()!()">{{ $t('afterSale.detail.reject') }}</button>
      <button class="op main" @tap="onPrimary">{{ primaryLabel }}</button>
    </view>
  </view>
```

> 说明：`hasOps` 与 `primaryLabel` 均由 `afterSaleActions()` 推导，因此「确认收货」只在 `Returning` 出现、「执行退款」只在 `Received` 出现——原详情页把 `receive` 判成 `Approved`、把 `refund` 判成 `['Approved','Received']` 的 A4 缺陷在此根除。

- [ ] **Step 3: 补样式**

在 `<style lang="scss" scoped>` 的 `.page { ... }` 内、`.head { ... }` 之前插入：

```scss
    .cust { display: flex; align-items: center; gap: 16rpx;
      .cmeta { flex: 1; min-width: 0;
        .cname { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; } }
      .op { min-width: 144rpx; margin: 0; padding: 0 20rpx; height: 60rpx; line-height: 60rpx;
        font-size: 26rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink; }
    }
    .prod { display: flex; gap: 16rpx; align-items: center;
      .thumb { width: 112rpx; height: 112rpx; border-radius: $wa-radius; background: $wa-bg; flex-shrink: 0; }
      .pmeta { flex: 1; min-width: 0;
        .pname { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; } }
    }
    .tl { position: relative; padding-left: 36rpx; padding-bottom: 20rpx;
      &:last-child { padding-bottom: 0; }
      &::before { content: ''; position: absolute; left: 9rpx; top: 18rpx; bottom: -4rpx;
        width: 2rpx; background: $wa-bg; }
      &:last-child::before { display: none; }
      .dot { position: absolute; left: 0; top: 8rpx; width: 20rpx; height: 20rpx;
        border-radius: 50%; background: $wa-bg; }
      &.on .dot { background: $wa-accent; }
      &.fail .dot { background: $wa-danger; }
      .tmeta { display: flex; flex-direction: column; gap: 4rpx;
        .tlabel { font-size: 28rpx; color: $wa-muted; }
        .fail-text { color: $wa-danger; } }
      &.on .tmeta .tlabel { color: $wa-ink; font-weight: 600; }
    }
    .grid { display: flex; flex-wrap: wrap; gap: 16rpx;
      .shot { width: 180rpx; height: 180rpx; border-radius: $wa-radius; background: $wa-bg; } }
    .fold { display: flex; align-items: center; justify-content: space-between;
      .no-mb { margin-bottom: 0; }
      .fold-x { font-size: 34rpx; color: $wa-muted; } }
    .link { color: $wa-accent; }
    .footbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
      display: flex; gap: 20rpx; padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
      background: $wa-card; box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.06);
      .op { flex: 1; margin: 0; height: 84rpx; line-height: 84rpx; font-size: 30rpx;
        border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; } }
    }
```

- [ ] **Step 4: 构建校验**

```bash
npm run build:h5
```

cwd：`d:\zhao\vshop\web-admin`

Expected: 构建成功，无模板编译错误。

- [ ] **Step 5: Commit**

```bash
git add src/pages/after-sale/detail/index.vue
git commit -m "fix(after-sale): 详情页动作对齐状态机 + 顾客/商品/凭证/进度/回补明细 + 吸底操作区"
```

cwd：`d:\zhao\vshop\web-admin`

---

### Task 15: 后台 i18n 双包同步

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json:738-812`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json:738-812`

- [ ] **Step 1: `zh-Hans.json` 的 `afterSale.list` 内追加**

在 [zh-Hans.json](file:///d:/zhao/vshop/web-admin/src/locale/zh-Hans.json#L739-L766) 的 `"list"` 对象内，`"retry"` 之前插入：

```json
      "afterSalePrefix": "售后 #",
      "tabToReturn": "待寄回",
      "tabToReceive": "待收货",
      "tabToRefund": "待退款",
      "tabRefundFailed": "退款异常",
      "tabClosed": "已取消",
      "waitingDays": "已等待 {d} 天 {h} 小时",
      "waitingHours": "已等待 {h} 小时",
      "waitingMinutes": "已等待 {m} 分钟",
      "createdAtLabel": "申请于 ",
      "emptyPending": "暂无待处理工单",
      "detailBtn": "详情",
      "filterHide": "收起",
```

- [ ] **Step 2: `zh-Hans.json` 的 `afterSale.detail` 内追加**

在 [zh-Hans.json](file:///d:/zhao/vshop/web-admin/src/locale/zh-Hans.json#L767-L811) 的 `"detail"` 对象内，`"retryInitiated"` 之后插入：

```json
      ,
      "viewOrder": "查看订单",
      "customerTitle": "顾客",
      "callCustomer": "拨打电话",
      "productTitle": "商品",
      "skuLabel": "规格：",
      "typeLabel": "售后类型：{type}",
      "progressTitle": "处理进度",
      "evidenceTitle": "顾客凭证",
      "restockTitle": "库存回补",
      "stockLocation": "库存点 ",
      "statusFailed": "退款失败",
      "statusRejected": "已拒绝",
      "statusClosed": "已关闭"
```

- [ ] **Step 3: `zh-Hans.json` 新增 `afterSale.timeline`**

在 [zh-Hans.json](file:///d:/zhao/vshop/web-admin/src/locale/zh-Hans.json#L812) 的 `afterSale` 对象闭合前（即 `"detail"` 块之后）插入：

```json
    ,
    "timeline": {
      "stepPending": "已申请",
      "stepApproved": "商家已同意",
      "stepReturning": "退回中",
      "stepReceived": "商家已收货",
      "stepRefunded": "退款完成"
    }
```

- [ ] **Step 4: `en.json` 同步（同结构、英文值）**

在 [en.json](file:///d:/zhao/vshop/web-admin/src/locale/en.json#L739-L766) 的 `"list"` 对象内 `"retry"` 之前插入：

```json
      "afterSalePrefix": "After-sale #",
      "tabToReturn": "To Return",
      "tabToReceive": "To Receive",
      "tabToRefund": "To Refund",
      "tabRefundFailed": "Refund Failed",
      "tabClosed": "Closed",
      "waitingDays": "Waiting {d}d {h}h",
      "waitingHours": "Waiting {h}h",
      "waitingMinutes": "Waiting {m}m",
      "createdAtLabel": "Applied ",
      "emptyPending": "No pending tickets",
      "detailBtn": "Detail",
      "filterHide": "Hide",
```

在 [en.json](file:///d:/zhao/vshop/web-admin/src/locale/en.json#L767-L811) 的 `"detail"` 对象内 `"retryInitiated"` 之后插入：

```json
      ,
      "viewOrder": "View Order",
      "customerTitle": "Customer",
      "callCustomer": "Call",
      "productTitle": "Product",
      "skuLabel": "SKU: ",
      "typeLabel": "Type: {type}",
      "progressTitle": "Progress",
      "evidenceTitle": "Customer Evidence",
      "restockTitle": "Stock Restock",
      "stockLocation": "Location ",
      "statusFailed": "Refund Failed",
      "statusRejected": "Rejected",
      "statusClosed": "Closed"
```

在 `en.json` 的 `afterSale` 对象闭合前插入：

```json
    ,
    "timeline": {
      "stepPending": "Applied",
      "stepApproved": "Approved",
      "stepReturning": "Returning",
      "stepReceived": "Received",
      "stepRefunded": "Refunded"
    }
```

- [ ] **Step 5: 键集合一致性校验**

```bash
node -e "const fs=require('fs');const zh=JSON.parse(fs.readFileSync('src/locale/zh-Hans.json','utf8')).afterSale;const en=JSON.parse(fs.readFileSync('src/locale/en.json','utf8')).afterSale;const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?flat(v,p+k+'.'):[p+k]);const a=flat(zh).sort(),b=flat(en).sort();const missEn=a.filter(k=>!b.includes(k)),missZh=b.filter(k=>!a.includes(k));console.log('zh keys',a.length,'| en keys',b.length);console.log('missing in en:',missEn.join(',')||'none');console.log('missing in zh:',missZh.join(',')||'none');"
```

cwd：`d:\zhao\vshop\web-admin`

Expected: 两个包键数相等，`missing in en: none`、`missing in zh: none`。

- [ ] **Step 6: Commit**

```bash
git add src/locale/zh-Hans.json src/locale/en.json
git commit -m "feat(after-sale): 后台 i18n 双包同步页签/等待时长/顾客商品/进度时间线词条"
```

cwd：`d:\zhao\vshop\web-admin`

---

### Task 16: 手机视图截图（390×844, dpr=2）+ 操作手册 / 测试用例

**Files:**
- Create: `d:\zhao\nshop\scripts\_shot_after_sales.py`
- Create: `d:\zhao\vshop\web-admin\scripts\_shot_after_sales_admin.py`
- Create: `d:\zhao\nshop\docs\superpowers\manual\aftersales-page-optimization\index.html`
- Create: `d:\zhao\nshop\docs\superpowers\manual\aftersales-page-optimization\shots\`（截图落盘目录）

- [ ] **Step 1: 写 C 端截图脚本**

新建 `d:\zhao\nshop\scripts\_shot_after_sales.py`（沿用 [\_shot_order_layouts.py](file:///d:/zhao/nshop/scripts/_shot_order_layouts.py) 的登录/取数/截图约定：标签页登录 → 走真实 UI 路径 → 等文案就绪再截 → 全页截图）：

```python
# -*- coding: utf-8 -*-
"""售后页面优化 C 端交付截图（390x844, dpr=2 = 780x1688, fullPage）。

产物：docs/superpowers/manual/aftersales-page-optimization/shots/
  c-list.png / c-detail.png / c-create.png

运行：python scripts/_shot_after_sales.py
前置：本地 dev 站点已起在 BASE（.env 指向线上 shop-api + 渠道 token），
     且测试账号名下至少有 1 笔已完成订单可用于发起售后。
注：本探针脚本位于 /scripts/_shot_*（.gitignore 已忽略），仅本地留存。
"""
import os, re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8080"
OUT = r"d:\zhao\nshop\docs\superpowers\manual\aftersales-page-optimization\shots"
EMAIL = "orders-layout-shot@joho.cn"
PASSWORD = "Test#Layout123"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
LIST_URL = BASE + "/account/after-sales"


def ui_login(pg):
    pg.goto(BASE + "/account/login", timeout=90000)
    pg.fill('input[type="email"]', EMAIL)
    pg.fill('input[type="password"]', PASSWORD)
    pg.click('button[type="submit"]')
    pg.wait_for_url("**/account", timeout=60000)
    pg.wait_for_timeout(1500)


def wait_ready(pg, texts, tries=25):
    body = ""
    for _ in range(tries):
        pg.wait_for_timeout(1000)
        body = pg.inner_text("body")
        if any(t in body for t in texts):
            return body
    return body


def shoot(pg, url, name, ready_texts):
    pg.goto(url, timeout=90000)
    pg.wait_for_load_state("networkidle")
    body = wait_ready(pg, ready_texts)
    pg.wait_for_timeout(800)  # 等图片/字体落位
    raw = re.findall(r"messages\.[a-zA-Z.]+", body)
    pg.screenshot(path=os.path.join(OUT, name), full_page=True)
    return body, raw


with sync_playwright() as p:
    os.makedirs(OUT, exist_ok=True)
    browser = p.chromium.launch(headless=True, executable_path=CHROME)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, locale="zh-CN")
    pg = ctx.new_page()
    try:
        ui_login(pg)

        # 列表
        body, raw = shoot(pg, LIST_URL, "c-list.png", ["进行中", "暂无售后记录", "售后"])
        print("list   | 裸key:", raw)

        # 详情：从列表点「查看详情」走真实路径
        pg.goto(LIST_URL, timeout=90000)
        pg.wait_for_load_state("networkidle")
        wait_ready(pg, ["查看详情"], tries=20)
        if pg.get_by_text("查看详情", exact=True).count():
            pg.get_by_text("查看详情", exact=True).first.click()
            pg.wait_for_url(re.compile(r".*/account/after-sales/[A-Za-z0-9]+$"), timeout=60000)
            body = wait_ready(pg, ["处理进度", "当前步骤", "未找到"])
            pg.wait_for_timeout(800)
            raw = re.findall(r"messages\.[a-zA-Z.]+", body)
            pg.screenshot(path=os.path.join(OUT, "c-detail.png"), full_page=True)
            print("detail | 裸key:", raw)
            # 引导条「填写退货单号」直达
            if pg.get_by_text("填写退货单号", exact=True).count():
                pg.get_by_text("填写退货单号", exact=True).first.click()
                pg.wait_for_timeout(1200)
                pg.screenshot(path=os.path.join(OUT, "c-track-form.png"), full_page=True)
                print("track  | ok")
        else:
            print("detail | 跳过：列表无「查看详情」入口（无数据）")

        # 申请弹窗：从订单详情点「申请售后」
        pg.goto(BASE + "/account/orders", timeout=90000)
        pg.wait_for_load_state("networkidle")
        wait_ready(pg, ["查看详情"], tries=20)
        if pg.get_by_text("查看详情", exact=True).count():
            pg.get_by_text("查看详情", exact=True).first.click()
            pg.wait_for_url(re.compile(r".*/account/orders/[A-Za-z0-9]+$"), timeout=60000)
            pg.wait_for_timeout(1500)
            if pg.get_by_text("申请售后", exact=True).count():
                pg.get_by_text("申请售后", exact=True).first.click()
                pg.wait_for_timeout(1500)
                pg.screenshot(path=os.path.join(OUT, "c-create.png"), full_page=True)
                print("create | ok")
            else:
                print("create | 跳过：订单不可申请售后")
    finally:
        browser.close()
    print("\n[DONE]", OUT)
    for f in sorted(os.listdir(OUT)):
        print("  ", f)
```

- [ ] **Step 2: 起 C 端本地站点并运行脚本**

```bash
pnpm dev
```

等待输出 `Local: http://localhost:8080/` 后，另开终端：

```bash
python scripts/_shot_after_sales.py
```

cwd：`d:\zhao\nshop`

Expected: 输出 `[DONE]`，`shots/` 下出现 `c-list.png` / `c-detail.png` / `c-create.png`（后两者视数据是否具备而定），且 `裸key: []`（无裸 key = i18n 无缺词）。

- [ ] **Step 3: 写后台截图脚本**

新建 `d:\zhao\vshop\web-admin\scripts\_shot_after_sales_admin.py`（同视口约定）：

```python
# -*- coding: utf-8 -*-
"""售后页面优化 后台(web-admin H5)交付截图（390x844, dpr=2, fullPage）。

产物：docs/superpowers/manual/aftersales-page-optimization/shots/
  a-list.png / a-detail.png

运行：python scripts/_shot_after_sales_admin.py
前置：web-admin 本地 dev 已起在 http://localhost:5280（VITE_API_URL 指向线上 admin-api）。
注：/scripts/_shot_* 已被 gitignore，仅本地留存。
"""
import os, re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5280"
OUT = r"d:\zhao\nshop\docs\superpowers\manual\aftersales-page-optimization\shots"
USER = "superadmin"
PWD = "z123123"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"


def wait_ready(pg, texts, tries=25):
    body = ""
    for _ in range(tries):
        pg.wait_for_timeout(1000)
        body = pg.inner_text("body")
        if any(t in body for t in texts):
            return body
    return body


with sync_playwright() as p:
    os.makedirs(OUT, exist_ok=True)
    browser = p.chromium.launch(headless=True, executable_path=CHROME)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, locale="zh-CN")
    pg = ctx.new_page()
    try:
        pg.goto(BASE + "/", timeout=90000)
        pg.wait_for_load_state("networkidle")
        wait_ready(pg, ["登录", "用户名"], tries=20)
        if pg.locator('input[type="text"]').count():
            pg.locator('input[type="text"]').first.fill(USER)
            pg.locator('input[type="password"]').first.fill(PWD)
            pg.get_by_text("登录", exact=True).first.click()
            pg.wait_for_timeout(2500)

        pg.goto(BASE + "/#/pages/after-sale/list/index", timeout=90000)
        pg.wait_for_load_state("networkidle")
        body = wait_ready(pg, ["待处理", "全部", "暂无售后工单"])
        pg.wait_for_timeout(800)
        raw = re.findall(r"afterSale\.[a-zA-Z.]+", body)
        pg.screenshot(path=os.path.join(OUT, "a-list.png"), full_page=True)
        print("a-list   | 裸key:", raw)

        if pg.get_by_text("详情", exact=True).count():
            pg.get_by_text("详情", exact=True).first.click()
            pg.wait_for_timeout(2000)
            body = wait_ready(pg, ["处理进度", "未找到"])
            pg.wait_for_timeout(800)
            raw = re.findall(r"afterSale\.[a-zA-Z.]+", body)
            pg.screenshot(path=os.path.join(OUT, "a-detail.png"), full_page=True)
            print("a-detail | 裸key:", raw)
        else:
            print("a-detail | 跳过：列表无「详情」入口（无数据）")
    finally:
        browser.close()
    print("\n[DONE]", OUT)
```

- [ ] **Step 4: 起后台本地站点并运行脚本**

```bash
$env:VITE_API_URL="https://e.joho.cn"; npm run dev:h5
```

等待输出 `Local: http://localhost:5280/` 后，另开终端：

```bash
python scripts/_shot_after_sales_admin.py
```

cwd：`d:\zhao\vshop\web-admin`

Expected: 输出 `[DONE]`，`shots/` 下出现 `a-list.png` / `a-detail.png`，`裸key: []`。

- [ ] **Step 5: 写操作手册**

新建 `d:\zhao\nshop\docs\superpowers\manual\aftersales-page-optimization\index.html`，包含以下结构（截图为 `shots/` 下的真实产物，逐张配文）：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>售后页面优化 · 操作手册与测试用例</title>
  <style>
    :root { --ink:#1f2329; --muted:#72767b; --line:#e8eaed; --accent:#2563eb; --danger:#e64340; --bg:#f6f7f9; }
    * { box-sizing:border-box; }
    body { margin:0; padding:32px 20px 80px; font:15px/1.7 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; color:var(--ink); background:var(--bg); }
    main { max-width:1160px; margin:0 auto; }
    h1 { font-size:28px; margin:0 0 8px; }
    h2 { font-size:20px; margin:40px 0 12px; padding-left:10px; border-left:4px solid var(--accent); }
    h3 { font-size:16px; margin:24px 0 8px; }
    p.lead { color:var(--muted); margin:0 0 24px; }
    table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    th,td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; font-size:14px; vertical-align:top; }
    th { background:#fafbfc; color:var(--muted); font-weight:600; }
    tr:last-child td { border-bottom:none; }
    .shots { display:flex; gap:20px; flex-wrap:wrap; }
    figure { margin:0; background:#fff; border:1px solid var(--line); border-radius:10px; padding:12px; width:390px; }
    figure img { width:100%; border-radius:6px; display:block; }
    figcaption { margin-top:10px; font-size:13px; color:var(--muted); }
    code { background:#eef1f5; padding:2px 6px; border-radius:4px; font-size:13px; }
    .danger { color:var(--danger); }
  </style>
</head>
<body>
<main>
  <h1>售后页面优化 · 操作手册与测试用例</h1>
  <p class="lead">覆盖 C 端（nshop）与后台（web-admin）售后页面重构；下图为 390×844、dpr=2 手机视口实拍。</p>

  <h2>一、本次改动概览</h2>
  <table>
    <tr><th>端</th><th>页面</th><th>主要变化</th></tr>
    <tr><td>C 端</td><td>售后列表</td><td>页签按“是否待你操作”重排并补 <code>退款异常</code>；卡片补商品/金额/时间；搜索 + 排序</td></tr>
    <tr><td>C 端</td><td>售后详情</td><td>新增「下一步该做什么」引导条 + 纵向进度时间线 + 凭证九宫格 + 吸底动作</td></tr>
    <tr><td>C 端</td><td>申请售后弹窗</td><td>分步表单、可退上限与快捷全额、常用原因、图片上传（最多 6 张、失败可重试）</td></tr>
    <tr><td>后台</td><td>售后列表</td><td>页签全量化 8 个并默认落「待处理」；卡片补顾客/商品/等待时长（超 24h 标红）；卡上直接处理；筛选折叠</td></tr>
    <tr><td>后台</td><td>售后详情</td><td class="danger">修正动作可用性（确认收货仅 <code>Returning</code>、执行退款仅 <code>Received</code>）；补顾客/商品/凭证/进度/库存回补；吸底操作区</td></tr>
  </table>

  <h2>二、C 端页面</h2>
  <div class="shots">
    <figure><img src="shots/c-list.png" alt="C 端售后列表" /><figcaption>售后列表：页签 + 卡片信息 + 搜索排序</figcaption></figure>
    <figure><img src="shots/c-detail.png" alt="C 端售后详情" /><figcaption>售后详情：引导条 + 进度时间线 + 吸底动作</figcaption></figure>
    <figure><img src="shots/c-create.png" alt="C 端申请售后" /><figcaption>申请售后：分步表单 + 凭证上传</figcaption></figure>
    <figure><img src="shots/c-track-form.png" alt="C 端填写退货单号" /><figcaption>填写退货单号（由引导条直达）</figcaption></figure>
  </div>

  <h2>三、后台页面</h2>
  <div class="shots">
    <figure><img src="shots/a-list.png" alt="后台售后列表" /><figcaption>后台列表：8 页签 + 卡上直接处理 + 等待时长</figcaption></figure>
    <figure><img src="shots/a-detail.png" alt="后台售后详情" /><figcaption>后台详情：顾客/商品/凭证/进度 + 吸底操作区</figcaption></figure>
  </div>

  <h2>四、测试用例</h2>
  <table>
    <tr><th>#</th><th>场景</th><th>步骤</th><th>预期</th></tr>
    <tr><td>1</td><td>C 端·仅退款直连退款</td><td>对一笔已完成订单申请「仅退款」→ 后台同意 → 后台执行退款</td><td>详情进度时间线推进到「退款完成」；列表页签从〈进行中〉移出，落〈已完成〉</td></tr>
    <tr><td>2</td><td>C 端·退货退款全链路</td><td>申请「退货退款」→ 后台同意 → C 端引导条点「填写退货单号」→ 后台确认收货 → 后台执行退款</td><td>中间态停在〈退回中〉；填写后后台可「确认收货」；收货后可「执行退款」</td></tr>
    <tr><td>3</td><td class="danger">后台动作可用性回归（A4）</td><td>取一笔 <code>Approved</code> 工单，观察后台详情吸底区</td><td class="danger">只出现「拒绝」+「同意」；<strong>不出现</strong>「确认收货」「执行退款」。<code>Returning</code> 才出「确认收货」，<code>Received</code> 才出「执行退款」</td></tr>
    <tr><td>4</td><td>C 端·凭证上传</td><td>申请售后时上传 7 张图；再上传一张超大图</td><td>第 7 张被拦（提示最多 6 张）；超大图提示「图片过大」；失败项可单独重试</td></tr>
    <tr><td>5</td><td>C 端·重复申请拦截</td><td>对同一订单行再次发起售后</td><td>提示「该商品已有进行中的售后申请」，不产生新工单</td></tr>
    <tr><td>6</td><td>后台·等待时长与超时标红</td><td>列表页取一笔 24h 前申请、仍处 <code>Pending</code> 的工单</td><td>显示「已等待 1 天 x 小时」且该行标红</td></tr>
    <tr><td>7</td><td>退款失败可重试</td><td>构造一笔 <code>RefundFailed</code>（如退款通道异常）</td><td>C 端页签落〈退款异常〉、引导条提示联系客服；后台出现「重试退款」</td></tr>
    <tr><td>8</td><td>多语言</td><td>切换任意语言包查看售后列表/详情</td><td>无裸 key（<code>messages.afterSales.*</code> 不直接出现在页面上）</td></tr>
  </table>

  <h2>五、回归命令</h2>
  <table>
    <tr><th>层</th><th>命令</th><th>工作目录</th></tr>
    <tr><td>插件 e2e</td><td><code>pnpm e2e</code></td><td><code>d:\zhao\vendure\packages\after-sales-plugin</code></td></tr>
    <tr><td>C 端单测</td><td><code>pnpm exec vitest run layers/base/app/utils/__tests__/after-sales-state.spec.ts</code></td><td><code>d:\zhao\nshop</code></td></tr>
    <tr><td>后台构建</td><td><code>npm run build:h5</code></td><td><code>d:\zhao\vshop\web-admin</code></td></tr>
  </table>
</main>
</body>
</html>
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/manual/aftersales-page-optimization
git commit -m "docs(after-sales): 售后页面优化操作手册 + 手机视口交付截图 + 测试用例"
```

cwd：`d:\zhao\nshop`

---

### Task 17: 部署收口（本地构建 → 推送 → 服务器生效）

> **部署铁律：全部本地构建，服务器只 `git pull` / 解压，绝不在服务器构建。**

- [ ] **Step 1: 后端（vendure）本地构建插件 lib**

```bash
npm run build
```

cwd：`d:\zhao\vendure\packages\after-sales-plugin`

Expected: `lib/` 重新生成，无 TS 报错。

- [ ] **Step 2: 后端回归（e2e）**

```bash
pnpm e2e
```

cwd：`d:\zhao\vendure\packages\after-sales-plugin`

Expected: 全部用例 PASS（含 Task 1 的关系字段断言、Task 2 的上传端点用例）。

- [ ] **Step 3: 后端提交并推送**

```bash
git add packages/after-sales-plugin
git commit -m "feat(after-sales): admin 嵌套关系字段 + 顾客端凭证上传端点"
git push
```

cwd：`d:\zhao\vendure`

- [ ] **Step 4: 服务器生效（vendure）**

```bash
ssh joho "cd /www/apps/vendure && git pull --ff-only && pm2 restart vendure && pm2 status vendure"
```

Expected: `pm2 status` 中 `vendure` 为 `online`。

- [ ] **Step 5: C 端（nshop）回归 + 部署**

```bash
pnpm exec vitest run layers/base/app/utils/__tests__/after-sales-state.spec.ts
```

cwd：`d:\zhao\nshop`

Expected: 状态工具层单测全绿（覆盖 8 态 → 5 页签映射、`RefundFailed` 归入〈退款异常〉）。

```bash
git add layers/base gql docs/superpowers
git commit -m "feat(after-sales): C 端售后列表/详情/申请重构（引导条+时间线+凭证上传）"
git push
node scripts/deploy.mjs
```

cwd：`d:\zhao\nshop`

Expected: `[deploy] 完成`，`pm2 status nshop` 为 `online`。

- [ ] **Step 6: 后台（web-admin）提交并部署**

```bash
git add src/constants/afterSaleActions.ts src/apis/afterSale.ts src/pages/after-sale src/locale/zh-Hans.json src/locale/en.json
git commit -m "feat(after-sale): 后台售后列表/详情重构 + 动作可用性收敛 + i18n"
git push
node scripts/deploy.mjs
```

cwd：`d:\zhao\vshop\web-admin`

Expected: `deploy done`（脚本内含 `npm run build:h5` → 产物校验 → scp → 服务器解压 → nginx reload）。

- [ ] **Step 7: 线上验收**

用手机视口打开 C 端售后列表与后台售后列表，各点开一笔工单走完「同意 → 确认收货 → 执行退款」，确认与手册第五节回归命令全部通过。

---

## Self-Review

**1. Spec coverage（逐节核对）**

| Spec 章节 | 落地任务 |
| --- | --- |
| R0-1 admin 类型补只读嵌套字段 | Task 1 |
| R0-2 最小顾客端凭证上传端点 | Task 2 |
| 状态/页签/进度划分（含 `RefundFailed`） | Task 3（C 端 `after-sales-state.ts`）、Task 12（后台 `afterSaleActions.ts`） |
| C 端 gql fragment + 上传 mutation | Task 4 |
| 凭证上传组件 | Task 5 |
| C 端申请弹窗分步表单 | Task 6 |
| C 端引导条 + 进度时间线 | Task 7 |
| C 端卡片改造 | Task 8 |
| C 端列表页 | Task 9 |
| C 端详情页 + 列表动作直达 | Task 10 |
| C 端 12 语言包同步 | Task 11 |
| 后台动作可用性单一来源（修 A4） | Task 12（定义）+ Task 13/14（消费） |
| 后台列表页 | Task 13 |
| 后台详情页 | Task 14 |
| 后台 i18n 双包 | Task 15 |
| 手机视口截图 + 手册/测试用例 | Task 16 |
| 部署收口 | Task 17 |

无未覆盖章节。

**2. Placeholder scan**

已逐段检查，无 `TBD` / `TODO` / 「实现细节略」/「同 Task N」类占位；所有代码步骤均给出完整内容与精确命令。

发现并修正的 2 处 spec 技术假设错误：
- `AssetService.createFromBuffer` 不存在 → 改用 `createFromFileStream(Readable.from(buffer), fileName, ctx)`（Task 2）。
- `[String!]!` 返回值不会经 `AssetInterceptorPlugin` 补绝对 URL → 新增 `toAbsoluteAssetUrl()` 显式补前缀（Task 2）。

**3. Type consistency**

- 后台 `afterSaleActions(state)` 返回 `AfterSaleActionAvailability`（Task 12 定义）→ 被 Task 13 模板 `afterSaleActions(a.state).approve/...` 与 Task 14 `can` 消费，字段名一致（`approve/reject/receive/refund/retry`）。
- `afterSaleStateLabel()`（Task 12）→ Task 13 `st()`、Task 14 `stLabel/stColor` 消费，返回 `StateLabel{label,color}` 与 [orderState.ts](file:///d:/zhao/vshop/web-admin/src/constants/orderState.ts#L2) 一致。
- `afterSaleWaiting(createdAt, t)` → Task 13 `waitingText` / `waitingOver24h` 消费，字段 `{text, over24h}` 一致。
- `afterSaleProgressIndex(state)`（Task 12）→ Task 14 `timeline` 消费，返回 `number` 一致。
- `AfterSaleRow.orderLine.sku`（Task 12 声明）→ Task 14 `productSku` 读取路径一致。
- C 端 `messages.afterSales.*` 键（Task 11）与 Task 9/10 模板引用的键一致；后台 `afterSale.list.*` / `afterSale.detail.*` / `afterSale.timeline.*`（Task 15）与 Task 13/14 模板引用一致。
- Task 14 模板引用的 `hasOps` / `primaryLabel` / `restockOpen` 均已在同任务 Step 1 中声明。

**4. 执行顺序依赖**

R0（Task 1-2）→ 必须先于 C 端（Task 4 依赖上传端点）与后台（Task 12-14 依赖 admin 嵌套字段）；Task 3 无外部依赖，可与 Task 1-2 并行；Task 11 必须在 Task 9/10 之后（键需与模板引用对齐）；Task 15 必须在 Task 13/14 之后；Task 16 依赖 Task 1-15 全部完成；Task 17 最后执行。

**5. 已发现并登记的待用户确认项**

- Task 16 的 C 端截图脚本依赖测试账号名下存在「可申请售后」的订单；若账号无此数据，需先构造一笔已完成订单（可在 `_shot_after_sales.py` 里复用 [\_shot_order_layouts.py](file:///d:/zhao/nshop/scripts/_shot_order_layouts.py#L119-L162) 的 `build_pickup_order` + `admin_settle`）。**执行到 Task 16 时若数据不足，先告知用户再继续，不要跳过截图。**
