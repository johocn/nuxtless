# nshop · 认证中间件统一 + 类型安全修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Nuxt 路由中间件统一 8+ 账户页重复的 `onMounted` 认证守卫，并系统性消除 13+ 处类型强制转换与登录双路径硬伤。

**Architecture:** 新增 `account`（需登录）/`guest`（需游客）两个 Nuxt 路由中间件（仅客户端生效，因 `isAuthenticated` 依赖 localStorage）；新增 `useRouteParam`/`useRouteQuery` composable 与 `types/guard.ts` 类型守卫替代散落断言；useGqlSession 改为函数重载类型化的唯一会话入口，删除死代码 `useCustomerStore.login`。纯前端，不改后端。

**Tech Stack:** Nuxt 4.4（layers 架构）、Pinia + persistedstate、nuxt-graphql-client 0.2.46、@nuxtjs/i18n、Vue 3.5。

> **重要技术依据（spec §5 兜底策略）**：nuxt-graphql-client 0.2.46 无自动捕获 `vendure-auth-token` 响应头能力（token 必须 `useGqlHeaders`/`useGqlToken` 手动注入），故**不迁移登录到 typed client**；保留 useGqlSession 为唯一会话入口并类型化，删除未使用的 `useCustomerStore.login`。

---

## 文件结构总览

**新增**
- `layers/base/app/middleware/account.ts` — 需登录守卫（未认证 → /account/login）
- `layers/base/app/middleware/guest.ts` — 需游客守卫（已认证 → /account）
- `layers/base/app/composables/useRouteParam.ts` — 类型安全的 route param/query 取值
- `types/guard.ts` — `isActiveCustomerDetail` / `isActiveOrderDetail` 类型守卫

**修改**
- 页面（接入中间件）：`account/index`、`addresses`、`orders/index`、`orders/[code]`、`after-sales/index`、`after-sales/[id]`、`login`、`register`、`request-password-reset`、`password-reset`、`verify`
- 页面/组件（类型清理）：`category/[slug]`、`product/[slug]`、`checkout/index`、`checkout/confirmation/[code].client`、`components/checkout/AddressForm`、`components/account/ResetPasswordForm`、`utils/getCategoryTrail`
- 认证收敛：`composables/useGqlSession.ts`、`stores/useCustomerStore.ts`

**删除**
- `scripts/_fix-nm.mjs`、`scripts/_scan-nm.mjs`

**验证命令**
- 类型检查：`pnpm typecheck`（期望 0 errors）
- 构建：`pnpm build`（最终验证，本地执行，遵守部署铁律）

---

### Task 1: 新增认证中间件

**Files:**
- Create: `layers/base/app/middleware/account.ts`
- Create: `layers/base/app/middleware/guest.ts`

- [ ] **Step 1: 创建 account 中间件**

`layers/base/app/middleware/account.ts`：

```ts
export default defineNuxtRouteMiddleware(() => {
  // isAuthenticated 依赖 localStorage（persistedstate），SSR 阶段恒为 false，
  // 因此只在客户端执行守卫，避免服务端误跳转。
  if (import.meta.server) return;

  const { isAuthenticated } = storeToRefs(useAuthStore());
  if (!isAuthenticated.value) {
    return navigateTo(useLocalePath()("/account/login"), { replace: true });
  }
});
```

- [ ] **Step 2: 创建 guest 中间件**

`layers/base/app/middleware/guest.ts`：

