# 售后/退换中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 nshop 交付顾客自助「售后/退换中心」：订单行内申请售后（退货退款/仅退款/换货）、我的售后列表、售后详情、取消待审核、填写回寄单号；配套一处极小 Vendure 后端增强（Shop 类型嵌套 `order/orderLine` + 白名单 bug fix）。

**Architecture:** 后端消费既有 `after-sales-plugin`（状态机/退款/库存回补/防重/时效校验全具备），仅补 2 个嵌套字段与 1 处状态白名单 fix。前端沿用「订单中心」已验证的模式：新增 `utils/after-sales-state.ts`（状态/类型→中文/颜色/可操作）、`composables/useAfterSales.ts`（封装 5 个 GQL 操作）、`components/afterSales/*`（4 组件）、两个账户页（列表/详情）、订单详情行级「申请售后」入口；i18n 全量 10 locale 同步。

**Tech Stack:** Nuxt 4 + Vue 3 + TypeScript + nuxt-graphql-client (`#gql/default`)、Nuxt UI v4 + Tailwind v4、Vendure 3.6.4（`after-sales-plugin`）。

**验证约定（本项目无 UI 层单测 runner）：** 每个任务的通过标准 = 在 `d:\zhao\nshop` 下 `pnpm typecheck` 全绿；纯映射工具（`after-sales-state.ts`、`format-money.ts`）附「手动断言片段」供快速核对；端到端行为在 R4 的线上/本地回环验证。为避免引入未需求的测试框架，不新建测试文件。

---

## 文件结构总览

**后端（d:\zhao\vendure）**
- Modify: `packages/after-sales-plugin/src/plugin.ts`（Shop SDL 补 `order: Order!`、`orderLine: OrderLine`）
- Modify: `packages/after-sales-plugin/src/after-sales.service.ts`（白名单 `PartialDelivery`→`PartiallyDelivered`）

**前端（d:\zhao\nshop）**
- Modify: `layers/base/gql/fragments/order.gql`（OrderDetail `lines` 补 `proratedLinePrice`）
- Create: `layers/base/gql/queries/after-sales.gql`（5 操作 + `AfterSalesFragment`）
- Create: `layers/base/app/utils/after-sales-state.ts`
- Create: `layers/base/app/utils/format-money.ts`
- Create: `layers/base/app/composables/useAfterSales.ts`
- Create: `layers/base/app/components/afterSales/AfterSalesStateBadge.vue`
- Create: `layers/base/app/components/afterSales/AfterSalesCard.vue`
- Create: `layers/base/app/components/afterSales/AfterSalesCreateModal.vue`
- Create: `layers/base/app/components/afterSales/AfterSalesTrackForm.vue`
- Modify: `layers/base/app/components/order/OrderItems.vue`（加 `<slot name="line-actions" :line :order>`）
- Create: `layers/base/app/pages/account/after-sales.vue`
- Create: `layers/base/app/pages/account/after-sales/[id].vue`
- Modify: `layers/base/app/pages/account/orders/[code].vue`（行内「申请售后」入口 + 弹窗）
- Modify: `layers/base/app/components/account/AccountMenu.vue`（下拉加「售后/退换」）
- Modify: `layers/base/app/pages/account/index.vue`（个人中心加「售后/退换」按钮）
- Modify: `layers/base/i18n/locales/{zh-CN,en-US,bg-BG,de-DE,es-ES,fa-IR,fr-FR,it-IT,pt-BR,ru-RU}.ts`（新增 `messages.afterSales.*` + `messages.account` 键）
- Modify: `layers/base/i18n/schema/zh-CN.ts`（若项目中存在 schema 校验建议文件，同步新增键，若无则跳过）

---

## R0：后端增强 + schema 刷新 + 类型重生成

**Files:**
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\plugin.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales.service.ts`
- Modify: `d:\zhao\nshop\graphql.schema.json`（由后端 introspection 刷新）

- [ ] **Step 1: 修改 Shop SDL（plugin.ts）**

在 `plugin.ts` 的 shopApiExtensions `schema` 内、`type AfterSalesRequest implements Node { ... }` 块中（`updatedAt: DateTime!` 之后）追加两字段：

```graphql
            type AfterSalesRequest implements Node {
                id: ID!
                orderId: ID!
                orderLineId: ID
                type: AfterSalesType!
                state: AfterSalesState!
                reason: String!
                description: String
                evidenceImages: [String!]
                refundAmount: Int!
                returnTrackingNo: String
                returnCarrier: String
                rejectReason: String
                receivedQuantity: Int
                createdAt: DateTime!
                updatedAt: DateTime!
                order: Order!
                orderLine: OrderLine
            }
```

- [ ] **Step 2: 修白名单（after-sales.service.ts）**

在 `createRequest` 内把：

```ts
const allowedStates = ['Shipped', 'Delivered', 'PartialDelivery', 'Cancelled'];
```

改为：

```ts
const allowedStates = ['Shipped', 'Delivered', 'PartiallyDelivered', 'Cancelled'];
```

- [ ] **Step 3: 本地构建 vendure 并验证产物**

工作目录 `d:\zhao\vendure`：

```bash
pnpm build
```

在产物中确认新字段已编译进 dist（选一处含 `after-sales` 的关键打包产物，搜索 `PartiallyDelivered`）：

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('./dist/packages/after-sales-plugin/index.js','utf8');console.log(s.includes('PartiallyDelivered'))"
```

