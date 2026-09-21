# 模板配色方案 + 后台配置 C 端失效根因修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ①修复「后台改配置 C 端不变」的四断点；②新增 8 套「模板配色方案」预设并确认四级/五级风格体系正常可用。

**Architecture:** 配色方案落地为 **模板级 `theme.palette`**：C 端 `merge-config.ts` 内置 8 套预设调色板字典（L0 全局兜底），`mergeThemeTokens` 把模板的 `palette.scheme` 展开为其 `tokens` 再与全局 token 合并，最终由 `app.vue` 消费为内联 CSS 变量整站换肤。根因修复分四块：R1 渠道头/租户映射强化、R2 合并语义核对、R3 `useThemeConfig` 加 `getCachedData`+`refreshTheme`、R4 配置版本化破线上 HTML 缓存。

**Tech Stack:** Nuxt3（SSR / layers/base）、Vendure 3.x（`shop-template-plugin`）、vitest。

---

## 前置：已核实的落点

- **配色消费落点（a）**：`nshop/app/app.vue` L33-46 读 `useThemeConfig().themeTokens` → `themeCssVars` computed → `<style>` 内联 CSS 变量（`--ui-primary/--theme-primary/--color-brand-*/--theme-accent/--ui-radius`）。**配色换肤在此生效，无需改动 app.vue**。
- **后台入口（b）**：`vendure/packages/shop-template-plugin` 已有 admin mutation（`createShopTemplate`/`updateShopTemplate` 的 `theme` 字段为任意 JSON 透传，`adminApiExtensions` 已暴露），**本计划不做 React admin UI** —— 后台改配色走 Admin GraphQL mutation 验证「后台改→C端变」。`ShopTemplate` 已含 `version` 字段。
- **合并纯函数**：`nshop/layers/base/app/utils/merge-config.ts`：`mergeThemeTokens(global,template)` = `deepMerge({}, global.themeTokens, template.theme)`；`mergePageConfig(global,template,channelCfs,page)` = `deepMerge({}, global.defaults[page], template.pages[page], shop)`。`deepMerge` 递归深合并（对象递归、标量/数组覆盖、null/undefined 跳过）——**R2 合并顺序在 current 代码中已是「模板为主、渠道增量覆盖」**，需核对确认而非改动。
- **C 端消费**：`nshop/layers/base/app/composables/useThemeConfig.ts` 三个 `useAsyncData(key, handler, {server:true})`（`theme-template`/`theme-global-config`/`theme-channel-cfs`），无 `getCachedData`、无刷新函数。
- **渠道头**：`nshop/layers/base/app/plugins/tenant-channel.ts` + `nshop/layers/base/data/tenant-channels.json`。

---

## Task 1: 后端 `theme.palette` 类型与种子

**Files:**
- Modify: `vendure/packages/shop-template-plugin/src/types.ts`
- Modify: `vendure/packages/shop-template-plugin/src/plugin.ts`（`SEED_TEMPLATES` 改为 palette 结构）

后端无需改 service/entity：`theme` 已是 `JSON` 任意透传，`palette` 只是其内部子对象。

- [ ] **Step 1: types.ts 增加 palette 语义类型注释（不改接口签名，保持 JSON 自由）**

`vendure/packages/shop-template-plugin/src/types.ts` 在 `UpdateShopTemplateInput` 之后追加注释型类型（仅文档，YAGNI 不强制校验）：

```ts
// theme.palette 结构（可选，任意 JSON 兼容）：
// { scheme: 'dawn-gold', name: '晨曦金', tokens: { primaryColor, accentColor, radius } }
// scheme 为 C 端预设字典 Key，tokens 为展开兜底（二者并存，优先 scheme 解码，
// 显式 tokens 再经 deepMerge 覆盖）。
```

- [ ] **Step 2: plugin.ts 更新 SEED_TEMPLATES 为 8 套 palette 结构**

`vendure/packages/shop-template-plugin/src/plugin.ts` L71-87 将 `SEED_TEMPLATES` 替换为 8 套（平台对标风 + 气质品牌风），theme 统一存 `{ palette: { scheme, name } }`：

