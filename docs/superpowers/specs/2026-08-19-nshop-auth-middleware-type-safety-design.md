# nshop · 阶段「认证中间件统一 + 类型安全修复」— 设计文档

- **日期**：2026-08-19
- **项目**：`d:\zhao\nshop`（nuxtless fork，Vendure 电商前台）
- **范围**：前端硬伤修复——① 用 Nuxt 路由中间件统一 8+ 个账户页重复的 `onMounted` 认证守卫；② 登录路径统一（消除手写 fetch 会话管理器与 typed client 双路径）；③ 系统性消除 13+ 处类型强制转换；④ 顺带清理遗留调试脚本。纯前端，**不改 Vendure 后端**。
- **状态**：已审阅（用户确认方案 B 与全部设计节，进入实现计划）

## 1. 背景与目标

nshop 前台已完成 首页/分类/商品/结算/确认/账户体系（订单中心、地址簿、售后中心）等核心闭环，构建问题也已修复。但存在两类硬伤影响可维护性与上线质量：

1. **认证守卫重复**：8+ 个账户页各自在 `onMounted` 里判断 `isAuthenticated` 并 `navigateTo` 跳转，模板里还残留 `v-if="!isAuthenticated"` 加载态，逻辑高度重复、易遗漏。
2. **类型安全薄弱**：`route.params.xxx as string`、`customer.value as ActiveCustomerDetail`、`order.value as ActiveOrderDetail`、`useGqlSession` 的 `as LogInResult` 等 13+ 处强制类型转换；订单列表手写金额格式化与 `formatMoney` util 重复；`useGqlSession` 为遗留手写 fetch 会话管理器（与 typed GQL client 并存、登录双路径不一致）。

本阶段目标：**把两类硬伤一次性清干净**（用户选定方案 B），不动认证存储架构（token 仍在 localStorage，httpOnly cookie 重构另立专项）。

## 2. 现状审计（已核实）

### 2.1 认证守卫重复

无 `middleware/` 目录。以下页面各自实现 `onMounted` 守卫：

- **需登录**（未认证 → 跳 `/account/login`）：`account/index`、`account/addresses`、`account/orders/index`、`account/orders/[code]`、`account/after-sales/index`、`account/after-sales/[id]`
- **需游客**（已认证 → 跳 `/account`）：`account/login`、`account/register`、`account/request-password-reset`、`account/password-reset`、`account/verify`

认证状态来源：`useAuthStore`（Pinia + persistedstate，`session = { token, tokenSource, user }`，`isAuthenticated = !!session.user?.id`）。token 依赖 localStorage → **SSR 阶段 `isAuthenticated` 恒为 false**，中间件必须跳过服务端执行。

### 2.2 登录双路径（硬伤）

