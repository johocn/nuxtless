# 配送档案「全局化」管理 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让超管能在配送档案创建/编辑时开启「设为全局」并在列表用「全局」徽标标注，同时补全后端 create/update/delete 的权限校验与字段一致性。

**Architecture:** 前端在 `vshop/web-admin` 的配送档案页：新建/编辑表单增「设为全局」开关（仅超管可见，编辑态超管可切换，非超管倚赖后端只读），列表给全局档案加「全局」徽标并对非超管隐藏操作入口。后端在 `cjk-plugin` 的 `ShippingProfileService` 补三处权限校验，并在超管切换 isGlobal 时自动维护 `ownerChannelId`/`isTenantDefault`。仓库按归属分开提交：`vendure`（后端）、`vshop/web-admin`（前端）、`nshop`（文档/截图/发布脚本），均本地构建、`nshop/scripts/deploy.mjs` 发布。

**Tech Stack:** Vue 3 + TypeScript（uni-app / uni-h5，SCSS，Pinia）、NestJS + Vendure（TypeORM）、vitest、GraphQL、高德相关不涉及。

---

## 文件结构

- **后端（vendure 仓库）** `d:\zhao\vendure\packages\cjk-plugin\src\shipping\`
  - `shipping-profile.service.ts` — create/update/delete 权限校验与字段一致性（唯一后端改动，不拆）。
  - `shipping-profile-permissions.service.spec.ts` — 新增，单测权限校验与 isGlobal 一致性（纯逻辑，无需 DB）。
- **前端（vshop 仓库）** `d:\zhao\vshop\web-admin\src\pages\shipping\profile\index.vue` — 单页聚合，不改结构、只改模板与脚本。
- **文档/发布（nshop 仓库）**
  - 计划已评审的 spec：`docs/superpowers/specs/2026-09-12-shipping-profile-global-admin-design.md`
  - 本计划：`docs/superpowers/plans/2026-09-12-shipping-profile-global-admin.md`
  - 操作手册新增：`docs/superpowers/manual/shipping-profile-global/`（`index.html` + `assets/*.png`）
  - 验证脚本：`tmp/verify-shipping-profile-global.mjs`（会用到的共享 API 常量见下文）

> 三个仓库均为独立 git 根（`d:\zhao\vendure\.git`、`d:\zhao\vshop\.git`、`d:\zhao\nshop\.git`）。各 Task 的提交步骤在对应仓库根下执行。

## 共享 API / 常量（供各 Task 复用）

- 登录凭证（C 端 vendor 与 admin 同套账号体系）：
  - admin：`https://e.joho.cn/admin-api`，`superadmin / z123123`，`Authorization: Bearer <token>`。
  - 渠道 token：default `cnx87ezvmjx8nn3bth6c`，t2 `66ruvnhh34svhckaa2i`。
- admin GraphQL 变更（`shipping-profile-admin.resolver.ts`）：
  - 登录 `mutation { login(username,$u,password,$p){ ... on CurrentUser { id } ... on InvalidCredentialsError { message } } }`（`vendure-auth-token` 响应头即 token）。
  - `createShippingProfile(input: CreateShippingProfileInput!)`, `updateShippingProfile(input: UpdateShippingProfileInput!)`, `deleteShippingProfile(id: ID!)`。
  - 查询已含 `isGlobal`/`isTenantDefault`（见 `web-admin/src/apis/shipping-profile.ts`）。
- 后端既有规则（实现时必须保持）：
  - `ShippingProfile.ownerChannelId`：`null`=全局，非空=所属租户。
  - 全局档案不能是租户默认；`setTenantDefaultShippingProfile` 已拒绝全局档案。

## 执行纪律（全程，不逐条重复）

- 每个 Task 完成后运行对应测试/构建并**提交对应仓库**（提交命令见各 Task）。
- 后端改完必须本地 `build` 通过再发布；**绝不在服务器构建**。
- API 回归用 `tmp/` 下 node 脚本（沿用 `tmp/verify-admin-pickup-pool.mjs` 的 `gql`/登录模式）。

---

### Task 1: 后端 create/update/delete 权限校验（TDD）

**Files:**
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\shipping-profile-permissions.service.spec.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\shipping-profile.service.ts`

后端目前缺口：`create()` 对 `isGlobal=true` 无超管校验；`update()` 仅在「已是全局且非超管」时拦，非超管可升格自有档案；`delete()` 对全局档案无校验；且超管切换 isGlobal 时未维护 `ownerChannelId`/`isTenantDefault`。

**Design decision（重要）:** 权限逻辑提取为纯函数 `assertProfilePermissions(ctx, profile, input)` 便于 TDD，放在 `shipping-profile.service.ts` 底部导出；生产方法调用它。不要在方法里内联 if 再单测方法（方法依赖 DB/RequestContext，难以单测）。

- [ ] **Step 1: 写失败测试**

在 `d:\zhao\vendure\packages\cjk-plugin\src\shipping\shipping-profile-permissions.service.spec.ts` 写入：

```ts
import { describe, it, expect } from 'vitest';
import { Permission } from '@vendure/core';
import { assertProfileGlobalPermissions } from './shipping-profile.service';

// 构造最小 ctx / profile（不含 DB，纯函数可测）
const uctx = (opts: { isSuper?: boolean } = {}) =>
  ({ userHasPermissions: (p: Permission[]) => (opts.isSuper ? true : p.includes('?none?')) }) as any;
const prof = (p: Partial<{ isGlobal: boolean; ownerChannelId: number | null }>) => p as any;
const input = (p: Partial<{ isGlobal?: boolean }>) => p as any;

describe('assertProfileGlobalPermissions', () => {
  it('非超管 create isGlobal=true -> throw', () => {
    const target = { isGlobal: prof({ isGlobal: false }) };
    let ok = false;
    try { assertProfileGlobalPermissions(uctx(), 'create', prof({ isGlobal: false }), input({ isGlobal: true }), target); }
    catch (e: any) { ok = /仅超级管理员可创建全局档案/.test(e.message); }
    expect(ok).toBe(true);
  });

  it('超管 create isGlobal=true -> 不抛', () => {
    expect(() =>
      assertProfileGlobalPermissions(uctx({ isSuper: true }), 'create', prof({ isGlobal: false }), input({ isGlobal: true }), prof({ isGlobal: false })),
    ).not.toThrow();
  });

  it('非超管 update 改 isGlobal -> throw', () => {
    let msg = '';
    // 目标档案是租户级，input 想升格为全局
    try { assertProfileGlobalPermissions(uctx(), 'update', prof({ isGlobal: false }), input({ isGlobal: true }), prof({ isGlobal: false })); }
    catch (e: any) { msg = e.message; }
    expect(msg).toMatch(/仅超级管理员可修改全局属性/);
  });

  it('超管 update 由真改伪（全局→租户）-> 通过', () => {
    expect(() =>
      assertProfileGlobalPermissions(uctx({ isSuper: true }), 'update', prof({ isGlobal: true }), input({ isGlobal: false }), prof({ isGlobal: true })),
    ).not.toThrow();
  });

  it('超管 update 由伪改真（租户→全局）-> 通过', () => {
    expect(() =>
      assertProfileGlobalPermissions(uctx({ isSuper: true }), 'update', prof({ isGlobal: false }), input({ isGlobal: true }), prof({ isGlobal: false })),
    ).not.toThrow();
  });

  it('非超管 delete 全局档案 -> throw', () => {
    let msg = '';
    try { assertProfileGlobalPermissions(uctx(), 'delete', undefined as any, undefined as any, prof({ isGlobal: true })); }
    catch (e: any) { msg = e.message; }
    expect(msg).toMatch(/仅超级管理员可删除全局档案/);
  });

  it('超管 delete 全局档案 -> 通过', () => {
    expect(() =>
      assertProfileGlobalPermissions(uctx({ isSuper: true }), 'delete', undefined as any, undefined as any, prof({ isGlobal: true })),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd d:\zhao\vendure && pnpm --filter cjk-plugin test -- shipping-profile-permissions`（或各仓库按 `cjk-plugin/package.json` 的 `test` 脚本跑 `vitest run --shipping-profile-permissions`）
Expected: FAIL，`assertProfileGlobalPermissions is not a function`。

- [ ] **Step 3: 实现纯函数 + 接入生产方法**

前置：在 `shipping-profile.service.ts` 顶部确认已从 `@vendure/core` 导入 `Permission`（现有文件用的是 `Permission.SuperAdmin`，见 `update()`，已导入，无需改 import）。在文件底部新增导出纯函数：

```ts
/**
 * 配送档案「全局属性」权限校验（纯函数，便于单测）。
 * action: 'create' | 'update' | 'delete'
 * profile: 需加载 isGlobal/ownerChannelId 的当前档案（create 时可为空/默认）
 * input: 本次请求携带的入参（含 isGlobal 时校验）
 * target: 变更前的目标档案（create 时即新建档案）
 */
