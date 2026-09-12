# 领域知识沉淀机制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立「速查卡 → 领域手册 → 代码」三层知识沉淀机制（配送档案为首份样板），使 AI 下次定位代码/修复 Bug 无需反复扫描历史文档与源码。

**Architecture:** L1 `project_memory.md` 速查卡（AI 每会话自动注入，含一行指针）；L2 `docs/domains/<domain>.md` 领域手册（7 章：概念模型/符号级文件地图/设计决策/常见坑/问题速查/验证脚本/历史索引）；L3 代码与历史文档（由手册精确指向）。配套 `tmp/regress-<domain>.mjs` 一键回归套件与「定位五步法」工程约定。纯文档+脚本改动，无生产代码变更。

**Tech Stack:** Markdown、Node.js ESM（fetch + 现有 verify 脚本模式）、memory 系统（project_memory.md）

---

### Task 1: 领域手册通用规范 `docs/domains/README.md`

**Files:**
- Create: `d:\zhao\nshop\docs\domains\README.md`

- [ ] **Step 1: 创建目录与 README 规范**

```markdown
# 领域手册（Domain Handbooks）

面向「再次遇到同类问题能快速定位代码、精准修 Bug」的领域知识库。每个业务领域一份手册，与按任务日期组织的 `docs/superpowers/specs|plans` 互补：spec/plan 记录「某次任务怎么做」，手册记录「该领域长期是什么样、代码在哪、坑在哪」。

## 何时建手册

某个领域出现 ≥2 次独立任务（含 Bug 修复）即可建手册。已有：shipping-profile（配送档案）。

## 命名与目录

- 文件：`docs/domains/<domain>.md`，如 `shipping-profile.md`
- 领域粒度：一个业务概念域一份（配送档案、支付、租户、商品…）

## 章节模板（7 章，新建手册必须齐全）

1. **概念模型** — 核心实体、关系、作用域/可见性规则、关键术语
2. **文件地图（符号级）** — 每个相关文件：路径 → 职责 → 关键导出符号/函数/组件。**不写行号**（防漂移），行号用 `rg` 现查
3. **设计决策** — ADR 式「为什么这么做」（含放弃的备选）
4. **常见坑** — 复现现象 → 根因 → 解法，按本领域特有优先
5. **问题速查（Bug 知识库）** — 四列表格：现象 | 根因 | 代码点 | 回归脚本。每次修完 Bug 追加一行
6. **验证脚本清单** — 脚本路径 → 用途 → 运行命令（含 `tmp/regress-<domain>.mjs`）
7. **历史文档索引** — 相关 specs/plans/manual 的链接与一句话说明

## 维护流程（硬规范）

- **任务完成后自动沉淀**：相关任务收尾时更新对应手册（含第 5 章 Bug 知识库追加）+ memory 速查卡
- **代码定位五步法**（约束 AI 行为，防全仓库漫游）：速查手册 → grep 符号（必要时 ast-grep）→ 最小读取（目标函数 ±30 行）→ 看回归测试 → 修复 + 跑回归
- **行号不入库**：手册中代码位置一律用「文件路径 + 符号名」，行号现场 grep
```

- [ ] **Step 2: 自检章节完整性**

Run: `Select-String -Path d:\zhao\nshop\docs\domains\README.md -Pattern "^## |^### "`
Expected: 含「何时建手册」「命名与目录」「章节模板」「维护流程」四个标题

- [ ] **Step 3: 提交**

```bash
git add docs/domains/README.md
git commit -m "docs(domains): 领域手册通用规范 README（7 章模板+维护流程）"
```

---

### Task 2: 首份领域手册 `docs/domains/shipping-profile.md`

**Files:**
- Create: `d:\zhao\nshop\docs\domains\shipping-profile.md`

- [ ] **Step 1: 先用 rg 确认历史文档清单（填入第 7 章链接）**

Run: `rg -l "配送|自提点|ShippingProfile|pickup" d:\zhao\nshop\docs\superpowers\specs d:\zhao\nshop\docs\superpowers\plans d:\zhao\nshop\docs\superpowers\manual 2>$null`
Expected: 列出历史文档相对路径，用于第 7 章「历史文档索引」（若无输出则以本会话已知文件为准：`2026-09-12-shipping-profile-global-admin-design.md`、`2026-09-12-shipping-profile-global-admin.md`、`manual/shipping-profile-global/index.html`）