```ts
export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) return;

  const { isAuthenticated } = storeToRefs(useAuthStore());
  if (isAuthenticated.value) {
    return navigateTo(useLocalePath()("/account"), { replace: true });
  }
});
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck`
Expected: 无与中间件相关的类型错误（Nuxt 自动注册中间件名为 `account` / `guest`）。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/middleware/account.ts layers/base/app/middleware/guest.ts
git commit -m "feat(auth): 新增 account/guest 路由中间件（仅客户端生效）"
```

---

### Task 2: account 组页面接入中间件（6 页）

**Files:**
- Modify: `layers/base/app/pages/account/index.vue`
- Modify: `layers/base/app/pages/account/addresses.vue`
- Modify: `layers/base/app/pages/account/orders/index.vue`
- Modify: `layers/base/app/pages/account/orders/[code].vue`
- Modify: `layers/base/app/pages/account/after-sales/index.vue`
- Modify: `layers/base/app/pages/account/after-sales/[id].vue`

通用模式：`definePageMeta({ middleware: "account" })`；删除 `const { isAuthenticated } = storeToRefs(useAuthStore());`；删除 `onMounted` 内的认证守卫段（保留数据加载）；删除模板中 `isAuthenticated` 相关加载门。**保留页面自身数据 loading。**

- [ ] **Step 1: account/index.vue**

脚本区：
1. `<script setup lang="ts">` 首行前加：
```ts
definePageMeta({ middleware: "account" });
```
2. 删除第 8 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`
3. `onMounted` 内删除守卫段，保留数据获取：
```ts
onMounted(async () => {
  if (!customer.value || !("phoneNumber" in customer.value)) {
    await fetchCustomer("detail");
  }
  loading.value = false;
});
```
（此文件模板无 `isAuthenticated`，不用改模板；`"phoneNumber" in` 判别在 Task 5 替换为类型守卫）

- [ ] **Step 2: addresses.vue**

1. `<script setup lang="ts">` 首行前加 `definePageMeta({ middleware: "account" });`
2. 删除第 7 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`
3. `onMounted` 改为：
```ts
onMounted(async () => {
  await fetchAddresses();
});
```

- [ ] **Step 3: orders/index.vue**

1. `<script setup lang="ts">` 首行前加 `definePageMeta({ middleware: "account" });`
2. 删除第 18 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`
3. `onMounted` 改为：
```ts
onMounted(async () => {
  await refresh();
  loading.value = false;
});
```
4. 模板 `<BaseLoader v-if="loading || !isAuthenticated" width="sm:w-xs md:w-sm" />` 改为：
```html
<BaseLoader v-if="loading" width="sm:w-xs md:w-sm" />
```

- [ ] **Step 4: orders/[code].vue**

1. `<script setup lang="ts">` 首行前加 `definePageMeta({ middleware: "account" });`
2. 删除第 5 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`
3. 删除整个 `onMounted` 块（其中只有认证守卫，无其他逻辑）：
```ts
onMounted(async () => {
  if (!isAuthenticated.value) {
    navigateTo(localePath("/account/login"), { replace: true });
    return;
  }
});
```
4. 模板顶部改为（删除 BaseLoader，`UError` 改 `v-if`，`main` 保持 `v-else-if` 与之衔接）：
```html
<UError
  v-if="hasError"
  :error="{
    statusCode: 404,
    statusMessage: t('messages.error.noOrder'),
    message: t('messages.error.orderNotFound'),
  }"
/>
<main v-else-if="order" class="container mb-14">
```

- [ ] **Step 5: after-sales/index.vue**

1. `<script setup lang="ts">` 首行前加 `definePageMeta({ middleware: "account" });`
2. 删除第 10 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`
3. `onMounted` 改为：
```ts
onMounted(async () => {
  await refresh();
  loading.value = false;
});
```
4. 模板 `<BaseLoader v-if="loading || !isAuthenticated" width="sm:w-xs md:w-md" />` 改为：
```html
<BaseLoader v-if="loading" width="sm:w-xs md:w-md" />
```

- [ ] **Step 6: after-sales/[id].vue**

1. `<script setup lang="ts">` 首行前加 `definePageMeta({ middleware: "account" });`
2. 删除第 15 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`
3. 该文件无 `onMounted`（认证由中间件接管），跳过。
4. 模板顶部改为：
```html
<UError
  v-if="hasError"
  :error="{ statusCode: 404, statusMessage: t('messages.afterSales.notFound'), message: t('messages.afterSales.notFound') }"
