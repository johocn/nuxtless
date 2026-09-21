# 方案2：首页过滤接入四级可回退风格体系 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把方案1 的首页「语言·城市·配送」过滤功能纳入五级可回退风格体系（L0 全局默认 ← L1 ShopGlobalConfig ← L2 ShopTemplate ← L3 店铺覆盖 ← L4 内建默认），使过滤开关、模块默认配送、过滤条样式可经后台配置。

**Architecture:** 纯前端接线。`pageConfig("home")` 已做五级合并（home 键已存在于 `PAGE_CF_FIELD`），新增 `utils/home-filter-config.ts` 解析器（L4 兜底纯函数）+ `useHomeFilterConfig` composable 从 `pageConfig("home").filter` 读配置；过滤条组件 `DeliveryFilterBar` 两种 variant（segmented/tabs）；`useModuleDelivery` 增加初始值注入。**后端零改动**（ShopTemplate.pages/ShopGlobalConfig.defaults 为泛型 JSON）。

**Tech Stack:** Nuxt 3 / Pinia / Vitest（纯函数单测）/ 无新 GQL 字段

**前置关键事实（零上下文执行者必读）：**
- 本计划与方案1（`docs/superpowers/plans/2026-09-19-home-filter-language-city-delivery.md`）**合并执行，顺序：方案1 → 本方案**。方案1 已完成 `utils/productVisibility.ts`（`DeliveryMethod`/`isProductVisible`）与 `composables/useModuleDelivery.ts`（`useModuleDelivery(moduleId)`，返回值 `{ current, setDelivery }`），本计划在其上叠加。
- 五级合并入口：`layers/base/app/composables/useThemeConfig.ts` 的 `pageConfig(page)`；`PAGE_CF_FIELD.home = 'shopContent'`（`layers/base/app/utils/merge-config.ts:40-46`）。`useShopContent` 与 `useHomeFilterConfig` 同从 `pageConfig("home")` 取值，共享 payload 缓存。
- L4 兜底解析参照 `layers/base/app/utils/detail-config.ts` 的 `parseDetailConfig` 模式（纯函数、坏值回退、不抛错）。
- 单测：Vitest `environment:'node'`，include `layers/base/app/**/*.test.ts`；命令 `npm test -- <keyword>`。
- 部署铁律：本地构建，服务器只解压/`pm2 restart`；`node scripts/deploy.mjs`。后端本次无改动，仅部署前端。
- i18n 词条 `messages.home.selfPickup` / `messages.home.mail` / `messages.home.emptyAfterFilter` 已由方案1 Task 6 加入，本计划复用，**勿重复加词条**。

---

## 文件结构

- Create `layers/base/app/utils/home-filter-config.ts` — `HomeFilterConfig` 类型 + L4 默认常量 + 解析纯函数
- Create `layers/base/app/utils/home-filter-config.test.ts` — 解析器单测
- Create `layers/base/app/composables/useHomeFilterConfig.ts` — 从 `pageConfig("home").filter` 读配置
- Create `layers/base/app/components/home/blocks/DeliveryFilterBar.vue` — 配送切换条（segmented/tabs 双 variant）
- Modify `layers/base/app/composables/useModuleDelivery.ts` — 初始值注入
- Modify `layers/base/app/components/home/blocks/GoodsFloor.vue` — 接线配置（enabled/bar/defaultDelivery）
- Modify `app/pages/index.vue` — 兜底楼层同构接线
- Create `docs/superpowers/notes/home-filter-config-example.md` — L1/L2 配置 JSON 样例（模板库录入用）

---

### Task 0: 解析器 `home-filter-config` + 单测（TDD）

**Files:**
- Create: `layers/base/app/utils/home-filter-config.ts`
- Create: `layers/base/app/utils/home-filter-config.test.ts`

- [ ] **Step 1: 写失败测试**