Expected: 输出 `true`。若路径不对，用 `Get-ChildItem -Recurse dist -Filter *.js | Select-String -Pattern "PartiallyDelivered"` 定位并确认。

- [ ] **Step 4: 提交并推送后端，服务器重启（铁律：不在服务器构建）**

```bash
git add packages/after-sales-plugin/src/plugin.ts packages/after-sales-plugin/src/after-sales.service.ts dist
git commit -m "feat(after-sales): Shop 类型嵌套 order/orderLine + 白名单修复 PartiallyDelivered"
git push
ssh qing "cd <REMOTE_VENDURE_DIR> && git pull && pm2 restart <app>"
```

其中 `<REMOTE_VENDURE_DIR>`/`<app>` 按本项目实际部署路径/PM2 应用名填写（后端部署方式沿用项目既有约定，务必本地构建后推送，禁止服务器 build）。

- [ ] **Step 5: 从生产 Shop API 刷新 nshop 的 graphql.schema.json**

写临时脚本（执行后删除）`d:\zhao\nshop\scripts\introspect-schema.mjs`：

```js
// 用法：node scripts/introspect-schema.mjs <endpoint> <out.json>
import { writeFileSync } from 'node:fs';
const endpoint = process.argv[2] ?? process.env.GQL_HOST ?? 'https://e.joho.cn/shop-api';
const out = process.argv[3] ?? 'graphql.schema.json';
const res = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: `{ __schema { queryType { name } mutationType { name } types { kind name description fields { name args { name defaultValue type { kind name ofType { kind name ofType { kind name } } } } type { kind name ofType { kind name ofType { kind name } } } } } } }` }),
});
const data = await res.json();
writeFileSync(out, JSON.stringify(data.data.__schema, null, 2));
console.log('schema written');
```

运行（确保 `.env` 或命令行给了 endpoint）并核对售后字段已进入 schema：

```bash
node scripts/introspect-schema.mjs
node -e "const s=require('./graphql.schema.json'); console.log(!!s.types.find(t=>t.name==='AfterSalesRequest'))"
```

Expected: `true`。若生产 introspection 被禁用或未含售后类型，**先别部署前端**——进入排障（确认生产后端确实启用 `AfterSalesPlugin`），解决后再继续；这是上线前必验项。成功后删除该临时脚本（保持仓库干净）。

- [ ] **Step 6: 重生成前端类型**

工作目录 `d:\zhao\nshop`：

```bash
pnpm nuxi prepare
```

- [ ] **Step 7: 验证 R0 提交**

```bash
git -C d:\zhao\nshop add graphql.schema.json 2>$null
git -C d:\zhao\nshop commit -m "chore(after-sales): 刷新 graphql.schema.json（含 order/orderLine 嵌套）" 2>$null
```

Expected: schema.json 变更已提交（若有）。

---

## R1：数据层（fragment + gql + util + composable）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\fragments\order.gql`
- Create: `d:\zhao\nshop\layers\base\gql\queries\after-sales.gql`
- Create: `d:\zhao\nshop\layers\base\app\utils\after-sales-state.ts`
- Create: `d:\zhao\nshop\layers\base\app\utils\format-money.ts`
- Create: `d:\zhao\nshop\layers\base\app\composables\useAfterSales.ts`

- [ ] **Step 1: OrderDetail fragment 补 `proratedLinePrice`**

`order.gql` 的 `OrderDetail` fragment 中 `lines { ... }` 内，在 `linePriceWithTax` 之后加一行：

```graphql
    unitPriceWithTax
    quantity
    linePriceWithTax
    proratedLinePrice
    productVariant {
```

- [ ] **Step 2: 新增 after-sales.gql**

创建 `layers/base/gql/queries/after-sales.gql`：

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
```

- [ ] **Step 3: nuxi prepare 重生成类型（使 Gql 与查询类型可用）**

```bash
pnpm nuxi prepare
```

- [ ] **Step 4: 创建 format-money.ts**

创建 `layers/base/app/utils/format-money.ts`：

```ts
export function formatMoney(amount: number, currency = "CNY", locale?: string) {
  const loc = locale ?? "zh-CN";
  return new Intl.NumberFormat(loc, { style: "currency", currency }).format(amount / 100);
}
```

- [ ] **Step 5: 创建 after-sales-state.ts**

创建 `layers/base/app/utils/after-sales-state.ts`：

```ts
export type AfterSalesState =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Returning"
  | "Received"
  | "Refunded"
  | "Closed";

export type AfterSalesType = "return_refund" | "refund_only" | "exchange";

export type AfterSalesTabKey =
  | "ALL"
  | "Pending"
  | "Approved"
  | "Returning"
  | "Refunded"
  | "Rejected"
  | "Closed";

export const AFTER_SALES_TABS: { key: AfterSalesTabKey; labelKey: string }[] = [
  { key: "ALL", labelKey: "afterSales.tabAll" },
  { key: "Pending", labelKey: "afterSales.tabPending" },
  { key: "Approved", labelKey: "afterSales.tabToReturn" },
  { key: "Returning", labelKey: "afterSales.tabReturning" },
  { key: "Refunded", labelKey: "afterSales.tabRefunded" },
  { key: "Rejected", labelKey: "afterSales.tabRejected" },
  { key: "Closed", labelKey: "afterSales.tabClosed" },
];

const TYPE_LABEL_KEY: Record<AfterSalesType, string> = {
  return_refund: "afterSales.typeReturnRefund",
  refund_only: "afterSales.typeRefundOnly",
  exchange: "afterSales.typeExchange",
};

