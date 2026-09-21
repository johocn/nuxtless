# 首页商品/分类/促销按「语言·城市·配送」过滤 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首页商品/分类/促销模块按当前语言（多翻译，不过滤）、当前城市（自动）、模块级配送方式（显式切换）过滤，只展示满足条件的商品；客户端负载经 SSR 后置过滤变小。

> **合并执行注记（2026-09-19）：** 本计划为「方案1」（核心过滤），与「方案2」（2026-09-19-home-filter-style-system-integration.md，过滤功能接入五级风格体系）合并为一个执行清单，顺序 方案1 → 方案2。方案2 依赖本计划的 `utils/productVisibility.ts`、`composables/useModuleDelivery.ts` 与 i18n 词条，并会修改 `useModuleDelivery.ts` 签名（增加 initial 参数，向后兼容）。

**Architecture:** 前端查询延续现有 `SearchProducts`+`GetProductsByIds`（补查 `serviceCities/belongCity/deliveryMethods`），在他们补齐 customFields 后、渲染前于 Nuxt SSR 层逐商品跑纯函数 `isProductVisible` 过滤，只把可见商品写进 HTML/payload。配送方式是**模块级独立状态**（SSR 按默认 MAIL 初筛 + 客户端在模块内即时二次过滤）。语言维度不做过滤（Vendure 多翻译已切文案）。

**Tech Stack:** Nuxt 3 / @nuxtjs/graphql-client(codegen) / Pinia / Vitest / Playwright / Vendure(后端 logistics-plugin customFields)

**前置关键事实（零上下文执行者必读）：**
- 后端在 `d:\zhao\vendure`，Product customFields 注册于 `packages\logistics-plugin\src\catalog-custom-fields.ts`；`serviceCities` 用的是 `type:'string', list:true`（`deliveryMethods` 照抄此风格）。
- 前端 schema 来自 `d:\zhao\nshop\graphql.schema.json`（静态文件），codegen 由 @nuxtjs/graphql-client 在 `nuxt build`/`nuxt dev` 时自动执行（`disableOnBuild:false`），类型输出在 `layers/base/gql`。新增字段后须**先刷新 schema.json** 再跑一次 codegen/build。
- 前端 Product customFields 读取点：`layers/base/gql/fragments/product.gql` 的 `ProductBaseFragment.customFields`。
- 首页数据流：`app/pages/index.vue`（兜底楼层）与 `layers/base/app/components/home/blocks/GoodsFloor.vue` 均 `SearchProducts`→`GetProductsByIds` 补价；`GetProductsByIds` 返回 `...ProductBaseFragment`（含 customFields）。
- 城市读取：`layers/base/app/composables/useCityService.ts` 已有 `getServiceInfo(product)`（`belongCity` 前缀匹配 + `serviceCities` 包含匹配）；本功能新增的是「配送方式」维度（`deliveryMethods`）。城市 cookie 用现有 locationStore 持久化同步。
- 测试：Vitest `environment:'node'`，include `layers/base/app/**/*.test.ts`；命令 `npm test`（vitest run）。纯函数测试放 `layers/base/app/utils/`。
- 部署铁律：一律**本地构建**，服务器只解压/`pm2 restart`；nshop 用 `node scripts/deploy.mjs`（含 build+scp+restart）。

---

## 文件结构