- [LoginForm.vue](file:///d:/zhao/nshop/layers/base/app/components/account/LoginForm.vue#L24-L35) 走手写 fetch 的 `useGqlSession("login")`，手动解析 `vendure-auth-token`、手动 `setUser + fetchCustomer + fetchOrder`
- [useCustomerStore.login](file:///d:/zhao/nshop/layers/base/stores/useCustomerStore.ts#L37-L63) 走 typed client `GqlLogInUser`（nuxt-graphql-client，自带 retainToken 机制），但**界面从未调用**（疑似死代码）

### 2.3 useGqlSession 遗留

[useGqlSession.ts](file:///d:/zhao/nshop/layers/base/app/composables/useGqlSession.ts) 三处使用：
- `app/app.vue` onBeforeMount：会话验证 + 把 localStorage 恢复的 token 同步进 typed client 全局 headers（`useGqlHeaders`）——这是它存在的核心职责
- `AccountMenu.vue` 登出后：重建匿名会话
- `LoginForm.vue`：登录（将移除，见 §4.2）

### 2.4 类型强制转换清单（13+ 处）

| 位置 | 现状 |
|---|---|
| `utils/getCategoryTrail.ts:6`、`pages/category/[slug].vue:18`、`pages/product/[slug].vue:18`、`checkout/confirmation/[code].client.vue:13`、`account/after-sales/[id].vue:16`、`account/orders/[code].vue:6` | `route.params.xxx as string` |
| `pages/account/index.vue:12`、`components/checkout/AddressForm.vue:27` | `customer.value as ActiveCustomerDetail` |
| `pages/checkout/index.vue:20` | `order.value as ActiveOrderDetail` |
| `useGqlSession.ts:88/90` | `as LogInResult` / `as ActiveOrder` |
| `pages/account/password-reset.vue:7`、`components/account/ResetPasswordForm.vue:8` | `route.query.token as string` |
| `pages/account/orders/index.vue` | 手写 `(totalWithTax/100).toFixed(2)` + `Intl.NumberFormat`（与 `formatMoney` 重复） |
| `pages/account/orders/[code].vue:14-16` | `NonNullable<NonNullable<...>["lines"]>[number]` 长类型表达式 |

## 3. 关键决策

| 事项 | 决策 |
|---|---|
| 修复深度 | **方案 B 全面修复**：中间件统一 + 登录路径统一 + 系统性类型清理，一次性清干净 |
| 认证存储 | **保持 localStorage + persistedstate 不动**（httpOnly cookie 重构风险大，另立专项） |
| 中间件执行时机 | **仅客户端**（`import.meta.server` 直接 return），因 `isAuthenticated` 依赖 localStorage |
| 登录路径 | **统一到 `useCustomerStore.login()`**（typed client），LoginForm 不再用手写 fetch |
| useGqlSession 去留 | **保留但瘦身**：只做会话验证 + token 同步（app.vue / 登出场景），移除 login 分支，返回类型化 |
| 类型守卫 | 判别逻辑单一来源（`types/` 或 utils），页面不再手动 `as` |
| 金额格式化 | 统一 `formatMoney` util，删除手写 `Intl.NumberFormat` |
| 调试脚本 | `scripts/_fix-nm.mjs`、`scripts/_scan-nm.mjs` 一并删除（rmSync 崩溃调试遗留，未提交） |
| 后端 | **零改动**（纯前端阶段） |
| 部署 | 铁律：本地构建 → 推送 → 服务器 pull + pm2，绝不在服务器构建 |

## 4. 设计细节

### 4.1 统一认证中间件

新增 `layers/base/app/middleware/`：

- `account.ts`（需登录）：
  ```ts
  export default defineNuxtRouteMiddleware(() => {
    if (import.meta.server) return;
    const { isAuthenticated } = storeToRefs(useAuthStore());
    if (!isAuthenticated.value) {
      return navigateTo(useLocalePath()("/account/login"), { replace: true });
    }
  });
  ```
- `guest.ts`（需游客）：
  ```ts
  export default defineNuxtRouteMiddleware(() => {
    if (import.meta.server) return;
    const { isAuthenticated } = storeToRefs(useAuthStore());
    if (isAuthenticated.value) {
      return navigateTo(useLocalePath()("/account"), { replace: true });
    }
  });
  ```

页面改造（全部 `definePageMeta({ middleware: ... })`，删除 `onMounted` 守卫、`isAuthenticated` 解构、模板 `v-if="!isAuthenticated"` 加载态；**保留**页面自身数据 loading）：

- `account`：account/index、addresses、orders/index、orders/[code]、after-sales/index、after-sales/[id]
- `guest`：login、register、request-password-reset、password-reset、verify（verify 的"已认证跳账户"逻辑正好由 guest 接管）

注：`verify.vue` 未认证时允许访问（执行邮箱验证），`guest` 中间件逻辑（仅拦截已认证）与其一致，可复用。

### 4.2 登录路径统一 + useGqlSession 类型化

1. **LoginForm.vue**：`onSubmit` 改调用 `useCustomerStore.login(email, password, rememberMe)`；登录成功后保留 `setUser({ id, email })`（来自 customer）、`fetchCustomer()`、`fetchOrder()`、成功/失败 toast 逻辑。`result` 判别沿用 `"identifier" in result` / `"errorCode" in result`。
2. **useGqlSession.ts**：
   - 移除 `login` 分支与 `LogInUser` 内联 query、`as LogInResult`
   - 返回类型收敛为 `Promise<ActiveOrder | null>`（default 分支，`as ActiveOrder` → 由调用方/判别处理；若仍有非空转换用类型守卫替代）
   - 保留 token 读取 + `useGqlHeaders` 同步机制（app.vue / 登出场景的核心职责）
3. **兜底策略**：若本地验证发现 typed client 登录后 token 未正确 retain（`fetchCustomer` 401），回退为"保留 useGqlSession login 分支但加函数重载类型化"，不强行改登录路径——**以回归验证结果为准**。

### 4.3 系统性类型安全清理

| 方案 | 说明 |
|---|---|
| `useRouteParam(name)` composable | 新建于 `composables/`，包装 `route.params[name]` 并类型化返回 `string`；替换 6 处 `as string`；query 类（password-reset / ResetPasswordForm 的 `route.query.token as string`）用 `useRouteQuery` 或同款 helper |
| `isActiveCustomerDetail()` 类型守卫 | 基于 `"phoneNumber" in` 判别，替换 account/index 与 checkout/AddressForm 的 `as ActiveCustomerDetail` |
| `isActiveOrderDetail()` 类型守卫 | 替换 checkout/index 的 `as ActiveOrderDetail` |
| `formatMoney` 统一 | orders/index 删除手写 `.toFixed(2)` + `Intl.NumberFormat`，改用 `formatMoney`（保持 locale/currency 语义一致） |
| `OrderLine` 类型复用 | orders/[code] 的 applyLine 长类型表达式改用 `types/order.ts` 的 `OrderLine` |

### 4.4 清理与验证

- 删除 `scripts/_fix-nm.mjs`、`scripts/_scan-nm.mjs`
- 验证清单：
  1. `pnpm typecheck` 通过；本地构建成功（遵守部署铁律）
  2. 登录/登出回归：token 保留、账户菜单状态、登出后重建匿名会话
  3. 未登录访问 account 各页 → 跳登录；已登录访问 login/register/verify → 跳账户
  4. 订单列表/详情、售后列表/详情、地址簿、结算、确认页回归（金额显示、自提点、商品图）
  5. 邮箱验证链接流程回归

## 5. 风险与回退

- **typed client token retain 行为**：若验证失败，回退为 useGqlSession 保留 login 分支 + 函数重载（§4.2 兜底）。
- **中间件时序**：persistedstate 在 store 初始化时同步恢复，中间件（客户端导航前）读取时已可用；但 SSR 阶段恒 false → 已用 `import.meta.server` 跳过，页面 SSR 首帧仍会渲染（与现状一致，不引入回归）。
- **verify 页**：仅移除重复跳转逻辑，验证执行路径不动。

## 6. 文件清单

**新增**
- `layers/base/app/middleware/account.ts`
- `layers/base/app/middleware/guest.ts`
- `layers/base/app/composables/useRouteParam.ts`（或同款 helper）

**修改**
- 页面：`account/index`、`addresses`、`login`、`register`、`request-password-reset`、`password-reset`、`verify`、`orders/index`、`orders/[code]`、`after-sales/index`、`after-sales/[id]`
- 组件：`components/account/LoginForm.vue`、`components/account/ResetPasswordForm.vue`、`components/checkout/AddressForm.vue`
- 页面（类型清理）：`checkout/index.vue`、`checkout/confirmation/[code].client.vue`、`category/[slug].vue`、`product/[slug].vue`
- composable：`useGqlSession.ts`
- util：`getCategoryTrail.ts`
- 类型：`types/` 下新增类型守卫（或 `types/guard.ts`）

**删除**
- `scripts/_fix-nm.mjs`、`scripts/_scan-nm.mjs`