/>
<main v-else-if="request" class="container mb-14">
```

- [ ] **Step 7: 类型检查**

Run: `pnpm typecheck`
Expected: 无错误；若某页删除 `isAuthenticated` 后仍有未使用变量/导入（如 `localePath` 仅在守卫中用），一并清理。

- [ ] **Step 8: Commit**

```bash
git add layers/base/app/pages/account
git commit -m "feat(auth): 账户页统一走 account 中间件，删除重复 onMounted 守卫"
```

---

### Task 3: guest 组页面接入中间件（5 页）

**Files:**
- Modify: `layers/base/app/pages/account/login.vue`
- Modify: `layers/base/app/pages/account/register.vue`
- Modify: `layers/base/app/pages/account/request-password-reset.vue`
- Modify: `layers/base/app/pages/account/password-reset.vue`
- Modify: `layers/base/app/pages/account/verify.vue`

- [ ] **Step 1: login.vue**

1. `definePageMeta` 加 middleware：
```ts
definePageMeta({
  alias: ["/login"],
  middleware: "guest",
});
```
2. 删除第 9 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`、第 10 行 `const loading = ref(true);`、整个 `onMounted` 块。
3. 模板 `<BaseLoader v-if="loading" width="sm:w-xs md:w-sm" />` 删除；`<main v-else class="container mt-14">` 改为 `<main class="container mt-14">`。

- [ ] **Step 2: register.vue**

1. `definePageMeta` 加 `middleware: "guest"`（保留 alias）。
2. 删除第 8 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`、第 9 行 `const loading = ref(true);`、整个 `onMounted` 块。
3. 模板 `<BaseLoader v-if="loading" ... />` 删除；`<main v-else ...>` 去掉 `v-else`。

- [ ] **Step 3: request-password-reset.vue**

1. `definePageMeta` 加 `middleware: "guest"`（保留 alias）。
2. 删除第 8 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`、第 9 行 `const loading = ref(true);`、整个 `onMounted` 块。**保留** `const submitted = ref(false);` 与 `watch(submitted, ...)`（若有）。
3. 模板 `<BaseLoader v-if="loading" ... />` 删除；`<main v-else ...>` 去掉 `v-else`。

- [ ] **Step 4: password-reset.vue**