export function afterSalesTypeLabelKey(type: string): string {
  return TYPE_LABEL_KEY[type as AfterSalesType] ?? "afterSales.typeUnknown";
}

export interface AfterSalesStateInfo {
  labelKey: string;
  color: "neutral" | "warning" | "info" | "success" | "error";
}

export function afterSalesStateInfo(state: string): AfterSalesStateInfo {
  switch (state) {
    case "Pending":
      return { labelKey: "afterSales.statePending", color: "warning" };
    case "Approved":
      return { labelKey: "afterSales.stateApproved", color: "info" };
    case "Rejected":
      return { labelKey: "afterSales.stateRejected", color: "error" };
    case "Returning":
      return { labelKey: "afterSales.stateReturning", color: "info" };
    case "Received":
      return { labelKey: "afterSales.stateReceived", color: "warning" };
    case "Refunded":
      return { labelKey: "afterSales.stateRefunded", color: "success" };
    case "Closed":
      return { labelKey: "afterSales.stateClosed", color: "neutral" };
    default:
      return { labelKey: "afterSales.stateUnknown", color: "neutral" };
  }
}

// 售后主链路进度（Closed/Rejected 不在主链路，返回 -1）
export const AFTER_SALES_PROGRESS: AfterSalesState[] = [
  "Pending",
  "Approved",
  "Returning",
  "Received",
  "Refunded",
];

export function afterSalesProgressIndex(state: string): number {
  const idx = AFTER_SALES_PROGRESS.indexOf(state as AfterSalesState);
  return idx;
}

export function tabOfAfterSales(state: string): AfterSalesTabKey {
  switch (state) {
    case "Pending":
      return "Pending";
    case "Approved":
      return "Approved";
    case "Returning":
    case "Received":
      return "Returning";
    case "Refunded":
      return "Refunded";
    case "Rejected":
      return "Rejected";
    case "Closed":
      return "Closed";
    default:
      return "ALL";
  }
}

// 仅待审核(Pending)可取消
export function canCancelAfterSales(state: string): boolean {
  return state === "Pending";
}

// 仅已通过(Approved)可填回寄单号
export function canFillTracking(state: string): boolean {
  return state === "Approved";
}

// 订单状态 ∈ 此集合才显示「申请售后」按钮（对应后端白名单）
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

手动断言（可选，用 `pnpm exec tsx -e` 或临时脚本核对该纯函数即可，运行后删除）：

```ts
import { afterSalesStateInfo, tabOfAfterSales, canFillTracking, canApplyAfterSales } from "../app/utils/after-sales-state";
console.assert(tabOfAfterSales("Received") === "Returning", "Received→Returning tab");
console.assert(canFillTracking("Approved") === true, "Approved 可填单");
console.assert(canApplyAfterSales("Shipped") === true, "Shipped 可申请");
console.assert(afterSalesStateInfo("Refunded").color === "success", "Refunded success");
console.log("after-sales-state assertions passed");
```

- [ ] **Step 6: 创建 useAfterSales.ts**

创建 `layers/base/app/composables/useAfterSales.ts`：

```ts
export interface CreateAfterSalesInput {
  orderId: string;
  orderLineId?: string | null;
  type?: string;
  reason: string;
  description?: string | null;
  refundAmount: number;
}

export interface AfterSalesResult {
  ok: boolean;
  id?: string | null;
  message?: string | null;
}

export function useAfterSales() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const toast = useToast();
  const { t } = useI18n();

  async function createRequest(input: CreateAfterSalesInput): Promise<AfterSalesResult> {
    loading.value = true;
    error.value = null;
    try {
      const { createAfterSalesRequest } = await GqlCreateAfterSalesRequest({
        input: {
          orderId: input.orderId,
          orderLineId: input.orderLineId ?? undefined,
          type: input.type ?? "return_refund",
          reason: input.reason,
          description: input.description ?? null,
          refundAmount: input.refundAmount,
        },
      });
      toast.add({ title: t("afterSales.createSuccess"), color: "success" });
      return { ok: true, id: createAfterSalesRequest?.id };
    } catch (e: any) {
      const msg = e?.message ?? "create after-sales failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  async function cancelRequest(id: string): Promise<AfterSalesResult> {
    loading.value = true;
    error.value = null;
    try {
      await GqlCancelAfterSalesRequest({ id });
      toast.add({ title: t("afterSales.cancelSuccess"), color: "success" });
      return { ok: true, id };
    } catch (e: any) {
      const msg = e?.message ?? "cancel after-sales failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  async function updateTracking(id: string, trackingNo: string, carrier: string): Promise<AfterSalesResult> {
    loading.value = true;
    error.value = null;
    try {
      await GqlUpdateReturnTracking({ id, trackingNo, carrier });
      toast.add({ title: t("afterSales.trackingSuccess"), color: "success" });
      return { ok: true, id };
    } catch (e: any) {
      const msg = e?.message ?? "update tracking failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, createRequest, cancelRequest, updateTracking };
}
```

- [ ] **Step 7: typecheck**

```bash
pnpm typecheck
```

Expected: 全绿（exit 0）。`GqlCreateAfterSalesRequest` 等由 nuxt-graphql-client 自动生成，若报"未定义"，说明 Step 3 的 prepare 未生效，重跑 `pnpm nuxi prepare`。

- [ ] **Step 8: Commit**