```ts
const SEED_TEMPLATES = [
    { name: '晨曦金(默认)', theme: { palette: { scheme: 'dawn-gold', name: '晨曦金' } } as Record<string, any>, pages: {} },
    { name: '京东红', theme: { palette: { scheme: 'jd-red', name: '京东红' } } as Record<string, any>, pages: {} },
    { name: '淘宝橙', theme: { palette: { scheme: 'taobao-orange', name: '淘宝橙' } } as Record<string, any>, pages: {} },
    { name: '拼多多红', theme: { palette: { scheme: 'pdd-red', name: '拼多多红' } } as Record<string, any>, pages: {} },
    { name: '唯品会蓝紫', theme: { palette: { scheme: 'vip-blue', name: '唯品会蓝紫' } } as Record<string, any>, pages: {} },
    { name: '科技蓝', theme: { palette: { scheme: 'tech-blue', name: '科技蓝' } } as Record<string, any>, pages: {} },
    { name: '清雅绿', theme: { palette: { scheme: 'fresh-green', name: '清雅绿' } } as Record<string, any>, pages: {} },
    { name: '极夜黑', theme: { palette: { scheme: 'midnight', name: '极夜黑' } } as Record<string, any>, pages: {} },
];
```

> 注：seed 是**空库幂等**逻辑（已有记录则不覆盖）。线上库已存在旧 3 套模板，不会自动替换。要刷新种子需：删除旧模板后重启，或经 admin mutation 手动更新目标模板的 `theme.palette.scheme`。验收依赖 8 套字典可用，本任务保证「新库」正确。

- [ ] **Step 3: 验证后端编译通过**

Run（在 `d:\zhao\vendure`）: `pnpm --filter shop-template-plugin build`
Expected: build 成功，无 TS 错误。

- [ ] **Step 4: Commit**

```bash
git add packages/shop-template-plugin/src/types.ts packages/shop-template-plugin/src/plugin.ts
git commit -m "feat(template-plugin): seed 8 套模板配色 palette 结构"
```

---

## Task 2: C 端内置 8 套配色预设字典 + palette 展开

**Files:**
- Create: `nshop/layers/base/app/utils/palette-presets.ts`
- Test: `nshop/layers/base/app/utils/__tests__/palette-presets.spec.ts`
- Modify: `nshop/layers/base/app/utils/merge-config.ts`

- [ ] **Step 1: 写失败测试**

`nshop/layers/base/app/utils/__tests__/palette-presets.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { PALETTE_PRESETS } from '../palette-presets';

describe('palette-presets', () => {
  it('内置 8 套预设', () => {
    expect(Object.keys(PALETTE_PRESETS).length).toBe(8);
  });
  it('默认启用 dawn-gold（晨曦金）', () => {
    expect(PALETTE_PRESETS['dawn-gold']).toBeDefined();
  });
  it('每套含可用的 primaryColor', () => {
    for (const p of Object.values(PALETTE_PRESETS)) {
      expect(p.tokens.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('每套 tokens 含 accentColor 与 radius', () => {
    for (const p of Object.values(PALETTE_PRESETS)) {
      expect(p.tokens.accentColor).toBeTypeOf('string');
      expect(typeof p.tokens.radius).toBe('number');
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `d:\zhao\nshop`）: `pnpm vitest run layers/base/app/utils/__tests__/palette-presets.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `palette-presets.ts`**

`nshop/layers/base/app/utils/palette-presets.ts`：