export function assertProfileGlobalPermissions(
    ctx: RequestContext,
    action: 'create' | 'update' | 'delete',
    profile: { isGlobal: boolean } | undefined,
    input: Partial<any> | undefined,
    target: { isGlobal: boolean } | undefined,
): void {
    const isSuper = ctx.userHasPermissions([Permission.SuperAdmin]);
    const toGlobal = input?.isGlobal === true;

    if (action === 'create') {
        if (toGlobal && !isSuper) {
            throw new UserInputError('仅超级管理员可创建全局档案');
        }
        return;
    }

    if (action === 'update') {
        // 非超管：isGlobal 变更一律拒绝（含把租户档案升格为全局、把全局档案降级）
        if (input?.isGlobal !== undefined && input?.isGlobal !== target?.isGlobal && !isSuper) {
            throw new UserInputError('仅超级管理员可修改全局属性');
        }
        return;
    }

    if (action === 'delete') {
        if (target?.isGlobal === true && !isSuper) {
            throw new UserInputError('仅超级管理员可删除全局档案');
        }
    }
}
```

修改 `create()`，在 `profile.isGlobal = input.isGlobal ?? false;` 前插入调用：

```ts
assertProfileGlobalPermissions(ctx, 'create', undefined, input, { isGlobal: input.isGlobal === true });
```

在 `update()` 开头（`const profile = await repo.findOne(...)` 之后、现有 `if (profile.isGlobal && !ctx...)` 之前）插入：

```ts
assertProfileGlobalPermissions(ctx, 'update', profile, input, profile);
```

并在 `update()` 里补字段一致性：在 `Object.assign(profile, updateData);` 之前加入：

```ts
// 超管切换 isGlobal 时维护归属与租户默认一致性
if (input.isGlobal === true) {
    profile.ownerChannelId = null;
    profile.isTenantDefault = false;
} else if (input.isGlobal === false) {
    profile.ownerChannelId = (ctx.channelId as any) ?? null;
}
```

> 注意 `import { Permission, RequestContext, UserInputError } from '@vendure/core'` 需已存在（`UserInputError` 在既有 `create()` 已用，不必新增；`RequestContext` 类型已用于方法签名）。

在 `delete()` 开头（`const profile = await repo.findOne(...)` 之后、`if (count > 0)` 之前）插入：

```ts
assertProfileGlobalPermissions(ctx, 'delete', profile, undefined, profile);
```

- [ ] **Step 4: 运行测试确认通过**

Run: 同上 vitest 命令
Expected: PASS（8 条）

- [ ] **Step 5: 后端 build**

Run: `cd d:\zhao\vendure && pnpm --filter cjk-plugin build`
Expected: 无类型错误，产出 `packages/cjk-plugin/lib/`。

- [ ] **Step 6: 提交（vendure 仓库）**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/shipping/shipping-profile.service.ts packages/cjk-plugin/src/shipping/shipping-profile-permissions.service.spec.ts
git commit -m "fix(shipping): 配送档案全局属性权限校验(create/update/delete)+isGlobal切换维护ownerChannelId/isTenantDefault"
```