`layers/base/app/utils/home-filter-config.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { parseHomeFilterConfig, DEFAULT_HOME_FILTER } from './home-filter-config';

describe('parseHomeFilterConfig', () => {
  it('null/undefined → 全默认', () => {
    expect(parseHomeFilterConfig(null)).toEqual(DEFAULT_HOME_FILTER);
    expect(parseHomeFilterConfig(undefined)).toEqual(DEFAULT_HOME_FILTER);
  });

  it('空对象 → 全默认', () => {
    expect(parseHomeFilterConfig({})).toEqual(DEFAULT_HOME_FILTER);
  });

  it('部分配置逐字段回退', () => {
    const cfg = parseHomeFilterConfig({ bar: { variant: 'tabs' } });
    expect(cfg.bar.variant).toBe('tabs');
    expect(cfg.bar.visible).toBe(true); // 未配置回退默认
    expect(cfg.enabled).toBe(true);
    expect(cfg.defaultDelivery).toBe('MAIL');
  });

  it('模块级覆盖顶层 defaultDelivery', () => {
    const cfg = parseHomeFilterConfig({
      defaultDelivery: 'SELF_PICKUP',
      modules: { goods: { enabled: true, defaultDelivery: 'MAIL' } },
    });
    expect(cfg.defaultDelivery).toBe('SELF_PICKUP');
    expect(cfg.modules.goods.defaultDelivery).toBe('MAIL');
    expect(cfg.modules.category.defaultDelivery).toBeNull(); // 未配置回退 null
  });

  it('坏类型（string/数组/null 节点）→ 全默认', () => {
    expect(parseHomeFilterConfig('oops')).toEqual(DEFAULT_HOME_FILTER);
    expect(parseHomeFilterConfig([])).toEqual(DEFAULT_HOME_FILTER);
    expect(parseHomeFilterConfig({ filter: 'x' })).toEqual(DEFAULT_HOME_FILTER); // 顶层无 filter 键即全默认
  });

  it('variant 非法值 → 回退 segmented', () => {
    const cfg = parseHomeFilterConfig({ bar: { variant: 'pill' } });
    expect(cfg.bar.variant).toBe('segmented');
  });

  it('enabled=false 整页关闭可配置', () => {
    const cfg = parseHomeFilterConfig({ enabled: false });
    expect(cfg.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run（在 `d:\zhao\nshop`）: `npm test -- home-filter-config`
Expected: FAIL，报 `Cannot find module './home-filter-config'`。

- [ ] **Step 3: 写最小实现**

`layers/base/app/utils/home-filter-config.ts`：
```ts
import type { DeliveryMethod } from './productVisibility';

export interface ModuleFilterConfig {
  enabled: boolean;
  defaultDelivery: DeliveryMethod | null;
}

export interface HomeFilterBarConfig {
  visible: boolean;
  variant: 'segmented' | 'tabs';
}

export interface HomeFilterConfig {
  enabled: boolean;
  defaultDelivery: DeliveryMethod;
  bar: HomeFilterBarConfig;
  modules: {
    goods: ModuleFilterConfig;
    category: ModuleFilterConfig;
    promo: ModuleFilterConfig;
  };
}

export const DEFAULT_HOME_FILTER: HomeFilterConfig = {
  enabled: true,
  defaultDelivery: 'MAIL',
  bar: { visible: true, variant: 'segmented' },
  modules: {
    goods: { enabled: true, defaultDelivery: null },
    category: { enabled: true, defaultDelivery: null },
    promo: { enabled: true, defaultDelivery: null },
  },
};