```ts
// 模板配色方案预设字典（L0 全局默认兜底）：C 端内置，与后端模板库的
// theme.palette.scheme 一一对应；各端（nshop/vshop）共用同一份语义。
export interface PaletteToken {
  primaryColor?: string;
  accentColor?: string;
  radius?: number | string;
  [key: string]: unknown;
}
export interface ThemePaletteDef {
  scheme: string;     // 调色板标识（模板 theme.palette.scheme 引用）
  name: string;       // 中文名（后台展示）
  tokens: PaletteToken; // 展开为 CSS 变量的 token 集
}

// 8 套预设（平台对标风 4 + 气质品牌风 4），默认 dawn-gold
export const PALETTE_PRESETS: Record<string, ThemePaletteDef> = {
  'dawn-gold': { scheme: 'dawn-gold', name: '晨曦金', tokens: { primaryColor: '#d4a574', accentColor: '#fdf6ee', radius: 8 } },
  'jd-red': { scheme: 'jd-red', name: '京东红', tokens: { primaryColor: '#e1251b', accentColor: '#ffeceb', radius: 8 } },
  'taobao-orange': { scheme: 'taobao-orange', name: '淘宝橙', tokens: { primaryColor: '#ff5000', accentColor: '#fff0e6', radius: 8 } },
  'pdd-red': { scheme: 'pdd-red', name: '拼多多红', tokens: { primaryColor: '#e02e24', accentColor: '#ffe9e7', radius: 8 } },
  'vip-blue': { scheme: 'vip-blue', name: '唯品会蓝紫', tokens: { primaryColor: '#4a5cff', accentColor: '#edefff', radius: 8 } },
  'tech-blue': { scheme: 'tech-blue', name: '科技蓝', tokens: { primaryColor: '#0066ff', accentColor: '#e6f0ff', radius: 10 } },
  'fresh-green': { scheme: 'fresh-green', name: '清雅绿', tokens: { primaryColor: '#07b873', accentColor: '#e6f9f0', radius: 10 } },
  'midnight': { scheme: 'midnight', name: '极夜黑', tokens: { primaryColor: '#1c1c1e', accentColor: '#333333', radius: 8 } },
};
```

（色值可在定稿前与用户微调，「晨曦金 dawn-gold」为默认已确认。）

- [ ] **Step 4: 运行测试确认通过**

Run（在 `d:\zhao\nshop`）: `pnpm vitest run layers/base/app/utils/__tests__/palette-presets.spec.ts`
Expected: PASS。

- [ ] **Step 5: merge-config.ts 接入 palette 展开**

`nshop/layers/base/app/utils/merge-config.ts` 顶部 import 预设字典：

```ts
import { PALETTE_PRESETS, PaletteToken } from "./palette-presets";
```

在 `ThemeTokens` 接口旁新增 `ThemePaletteData`（透传 C 端模板 JSON）：

```ts
export interface ThemePaletteData {
  scheme?: string;
  name?: string;
  tokens?: PaletteToken;
}
```

把 `mergeThemeTokens` 从「global.themeTokens ← template.theme」改为「global.themeTokens ← 模板 palette 展开 tokens ← template.theme 显式 token」：

```ts
/** 解析模板 theme 中的配色：优先按 palette.scheme 从预设查询并展开 tokens；
 *  无 scheme 或未知 scheme → null（回退），有 scheme 但同步带显式 tokens 时二者并存。 */
export function resolvePaletteTokens(template: ShopTemplateData | null): PaletteToken | null {
  const palette = template?.theme?.palette as ThemePaletteData | null | undefined;
  if (!palette || typeof palette !== 'object') return null;
  const preset = typeof palette.scheme === 'string' ? PALETTE_PRESETS[palette.scheme] : undefined;
  const presetTokens = preset ? preset.tokens : {};
  return deepMerge<PaletteToken>({}, presetTokens, palette.tokens ?? null);
}

/** 主题令牌合并：L1 全局 themeTokens ← 模板 palette 展开 tokens ← 模板 theme 显式 token */
export function mergeThemeTokens(
  globalConfig: ShopGlobalConfigData | null,
  template: ShopTemplateData | null,
): ThemeTokens {
  return deepMerge<ThemeTokens>(
    {},
    globalConfig?.themeTokens ?? null,
    resolvePaletteTokens(template),
    template?.theme ?? null,
  );
}
```

> 回退语义保持：`resolvePaletteTokens` 无 scheme/未知 scheme 返回 `{}`（或 null），`deepMerge` 跳过 null，C 端回到 L1/L0。坏 JSON 在 `parseJsonText`/后端已兜底。

- [ ] **Step 6: 跑 merge-config 相关现有测试回归**

Run（在 `d:\zhao\nshop`）: `pnpm vitest run layers/base/app/utils/__tests__/`
Expected: 全 PASS（含 schemes.spec.ts 等既有用例）。