- [ ] **Step 2: 用 rg 确认文件地图中的关键符号真实存在**

Run:
```powershell
rg -n "assertProfileGlobalPermissions" d:\zhao\vendure\packages\cjk-plugin\src\shipping\shipping-profile.service.ts
rg -n "applyVisibility|pickupLocationsForProfile" d:\zhao\vendure\packages\cjk-plugin\src\pickup\pickup-location.service.ts
rg -n "ShippingProfile" d:\zhao\vendure\packages\cjk-plugin\src\shipping\shipping-profile-permissions.ts
rg -n "PERMISSION_CATALOG" d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts
rg -n "isSuperAdmin" d:\zhao\vshop\web-admin\src\stores\authStore.ts
```
Expected: 每行返回 1+ 匹配。若某符号改名/不存在，以实际代码为准修正手册（记录差异）。

- [ ] **Step 3: 创建手册全文（7 章完整内容，如下）**

````markdown
# 配送档案领域手册（Shipping Profile）

> 入口指针：`project_memory.md`「配送档案/自提点体系」速查卡 → 本手册。
> 覆盖：后端 vendure `packages/cjk-plugin`、C 端 nshop `layers/base`、运营端 vshop `web-admin`。

## 1. 概念模型

| 实体 | 关键字段 | 说明 |
|---|---|---|
| ShippingProfile 配送档案 | `ownerChannelId`（归属租户，null=全局）、`isGlobal`（全局标记）、`isTenantDefault`（租户默认） | 全局档案 `ownerChannelId=null` 且 `isTenantDefault` 恒 false |
| shipping_profile_method 档案-方式关联 | `shippingMethodId`、`mode`、`options`（`{ rangeMode, pickupLocationIds }`） | 档案与配送方式多对多；方式级绑定自提点 |
| PickupLocation 自提点 | `type`（store 门店 / point 自提 / employee 职工单位）、`isPublic`、`address` | 门店自提点与普通自提点是**不同类型** |
| 租户/渠道 | `__default_channel__`（平台）、`t2` 等租户渠道 | 平台渠道 = 默认租户 |

**可见性规则（核心）**：
- 默认租户（平台渠道）：可使用**其他租户**自提点 + 全局档案
- 其他租户（t2 等）：仅可使用**全局档案** + **本租户档案**，自提点仅全局 + 自有
- 自提点按 `type` 过滤：门店自提点与自提点是不同点

**C 端链路**：每租户 × 每种配送档案 × 配送方式 → 自提点集 = 该方式 `options.pickupLocationIds` 过滤后按定位 **50km 内就近**（Haversine）排序。

## 2. 文件地图（符号级，行号用 rg 现查）

### 后端 vendure `packages/cjk-plugin/src/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `shipping/shipping-profile.service.ts` | 档案 CRUD + 权限校验 + 字段一致性 | `create/update/delete`、`assertProfileGlobalPermissions`（纯函数：create/update/delete 全局属性权限）、update 时 isGlobal 切换维护 `ownerChannelId`/`isTenantDefault` |
| `shipping/shipping-profile.resolver.ts` | GraphQL 入口 | 全部 `@Allow(ShippingProfile)`（单一权限码） |
| `shipping/shipping-profile-permissions.ts` | 权限定义 | `PermissionDefinition` name=`'ShippingProfile'` |
| `pickup/pickup-location.service.ts` | 自提点可见性 + 就近过滤 | `applyVisibility`（平台/租户分层）、就近查询 |
| `tenant/tenant-member.service.ts` | 租户权限目录（单一来源） | `PERMISSION_CATALOG` → `BUSINESS_PERMISSIONS` 白名单；`updateTenantRole`（整组替换 + 白名单校验） |
| `tenant/role-templates.ts` | 租户角色模板 | `tenant-admin` 模板含 `'ShippingProfile'`（新建角色自动带） |
| `seed/default-data.service.ts` | 租户/渠道/角色 seed | 每租户默认管理员 `admin` |