---

### Task 2: 前端表单「设为全局」开关 + 编辑态切换 + 非超管只读

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\shipping\profile\index.vue`（模板 1-123、脚本 124-441）

本 Task 只改前端，后端 API 已透传 `isGlobal`，无需改 API 层。

- [ ] **Step 1: 模板 — 新建/编辑面板加「设为全局」开关行 + 租户默认互斥**

在现有「设为租户默认」行（模板 93-96）上方插入「设为全局」行；仅超管显示可切换开关，非超管渲染只读锁定行（防御：正常路径下非超管进不了全局档案编辑，见 Task 2 Step 3 列表门控）：

```html
<!-- 超管：可切换（新建=开；编辑全局=开→关 归属当前渠道） -->
<view v-if="isSuperAdmin" class="field row">
  <view class="flag-label">
    <text class="label">设为全局</text>
    <text class="hint">{{ editingProfile?.isGlobal ? '全局档案对所有租户可见，仅超管可维护' : '开启后对所有租户可见' }}</text>
  </view>
  <switch :checked="isGlobal" color="#2563eb" style="transform: scale(0.8);" @change="onIsGlobalChange($event)" />
</view>
<!-- 非超管（防御）：全局档案编辑只读锁定 -->
<view v-else-if="editingProfile?.isGlobal" class="field row">
  <view class="flag-label">
    <text class="label">设为全局</text>
    <text class="hint">全局档案 · 仅超管可维护</text>
  </view>
  <switch :checked="true" disabled color="#2563eb" style="transform: scale(0.8);" />