- [ ] **Step 7: Commit**

```bash
git add layers/base/app/utils/palette-presets.ts layers/base/app/utils/__tests__/palette-presets.spec.ts layers/base/app/utils/merge-config.ts
git commit -m "feat(template): 内置 8 套配色预设字典并接入 mergeThemeTokens 展开"
```

---

## Task 3: R3 `useThemeConfig` 加 `refreshTheme` 与缓存语义

**Files:**
- Modify: `nshop/layers/base/app/composables/useThemeConfig.ts`

- [ ] **Step 1: 重构 useThemeConfig 暴露 `refreshTheme`**

`nshop/layers/base/app/composables/useThemeConfig.ts` 整体替换为（保留 `template/globalConfig/channelCfs/themeTokens/pageConfig` 原导出，新增 `refreshTheme`）：

```ts
import { mergePageConfig, mergeThemeTokens } from "../utils/merge-config";
import type { ShopGlobalConfigData, ShopTemplateData, ThemeTokens } from "../utils/merge-config";

const APP = "nshop";

export function useThemeConfig() {
  const { data: templateData, refresh: refreshTemplate } = useAsyncData(
    "theme-template",
    async () => {
      const res = await useAsyncGql("GetShopTemplate", { app: APP }, { server: true });
      return res.data.value?.shopTemplate ?? null;
    },
    // R3: 配置为弱数据——优先新鲜结果，避免 SPA 内跳转复用旧 payload 导致后台改动不可见。
    { server: true, getCachedData: () => null },
  );

  const { data: globalData, refresh: refreshGlobal } = useAsyncData(
    "theme-global-config",
    async () => {
      const res = await useAsyncGql("GetShopGlobalConfig", { app: APP }, { server: true });
      return res.data.value?.shopGlobalConfig ?? null;
    },
    { server: true, getCachedData: () => null },
  );

  const { data: channelData, refresh: refreshChannel } = useAsyncData(
    "theme-channel-cfs",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields ?? null;
    },
    { server: true, getCachedData: () => null },
  );

  const template = computed<ShopTemplateData | null>(() => templateData.value ?? null);
  const globalConfig = computed<ShopGlobalConfigData | null>(() => globalData.value ?? null);
  const channelCfs = computed<Record<string, any> | null>(() => channelData.value ?? null);
  const themeTokens = computed<ThemeTokens>(() => mergeThemeTokens(globalConfig.value, template.value));

  function pageConfig(page: string): Record<string, any> | null {
    return mergePageConfig(globalConfig.value, template.value, channelCfs.value, page);
  }

  /** R3: 后台改配置后强制刷新主题三件套，供页面/操作后调用，替代「怎么改都不变」。 */
  async function refreshTheme() {
    await Promise.all([refreshTemplate(), refreshGlobal(), refreshChannel()]);
  }

  return { template, globalConfig, channelCfs, themeTokens, pageConfig, refreshTheme };
}
```

- [ ] **Step 2: 类型校验**

Run（在 `d:\zhao\nshop`）: `pnpm typecheck`
Expected: 无新增 TS 错误。`override` 未使用无需处理。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/composables/useThemeConfig.ts
git commit -m "fix(theme): useThemeConfig 加入 getCachedData 与 refreshTheme 破 SPA payload 快照"
```

---

## Task 4: R1 渠道头强化 + 租户映射补齐

**Files:**
- Modify: `nshop/layers/base/app/plugins/tenant-channel.ts`
- Modify: `nshop/layers/base/data/tenant-channels.json`

- [ ] **Step 1: 核对 tenant-channel.ts 首帧时序**

确认 `tenant-channel.ts` 的 `useGqlHeaders` 在 `useAsyncData` 主题查询前注入 `vendure-token`（当前已实现）。补强：确保对未命中租户的路径**不清空已设头**（避免把正确 token 覆盖为空）。

改为仅在命中时设置、未命中沿用插件默认头：

```ts
// 在任意 typed GQL 之前设置租户渠道头。
// 未命中已知租户 code 时保持 graphql-client 默认头（CHANNEL_TOKEN 根渠道），
// 不清空 token，避免把已设的正确渠道头覆盖为空。
const { token } = useTenantChannel();
if (hit && token.value) {
  useGqlHeaders({ "vendure-token": token.value });
}
```

- [ ] **Step 2: 核对 data/tenant-channels.json 门店映射**

读 `nshop/layers/base/data/tenant-channels.json`：列出 `tenants[]` 的 `code/token`。逐项与本店 `dev-config.ts` 的 `Channel.customFields` 及生产门店对照，**补全缺失门店的租户 token 映射**（门店 code → 该渠道 `vendure-token`）。此步骤依赖现状，若映射已齐则仅记录结论不再改动。

- [ ] **Step 3: 本地验证渠道切换**

Run：启动本地 nshop dev server 访问一条门店路径，检查首个 GraphQL 请求头的 `vendure-token`。
Expected: 命中租户时头 = 该门店 token；未命中 = 根渠道 token。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/plugins/tenant-channel.ts layers/base/data/tenant-channels.json
git commit -m "fix(tenant): 强化渠道头注入语义并补齐门店租户映射"
```