function isObj(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function bool(v: unknown, dflt: boolean): boolean {
  return typeof v === 'boolean' ? v : dflt;
}

function delivery(v: unknown, dflt: DeliveryMethod | null): DeliveryMethod | null {
  return v === 'MAIL' || v === 'SELF_PICKUP' ? v : dflt;
}

function moduleCfg(v: unknown): ModuleFilterConfig {
  const o = isObj(v) ? v : {};
  return {
    enabled: bool(o.enabled, true),
    defaultDelivery: delivery(o.defaultDelivery, null),
  };
}

/** 解析店铺/模板/全局 home.filter 配置；坏值逐字段回退 L4 内建默认，不抛错（SSR 友好） */
export function parseHomeFilterConfig(raw: unknown): HomeFilterConfig {
  if (!isObj(raw)) return { ...DEFAULT_HOME_FILTER };
  const bar = isObj(raw.bar) ? raw.bar : {};
  return {
    enabled: bool(raw.enabled, DEFAULT_HOME_FILTER.enabled),
    defaultDelivery: delivery(raw.defaultDelivery, DEFAULT_HOME_FILTER.defaultDelivery),
    bar: {
      visible: bool(bar.visible, DEFAULT_HOME_FILTER.bar.visible),
      variant: bar.variant === 'tabs' ? 'tabs' : 'segmented',
    },
    modules: {
      goods: moduleCfg(isObj(raw.modules) ? raw.modules.goods : null),
      category: moduleCfg(isObj(raw.modules) ? raw.modules.category : null),
      promo: moduleCfg(isObj(raw.modules) ? raw.modules.promo : null),
    },
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run（在 `d:\zhao\nshop`）: `npm test -- home-filter-config`
Expected: 全部 PASS（7 例）。

- [ ] **Step 5: Commit**

```bash
git -C d:/zhao/nshop add layers/base/app/utils/home-filter-config.ts layers/base/app/utils/home-filter-config.test.ts
git -C d:/zhao/nshop commit -m "feat(home): 过滤配置解析器 home-filter-config(L4兜底纯函数)+单测"
```

---

### Task 1: `useHomeFilterConfig` composable

**Files:**
- Create: `layers/base/app/composables/useHomeFilterConfig.ts`

- [ ] **Step 1: 实现**

```ts
// home 页过滤配置走五级合并：pageConfig("home") 已由 useThemeConfig 完成
// L1 全局 defaults.home ← L2 模板 pages.home ← L3 店铺 shopContent(filter 节点)，
// 本 composable 只做解析 + L4 内建默认兜底（与 useShopContent 同源同缓存）。
import { parseHomeFilterConfig, type HomeFilterConfig } from "../utils/home-filter-config";

export function useHomeFilterConfig() {
  const { pageConfig } = useThemeConfig();
  const config = computed<HomeFilterConfig>(() =>
    parseHomeFilterConfig(pageConfig("home")?.filter ?? null),
  );
  return { config };
}
```

- [ ] **Step 2: 确认可编译**

Run（在 `d:\zhao\nshop`）: `npx nuxt prepare`
Expected: 无报错，`useHomeFilterConfig` 进入 auto-import。

- [ ] **Step 3: Commit**

```bash
git -C d:/zhao/nshop add layers/base/app/composables/useHomeFilterConfig.ts
git -C d:/zhao/nshop commit -m "feat(home): useHomeFilterConfig 读取五级合并后的 filter 配置"
```

---

### Task 2: `DeliveryFilterBar` 组件（segmented/tabs 双 variant）

**Files:**
- Create: `layers/base/app/components/home/blocks/DeliveryFilterBar.vue`

- [ ] **Step 1: 实现组件**

```vue
<script setup lang="ts">
// 配送方式切换条：variant=segmented（分段控件）/ tabs（文本页签）。
// 文案走 i18n（messages.home.selfPickup / messages.home.mail，方案1 已加），
// 组件注册名 DeliveryFilterBar（Nuxt 自动按目录前缀注册，模板必须用全名）。
import type { DeliveryMethod } from "../../../utils/productVisibility";

const props = defineProps<{
  variant: "segmented" | "tabs";
  modelValue: DeliveryMethod;
}>();
const emit = defineEmits<{ "update:modelValue": [value: DeliveryMethod] }>();
const { t } = useI18n();

const options: { value: DeliveryMethod; label: string }[] = [
  { value: "MAIL", label: t("messages.home.mail") },
  { value: "SELF_PICKUP", label: t("messages.home.selfPickup") },
];

function pick(v: DeliveryMethod) {
  if (v !== props.modelValue) emit("update:modelValue", v);
}
</script>

<template>
  <div
    class="flex items-center gap-1"
    :class="variant === 'tabs' ? 'border-b border-gray-100' : 'rounded-full bg-gray-100 p-1 w-fit'"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      @click="pick(opt.value)"
      class="px-3 py-1 text-xs transition"
      :class="
        modelValue === opt.value
          ? variant === 'tabs'
            ? 'border-b-2 border-primary font-semibold text-primary -mb-px'
            : 'rounded-full bg-primary text-white font-medium shadow-sm'
          : 'text-gray-500'
      "
    >
      {{ opt.label }}
    </button>
  </div>
</template>
```

- [ ] **Step 2: 确认可编译**

Run（在 `d:\zhao\nshop`）: `npx nuxt prepare`
Expected: 无报错，`DeliveryFilterBar` 可被页面级组件解析。

- [ ] **Step 3: Commit**

```bash
git -C d:/zhao/nshop add layers/base/app/components/home/blocks/DeliveryFilterBar.vue
git -C d:/zhao/nshop commit -m "feat(home): 配送切换条 DeliveryFilterBar(segmented/tabs 双 variant)"
```

---

### Task 3: `useModuleDelivery` 初始值注入

**Files:**
- Modify: `layers/base/app/composables/useModuleDelivery.ts`（方案1 产物，追加 initial 参数）

- [ ] **Step 1: 修改签名**

在方案1 实现基础上，仅改函数签名与初始值解析：

```ts
export function useModuleDelivery(moduleId: string, initial?: DeliveryMethod) {
  const methods = useState<ModuleDeliveryState>(STORAGE_KEY, readStore);
  const current = computed<DeliveryMethod>(
    () => methods.value[moduleId] ?? initial ?? 'MAIL',
  );
  // ...set 逻辑不变
}
```

> 说明：`initial` 由调用方传入配置解析出的模块默认配送（`config.modules.goods.defaultDelivery ?? config.defaultDelivery`），缺省回退 `'MAIL'`（与方案1 行为完全一致，无调用方破坏）。

- [ ] **Step 2: 确认可编译**

Run（在 `d:\zhao\nshop`）: `npx nuxt prepare`
Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
git -C d:/zhao/nshop add layers/base/app/composables/useModuleDelivery.ts
git -C d:/zhao/nshop commit -m "feat(home): useModuleDelivery 支持初始配送方式注入(L4兜底MAIL)"
```

---

### Task 4: GoodsFloor 与首页兜底楼层接线

**Files:**
- Modify: `layers/base/app/components/home/blocks/GoodsFloor.vue`（方案1 Task 5 改造后追加配置接线）
- Modify: `app/pages/index.vue`（兜底楼层同构）

接线语义（两处一致）：
1. `const { config } = useHomeFilterConfig();`
2. 模块过滤开关 = `config.enabled && config.modules.goods.enabled`（兜底楼层同样用 goods 键）。
3. 模块默认配送 = `config.modules.goods.defaultDelivery ?? config.defaultDelivery`；`useModuleDelivery(moduleId, moduleDefault)`。
4. 过滤条渲染条件 = 模块过滤开关 && `config.bar.visible`；`variant = config.bar.variant`。
5. 开关关闭 → 跳过 `isProductVisible` 过滤、不渲染过滤条（现状渲染，回到不过滤行为）。

- [ ] **Step 1: GoodsFloor 接线**

在方案1 改造后的 `GoodsFloor.vue` 中：
- 顶部加入 `const { config } = useHomeFilterConfig();`
- 用 computed 表达 `const filterEnabled = computed(() => config.value.enabled && config.value.modules.goods.enabled);`
- 默认配送：`const defaultDelivery = computed(() => config.value.modules.goods.defaultDelivery ?? config.value.defaultDelivery);`
- `useModuleDelivery(blockId, defaultDelivery.value)` 传入初始值；
- `visibleItems` 过滤条件加 `filterEnabled.value &&` 前缀；
- 模块头部在 `filterEnabled && config.value.bar.visible` 时渲染 `<DeliveryFilterBar :variant="config.value.bar.variant" v-model="delivery.current" />`（`delivery` 为 `useModuleDelivery` 返回值）。

- [ ] **Step 2: index.vue 兜底楼层同构接线**

`app/pages/index.vue` 的 `hotProducts`/`moreProducts` 两处楼层套同一模式（模块 id 用 `"home-hot"` / `"home-more"`，默认配送同上取自配置），过滤开关为 `config.enabled && config.modules.goods.enabled`，过滤条渲染条件同上。

- [ ] **Step 3: 类型检查**

Run（在 `d:\zhao\nshop`）: `npm run build`
Expected: 构建通过（含 codegen 与类型校验，无新 GQL 字段）。

- [ ] **Step 4: Commit**

```bash
git -C d:/zhao/nshop add -A
git -C d:/zhao/nshop commit -m "feat(home): 过滤功能接入五级风格配置(开关/默认配送/过滤条样式)"
```

---

### Task 5: 配置样例文档

**Files:**
- Create: `docs/superpowers/notes/home-filter-config-example.md`

- [ ] **Step 1: 写 L1/L2 配置 JSON 样例**

内容：spec §5.4 的 `filter` JSON 示例 + 放置层级说明（L1 `ShopGlobalConfig.defaults.home.filter` / L2 `ShopTemplate.pages.home.filter` / L3 `shopContent` JSON 的 `filter` 节点）+ 验证方式（模板库录入后刷新首页观察过滤条样式/模块开关生效）。

- [ ] **Step 2: Commit**

```bash
git -C d:/zhao/nshop add docs/superpowers/notes/home-filter-config-example.md
git -C d:/zhao/nshop commit -m "docs: home 过滤配置(L1/L2/L3)JSON 样例"
```

---

### Task 6: Playwright 手机截图（配置生效验证）+ 部署

**Files:**
- 手机视口截图（标准 390×844，dpr 2 → 780×1688）
- 部署：仅前端（后端无改动）

- [ ] **Step 1: 配置两个变体验证截图**

在店铺 `shopContent` 配置两种形态各截一张：
1. `filter.bar.variant = "tabs"` 且 `modules.promo.enabled = false` → 商品楼层为页签式过滤条、促销模块不过滤；
2. `filter.enabled = false` → 整页回到不过滤现状（无过滤条）。

- [ ] **Step 2: 截图保存 + 操作手册**

按项目既有手册目录保存两张截图，并把「配置项（enabled/defaultDelivery/bar.variant/modules.*）+ 截图」补进操作手册（对照用户交付规范：功能实现 + API/e2e 回归 + 手机截图 + 操作手册）。

- [ ] **Step 3: 部署前端**

Run（在 `d:\zhao\nshop`）: `node scripts/deploy.mjs`
Expected: 构建→scp→服务器解压→pm2 restart 全部成功。

- [ ] **Step 4: 线上冒烟**

访问首页：① 店铺未配置 → 默认 segmented 过滤条 + 默认 MAIL 过滤（与方案1 行为一致）；② 按 Task 6 Step 1 配置后 → tabs 样式、promo 不过滤、enabled=false 时无过滤条。

---

## Self-Review（对照 spec）

**Spec 覆盖：**
- §3 配置结构（HomeFilterConfig/ModuleFilterConfig/L4 默认）→ Task 0 解析器。✓
- §4 放置层级（五级回退，无需后端改动）→ Task 1 useHomeFilterConfig 从 pageConfig("home") 读取。✓
- §5.1 过滤条组件（segmented/tabs）→ Task 2 DeliveryFilterBar。✓
- §5.2 useModuleDelivery 初始值注入 → Task 3。✓
- §5.2 GoodsFloor / index.vue 接线 → Task 4。✓
- §5.4 配置样例 → Task 5。✓
- §6 单测 + Playwright + 构建 → Task 0（单测）+ Task 6（截图/部署/冒烟）。✓

**Placeholder scan：** 无 TBD/TODO；所有代码步骤含完整代码。Task 4 为接线描述（引用方案1 已存在代码），已给出精确语义与关键代码片段，非占位。

**Type consistency：** `DeliveryMethod` 来自方案1 `utils/productVisibility.ts`（`'MAIL' | 'SELF_PICKUP'`）；`HomeFilterConfig`/`ModuleFilterConfig`/`HomeFilterBarConfig` 在 Task 0 定义并贯穿 Task 1/4 使用；`useModuleDelivery(moduleId, initial?)` 在 Task 3 改签名、Task 4 以 `(blockId, defaultDelivery.value)` 调用，一致。`DeliveryFilterBar` props `variant/modelValue` 与 emit `update:modelValue` 在 Task 2 定义、Task 4 使用 `v-model`，一致。

**依赖顺序：** Task 0（解析器）→ Task 1（composable）→ Task 2（组件）→ Task 3（useModuleDelivery 注入）→ Task 4（接线，依赖 Task 0/2/3 + 方案1 Task 3/4/5）→ Task 5（文档）→ Task 6（部署）。方案1 必须先行完成（本计划使用其 `productVisibility.ts` / `useModuleDelivery.ts` / i18n 词条）。