</view>
```

同时改造「设为租户默认」行（模板 93-96），开启全局时置灰并提示互斥：

```html
<view class="field row">
  <view class="flag-label">
    <text class="label">设为租户默认</text>
    <text v-if="isGlobal" class="hint">全局档案不可设为租户默认</text>
  </view>
  <switch :checked="setDefault" :disabled="isGlobal" @change="setDefault = $event.detail.value" color="#2563eb" style="transform: scale(0.8);" />
</view>
```

- [ ] **Step 2: 模板 — 列表全局徽标 + 非超管只读**

在现有 `.default-badge` 之后加「全局」徽标（紧贴名称）：

```html
<text v-if="s.isGlobal" class="global-badge">全局</text>
```

替换列表 `.ops` 区（现有 115-119），放入 `v-if="!s.isGlobal || isSuperAdmin"` 门控；非超管看全局档案时隐藏操作、改显「仅超管可维护」：

```html
<view class="ops" v-if="!s.isGlobal || isSuperAdmin">
  <text @tap="onEdit(s)">编辑</text>
  <text v-if="!s.isTenantDefault" class="setdefault" @tap="onSetDefault(s)">设为默认</text>
  <text class="del" @tap="onDel(s)">删除</text>
</view>
<view class="ops readonly" v-else>
  <text class="readonly-tip">仅超管可维护 · 不可编辑</text>
</view>
```

- [ ] **Step 3: 模板 — 启停开关门控**

现有列表顶部启停 switch（112）对非超管的全局档案也显示。改为：

```html
<switch v-if="!s.isGlobal || isSuperAdmin" :checked="s.enabled" color="#2563eb" style="transform: scale(.7);" @change="onToggle(s, $event)" />
```

- [ ] **Step 4: 脚本 — 状态与逻辑**

在 `<script setup>` 顶部读入 authStore，并新增状态：

```ts
import { useAuthStore } from '../../../stores/authStore';
const auth = useAuthStore();