```bash
git add layers/base/gql/fragments/order.gql layers/base/gql/queries/after-sales.gql layers/base/app/utils/after-sales-state.ts layers/base/app/utils/format-money.ts layers/base/app/composables/useAfterSales.ts
git commit -m "feat(after-sales): 数据层 after-sales.gql + useAfterSales + 状态/金额工具"
```

---

## R2：售后组件（4 个）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesStateBadge.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesCard.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesCreateModal.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\afterSales\AfterSalesTrackForm.vue`

注意：本 layer `~` 别名解析到根 `app/*`，本项目统一用**相对导入**（如 `../../utils/after-sales-state`）；NuxtUI v4 颜色用 `primary` 不用 `brand`；`order/` 组件与 `BaseLoader`/`UError` 均 auto-import。

- [ ] **Step 1: AfterSalesStateBadge.vue**

```vue
<script setup lang="ts">
import { afterSalesStateInfo } from "../../utils/after-sales-state";

const props = defineProps<{ state: string }>();
const { t } = useI18n();
const info = computed(() => afterSalesStateInfo(props.state));
</script>

<template>
  <UBadge :color="info.color" variant="outline" :label="t(info.labelKey)" />
</template>
```

- [ ] **Step 2: AfterSalesCard.vue**

```vue
<script setup lang="ts">
import type { GetMyAfterSalesRequestsQuery } from "#gql/default";
import { formatMoney } from "../../utils/format-money";
import {
  afterSalesTypeLabelKey,
  afterSalesStateInfo,
} from "../../utils/after-sales-state";

const props = defineProps<{
  request: NonNullable<
    GetMyAfterSalesRequestsQuery["myAfterSalesRequests"]
  >["items"][number];
}>();
const { t, locale } = useI18n();
const localePath = useLocalePath();
const stateInfo = computed(() => afterSalesStateInfo(props.request.state));
const typeKey = computed(() => afterSalesTypeLabelKey(props.request.type));
const amount = computed(() => formatMoney(props.request.refundAmount, "CNY", locale.value));
const productName = computed(() => props.request.orderLine?.productVariant?.name);
const preview = computed(
  () => props.request.orderLine?.productVariant?.featuredAsset?.preview,
);
</script>

<template>
  <ULink
    :to="localePath(`/account/after-sales/${request.id}`)"
    class="block rounded-lg border border-neutral-200 p-4 transition hover:border-primary dark:border-neutral-800"
  >
    <div class="flex items-center gap-4">
      <NuxtImg
        :src="preview"
        :alt="productName ?? ''"
        class="h-16 w-16 rounded object-cover"
        format="webp"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ t(typeKey) }}</span>
          <UBadge :color="stateInfo.color" variant="outline" :label="t(stateInfo.labelKey)" />
        </div>
        <p class="truncate text-sm text-neutral-500">
          {{ productName ?? request.id }}
        </p>
        <p class="text-xs text-neutral-400">
          {{ t("afterSales.orderCode") }}: {{ request.order?.code }} · {{ t("afterSales.amount") }}:
          {{ amount }}
        </p>
      </div>
    </div>
  </ULink>
</template>
```

- [ ] **Step 3: AfterSalesCreateModal.vue**

```vue
<script setup lang="ts">
import type { OrderLine } from "#gql/default";
import { useAfterSales } from "../../composables/useAfterSales";

const props = defineProps<{
  orderId: string;
  orderLine: NonNullable<OrderLine>;
  maxAmount: number;
}>();
const isOpen = defineModel<boolean>({ default: false });
const { loading, createRequest } = useAfterSales();

const types = [
  { value: "return_refund", label: "退货退款" },
  { value: "refund_only", label: "仅退款" },
  { value: "exchange", label: "换货" },
];

const refundAmount = ref<number | null>(Math.max(1, Math.floor(props.maxAmount)));
const selectedType = ref<string>("return_refund");
const reason = ref("");
const description = ref("");
const formError = ref<string | null>(null);

const productName = computed(() => props.orderLine.productVariant?.name);
const canSubmit = computed(
  () =>
    !loading.value &&
    !!reason.value.trim() &&
    refundAmount.value != null &&
    refundAmount.value > 0 &&
    refundAmount.value <= props.maxAmount,
);

async function onSubmit() {
  formError.value = null;
  if (!canSubmit.value) return;
  const res = await createRequest({
    orderId: props.orderId,
    orderLineId: props.orderLine.id,
    type: selectedType.value,
    reason: reason.value.trim(),
    description: description.value.trim() || null,
    refundAmount: Math.floor(refundAmount.value ?? 0),
  });
  isOpen.value = false;
  if (res.ok && res.id) {
    navigateTo(`/account/after-sales/${res.id}`);
  } else {
    formError.value = res.message ?? null;
  }
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #body>
      <div class="space-y-4">
        <h3 class="text-lg font-semibold">{{ t("afterSales.applyTitle") }}</h3>
        <p class="text-sm text-neutral-500">{{ productName }}</p>

        <UFormGroup :label="t('afterSales.type')">
          <USelect v-model="selectedType" :items="types" />
        </UFormGroup>

        <UFormGroup :label="t('afterSales.refundAmount')" :hint="`${t('afterSales.amountHint')}: ${maxAmount}`">
          <UInput v-model.number="refundAmount" type="number" min="1" :max="maxAmount" />
        </UFormGroup>

        <UFormGroup :label="t('afterSales.reason')" required>
          <UInput v-model="reason" :placeholder="t('afterSales.reasonPlaceholder')" />
        </UFormGroup>

        <UFormGroup :label="t('afterSales.description')">
          <UTextarea v-model="description" :placeholder="t('afterSales.descPlaceholder')" />
        </UFormGroup>

        <p v-if="formError" class="text-sm text-error">{{ formError }}</p>
        <p v-else-if="!canSubmit" class="text-sm text-neutral-500">
          {{ t("afterSales.reasonHint") }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton variant="ghost" :label="t('afterSales.cancel')" @click="isOpen = false" />
        <UButton color="primary" :loading="loading" :disabled="!canSubmit" :label="t('afterSales.submit')" @click="onSubmit" />
      </div>
    </template>
  </UModal>
</template>
```