- Modify `d:\zhao\vendure\packages\logistics-plugin\src\catalog-custom-fields.ts` — 后端注册 `deliveryMethods`
- Modify `d:\zhao\nshop\graphql.schema.json` — 刷新后端 schema（含新字段）
- Modify `d:\zhao\nshop\scripts\_seed_delivery_methods.mjs` — 为样例商品回填 `deliveryMethods`（Create: 以 `_` 前缀，属临时种子脚本）
- Modify `d:\zhao\nshop\layers\base\gql\fragments\product.gql` — 补查 `deliveryMethods`
- Create `d:\zhao\nshop\layers\base\app\utils\productVisibility.ts` — 纯函数 `isProductVisible`（SSR/客户端共用）
- Create `d:\zhao\nshop\layers\base\app\utils\productVisibility.test.ts` — 单测
- Create `d:\zhao\nshop\layers\base\app\composables\useModuleDelivery.ts` — 模块级配送状态
- Modify `layers/base/app/components/home/blocks/GoodsFloor.vue` — SSR 过滤 + 模块切换 UI + 空态
- Modify `app/pages/index.vue` — 兜底楼层 SSR 过滤 + 切换
- Modify `layers/base/app/composables/useHomeContent.ts` — 促销绑定商品过滤接入
- 其余展示组件（JdProductGrid/GoodsMasonryGrid/GoodsSingleList）— 复用同一过滤工具与组件

---

### Task 0: 后端新增 `deliveryMethods` customField

**Files:**
- Modify: `d:\zhao\vendure\packages\logistics-plugin\src\catalog-custom-fields.ts:19-26`

- [ ] **Step 1: 在 Product 注册块加入 `deliveryMethods`**（在 `serviceCities` 之后）

在 `serviceCities` 字段对象 `}`（第 26 行）之后、`videoUrl`（第 27 行）之前插入：
```ts
        {
            name: 'deliveryMethods',
            type: 'string',
            list: true,
            nullable: true,
            public: true, // Shop API 需要读取，前端按配送方式过滤
            label: [{ languageCode: LanguageCode.zh_Hans, value: '配送方式（MAIL/SELF_PICKUP）' }],
            ui: {
                component: 'multiple-select-form-input',
                options: [
                    { value: 'MAIL', label: [{ languageCode: LanguageCode.zh_Hans, value: '邮寄' }] },
                    { value: 'SELF_PICKUP', label: [{ languageCode: LanguageCode.zh_Hans, value: '到店自提' }] },
                ],
            },
        },
```

- [ ] **Step 2: 后端类型检查**

Run（在 `d:\zhao\vendure`）: `pnpm --filter logistics-plugin build`（或该插件既有构建命令；若无独立 build 则 `npx tsc --noEmit -p packages/logistics-plugin`）
Expected: 通过无类型错误。

- [ ] **Step 3: Commit（后端仓库）**

```bash
git -C d:/zhao/vendure add packages/logistics-plugin/src/catalog-custom-fields.ts
git -C d:/zhao/vendure commit -m "feat(logistics): 新增 Product deliveryMethods 自定义字段"
```

> 部署：后端走 git pull + restart，由本计划后续「Task 6 部署」统一执行。

---

### Task 1: 刷新前端 schema + 补查字段

**Files:**
- Modify: `d:\zhao\nshop\graphql.schema.json`
- Modify: `d:\zhao\nshop\layers\base\gql\fragments\product.gql`

- [ ] **Step 1: 确认 schema.json 是否含 deliveryMethods**

Run: `rg "deliveryMethods" d:/zhao/nshop/graphql.schema.json`
- 若已含（后端重启后重新 fetch 过）→ 跳过 Step 2。
- 若为 MISSING → 需刷新。用项目既有 introspection/fetch schema 的方式（默认：对 `GQL_HOST` 跑 introspection 覆盖 `d:\zhao\nshop\graphql.schema.json`；若仓库有 fetch script 优先用之）。

- [ ] **Step 2: 重跑 codegen 生成类型**

Run（在 `d:\zhao\nshop`）: `npx nuxt prepare`（触发 @nuxtjs/graphql-client codegen，读 schema.json 重生成 ProductDetail/ProductBase 类型，使 `customFields.deliveryMethods` 出现在 TS 类型）。
Expected: 无报错；`layers/base/gql/types`（或生成的类型文件）里 `deliveryMethods` 可查询。

- [ ] **Step 3: ProductBaseFragment 补查字段**