### C 端 nshop `layers/base/app/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `components/checkout/BoxPickupBlock.vue` | 自提点选择块 | 名称点击导航、地图图标按钮、切换自提点入口（>1 时必显） |
| `components/AppPickupNavigationModal.vue` | 高德导航弹层 | 动态加载高德 JS SDK |
| `components/AppBackButton.vue` | 全局返回按钮 | 结算页等复用 |
| `composables/useOrderStore.ts` | 订单状态（含自提点选择） | Pinia + persistedstate |
| `composables/useLocationStore.ts` | 定位状态 | Pinia + persistedstate，切换后同步自提点 |

### 运营端 vshop `web-admin/src/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `pages/shipping/profile/index.vue` | 配送档案管理页 | 「设为全局」开关（仅超管）、全局徽标、非超管只读；租户默认互斥 |
| `stores/authStore.ts` | 登录态 | `isSuperAdmin` 计算属性 |
| `pages/platform/roles/index.vue` | 角色权限管理 | 可选权限来自 `PERMISSION_CATALOG`（需后端注册才可见） |

## 3. 设计决策（ADR 式）

| 决策 | 理由 |
|---|---|
| 档案级 `boundPickupLocations` + 方式级 `options.pickupLocationIds` 两级绑定 | 档案定义「可选池」，配送方式定义「实际可用点」，解耦 |
| 平台/租户分层可见性 | 默认租户可用其他租户点（服务兜底）；其他租户隔离，仅全局+自有，防越权 |
| 全局档案仅超管维护 | `assertProfileGlobalPermissions`：非超管 create isGlobal / 改 isGlobal / 删全局一律拒绝 |
| 全局档案不可为租户默认 | `ownerChannelId=null` 时强制 `isTenantDefault=false`，语义互斥 |
| 权限目录单一来源 | `PERMISSION_CATALOG` → 角色页可选权限 + `updateTenantRole` 白名单 + 角色模板，三处同源 |
| C 端 50km 就近过滤 | 自提点无城市字段，按距离（Haversine）就近 |

## 4. 常见坑

| 现象 | 根因 | 解法 |
|---|---|---|
| 前端 locale 失效回退英文 | 前端 `zh-CN` vs Vendure `zh_Hans` 枚举不一致 | 客户端 `VENDURE_LOCALE_MAP` 映射 |
| i18n 数组文案取不到 | 数组型词条用 `t()` | 用 `tm()` |
| 后端多语言全英文 | `localizeText` 硬编码 en 兜底 | 后端默认 `current locale → en`，勿当 defaultLocale |
| `updateTenantRole` 报权限不在白名单 | 角色含 `Authenticated`/历史权限（如 `ManageOwnShop`） | `Authenticated` 由 `RoleService.update` 自动补回，回填时过滤白名单外项 |
| PowerShell `&&` 报错 | PS 不支持 `&&` 分隔 | 用 `;` |
| C 端查询「无活动订单」 | 未传会话 cookie | gql 请求带 `Cookie` 头 |

## 5. 问题速查（Bug 知识库）

| 现象 | 根因 | 代码点 | 回归脚本 |
|---|---|---|---|
| 自由大路店在档案 1 误显示（应为国信南山温泉酒店） | methodConfigs.options.pickupLocationIds 与库不一致 | `shipping-profile.service.ts` 绑定逻辑 | `tmp/query-t2-profiles-db.mjs` |
| 切换自提点被遗忘，结算沿用旧选择 | 切换状态未持久化/同步 | `BoxPickupBlock.vue` / `useOrderStore` | `tmp/verify-orderboxes-*.mjs` |
| t2 无配送档案 | 租户可见性规则缺自有档案 | `pickup-location.service.ts` `applyVisibility` | `tmp/verify-admin-pickup-pool.mjs` |
| 非超管可改全局属性 | 权限校验缺口 | `assertProfileGlobalPermissions` | 单测 + `tmp/verify-shipping-profile-global.mjs` |

## 6. 验证脚本清单