> 说明：`navigateTo` 用绝对路径即可（当前 locale 路径由 App 内统一处理；如需 locale 化可改用 `useLocalePath`）。`refundAmount` 预填 `maxAmount`（即该行 `proratedLinePrice`），后端对超上限会再拦截。

- [ ] **Step 4: AfterSalesTrackForm.vue**

```vue
<script setup lang="ts">
import { useAfterSales } from "../../composables/useAfterSales";

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ (e: "updated"): void }>();
const { t } = useI18n();
const { loading, updateTracking } = useAfterSales();
const trackingNo = ref("");
const carrier = ref("");
const errorMsg = ref<string | null>(null);

async function onSubmit() {
  errorMsg.value = null;
  if (!trackingNo.value.trim() || !carrier.value.trim()) return;
  const res = await updateTracking(props.id, trackingNo.value.trim(), carrier.value.trim());
  if (res.ok) {
    emit("updated");
    trackingNo.value = "";
    carrier.value = "";
  } else {
    errorMsg.value = res.message;
  }
}
</script>

<template>
  <div class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
    <h3 class="mb-3 font-medium">{{ t("afterSales.trackTitle") }}</h3>
    <div class="grid grid-cols-2 gap-3">
      <UFormGroup :label="t('afterSales.carrier')" required>
        <UInput v-model="carrier" :placeholder="t('afterSales.carrierPlaceholder')" />
      </UFormGroup>
      <UFormGroup :label="t('afterSales.trackingNo')" required>
        <UInput v-model="trackingNo" :placeholder="t('afterSales.trackingPlaceholder')" />
      </UFormGroup>
    </div>
    <p v-if="errorMsg" class="mt-2 text-sm text-error">{{ errorMsg }}</p>
    <UButton class="mt-3" color="primary" :loading="loading" @click="onSubmit">
      {{ t("afterSales.submitTracking") }}
    </UButton>
  </div>
</template>
```

- [ ] **Step 5: typecheck**

```bash
pnpm typecheck
```

Expected: 全绿。若 `GetMyAfterSalesRequestsQuery`/`OrderLine` 类型未识别，确认 R1 Step3 `nuxi prepare` 已跑、且 `#gql/default` 存在。

- [ ] **Step 6: Commit**

```bash
git add layers/base/app/components/afterSales
git commit -m "feat(after-sales): 售后组件 AfterSalesStateBadge/Card/CreateModal/TrackForm"
```

---

## R3：OrderItems slot + 订单详情入口 + 两个账户页 + 账户菜单/个人中心

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\order\OrderItems.vue`
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\orders\[code].vue`
- Create: `d:\zhao\nshop\layers\base\app\pages\account\after-sales.vue`
- Create: `d:\zhao\nshop\layers\base\app\pages\account\after-sales\[id].vue`
- Modify: `d:\zhao\nshop\layers\base\app\components\account\AccountMenu.vue`
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\index.vue`

- [ ] **Step 1: OrderItems 加行级 slot**

在 `OrderItems.vue` 模板的每个 `<li>` 内、右侧 `div.text-right` 之后加一个 slot（`<li>` 上加 `items-center` 已具备）：

```vue
      <div class="text-right">
        <p class="text-sm">×{{ line.quantity }}</p>
        <p class="font-semibold">{{ fmt(line.linePriceWithTax) }}</p>
      </div>
      <slot name="line-actions" :line="line" :order="order" />
```

- [ ] **Step 2: 订单详情加「申请售后」入口**

`pages/account/orders/[code].vue` 改动：
- `<script setup>` 中追加 import 与状态（放在现有 `const order = computed(...)` 之后）：

```ts
import { canApplyAfterSales } from "../../../utils/after-sales-state";

const applyModalOpen = ref(false);
const applyLine = ref<
  NonNullable<NonNullable<typeof order.value>["lines"]>[number] | null
>(null);
```

- 模板中把商品区块改为（用 `order.id` 作为后端 `orderId`，`OrderDetail` fragment 顶层已含 `id`）：

```vue
    <section class="mb-10">
      <h2 class="mb-3 text-lg font-semibold">{{ t("messages.shop.orderSummary") }}</h2>
      <OrderItems :order="order">
        <template #line-actions="{ line, order: o }">
          <UButton
            v-if="canApplyAfterSales(o.state)"
            size="xs"
            variant="soft"
            color="primary"
            icon="i-lucide-receipt"
            :label="t('afterSales.apply')"
            class="shrink-0"
            @click="applyLine = line; applyModalOpen = true"
          />
        </template>
      </OrderItems>
    </section>

    <AfterSalesCreateModal
      v-if="applyLine"
      v-model:open="applyModalOpen"
      :order-id="order.id"
      :order-line="applyLine"
      :max-amount="applyLine.proratedLinePrice"
    />