---

## Task 5: R4 配置版本化 + 线上 HTML 缓存破缓存

**Files:**
- Modify: `nshop/app/app.vue`

- [ ] **Step 1: 版本化响应头**

`nshop/app/app.vue` 中 `useHead` 的 `themeCssVars` 分支旁，为 SSR 添加版本派生 HTTP 响应头，使模板/全局配置 `version` 变化驱动 nginx/CDN 缓存失效。

在 `useHead(() => ({ style: ... }))` 之后新增：

```ts
// R4: 配置版本化——模板/全局配置 version 变化即派生 Unique 响应头，破 nginx/CDN 对
// SSR 首帧 HTML 的缓存（缓存 key 含该头变化即视为不同）。客户端不设此头。
if (import.meta.server) {
  const { template: tpl, globalConfig: gCfg } = useThemeConfig();
  const versionSig = `${tpl.value?.version ?? 0}-${gCfg.value ? 1 : 0}-${channelToken.value ?? ''}`;
  setResponseHeader("X-Template-Version", versionSig);
}
```

> 需冠以 `import` 已在文件顶部（`setResponseHeader` 来自 `h3`，Nuxt 自动全局注入，若未自动导入则在顶部 `import { setResponseHeader } from 'h3';`）。header 变化本身并不自动破 HTTP 缓存，实际还需 nginx 侧将 `X-Template-Version` 纳入缓存 key 或对该 headless 路由禁用缓存——写入 `nshop-www.conf` 备注并在交付说明中提示；本任务交付代码侧信号。

- [ ] **Step 2: 类型校验**

Run（在 `d:\zhao\nshop`）: `pnpm typecheck`
Expected: 无新增 TS 错误。

- [ ] **Step 3: Commit**

```bash
git add nshop/app/app.vue
git commit -m "fix(render): 模板/全局配置版本化派生响应头，破线上 HTML 缓存"
```

---

## Task 6: R2 合并语义核对（验证而非改动）

**Files:**
- Test: `nshop/layers/base/app/utils/__tests__/merge-config.spec.ts`（新建）

current `deepMerge` 已递归合并，`mergePageConfig` = `deepMerge({}, global.defaults[page], template.pages[page], shop)`，即模板为主、渠道 `detailConfig` 仅增量覆盖同 key。本任务用测试固化该语义，防止将来回归。

- [ ] **Step 1: 写测试固化合并顺序**