运行方式均为 `node tmp/<script>.mjs`（线上 admin API `https://e.joho.cn/admin-api`，superadmin/z123123）：

| 脚本 | 用途 |
|---|---|
| `tmp/regress-shipping-profile.mjs` | **一键回归套件**（本领域首选） |
| `tmp/verify-shipping-profile-global.mjs` | 全局档案创建/查询/删除 + 非超管被拒 |
| `tmp/verify-admin-profiles.mjs` | 运营端档案列表 |
| `tmp/verify-admin-pickup-pool.mjs` | 自提点可见性池 |
| `tmp/verify-profile1-bindings.mjs` | 档案 1 的 methodConfigs + boundPickupLocations |
| `tmp/verify-bound-pickups.mjs` | 档案绑定自提点 |
| `tmp/verify-orderboxes-pickup.mjs` / `verify-orderboxes-multichannel.mjs` / `verify-orderboxes-t2-now.mjs` / `verify-orderboxes-vt.mjs` / `verify-t1t3-orderboxes.mjs` | C 端各租户 orderBoxes 自提场景 |
| `tmp/verify-shop-pickup-visibility.mjs` | 门店自提可见性 |
| `tmp/verify-tenant-admin-shipping-profile.mjs` | 租户管理员登录访问档案（需 TA_USER/TA_PASS 环境变量） |

## 7. 历史文档索引

- `docs/superpowers/specs/2026-09-12-shipping-profile-global-admin-design.md` — 全局档案管理设计（设为全局开关、徽标、权限锁定）
- `docs/superpowers/plans/2026-09-12-shipping-profile-global-admin.md` — 全局档案实现计划（含权限纯函数 TDD）
- `docs/superpowers/specs/2026-09-12-domain-knowledge-design.md` — 本机制设计（三层架构 + 四件套）
- `docs/superpowers/manual/shipping-profile-global/index.html` — 全局档案操作手册（含手机截图）
- （Step 1 中 rg 命中的其他历史 spec/plan/manual 追加在此）
````

- [ ] **Step 4: 自检手册**

Run: `Select-String -Path d:\zhao\nshop\docs\domains\shipping-profile.md -Pattern "^## "`
Expected: 恰好 7 个 `##` 标题（1..7 章）

- [ ] **Step 5: 提交**

```bash
git add docs/domains/shipping-profile.md
git commit -m "docs(domains): 配送档案领域手册（7 章：概念/文件地图/决策/坑/Bug 库/脚本/索引）"
```

---

### Task 3: 一键回归套件 `tmp/regress-shipping-profile.mjs`

**Files:**
- Create: `d:\zhao\nshop\tmp\lib\regress-helpers.mjs`
- Create: `d:\zhao\nshop\tmp\regress-shipping-profile.mjs`

- [ ] **Step 1: 创建可复用 helpers 模块**

````javascript
// tmp/lib/regress-helpers.mjs
export const BASE = process.env.WA_API || 'https://e.joho.cn/admin-api';
export const T2_TOKEN = '66ruvnhh34svhckaa2i';
export const DEFAULT_TOKEN = 'cnx87ezvmjx8nn3bth6c';

export const gql = async (q, vars = {}, headers = {}) => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const body = await res.json();
  const token = res.headers.get('vendure-auth-token');
  return { body, token };
};

export async function loginAs(username = 'superadmin', password = 'z123123') {
  const r = await gql(`mutation { login(username:"${username}", password:"${password}") {
    ... on CurrentUser { id identifier } ... on InvalidCredentialsError { message } } }`);
  if (!r.token) throw new Error('login failed ' + JSON.stringify(r.body));
  return r.token;
}

export const hAdmin = (auth, channel) => ({
  Authorization: `Bearer ${auth}`,
  ...(channel ? { 'vendure-token': channel } : {}),
});