1. `definePageMeta` 加 `middleware: "guest"`（保留 alias）。
2. 删除第 10 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`。
3. `onMounted` 删除认证段，**保留 token 缺失校验**（这是数据校验，不是认证守卫）：
```ts
onMounted(() => {
  if (!token) {
    navigateTo(localePath("/account/request-password-reset"), {
      replace: true,
    });
    return;
  }

  loading.value = false;
});
```
4. 模板不变（保留 `BaseLoader v-if="loading"` 作 token 校验门）。

- [ ] **Step 5: verify.vue**

1. `definePageMeta` 加 `middleware: "guest"`（保留 alias）。
2. 删除第 12 行 `const { isAuthenticated } = storeToRefs(useAuthStore());`。
3. `onMounted` 删除认证段，保留验证逻辑：
```ts
onMounted(async () => {
  loading.value = false;

  if (!token) {
    error.value = "Missing verification token.";
    verifying.value = false;
    return;
  }

  const result = await verify(token);

  if (result && "identifier" in result) {
    await navigateTo(localePath("/account/login"), { replace: true });
    toast.add({
      title: t("messages.account.verifySuccess"),
      description: t("messages.account.verifySuccessMessage"),
      color: "success",
    });
  } else {
    error.value = result?.message ?? "Verification failed.";
    verifying.value = false;
  }
});
```
4. 模板不变（保留 `BaseLoader v-if="loading"`）。

- [ ] **Step 6: 类型检查**

Run: `pnpm typecheck`
Expected: 无错误；清理因删守卫而产生的未使用导入（如 `localePath`）。

- [ ] **Step 7: Commit**

```bash
git add layers/base/app/pages/account
git commit -m "feat(auth): 游客页统一走 guest 中间件，删除重复 onMounted 守卫"
```

---

### Task 4: useRouteParam/useRouteQuery + route 断言清理

**Files:**
- Create: `layers/base/app/composables/useRouteParam.ts`
- Modify: `layers/base/app/utils/getCategoryTrail.ts`
- Modify: `layers/base/app/pages/category/[slug].vue`
- Modify: `layers/base/app/pages/product/[slug].vue`
- Modify: `layers/base/app/pages/checkout/confirmation/[code].client.vue`
- Modify: `layers/base/app/pages/account/orders/[code].vue`
- Modify: `layers/base/app/pages/account/after-sales/[id].vue`
- Modify: `layers/base/app/pages/account/password-reset.vue`
- Modify: `layers/base/app/pages/account/verify.vue`
- Modify: `layers/base/app/components/account/ResetPasswordForm.vue`

- [ ] **Step 1: 创建 composable**

`layers/base/app/composables/useRouteParam.ts`：

```ts
// 类型安全的 route param/query 取值，替代散落的 `route.params.xxx as string` 断言。
// 兼容 vue-router 5 的 `string | string[] | null` 值类型。
export function useRouteParam(name: string): string {
  const route = useRoute();
  const value = route.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function useRouteQuery(name: string): string {
  const route = useRoute();
  const value = route.query[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
```

- [ ] **Step 2: getCategoryTrail.ts**

原文件顶部 `const route = useRoute();` + `const slug = route.params.slug as string;` 改为：

```ts
export function getCategoryTrail(): BreadcrumbItem[] {
  const slug = useRouteParam("slug");
  ...
}
```
并删除 `const route = useRoute();` 行（此文件 route 仅用于 slug，已核实）。

- [ ] **Step 3: category/[slug].vue**

第 18 行 `const slug = route.params.slug as string;` 改为：
```ts
const slug = useRouteParam("slug");
```
保留 `const route = useRoute();`（文件其他处仍用 `route.query` / `route.path`）。

- [ ] **Step 4: product/[slug].vue**

第 18 行改为 `const slug = useRouteParam("slug");`；删除第 2 行 `const route = useRoute();`（此文件 route 仅用于 slug，已核实）。

- [ ] **Step 5: confirmation/[code].client.vue**

第 13 行 `const code = route.params.code as string;` 改为：
```ts
const code = useRouteParam("code");
```
保留 `const route = useRoute();`（文件其他处仍用 `route.query.redirect_status` / `route.query.payment_intent` / `route.params.code`）。

- [ ] **Step 6: orders/[code].vue**

第 6 行 `const code = route.params.code as string;` 改为 `const code = useRouteParam("code");`；删除第 2 行 `const route = useRoute();`（此文件 route 仅用于 code，已核实）。

- [ ] **Step 7: after-sales/[id].vue**

第 16 行 `const id = route.params.id as string;` 改为 `const id = useRouteParam("id");`；删除第 12 行 `const route = useRoute();`（此文件 route 仅用于 id，已核实）。

- [ ] **Step 8: password-reset.vue**

第 6-7 行改为：
```ts
const token = useRouteQuery("token");
```
删除 `const route = useRoute();`（此文件 route 仅用于 token，已核实）。

- [ ] **Step 9: verify.vue**

第 6-7 行改为：
```ts
const token = useRouteQuery("token") || undefined;
```
删除 `const route = useRoute();`（此文件 route 仅用于 token，已核实；`|| undefined` 保持原 `string | undefined` 语义）。

- [ ] **Step 10: ResetPasswordForm.vue**

第 6-8 行改为：
```ts
const token = useRouteQuery("token");
```
删除 `const route = useRoute();`（此文件 route 仅用于 token，已核实）。

- [ ] **Step 11: 类型检查**

Run: `pnpm typecheck`
Expected: 无错误；`useRouteParam`/`useRouteQuery` 为 Nuxt 自动导入 composable（位于 `layers/base/app/composables/`），无需手动 import。

- [ ] **Step 12: Commit**

```bash
git add layers/base/app/composables/useRouteParam.ts layers/base/app/utils/getCategoryTrail.ts layers/base/app/pages layers/base/app/components/account/ResetPasswordForm.vue
git commit -m "refactor(types): useRouteParam/useRouteQuery 消除 route 断言"
```

---

### Task 5: 类型守卫 + customer/order 断言 + 金额格式化

**Files:**
- Create: `types/guard.ts`
- Modify: `layers/base/app/pages/account/index.vue`
- Modify: `layers/base/app/components/checkout/AddressForm.vue`
- Modify: `layers/base/app/pages/checkout/index.vue`
- Modify: `layers/base/app/pages/account/orders/index.vue`
- Modify: `layers/base/app/pages/account/orders/[code].vue`

- [ ] **Step 1: 创建类型守卫**

`types/guard.ts`：

```ts
// /types/guard.ts
import type { ActiveCustomer } from "./customer";
import type { ActiveCustomerDetail } from "./customer";
import type { ActiveOrder, ActiveOrderDetail } from "./order";

/** detail 查询返回的 customer 含 phoneNumber（base 查询无）。 */
export function isActiveCustomerDetail(
  customer: ActiveCustomer | null,
): customer is ActiveCustomerDetail {
  return !!customer && "phoneNumber" in customer;
}

/** detail 查询返回的 order 含 shippingWithTax。 */
export function isActiveOrderDetail(
  order: ActiveOrder | null,
): order is ActiveOrderDetail {
  return !!order && "shippingWithTax" in order;
}
```

- [ ] **Step 2: account/index.vue**

1. 第 12 行替换为：
```ts
const activeCustomer = computed<ActiveCustomerDetail | null>(() =>
  isActiveCustomerDetail(customer.value) ? customer.value : null,
);
```
2. `onMounted` 内判别替换为：
```ts
if (!isActiveCustomerDetail(customer.value)) {
  await fetchCustomer("detail");
}
```
3. 模板 `activeCustomer?.id` / `activeCustomer?.firstName` 等可选链用法保持不变（`null` 兼容）。

- [ ] **Step 3: checkout/AddressForm.vue**

1. 第 22 行判别替换为：
```ts
if (!isActiveCustomerDetail(customer.value)) {
  await fetchCustomer("detail");
}
```
2. 第 27 行替换为：
```ts
const activeCustomer = computed<ActiveCustomerDetail | null>(() =>
  isActiveCustomerDetail(customer.value) ? customer.value : null,
);
```
3. 确认该组件模板中 `activeCustomer` 的使用均为可选链或 `v-if`（原 `as` 断言已假定非空，改用守卫后为 `null` 安全；若模板直接 `activeCustomer.firstName` 访问，改为 `activeCustomer?.firstName`）。

- [ ] **Step 4: checkout/index.vue**

第 19-20 行替换为：
```ts
// fetchOrder("detail") 后 order 应为 ActiveOrderDetail；守卫类型化，模板用可选链保持 null 安全。
const activeOrder = computed<ActiveOrderDetail | null>(() =>
  isActiveOrderDetail(order.value) ? order.value : null,
);
```
第 15 行 `if (!order.value || !("shippingWithTax" in order.value))` 改为：
```ts
if (!isActiveOrderDetail(order.value)) {
  await orderStore.fetchOrder("detail");
}
```
（模板 `activeOrder?.lines` / `activeOrder?.code` 均为可选链，`null` 兼容，无需改动）

- [ ] **Step 5: orders/index.vue 金额格式化统一**

1. 导入 `formatMoney`（文件顶部）：
```ts
import { formatMoney } from "../../../utils/format-money";
```
2. `tableData` computed 中替换：
```ts
const tableData = computed<OrderTableRow[]>(() =>
  filteredOrders.value.map((order, index) => ({
    id: index + 1,
    date: d(new Date(order.orderPlacedAt)),
    status: order.state,
    amount: formatMoney(order.totalWithTax, order.currencyCode, locale.value),
    currency: order.currencyCode,
    code: order.code,
  })),
);
```
3. 金额列 cell 替换（删除 `Number.parseFloat` 与 `Intl.NumberFormat`，直接展示已格式化金额）：
```ts
cell: ({ row }) => {
  return h("div", { class: "text-right font-medium" }, row.original.amount);
},
```
4. 若 `locale` 未被别处使用则保留（`d` 也已使用 `locale` 无关，`useI18n` 解构 `{ locale, d, t }` 中 `locale` 现用于 `formatMoney`）。

- [ ] **Step 6: orders/[code].vue OrderLine 类型**

第 14-16 行 `applyLine` 类型替换为：
```ts
const applyLine = ref<OrderLine | null>(null);
```
文件顶部加：
```ts
import type { OrderLine } from "~~/types/order";
```
删除原来的 `NonNullable<NonNullable<typeof order.value>["lines"]>[number]` 表达式。

- [ ] **Step 7: 类型检查**

Run: `pnpm typecheck`
Expected: 无错误；确认 `isActiveCustomerDetail` / `isActiveOrderDetail` 被 `~~/types/guard` 解析（Nuxt alias `~~` → 项目根，`types/` 下已有同风格 `types/customer.ts` 等）。

- [ ] **Step 8: Commit**

```bash
git add types/guard.ts layers/base/app/pages/account/index.vue layers/base/app/pages/account/orders layers/base/app/pages/checkout/index.vue layers/base/app/components/checkout/AddressForm.vue
git commit -m "refactor(types): 类型守卫替代 customer/order 断言，统一金额格式化"
```

---

### Task 6: useGqlSession 类型化 + 删除死代码 store.login

**Files:**
- Modify: `layers/base/app/composables/useGqlSession.ts`
- Modify: `layers/base/stores/useCustomerStore.ts`

- [ ] **Step 1: 确认 store.login 未被调用**

Run（在 `d:\zhao\nshop` 下）:
```bash
git grep -n "\.login(" -- layers/base/app | Select-String -NotMatch "useGqlSession|GqlLogInUser|LoginForm"
```
Expected: 无命中（`useCustomerStore.login` 无界面调用方，可安全删除）。若存在调用方，停止并告知用户。

- [ ] **Step 2: useGqlSession 加函数重载**

替换 `layers/base/app/composables/useGqlSession.ts` 为：

```ts
import type { ActiveOrder } from "~~/types/order";
import type { LogInResult } from "~~/types/customer";

// 统一会话入口：login 返回登录结果（CurrentUser | ErrorResult），default 返回活跃订单。
// token 捕获依赖手写 fetch 读取 vendure-auth-token 响应头（typed client 无此能力）。
export async function useGqlSession(
  locale: string,
  gqlHost: string | undefined,
  channelToken: string,
  queryType?: "default",
): Promise<ActiveOrder | null>;
export async function useGqlSession(
  locale: string,
  gqlHost: string | undefined,
  channelToken: string,
  queryType: "login",
  variables: Record<string, unknown>,
): Promise<LogInResult | null>;
export async function useGqlSession(
  locale: string,
  gqlHost: string | undefined,
  channelToken: string,
  queryType: "default" | "login" = "default",
  variables?: Record<string, unknown>,
): Promise<ActiveOrder | LogInResult | null> {
  if (!gqlHost) {
    console.error("useGqlSession: GQL_HOST is not defined");
    return null;
  }

  const authStore = useAuthStore();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = authStore.session?.token;
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (channelToken) {
    headers["vendure-channel-token"] = channelToken;
  }
  if (locale) {
    headers["Accept-Language"] = locale;
  }

  const query =
    queryType === "login"
      ? `
    mutation LogInUser($emailAddress: String!, $password: String!, $rememberMe: Boolean!) {
      login(username: $emailAddress, password: $password, rememberMe: $rememberMe) {
        ... on CurrentUser {
          id
          identifier
        }
        ... on ErrorResult {
          errorCode
          message
        }
      }
    }
  `
      : `
    query ActiveOrder {
      activeOrder {
        id
        state
      }
    }
  `;

  try {
    const res = await fetch(`${gqlHost}?languageCode=${locale}`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const newToken = res.headers.get("vendure-auth-token");
    if (newToken) {
      headers.authorization = `Bearer ${newToken}`;
      authStore.setSession(newToken);
    }

    useGqlHeaders(headers);

    const json = (await res.json()) as {
      data?: { login?: LogInResult; activeOrder?: ActiveOrder };
    };

    if (queryType === "login") {
      return json.data?.login ?? null;
    }
    return json.data?.activeOrder ?? null;
  } catch (error) {
    console.error("Failed to fetch session token:", error);
    return null;
  }
}
```

- [ ] **Step 3: 删除 useCustomerStore.login 死代码**

在 `layers/base/stores/useCustomerStore.ts` 中：
1. 删除整个 `login` action（原 37-63 行）：
```ts
  async function login(
    email: string,
    password: string,
    rememberMe = true,
  ): Promise<LogInResult | undefined> {
    // ...（整段删除）
  }
```
2. 从 import 删除 `LogInResult`（如无其他使用）：
```ts
import type {
  ActiveCustomer,
  LogOutResult,
  RegisterResult,
  VerifyResult,
  RequestPasswordResetResult,
  ResetPasswordResult,
} from "~~/types/customer";
```
3. 从 return 对象删除 `login` 键。

- [ ] **Step 4: 类型检查**

Run: `pnpm typecheck`
Expected: 无错误。LoginForm.vue 调用 `useGqlSession("login", {...})` 命中重载返回 `LogInResult | null`，其 `"identifier" in result` / `"errorCode" in result` 判别仍成立。

- [ ] **Step 5: Commit**

```bash
git add layers/base/app/composables/useGqlSession.ts layers/base/stores/useCustomerStore.ts
git commit -m "refactor(auth): useGqlSession 函数重载类型化，删除未使用的 store.login 双路径"
```

---

### Task 7: 清理调试脚本 + 全量验证

**Files:**
- Delete: `scripts/_fix-nm.mjs`
- Delete: `scripts/_scan-nm.mjs`

- [ ] **Step 1: 删除调试脚本**

```bash
git rm scripts/_fix-nm.mjs scripts/_scan-nm.mjs
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: 0 errors。

- [ ] **Step 3: 本地构建（部署铁律：本地构建，不在服务器）**

Run: `pnpm build`
Expected: 构建成功，`.output/` 生成。若构建卡住（google 字体等网络问题），确认 `layers/base/nuxt.config.ts` 的 `fonts.providers` 已禁用 google（commit `f00e302` 已处理，一般不再出现）。

- [ ] **Step 4: 人工回归清单（按序验证）**

启动本地 `pnpm dev`（或由用户指定方式）逐项验证：

1. **未登录访问保护页**：`/account`、`/account/orders`、`/account/addresses`、`/account/after-sales` → 立即重定向 `/account/login`，不再闪 loader
2. **已登录访问游客页**：`/account/login`、`/account/register`、`/account/request-password-reset`、`/account/password-reset`、`/verify` → 重定向 `/account`
3. **登录闭环**：账号密码登录成功 → 账户菜单显示用户信息、订单/地址/售后入口正常；登录失败 → 错误 toast
4. **登出闭环**：登出 → 清会话 → 重建匿名会话 → 访问 `/account` 跳登录
5. **订单列表/详情**：金额显示正常（`formatMoney` 格式化）、状态 Tab 筛选、取消/再次购买、复制链接、行内申请售后
6. **售后列表/详情**：状态徽标、进度、取消售后、回寄单号
7. **地址簿**：列表/新增/编辑/删除
8. **结算页**：地址簿选择/回填、自提点、支付提交、确认页
9. **商品/分类页**：slug 参数正常、breadcrumb、排序/筛选（route 改动无回归）
10. **邮箱验证链接**：`/verify?token=...` 流程正常

- [ ] **Step 5: Commit 清理**

```bash
git add -A
git commit -m "chore(auth): 删除临时调试脚本，完成认证/类型安全修复"
```

---

## Self-Review（写后自查）

**Spec 覆盖核对：**
- §4.1 中间件 → Task 1-3 ✅
- §4.2 登录路径统一 + useGqlSession 类型化 → Task 6（按 spec §5 兜底策略调整，目标不变）✅
- §4.3 类型清理（route 断言 / customer / order / 金额 / OrderLine）→ Task 4-5 ✅
- §4.4 删调试脚本 + 验证清单 → Task 7 ✅

**占位符扫描：** 无 TBD/TODO；每步含完整代码。

**类型一致性：** `useRouteParam`/`useRouteQuery`（Task 4 定义，Task 4 各步使用）、`isActiveCustomerDetail`/`isActiveOrderDetail`（Task 5 定义并使用）、`useGqlSession` 重载签名（Task 6 定义，LoginForm 既有调用命中）、`OrderLine`（Task 5 使用，types/order.ts:30 已有）——签名前后一致。