```

> 说明：后端 `CreateAfterSalesRequestInput.orderId` 接收订单主键，直接用 `order.id`（本项目是 Vendure 非 Strapi，此 ID 即订单主键，无需 documentId 语义）。`applyLine`（`OrderDetail.lines[number]`，因 fragment 已补 `proratedLinePrice`）直接作为 `orderLine` prop 传给 create modal；若类型不兼容，将 modal 的 `orderLine` prop 类型改为该行所在类型（见下方 Step 7 核对）。

- [ ] **Step 3: 售后列表页 after-sales.vue**

```vue
<script setup lang="ts">
import { AFTER_SALES_TABS, tabOfAfterSales } from "../../utils/after-sales-state";
import type { AfterSalesTabKey } from "../../utils/after-sales-state";

const { t } = useI18n();
const localePath = useLocalePath();
const { isAuthenticated } = storeToRefs(useAuthStore());
const activeTab = ref<AfterSalesTabKey>("ALL");
const loading = ref(true);

const { data: listData, refresh } = await useAsyncGql(
  "MyAfterSalesRequests",
  { options: { take: 100 } },
  { immediate: false, server: false },
);

const requests = computed(() => listData.value?.myAfterSalesRequests?.items ?? []);
const filtered = computed(() =>
  activeTab.value === "ALL"
    ? requests.value
    : requests.value.filter((r) => tabOfAfterSales(r.state) === activeTab.value),
);

onMounted(async () => {
  if (!isAuthenticated.value) {
    navigateTo(localePath("/account/login"), { replace: true });
    return;
  }
  await refresh();
  loading.value = false;
});
</script>

<template>
  <BaseLoader v-if="loading || !isAuthenticated" width="sm:w-xs md:w-md" />
  <main v-else class="container">
    <header class="my-14">
      <h1 class="text-2xl font-semibold">{{ t("afterSales.title") }}</h1>
      <ULink :to="localePath('/account')" class="mt-2 text-sm">
        {{ t("messages.account.backToAccount") }}
      </ULink>
    </header>

    <UTabs
      v-model="activeTab"
      :items="AFTER_SALES_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }))"
      class="mb-6"
    />

    <div v-if="filtered.length" class="flex flex-col gap-4">
      <AfterSalesCard v-for="r in filtered" :key="r.id" :request="r" />
    </div>
    <p v-else class="py-16 text-center text-neutral-500">
      {{ t("afterSales.empty") }}
    </p>
  </main>
</template>
```

- [ ] **Step 4: 售后详情页 after-sales/[id].vue**

```vue
<script setup lang="ts">
import {
  afterSalesTypeLabelKey,
  afterSalesStateInfo,
  afterSalesProgressIndex,
  AFTER_SALES_PROGRESS,
  canCancelAfterSales,
  canFillTracking,
} from "../../../utils/after-sales-state";
import { formatMoney } from "../../../utils/format-money";

const route = useRoute();
const { t, locale } = useI18n();
const localePath = useLocalePath();
const { isAuthenticated } = storeToRefs(useAuthStore());
const id = route.params.id as string;

const { data, error, refresh } = await useAsyncGql("AfterSalesRequest", { id });
const request = computed(() => data.value?.afterSalesRequest ?? null);
const hasError = computed(() => !!error.value || !request.value);
const { loading, cancelRequest } = useAfterSales();

const stateInfo = computed(() =>
  request.value ? afterSalesStateInfo(request.value.state) : null,
);
const typeKey = computed(() =>
  request.value ? afterSalesTypeLabelKey(request.value.type) : "",
);
const amount = computed(() =>
  request.value ? formatMoney(request.value.refundAmount, "CNY", locale.value) : "",
);
const progress = computed(() =>
  request.value ? afterSalesProgressIndex(request.value.state) : -1,
);

async function onCancel() {
  if (!request.value) return;
  const res = await cancelRequest(request.value.id);
  if (res.ok) await refresh();
}
</script>