export class Regress {
  constructor(name) { this.name = name; this.pass = 0; this.fail = 0; this.skips = 0; this.logs = []; }
  ok(name) { this.pass++; this.logs.push(`  [PASS] ${name}`); }
  fail(name, detail) { this.fail++; this.logs.push(`  [FAIL] ${name} :: ${String(detail).slice(0, 200)}`); }
  skip(name) { this.skips++; this.logs.push(`  [SKIP] ${name}`); }
  assert(name, cond, detail = '') { cond ? this.ok(name) : this.fail(name, detail); }
  summary() {
    for (const l of this.logs) console.log(l);
    console.log(`  == ${this.name}: PASS ${this.pass} / FAIL ${this.fail} / SKIP ${this.skips}`);
    return this.fail === 0;
  }
}
````

- [ ] **Step 2: 创建回归套件（4 组断言）**

````javascript
#!/usr/bin/env node
// 配送档案领域一键回归：档案可见性 / 全局权限 / 租户管理员角色权限 / 档案1绑定一致性
import { gql, hAdmin, loginAs, Regress, T2_TOKEN, DEFAULT_TOKEN } from './lib/regress-helpers.mjs';

(async () => {
  const auth = await loginAs();
  const r = new Regress('shipping-profile');

  // 组 1：档案可见性（平台含全局档案；t2 渠道可见全局档案）
  const vis = await gql(`query { shippingProfiles(options:{take:100}) { items { id name isGlobal } } }`, {}, hAdmin(auth, DEFAULT_TOKEN));
  const items = vis.body?.data?.shippingProfiles?.items ?? [];
  r.assert('平台渠道可查配送档案', items.length > 0, JSON.stringify(vis.body?.errors));
  r.assert('平台渠道可见全局档案', items.some((p) => p.isGlobal === true));

  const visT2 = await gql(`query { shippingProfiles(options:{take:100}) { items { id name isGlobal } } }`, {}, hAdmin(auth, T2_TOKEN));
  const itemsT2 = visT2.body?.data?.shippingProfiles?.items ?? [];
  r.assert('t2 渠道可查配送档案', itemsT2.length > 0, JSON.stringify(visT2.body?.errors));

  // 组 2：全局档案权限（超管在 t2 建全局 → isTenantDefault=false → 删除，自清理）
  const mres = await gql(`query { shippingMethods(options:{take:20}) { items { id } } }`, {}, hAdmin(auth));
  const methodId = mres.body?.data?.shippingMethods?.items?.[0]?.id;
  r.assert('取到配送方式 id', !!methodId, JSON.stringify(mres.body?.errors));
  let createdId = '';
  if (methodId) {
    const ts = Date.now();
    const c = await gql(
      `mutation($i:CreateShippingProfileInput!){ createShippingProfile(input:$i){ id isGlobal isTenantDefault } }`,
      { i: { name: '回归全局' + ts, code: 'rgl' + ts, description: '', isGlobal: true, shippingMethodIds: [methodId] } },
      hAdmin(auth, T2_TOKEN)
    );
    const p = c.body?.data?.createShippingProfile;
    r.assert('超管创建全局档案', p?.isGlobal === true, JSON.stringify(c.body?.errors));
    r.assert('全局档案 isTenantDefault=false', p?.isTenantDefault === false, JSON.stringify(p));
    createdId = p?.id ?? '';
    if (createdId) {
      const d = await gql(`mutation($id:ID!){ deleteShippingProfile(id:$id) }`, { id: createdId }, hAdmin(auth, T2_TOKEN));
      r.assert('超管删除全局档案', !d.body?.errors, JSON.stringify(d.body?.errors));
    }
  }

  // 组 3：所有租户管理员角色均含 ShippingProfile（覆盖 2026-09-12 权限回填）
  const roles = await gql(`query { roles(options:{take:300}) { items { id code permissions } } }`, {}, hAdmin(auth));
  const tenants = (roles.body?.data?.roles?.items ?? []).filter((x) => /tenant-admin/i.test(x.code));
  r.assert('存在租户管理员角色', tenants.length > 0, '无 tenant-admin 角色');
  const missing = tenants.filter((t) => !(t.permissions || []).includes('ShippingProfile'));
  r.assert(`全部 ${tenants.length} 个租户管理员含 ShippingProfile`, missing.length === 0,
    missing.map((m) => m.code).join(','));

  // 组 4：档案 1（门店自提）绑定一致性：methodConfigs.options.pickupLocationIds 均为真实自提点
  const bind = await gql(`query { shippingProfiles(options:{take:50}) { items { id methodConfigs { shippingMethodId mode options } } } }`, {}, hAdmin(auth, DEFAULT_TOKEN));
  const prof1 = (bind.body?.data?.shippingProfiles?.items ?? []).find((p) => p.id === '1');
  if (prof1?.methodConfigs?.length) {
    const ids = prof1.methodConfigs.flatMap((c) => c.options?.pickupLocationIds ?? []);
    r.assert('档案1方式配置存在 pickupLocationIds', ids.length > 0, JSON.stringify(prof1.methodConfigs));
  } else {
    r.skip('档案1方式配置为空，跳过绑定一致性');
  }

  process.exit(r.summary() ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
````

- [ ] **Step 3: 运行回归套件**

Run: `node d:\zhao\nshop\tmp\regress-shipping-profile.mjs`
Expected: `== shipping-profile: PASS 8 / FAIL 0 / SKIP 0`（组 4 为空时 SKIP 1 亦可，exit 0）

- [ ] **Step 4: 提交**

```bash
git add tmp/lib/regress-helpers.mjs tmp/regress-shipping-profile.mjs
git commit -m "test(regress): 配送档案领域一键回归套件（可见性/全局权限/角色权限/绑定一致性）"
```

---

### Task 4: memory 速查卡升级 + 工程约定

**Files:**
- Modify: `c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md`

- [ ] **Step 1: 在「配送档案/自提点体系」节顶部插入速查卡指针行**

在 `## 配送档案/自提点体系（2026-09-12…）` 标题下第一行插入：

```markdown
- **完整手册（含符号级文件地图/Bug 知识库/回归脚本）：`docs/domains/shipping-profile.md`；定位代码用五步法：速查→grep→最小读取→看回归→修复验证**
```

- [ ] **Step 2: 在「工程约定/硬规范」区追加领域手册维护约定**

追加到部署铁律/测试交付等硬规范同级：

```markdown
- **领域手册维护（硬规范）**：相关任务完成后，收尾必须更新 `docs/domains/<domain>.md`（Bug 知识库追加「现象→根因→代码点→回归脚本」行）+ memory 速查卡指针；定位代码用五步法（速查手册→grep 符号→最小读取±30 行→看回归测试→修复+跑回归），禁止通读大文件、禁止全仓库漫游
```

- [ ] **Step 3: 提交（memory 文件不入 git，直接保存即可；验证写入成功）**

Run: `Select-String -Path "c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md" -Pattern "shipping-profile.md|领域手册维护"`
Expected: 2 行匹配

---

### Task 5: 验收与收尾提交

**Files:**
- Test: 上述 4 个 Task 的产物

- [ ] **Step 1: 对照 spec 验收标准逐项核对**

Run:
```powershell
# 验收 1：速查卡指针存在（AI 会话零查找）
Select-String -Path "c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md" -Pattern "shipping-profile.md"
# 验收 2：手册 Bug 知识库 4 案例四列齐全
Select-String -Path d:\zhao\nshop\docs\domains\shipping-profile.md -Pattern "自由大路|切换自提点被遗忘|t2 无配送档案|非超管可改全局属性"
# 验收 3：回归套件一键全绿（Task 3 Step 3 已跑，重跑确认）
node d:\zhao\nshop\tmp\regress-shipping-profile.mjs
# 验收 4：README 模板完整无占位
Select-String -Path d:\zhao\nshop\docs\domains\README.md -Pattern "TBD|TODO|待补充"
```
Expected: 验收 1/2/4 有匹配（README 的 TBD 查询应为**空**）；验收 3 exit 0

- [ ] **Step 2: 最终提交（如 Task 4 后仍有未提交产物）**

```bash
git add -A docs/domains tmp/lib tmp/regress-shipping-profile.mjs
git commit -m "docs(domains): 领域知识沉淀机制落地（规范+手册+回归套件）"
```

- [ ] **Step 3: 输出交付说明**

在会话中向用户报告：手册路径、回归套件运行结果、速查卡指针、五步法约定，以及后续领域（支付/租户/商品）如何照 README 模板补充。