在 `layers/base/gql/fragments/product.gql` 的 `ProductBaseFragment.customFields` 块加入 `deliveryMethods`：
```
  customFields {
    belongCity
    serviceCities
    deliveryMethods
    displayTemplate
    videoUrl
```
  （保持其余字段不动）

- [ ] **Step 4: 再跑 codegen 使 fragment 生效**

Run（在 `d:\zhao\nshop`）: `npx nuxt prepare`
Expected: 无报错。

- [ ] **Step 5: Commit**

```bash
git -C d:/zhao/nshop add graphql.schema.json layers/base/gql/fragments/product.gql
git -C d:/zhao/nshop commit -m "feat(detail): 补查 deliveryMethods 并刷新 GQL 类型"
```

---

### Task 2: Seed 样例数据（临时脚本）

**Files:**
- Create: `d:\zhao\nshop\scripts\_seed_delivery_methods.mjs`

- [ ] **Step 1: 写种子脚本**（基于已有种子脚本 `scripts/_seed_t2_phys_city.mjs` 所用的 admin/迁移 API 方式，仅对给定 slug 的商品回填 deliveryMethods 与 serviceCities 以构造测试样本）

脚本核心逻辑（示意，执行时对齐该仓库既有 seed 调 Vendure Admin API 的方式）：
```js
// 目标样本：
//  A) 长春温泉门票：deliveryMethods=["SELF_PICKUP"], belongCity="长春", serviceCities=[]
//     → 长春自提-only：北京应隐藏、长春显示、邮寄模式隐藏
//  B) 水杯/通用品：deliveryMethods=["MAIL"], serviceCities=[]（全城可寄）
//     → 邮寄全国可见；自提模式隐藏
//  C) 区间品：deliveryMethods=["MAIL"], serviceCities=["长春","吉林"]
//     → 仅长春/吉林可见
// 经 Vendure Admin API 更新对应 product.customFields
```

- [ ] **Step 2: 运行并确认**

Run（在 `d:\zhao\nshop`）: `node scripts/_seed_delivery_methods.mjs`
Expected: 打印更新成功的商品 slug + 新 customFields 值。

---

### Task 3: 纯函数 `isProductVisible` + 单测（TDD）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\productVisibility.ts`
- Create: `d:\zhao\nshop\layers\base\app\utils\productVisibility.test.ts`

- [ ] **Step 1: 写失败测试**

`productVisibility.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { isProductVisible, type VisibilityCtx, type ProductLike } from './productVisibility';

const base = (patch: Partial<ProductLike['customFields']>): ProductLike => ({
  customFields: { belongCity: null, serviceCities: [], deliveryMethods: ['MAIL', 'SELF_PICKUP'], ...patch },
});

describe('isProductVisible', () => {
  const ACTIVE = 'ENABLED'; // 与 TODO 无关——仅作 ctx 常量（见下）

  it('自提-only 商品：北京隐藏、长春显示', () => {
    const p = base({ deliveryMethods: ['SELF_PICKUP'], belongCity: '长春', serviceCities: [] });
    expect(isProductVisible(p, { city: '北京', delivery: 'MAIL' })).toBe(false);
    expect(isProductVisible(p, { city: '长春', delivery: 'SELF_PICKUP' })).toBe(true);
  });

  it('邮寄全国（serviceCities 空、MAIL）：任何城市可见', () => {
    const p = base({ deliveryMethods: ['MAIL'], serviceCities: [] });
    expect(isProductVisible(p, { city: '北京', delivery: 'MAIL' })).toBe(true);
  });

  it('serviceCities 含 X 才显示', () => {
    const p = base({ deliveryMethods: ['MAIL'], serviceCities: ['长春', '吉林'] });
    expect(isProductVisible(p, { city: '长春', delivery: 'MAIL' })).toBe(true);
    expect(isProductVisible(p, { city: '北京', delivery: 'MAIL' })).toBe(false);
  });

  it('SELF_PICKUP 模式下邮寄-only 商品消失', () => {
    const p = base({ deliveryMethods: ['MAIL'], serviceCities: [] });
    expect(isProductVisible(p, { city: '长春', delivery: 'SELF_PICKUP' })).toBe(false);
  });

  it('城市未知且 MAIL 放行', () => {
    const p = base({ deliveryMethods: ['MAIL'], serviceCities: [] });
    expect(isProductVisible(p, { city: null, delivery: 'MAIL' })).toBe(true);
  });

  it('城市未知且 SELF_PICKUP 隐藏（空态触发）', () => {
    const p = base({ deliveryMethods: ['SELF_PICKUP'], belongCity: '长春', serviceCities: [] });
    expect(isProductVisible(p, { city: null, delivery: 'SELF_PICKUP' })).toBe(false);
  });
  void ACTIVE; // 占位避免未用告警（实际测试不再需要此常量时删除）
});
```