<template>
  <BaseLoader v-if="!isAuthenticated" width="sm:w-xs md:w-md" />
  <UError
    v-else-if="hasError"
    :error="{ statusCode: 404, statusMessage: t('afterSales.notFound'), message: t('afterSales.notFound') }"
  />
  <main v-else-if="request" class="container mb-14">
    <header class="my-14">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{{ t("afterSales.detailTitle") }}</h1>
        <UBadge v-if="stateInfo" :color="stateInfo.color" variant="outline" :label="t(stateInfo.labelKey)" />
      </div>
      <ULink :to="localePath('/account/after-sales')" class="mt-2 text-sm">
        {{ t("afterSales.backToList") }}
      </ULink>
      <ULink
        v-if="request.order?.code"
        :to="localePath(`/account/orders/${request.order.code}`)"
        class="mt-1 block text-sm text-primary"
      >
        {{ t("afterSales.orderCode") }}: {{ request.order.code }}
      </ULink>
    </header>

    <ol v-if="progress >= 0" class="mb-8 flex items-center gap-1 text-xs">
      <li v-for="(s, i) in AFTER_SALES_PROGRESS" :key="s" class="flex items-center gap-1">
        <div
          class="rounded-full px-2 py-0.5"
          :class="i <= progress ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-500'"
        >
          {{ t(`afterSales.step${s}`) }}
        </div>
        <i v-if="i < AFTER_SALES_PROGRESS.length - 1" class="h-px w-4 bg-neutral-300"></i>
      </li>
    </ol>

    <section class="mb-8 flex items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <NuxtImg
        :src="request.orderLine?.productVariant?.featuredAsset?.preview"
        :alt="request.orderLine?.productVariant?.name ?? ''"
        class="h-20 w-20 rounded object-cover"
        format="webp"
      />
      <div class="min-w-0">
        <p class="font-medium">{{ t(typeKey) }}</p>
        <p class="text-sm text-neutral-500">{{ request.orderLine?.productVariant?.name }}</p>
        <p class="text-sm">{{ t("afterSales.amount") }}: {{ amount }}</p>
      </div>
    </section>

    <dl class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <dt class="text-sm text-neutral-500">{{ t("afterSales.reason") }}</dt>
        <dd class="mt-1">{{ request.reason }}</dd>
      </div>
      <div v-if="request.description">
        <dt class="text-sm text-neutral-500">{{ t("afterSales.description") }}</dt>
        <dd class="mt-1">{{ request.description }}</dd>
      </div>
      <div v-if="request.rejectReason">
        <dt class="text-sm text-neutral-500">{{ t("afterSales.rejectReason") }}</dt>
        <dd class="mt-1 text-error">{{ request.rejectReason }}</dd>
      </div>
      <div v-if="request.returnTrackingNo">
        <dt class="text-sm text-neutral-500">{{ t("afterSales.trackingNo") }}</dt>
        <dd class="mt-1 font-mono">{{ request.returnCarrier }} {{ request.returnTrackingNo }}</dd>
      </div>
    </dl>

    <div class="flex flex-wrap gap-3">
      <UButton
        v-if="canCancelAfterSales(request.state)"
        color="error"
        variant="soft"
        :loading="loading"
        :label="t('afterSales.cancel')"
        @click="onCancel"
      />
    </div>

    <AfterSalesTrackForm
      v-if="canFillTracking(request.state)"
      :id="request.id"
      class="mt-6"
      @updated="refresh"
    />
  </main>
</template>
```

- [ ] **Step 5: AccountMenu 加「售后/退换」**

在 `userItems` 第二个子数组（含 profile/orders/addresses 那个）末尾、`addresses` 项之后加：

```ts
    {
      label: t("messages.account.afterSales"),
      icon: "i-lucide-rotate-ccw",
      to: localePath("/account/after-sales"),
      class: "items-center",
    },
```

- [ ] **Step 6: 个人中心 index.vue 加「售后/退换」按钮**

在 `section#account-actions` 里、`/account/addresses` 按钮之后加：

```vue
      <UButton
        :to="localePath('/account/after-sales')"
        variant="soft"
        class="px-7"
      >
        {{ t("messages.account.afterSales") }}
      </UButton>
```

- [ ] **Step 7: typecheck**

```bash
pnpm typecheck
```

Expected: 全绿。重点核对 `AfterSalesCreateModal` 的 `OrderLine` 类型与 `orders/[code].vue` 传入的 `line`（`OrderDetail.lines[number]`）兼容——若类型不匹配，把 create modal 的 `orderLine` prop 类型改为 `NonNullable<NonNullable<GetOrderByCodeQuery["orderByCode"]>["lines"]>[number]`，并将 import 改为 `import type { GetOrderByCodeQuery } from "#gql/default";`。

- [ ] **Step 8: Commit**

```bash
git add layers/base/app/components/order/OrderItems.vue "layers/base/app/pages/account/orders/[code].vue" layers/base/app/components/account/AccountMenu.vue layers/base/app/pages/account/index.vue layers/base/app/pages/account/after-sales.vue "layers/base/app/pages/account/after-sales/[id].vue"
git commit -m "feat(after-sales): 售后列表/详情页 + 订单行内申请入口 + 账户入口"
```

---

## R4：i18n 全量同步 + 部署 + 线上验证 + 回归