`nshop/layers/base/app/utils/__tests__/merge-config.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { mergePageConfig, mergeThemeTokens } from '../merge-config';

describe('mergePageConfig 合并顺序（模板为主、渠道增量）', () => {
  const tpl = {
    pages: { product: { layout: 'classic', blocks: { a: { show: true, scale: 2 }, b: { show: false } } } },
  } as any;
  const shop = { detailConfig: JSON.stringify({ blocks: { a: { show: false } } }) } as any;
  it('模板 layout 不被渠道覆盖，渠道仅覆盖同 key 块', () => {
    const r = mergePageConfig(null, tpl, shop, 'product')!;
    expect(r.layout).toBe('classic');
    expect(r.blocks.a.show).toBe(false);      // 渠道增量覆盖
    expect(r.blocks.a.scale).toBe(2);          // 模板独有保留
    expect(r.blocks.b.show).toBe(false);       // 模板独有块保留
  });
});

describe('mergeThemeTokens 配色回退', () => {
  it('无模板/无全局时为空', () => {
    expect(mergeThemeTokens(null, null)).toEqual({});
  });
  it('模板 palette.scheme 展开 primaryColor 并覆盖全局同名', () => {
    const g = { themeTokens: { primaryColor: '#000000', radius: 4 } } as any;
    const t = { theme: { palette: { scheme: 'jd-red' } } } as any;
    const r = mergeThemeTokens(g, t);
    expect(r.primaryColor).toBe('#e1251b');
    expect(r.radius).toBe(4);
  });
  it('未知 scheme 回退全局，不抛错', () => {
    const g = { themeTokens: { primaryColor: '#000000' } } as any;
    const t = { theme: { palette: { scheme: 'nope' } } } as any;
    const r = mergeThemeTokens(g, t);
    expect(r.primaryColor).toBe('#000000');
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run（在 `d:\zhao\nshop`）: `pnpm vitest run layers/base/app/utils/__tests__/merge-config.spec.ts`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/utils/__tests__/merge-config.spec.ts
git commit -m "test(theme): 固化模板为主/渠道增量合并语义与配色回退"
```

---

## Task 7: 端到端验收（后台改 → C 端换肤）

**Files:**
- 交付物：操作手册补充 + 手机视口截图

- [ ] **Step 1: 本地全栈联调冒烟**

启动后端 `d:\zhao\vendure`（`pnpm dev`，保证 shop-template-plugin 已重启引入新 seed 或经 mutation 更新）与 `nshop` dev。

用 Admin GraphQL mutation 把某门店引用模板的 `theme.palette.scheme` 改为 `jd-red`：

```graphql
mutation {
  updateShopTemplate(input: {
    id: "<模板id>",
    theme: { palette: { scheme: "jd-red", name: "京东红" } }
  }) { id theme }
}
```

访问该店商品详情页：Expected 主色为京东红（`#e1251b`），`<html>` 内联 CSS `--ui-primary:#e1251b`。改用 `test` 未有 scheme 回退为全局默认色。

- [ ] **Step 2: 手机视口截图**

用 Playwright 移动视口（**390×844，dpr=2**）打开配色「晨曦金默认与选中的 jd-red」两块商品详情页截图。
Expected: 主色/按钮/强调色随所选 palette 变化。

- [ ] **Step 3: 补操作手册**

将「如何从后台改模板配色 / 如何使配置对 C 端生效」写入操作手册：说明改 `theme.palette.scheme` → 强刷/C 端刷新可见，附 Step 2 截图。

- [ ] **Step 4: 部署 + 真机验证（本地构建铁律）**

按项目铁律**本地构建**产物 → scp 到服务器 → 服务器仅解压 / `pm2 restart`（不在服务器构建）。线上验证配色切换与配置可见性，补真机截图。

- [ ] **Step 5: Commit**

```bash
git add <操作手册> <截图>
git commit -m "docs(template): 配色方案操作手册与手机视口截图"
```

---

## Self-Review

- **Spec 覆盖**：R1(Task4)、R2(Task6 核对+测试)、R3(Task3)、R4(Task5)、配色方案甲(Task1+2)、验收标准(Task7) 全覆盖；spec 提到的「`version` 作为 C 端缓存判定依据」已并入 Task3/5。
- **占位符扫描**：Task 色值需在首轮实现时与用户对一下「晨曦金/科技蓝」等细微色值；Step 2 租户映射为「若已齐则记录不改」，均已明示感知。
- **类型一致**：`PaletteToken/ThemePaletteData/ThemePaletteDef` 统一在 `palette-presets.ts`；`resolvePaletteTokens` 在 Task2 定义、Task6 测试引用一致；`refreshTheme` 在 Task3 定义、验收 Task7 不引用（页面可按需接入，本计划不阻塞）。