- [ ] **Step 2: 运行确认失败**

Run（在 `d:\zhao\nshop`）: `npm test -- productVisibility`
Expected: FAIL，报 `Cannot find module './productVisibility'`（模块未创建）。

- [ ] **Step 3: 写最小实现**

`productVisibility.ts`：
```ts
export type DeliveryMethod = 'MAIL' | 'SELF_PICKUP';

export interface VisibilityCtx {
  /** 当前城市；null=未授权 */
  city: string | null;
  /** 模块级配送选择 */
  delivery: DeliveryMethod;
}

export interface ProductLike {
  customFields?: {
    belongCity?: string | null;
    serviceCities?: Array<string | null> | null;
    deliveryMethods?: DeliveryMethod[] | null;
  } | null;
}

export function isProductVisible(p: ProductLike | null | undefined, ctx: VisibilityCtx): boolean {
  const cf = p?.customFields ?? {};
  const serviceCities: string[] = (cf.serviceCities ?? []).map((s) => s?.trim() ?? '').filter(Boolean);
  const belongCity: string = cf.belongCity?.trim() ?? '';
  // 空 deliveryMethods 视为两者都支持（旧数据兜底）
  const methods: DeliveryMethod[] = cf.deliveryMethods?.length ? cf.deliveryMethods : ['MAIL', 'SELF_PICKUP'];
  const isMail = methods.includes('MAIL');
  const isPickup = methods.includes('SELF_PICKUP');
  const map = (s: string[]) => s.some((x) => x === ctx.city); // 精确匹配（与 useCityService 的前缀匹配不同：本过滤用精确城市名）
  // 可寄到 X：MAIL 方式 && (城市未知 或 serviceCities 空=全城 或 含 X)
  const canMail = isMail && (!ctx.city || !serviceCities.length || map(serviceCities));
  // 可自提于 X：SELF_PICKUP 方式 && belongCity===X
  const canPickup = isPickup && !!belongCity && ctx.city === belongCity;
  return ctx.delivery === 'SELF_PICKUP' ? canPickup : canMail;
}
```

- [ ] **Step 4: 运行确认通过**

Run（在 `d:\zhao\nshop`）: `npm test -- productVisibility`
Expected: 全部 PASS（自提/邮寄/区间/未知城市 6 例）。

- [ ] **Step 5: Commit**

```bash
git -C d:/zhao/nshop add layers/base/app/utils/productVisibility.ts layers/base/app/utils/productVisibility.test.ts
git -C d:/zhao/nshop commit -m "feat: 商品可见性纯函数 isProductVisible + 单测"
```

---

### Task 4: 模块级配送状态 composable

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\composables\useModuleDelivery.ts`

- [ ] **Step 1: 实现 per-module 配送状态（localStorage 持久化）**

```ts
import type { DeliveryMethod } from '../utils/productVisibility';

const STORAGE_KEY = 'nshop:module-delivery';

interface ModuleDeliveryState {
  [moduleId: string]: DeliveryMethod;
}

function readStore(): ModuleDeliveryState {
  if (!import.meta.client) return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as ModuleDeliveryState;
  } catch {
    return {};
  }
}