const isSuperAdmin = computed(() => auth.isSuperAdmin);
```

在 `const setDefault = ref(false)` 后加：

```ts
const isGlobal = ref(false);
```

- [ ] **Step 5: 脚本 — 新建/编辑初始化设置 isGlobal**

`onCreate()` 重置处追加：

```ts
isGlobal.value = false;
```

`onEdit()` 在 `setDefault.value = false;` 后追加：

```ts
isGlobal.value = s.isGlobal ?? false;
```

- [ ] **Step 6: 脚本 — 全局开关切换（开启前确认 + 与租户默认互斥）**

在 `onToggle`（421）之前新增：

```ts
function onIsGlobalChange(e: any) {
  const v = Boolean(e.detail.value);
  if (!v) { // 关闭——仅超管在编辑态可关；关闭后归属当前渠道，允许设租户默认
    isGlobal.value = v;
    return;
  }
  uni.showModal({
    title: '设为全局',
    content: editingProfile.value?.isTenantDefault
      ? '开启后所有租户可见，且将自动取消「租户默认」，确认？'
      : '开启后所有租户可见，确认？',
    success: (r) => {
      if (r.confirm) {
        isGlobal.value = true;
        setDefault.value = false; // 互斥：全局档案不能是租户默认
      }
    },
  });
}
```

- [ ] **Step 7: 脚本 — onSave 传 isGlobal**

`createShippingProfile` 与 `updateShippingProfile` 的入参加入 `isGlobal`；但**仅超管可发**，非超管不传：

```ts
// create 分支
await createShippingProfile({
  name: form.value.name.trim(),
  code: form.value.code.trim(),
  description: form.value.description,
  shippingMethodIds,
  methodConfigs,
  requiresAddress: form.value.requiresAddress,
  requiresContact: form.value.requiresContact,
  ...(isSuperAdmin.value ? { isGlobal: isGlobal.value } : {}),
});
// update 分支
await updateShippingProfile(id, {
  name: form.value.name.trim(),
  code: form.value.code.trim(),
  description: form.value.description,
  shippingMethodIds,
  methodConfigs,
  requiresAddress: form.value.requiresAddress,
  requiresContact: form.value.requiresContact,
  ...(isSuperAdmin.value ? { isGlobal: isGlobal.value } : {}),
});
```

- [ ] **Step 8: 脚本 — 保存后需 reload 才刷新 **全局** 徽标/只读态**

`onSave` 成功路径已调用 `await reload()`，无需额外改动（列表会自动重取 `isGlobal`）。

- [ ] **Step 9: 样式 — 加「全局」徽标与只读提示样式**

在 `<style scoped>` 的 `.default-badge` 附近追加：

```scss
.global-badge { font-size: 22rpx; color: #fff; background: #7c5cfc; border-radius: 20rpx; padding: 2rpx 16rpx; margin-left: 16rpx; }
.ops.readonly { .readonly-tip { color: $wa-muted; font-size: 24rpx; } }
```

- [ ] **Step 10: 校验脚手架缺 computed**

页面当前未引入 `computed`；`.vue` 顶部 `import { ref, onMounted } from 'vue'` 需改为 `import { ref, computed, onMounted } from 'vue'`。检查 `authStore` 路径 `../../../stores/authStore` 与仓库现有引用一致（`src/pages/shipping/methods/index.vue` 已用 `useAuthStore`，可参考其路径）。

- [ ] **Step 11: 本地构建**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 产出 `web-admin/dist/build/h5`，无 TypeScript 报错。

- [ ] **Step 12: 提交（vshop 仓库）**

```bash
cd d:\zhao\vshop
git add web-admin/src/pages/shipping/profile/index.vue
git commit -m "feat(web-admin): 配送档案「设为全局」开关+全局徽标+非超管只读"
```

---

### Task 3: API 回归验证（后端三处校验）

**Files:**
- Create: `d:\zhao\nshop\tmp\verify-shipping-profile-global.mjs`

- [ ] **Step 1: 写验证脚本**

沿用 `tmp/verify-admin-pickup-pool.mjs` 的 `gql`/登录模式，但请求体需能携带 Authorization 与渠道 token。核心逻辑：

```js
#!/usr/bin/env node
/** 验证配送档案全局属性：非超管升格/删全局被拒、超管切换一致性 */
const BASE = process.env.WA_API || 'https://e.joho.cn/admin-api';
const CHANNELS = {
  default: { token: 'cnx87ezvmjx8nn3bth6c' },
  t2: { token: '66ruvnhh34svhckaa2i' },
};
let auth = '';
const gql = async (q, vars = {}, headers = {}) => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const body = await res.json();
  const token = res.headers.get('vendure-auth-token');
  return { body, token };
};
const login = async () => {
  const r = await gql(`mutation { login(username:"superadmin", password:"z123123"){ ... on CurrentUser { id identifier } ... on InvalidCredentialsError { message } } }`);
  if (!r.token) throw new Error('login failed ' + JSON.stringify(r.body));
  auth = r.token;
};
const admin = (q, vars={}, chToken) =>
  gql(q, vars, { Authorization: `Bearer ${auth}`, ...(chToken?{'vendure-token': chToken}:{}) }).then(r=>r.body);