**Files:**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\*.ts`（10 个文件，逐一同构新增）

- [ ] **Step 1: 新增 messages.afterSales.* 块（10 个 locale）**

对 `zh-CN.ts` 用中文值，对其余 9 个文件用英文兜底值。在 `messages` 顶层（可放 `billing` 之后）新增块：

```ts
afterSales: {
  // zh-CN 值 / 其他语言英文兜底值
  title: "售后/退换" | "After-Sales",
  detailTitle: "售后详情" | "After-Sales Detail",
  backToList: "返回售后列表" | "Back to after-sales",
  apply: "申请售后" | "Apply",
  applyTitle: "申请售后/退换" | "Apply After-Sales",
  type: "类型" | "Type",
  typeReturnRefund: "退货退款" | "Return & Refund",
  typeRefundOnly: "仅退款" | "Refund Only",
  typeExchange: "换货" | "Exchange",
  typeUnknown: "售后" | "After-Sales",
  refundAmount: "退款金额" | "Refund Amount",
  amountHint: "上限" | "max",
  amount: "退款金额" | "Refund Amount",
  reason: "原因" | "Reason",
  reasonPlaceholder: "请描述售后原因" | "Describe the reason",
  reasonHint: "请填写原因且金额不超过上限" | "Provide a reason and amount within limit",
  description: "详细说明" | "Description",
  descPlaceholder: "选填，补充说明" | "Optional details",
  submit: "提交申请" | "Submit",
  submitTracking: "提交单号" | "Submit",
  cancel: "取消" | "Cancel",
  cancelSuccess: "已取消售后申请" | "Request cancelled",
  createSuccess: "售后申请已提交" | "Request submitted",
  trackingSuccess: "回寄单号已更新" | "Tracking updated",
  trackingNo: "回寄单号" | "Return Tracking No.",
  carrier: "承运商/物流公司" | "Carrier",
  carrierPlaceholder: "如：中通快递" | "e.g. ZTO Express",
  trackingPlaceholder: "输入运单号" | "Tracking number",
  trackTitle: "填写回寄物流单号" | "Enter Return Tracking",
  orderCode: "订单号" | "Order",
  rejectReason: "驳回原因" | "Reject Reason",
  empty: "暂无售后记录" | "No after-sales yet",
  notFound: "售后记录不存在" | "Not found",
  tabAll: "全部" | "All",
  tabPending: "待审核" | "Pending",
  tabToReturn: "待退货" | "To Return",
  tabReturning: "退货退款中" | "In Progress",
  tabRefunded: "已退款" | "Refunded",
  tabRejected: "已驳回" | "Rejected",
  tabClosed: "已关闭" | "Closed",
  statePending: "待商家审核" | "Pending Review",
  stateApproved: "审核通过·待退货" | "Approved",
  stateRejected: "已驳回" | "Rejected",
  stateReturning: "退货中" | "Returning",
  stateReceived: "已收货·退款处理中" | "Received",
  stateRefunded: "已退款" | "Refunded",
  stateClosed: "已关闭" | "Closed",
  stateUnknown: "处理中" | "Processing",
  stepPending: "申请" | "Apply",
  stepApproved: "审核通过" | "Approved",
  stepReturning: "退货中" | "Returning",
  stepReceived: "已收货" | "Received",
  stepRefunded: "已退款" | "Refunded",
},
```

同时在每个文件的 `messages.account` 块内新增键（在 `addresses` 等键附近；zh 中文、其余英文）：

```ts
afterSales: "售后/退换" | "After-Sales",
```

- [ ] **Step 2: 校验 i18n key 完整（10 个文件均含 `afterSales` 顶层块与 `account.afterSales`）**

运行一次扫描（PowerShell，工作目录 nshop）：

```powershell
Get-ChildItem layers/base/i18n/locales -Filter *.ts | ForEach-Object {
  $c = Get-Content $_.FullName -Raw
  $has = $c -match 'afterSales: \{' -and $c -match 'afterSales: "'
  "$($_.Name): afterSales-block=$([bool]($c -match 'afterSales: \{')) account-key=$([bool]($c -match 'afterSales:'))"
}
```

Expected: 10 行，`afterSales-block=True` 且 `account-key=True`（每行至少应看到顶层块与 account 键都存在）。

- [ ] **Step 3: 全量 typecheck + build**

```bash
pnpm typecheck
pnpm build
```

Expected: 两者全绿，`pnpm build` 产出 `.output/server/index.mjs`。

- [ ] **Step 4: 部署（铁律：本地构建 → scp → pm2）**

后端已在 R0 Step4 部署过；前端：

```bash
git add layers/base/i18n/locales
git commit -m "feat(i18n): 售后/退换文案全量同步"
git push origin nshop
node scripts/deploy.mjs      # 默认本地 build + scp .output + pm2 restart；可用 SKIP_BUILD=1 复用上一步产物
```

- [ ] **Step 5: 线上验证**

```bash
ssh qing "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/account/after-sales"
ssh qing "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/account"
```

Expected: 两处均 `200`。再对 `e.joho.cn/shop-api` 做一次 introspection 确认售后 mutation 存在（R0 Step5 已校验，此处复核）：

```bash
node scripts/introspect-check.mjs
```

- [ ] **Step 6: 回归检查清单（本地 dev 或线上人工）**

按以下顺序人工/半自动走查，任一失败即回滚并排查：
1. 登录 → 订单详情（已发货/已完成订单）→ 某商品行点「申请售后」→ 弹窗预填金额=该行比例价 → 填原因提交 → 跳售后详情。
2. 详情页：状态徽标/进度条/商品图/金额/原因显示正确。
3. 「我的售后」列表：Tab 筛选（待审核/已通过/退货退款中/已退款）+ 空态正确。
4. Pending 单点「取消」→ 状态变 Closed 并刷新。
5. 管理员 ho 在后台 approve 一条 → 换顾客端 → Approved 态显示「填写回寄单号」→ 提交 → 状态变 Returning。
6. 越权/异常：用另一账号访问他人售后 id → 详情 404 或后端 403 明文。
7. 回归：购物车/结算/订单中心/地址簿/登录不回归；`/account`、`/account/orders` 仍旧 200。

- [ ] **Step 7: 收尾提交（如 R0 临时脚本未删、schema 变更未提交，一并处理提交）**

```bash
git status
# 确认无 introspection 临时脚本残留；若有删除
git push origin nshop 2>$null
```

---

## Self-Review 记录（写完即核，已内联修正）

- **Spec 覆盖**：R0=§4 后端增强 + schema 刷新；R1=§5.1 数据层；R2=§5(§5.1 组件)；R3=§5.3 页面与入口；R4=§5.5 i18n + §8 测试部署。全部 spec 要求均有对应任务。
- **类型一致性**：全计划统一用 `#gql/default` 类型名；create modal 的 `orderLine` prop 提供了两种可兼容类型写法（`OrderLine` 或 `GetOrderByCodeQuery.lines[number]`），避免 mismatch。
- **占位扫档**：无 TBD/TODO；关键风险（生产插件是否启用、`PartialDelivery` 白名单、`order.id` 是否在 fragment）均改为显式核对步骤而非"适当处理"。