export function useModuleDelivery(moduleId: string) {
  const methods = useState<ModuleDeliveryState>(STORAGE_KEY, readStore);
  const current = computed<DeliveryMethod>(() => methods.value[moduleId] ?? 'MAIL');
  function set(d: DeliveryMethod) {
    methods.value = { ...methods.value, [moduleId]: d };
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(methods.value));
  }
  return { current, setDelivery: set };
}
```

- [ ] **Step 2: 确认可编译（Nuxt auto-import）**

Run（在 `d:\zhao\nshop`）: `npx nuxt prepare`
Expected: 无报错，`useModuleDelivery` 进入 auto-import。

- [ ] **Step 3: Commit**

```bash
git -C d:/zhao/nshop add layers/base/app/composables/useModuleDelivery.ts
git -C d:/zhao/nshop commit -m "feat: 模块级配送选择 useModuleDelivery(localStorage)"
```

---

### Task 5: 首页各商品模块接入 SSR 过滤 + 切换 + 空态

**Files:**
- Modify: `layers/base/app/components/home/blocks/GoodsFloor.vue:26-58`
- Modify: `app/pages/index.vue:51-84, 194-202`
- Modify: `layers/base/app/composables/useHomeContent.ts`
- Modify（复用，做法同 GoodsFloor）：`layers/base/app/components/home/jd/JdProductGrid.vue`、`layers/base/app/components/home/blocks/GoodsMasonryGrid.vue`、`layers/base/app/components/home/blocks/GoodsSingleList.vue`

核心模式（以 `GoodsFloor.vue` 为例；其余复制同构）：
- 其在 `GetProductsByIds` 补齐 each 的 customFields 之后、渲染 `items` 之前，套过滤：
```ts
const cityName = useLocationStore().cityName; // SSR 期 cookie 已同步
const { current: delivery } = useModuleDelivery(blockId);
const visibleItems = computed(() =>
  (items ?? []).filter((p) => isProductVisible(p, { city: cityName ?? null, delivery: delivery.value })),
);
// 渲染用 visibleItems；为空 → 显示空态（i18n key，见 Task 8 词条）
```
- 模块头部渲染「自提/邮寄」分段切换（`current`/`setDelivery`），切换即时客户端过滤（visibleItems computed 自动联动）。
- 副作用一致性：`current` 变化无需回服务端（SSR 已按默认 MAIL 下发；切换只在客户端重排可见集）。

- [ ] **Step 1: GoodsFloor 接过滤 + 切换 + 空态**
按上述核心模式改 `GoodsFloor.vue`，新增 `.filter` 纯函数调用、模块级切换控件、可见商品为空时渲染空态（i18n key `messages.home.emptyAfterFilter`）。

- [ ] **Step 2: index.vue 兜底楼层接过滤 + 切换**（同构模式接到 `hotProducts`/`moreProducts`）

- [ ] **Step 3: useHomeContent 促销绑定商品接过滤**（对 `publishedContent`/促销绑定商品列表套同一过滤）

- [ ] **Step 4: JdProductGrid / GoodsMasonryGrid / GoodsSingleList 复用**（各套同一 pattern，共用 `useProductVisibility`+`useModuleDelivery`）

- [ ] **Step 5: 类型检查**

Run（在 `d:\zhao\nshop`）: `npm run build`
Expected: 构建通过（含 codegen 与类型校验）。

- [ ] **Step 6: Commit**

```bash
git -C d:/zhao/nshop add -A
git -C d:/zhao/nshop commit -m "feat(home): 首页商品/分类/促销按语言·城市·配送过滤(SSR后置+模块级切换)"
```

---

### Task 6: i18n 词条（四语言同步）

**Files:**
- Modify: `layers/base/i18n/locales/zh-CN.ts` / `en-US.ts` / `ja-JP.ts` / `ko-KR.ts`

- [ ] **Step 1: 四语言补新增词条**（`messages.home` 下）

key | zh-CN | en-US | ja-JP | ko-KR
- 白话示例：`selfPickup`=「自提」/`mail`=「邮寄」/`emptyAfterFilter`=「当前城市/配送方式下暂无可用商品」/（en=`No products available for your city/delivery`，ja=/ko= 翻译）。
按各语言文件现有 `home` 段结构加入（key 名称以最终 GoodsFloor/首页实现所用为准）。

- [ ] **Step 2: 构建校验词条**

Run（在 `d:\zhao\nshop`）: `npm run build`
Expected: 通过（i18n 类型/编译无报错）。

- [ ] **Step 3: Commit**

```bash
git -C d:/zhao/nshop commit -am "feat(i18n): 配送切换与空态词条(四语言)"
```

---

### Task 7: Playwright 手机截图 + 操作手册（硬规范）

**Files:**
- Create（或沿用既有 e2e/manual 目录约定）：手机视图截图（标准视口 390×844 = dpr 2 = 780×1688）

- [ ] **Step 1: 移动视口覆盖三场景**（Playwright，①北京城市：自提-only 商品不出现；②切「自提」：邮寄-only 消失；③切英文：显示翻译文案）
- [ ] **Step 2: 截图保存到项目既有手册目录**
- [ ] **Step 3: 将截图与「功能实现+回归+截图」补进操作手册/Wiki（对照用户既有交付规范）**

---

### Task 8: 统一部署

**Files:**
- 后端 `d:\zhao\vendure` + 前端 `d:\zhao\nshop`

- [ ] **Step 1: 部署后端**（走 git pull + pm2 restart，含新 customField 生效）

```bash
# 由仓库既有机制执行后端部署（记忆：vendure 后端走 git pull + pm2 restart）
```

- [ ] **Step 2: 部署前端**（遵守部署铁律：本地构建；勿在服务器构建）

Run（在 `d:\zhao\nshop`）: `SKIP_BUILD=0 node scripts/deploy.mjs`（或直接 `node scripts/deploy.mjs`）
Expected: 构建→scp→服务器解压→pm2 restart 全部成功（对照 .env: SERVER_HOST/REMOTE_DIR）。

- [ ] **Step 3: 线上冒烟**

Run: 访问首页，确认 SSR HTML 只含「当前城市+配送可见」商品；切换英文确认翻译；切邮寄/自提确认即时过滤。

---

## Self-Review（对照 spec）

**Spec 覆盖：**
- 语言不过滤（多翻译）→ spec §2.1；实现：无代码（Task 6 仅保证词条翻译），无遗漏。
- 城市自动过滤 → spec §2.2；实现 Task 3 纯函数 + Task 5 接入。✓
- 配送模块级切换 → spec §2.3；Task 4 useModuleDelivery + Task 5 切换控件。✓
- deliveryMethods 后端字段 → spec §3.0；Task 0 后端 + Task 1 schema/codegen + Task 2 seed。✓
- 性能净收益（SSR 后置）→ spec §5；Task 5 VisibleItems 过滤后渲染，客户端只见可见项。✓
- 空态/未知城市边界 → Task 3 测试 5/6 + Task 5 空态。✓
- 手机截图补手册 → Task 7。✓

**Placeholder scan：** 无 TBD/TODO；所有代码步骤含完整代码或明确示意。两个「示意/对齐」点（Task 2 seed 调用方式、Task 8 后端部署命令）已显式标注以既有仓库机制为准，非占位。

**Type consistency：** `DeliveryMethod`/`VisibilityCtx`/`ProductLike` 在 Task 3 定义并在 Task 4/5 复用；`useModuleDelivery` 返回 `{ current, setDelivery }` 在 Task 5 用 `setDelivery` 一致。

**已知依赖顺序：** Task 0→1 必须先行（schema 含字段 codegen 才出类型），Task 3 纯函数不依赖后端可先行；Task 5 依赖 Task 3/4；Task 7 依赖部署 Task 8。