(async () => {
  await login();
  // 1) 超管在 t2 渠道创建一个全局档案
  const profQ = `mutation($i:CreateShippingProfileInput!){ createShippingProfile(input:$i){ id name isGlobal } }`;
  const now = Date.now();
  let resp = await admin(profQ, { i: { name:'全局测试'+now, code:'gtest'+now, isGlobal:true, shippingMethodIds:['<一个真实方法id>'] } }, CHANNELS.t2.token);
  console.log('超管建全局:', JSON.stringify(resp.body?.data?.createShippingProfile ?? resp.body?.errors));
  const gid = resp.body?.data?.createShippingProfile?.id;
  // 2) 查询该档案确认 ownerChannelId=null / isTenantDefault=false
  const q1 = await admin(`query($id:ID!){ shippingProfile(id:$id){ id name isGlobal isTenantDefault } }`, { id: gid });
  console.log('查询全局档案:', JSON.stringify(q1.body?.data?.shippingProfile));
  // 3) 非超管（用一个租户管理员账号）升格自己的档案 -> 应被拒（此处用异常捕获，若未拦截即失败）
  // 4) 删除全局档案（超管应成功；非超管应被拒）——仅清理测试数据时调用
  const del = await admin(`mutation($id:ID!){ deleteShippingProfile(id:$id) }`, { id: gid });
  console.log('超管删全局:', JSON.stringify(del.body?.data ?? del.body?.errors));
})().catch(e=>console.error('ERR', e.message));
```

> 注：脚本内的真实配送方法 id 需从 `shippingMethods` 查询取；非超管账号 id/账号名由实施者在 **Step 2** 用现有后台账号清单填充（若无，则用后备断言「即使传入 isGlobal 后端也拒绝」的契约即可，见 Step 2 Negotiation）。

- [ ] **Step 2: 确认非超管账号与配送方法 id**

后台当前可用非超管账号/方法清单若未提供，实施者从 `tmp/verify-superadmin-jiang.mjs` / `scripts/fix-t2-shipping.mjs` 或后台「成员」页读取一个非超管账号登录 token，以及任意一个 enable 配送方式 `id`。超管建全局 + 删除用例为最低通过门槛。若非超管账号不可得，则把「非超管升格/删全局被拒」两条降级为：**代码评审确认** + **超管建/查/删全局** 线上回归，并在计划执行记录中说明。

- [ ] **Step 3: 跑脚本验证**

Run: `node d:\zhao\nshop\tmp\verify-shipping-profile-global.mjs`
Expected:
- 超管在 t2 渠道创建全局档案返回 `isGlobal:true`；
- 查询该档案 `isTenantDefault:false`（ownerChannelId 为 `null`——admin 查询未暴露 ownerChannelId，故用「非租户默认」+「列表超管仍见」间接确认）；
- 超管删除成功返回 `true`。

- [ ] **Step 4: 提交（nshop 仓库）**

```bash
cd d:\zhao\nshop
git add tmp/verify-shipping-profile-global.mjs
git commit -m "test(shipping): 配送档案全局属性 API 回归脚本"
```

---

### Task 4: 手机视口截图 + 操作手册

**Files:**
- Create: `d:\zhao\nshop\docs\superpowers\manual\shipping-profile-global\index.html`
- Create: `d:\zhao\nshop\docs\superpowers\manual\shipping-profile-global\assets\*.png`（截图）

- [ ] **Step 1: 采集手机视口截图**

用 Playwright 移动视口（390×844，dpr=2）截取并保存到 `docs/superpowers/manual/shipping-profile-global/assets/`：
1. 超管新建配送档案表单（含「设为全局」开关，开启态 + 租户默认置灰互斥）——`wa_profile_create_global.png`
2. 超管编辑全局档案表单（开关可切换态，标注「全局档案对所有租户可见，仅超管可维护」）——`wa_profile_edit_global_toggle.png`
3. 列表全局档案含「全局」徽标（超管视角）——`wa_profile_list_global_super.png`
4. 非超管视角全局档案只读卡片（无编辑/删除/启停）——`wa_profile_list_global_tenant.png`

> 截图脚本可参考 `scripts/_shot_*.py` 系列（Playwright + python），或 `nshop/scripts/shots/` 现有 Playwright 截图器。视口严格 390×844 / dpr 2，符合用户铁律。

- [ ] **Step 2: 写操作手册 index.html**

新建 `docs/superpowers/manual/shipping-profile-global/index.html`，结构沿用 `pickup-profile-pickup-admin/index.html`（含 `<style>`、`.kicker`/`<h1>`、验收表格、`<img>` 引用 `assets/`）。章节涵盖：
1. **背景**：配送档案全局化；后端权限缺口与本次补齐。
2. **功能**：超管「设为全局」；编辑态切换；列表「全局」徽标；非超管只读。
3. **验收表格**（超管/租户管理员两条路径）：
   - 超管在 default/t2 渠道创建全局档案 → 表单含开关、开启态 + 租户默认互斥、列表显示「全局」徽标、编辑保存后徽标刷新。
   - 非超管 t2 视图 → 全局档案卡片无「编辑/删除/设为默认/启停」，显示「仅超管可维护」。
   - 后端回归：非超管升格/删全局被拒（若可提供账号则给截图，否则注明代码评审 + 超管建删回归）。
4. **交付结论**：实现 + API 回归 + 手机截图三件套齐全。

- [ ] **Step 3: 提交（nshop 仓库）**

```bash
cd d:\zhao\nshop
git add docs/superpowers/manual/shipping-profile-global/
git commit -m "docs(manual): 配送档案全局化操作手册+手机截图"
```

---

### Task 5: 发布（后端 + web-admin）

- [ ] **Step 1: 发布后端 vendure**

本地构建已由 Task 1 Step 5 完成。按部署铁律：**绝不在服务器构建**。发布走对应仓库机制（后端 git pull + pm2 restart）。在 vendure 服务器执行（或由部署脚本）：
```bash
# 服务器上（不在服务器 build）
cd /path/to/vendure && git pull && pm2 restart cjk-plugin或对应进程
```
> 具体进程名/路径从现有 `nshop/scripts/server-ops.mjs` 读取，避免臆测。若后端采用 CI，则改走对应发布流水线。

- [ ] **Step 2: 发布 web-admin**

web-admin 为 uni-app h5，产物随 nshop 发布。web-admin 在 `vshop` 仓库、根无 `scripts/deploy.mjs`，说明其 HTML/JS 产物由 **nshop 的 `scripts/deploy.mjs`** 一并打包发布到服务器（解压/拷入 + pm2 restart）。执行方式以 `nshop/scripts/deploy.mjs` 为准（读其用法：`node scripts/deploy.mjs --help`），把 `web-admin/dist/build/h5` 产物打包后走既有发布流程。

- [ ] **Step 3: 线上回归**

按 Task 3 脚本在发布后重跑 `node d:\zhao\nshop\tmp\verify-shipping-profile-global.mjs`，并在线上后台用超管/租户管理员验收截图（补进操作手册 `index.html` 的线上章节）。

- [ ] **Step 4: 提交（nshop 仓库：发布记录）**

```bash
cd d:\zhao\nshop
git add -A
git commit -m "release(shipping-profile): 配送档案全局化管理上线+操作手册补线上验收"
```

---

## Self-Review 结论

- **Spec 覆盖**：后缀「决策记录 1-5」均落实到 Task：仅超管可操作 → Task1(Task 1 后端) + Task2(Task 2 前端)；切换一致性 → Task 1 Step 3；非超管只读 UI+后端 → Task 2 Step 2/3 + Task 1；徽标样式 A → Task 2 Step 2/9；租户默认互斥 → Task 2 Step 6 + Task 1 Step 3。测试/交付 → Task 3/4/5。
- **占位符**：无 TBD；脚本内真实方法 id / 非超管账号已在 Task 3 Step 2 用**明确的可执行降级路径**处理（代码评审 + 超管建删回归），非「实现后补」。
- **类型一致性**：`isGlobal`、`isTenantDefault`、`ownerChannelId`、`assertProfileGlobalPermissions(ctx, action, profile, input, target)` 在测试、实现、api 脚本间一致；前端 `isGlobal`/`isSuperAdmin` 状态名一致。
- **已知依赖**：前端依赖 `authStore.isSuperAdmin`（已存在，见 `vshop/web-admin/src/stores/authStore.ts` 26 行）；后端依赖 `Permission.SuperAdmin`（已导入）。三个仓库均为独立 git 根。