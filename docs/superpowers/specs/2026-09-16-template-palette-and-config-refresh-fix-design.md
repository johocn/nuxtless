# 模板配色方案 + 后台配置 C 端失效根因修复

日期：2026-09-16
状态：设计定稿，待用户复核
范围：nshop（Nuxt3 SSR / layers/base）+ vendure `shop-template-plugin`

## 一、背景与目标

四级可回退风格体系（实际为五级合并模型）框架已基本搭建，但存在痛点：

1. **后台改配置 C 端无变化**：模板库 `ShopTemplate`、全局 `ShopGlobalConfig`、店铺渠道 `detailConfig` 三层配置改动后，C 端页面不能及时/正确反映；且集中在**线上多店铺/多渠道**环境有卡点。
2. **缺少配色方案能力**：目前 `theme` 仅为松散的 `{primaryColor, accentColor, radius}` 对象，无可复用的命名调色板。

目标：①修复「后台改配置 C 端必变」的全套根因；②新增「模板配色方案（预设调色板）」能力；③确认四级/五级风格体系模板正常可用。

## 二、现状链路（已核实代码）

- C 端：`layers/base/app/composables/useThemeConfig.ts` 用 3 个 `useAsyncData(server:true)`（key：`theme-template` / `theme-global-config` / `theme-channel-cfs`）分别拉取 `GetShopTemplate`、`GetShopGlobalConfig`、`GetChannelTheme`。
- 模板解析：后端 `shop-template.service.ts` 的 `shopTemplate(ctx, app, id?)`，`id` 缺省时从 `ctx.channel.customFields.templateId` 解析；模板跨端/停用返回 null。
- 合并：`layers/base/app/utils/merge-config.ts` 的 `mergePageConfig` = `deepMerge({}, global.defaults[page], template.pages[page], shop.detailConfig)`；`mergeThemeTokens` = `deepMerge({}, global.themeTokens, template.theme)`。
- 渠道头：`nuxt.config.ts` 默认 `vendure-token: CHANNEL_TOKEN`（根渠道）；`tenant-channel.ts` 插件按 URL 首段从 `tenant-channels.json` 切换，未命中回退根 token。

## 三、根因（四断点）

- **R1 多店铺渠道识别**：SSR 首帧/主题查询带错或不带 `vendure-token` 时落到默认渠道，非默认店铺读不到自己配的模板/渠道配置。
- **R2 合并顺序被覆盖**：`mergePageConfig` 中 L3 渠道 `detailConfig` 经 `deepMerge` 整块覆盖模板 L2 的 `pages[page]`，模板改动被渠道旧值盖掉。
- **R3 SSR/payload 快照**：3 个 `useAsyncData(server:true)` 仅在 SSR 拉取并序列化进 payload；SPA 内跳转复用旧 payload，不重新发起请求。
- **R4 线上 HTML 层缓存**：线上 `www.youshop.cn` 若存在 nginx/CDN 对 SSR 首帧的缓存，旧配置持久在线。

## 四、根因修复方案

### R1 多店铺渠道识别
- SSR 与客户端统一通过 `tenant-channel.ts` 注入 `vendure-token`（当前已实现，补强：确保首个 GQL 请求（含主题查询）前已设置，且 `useAsyncGql` 服务端携带）。
- 补齐 `layers/base/data/tenant-channels.json` 中未收录门店的租户 token 映射。
- 后端 `shopTemplate`/`shopGlobalConfig` 按 `ctx.channel` 兜底，未命中/非法配置明确返回 null，C 端逐级回退（不自动取平台最新模板）。

### R2 合并顺序与防覆盖
- `ShopTemplate` 增加 `version` 字段（`shop-template.entity` / types / admin 接口已含 `version`，沿用）。
- 明确合并语义：**模板为主、渠道 `detailConfig` 为显式增量覆盖**。模板层的 `layout/blocks` 改动必须经 `deepMerge` 生效；渠道覆盖仅用于渠道级微调。
- 合并仍用纯函数 `deepMerge`（数组/标量直接覆盖、null 跳过），各端消费层语义一致。

### R3 SSR/payload 快照
- `useThemeConfig` 的 3 个 `useAsyncData` 配置 `getCachedData`（配置为弱数据：优先新鲜结果/可绕过），并暴露 `refreshTheme()` 供页面/操作后强制刷新。
- 配置版本化：模板 `version` 变化驱动缓存失效，作为新增配置可见性的判定依据。

### R4 线上 HTML 层缓存
- 配置版本化后：将模板/全局配置 `version` 作为 SSR HTML 派生标志/响应头，破 nginx/CDN 缓存；如必要在 nginx 侧调 short cache-control 或版本参数。

## 五、配色方案能力（方案甲：模板级 palette）

- `ShopTemplate.theme.palette` 新增结构化字段：
  ```ts
  interface PaletteToken {
    primaryColor?: string;
    accentColor?: string;
    radius?: string | number;
    [key: string]: unknown;
  }
  interface ThemePalette {
    scheme: string;          // 调色板标识（如 'dawn-gold'）
    name: string;            // 中文名（如 '晨曦金'）
    tokens: PaletteToken;    // 展开为 CSS 变量的 token 集
  }
  ```
- 内置 4 套命名调色板，随模板库内置（作为 **L0 全局默认兜底**）：
  - 晨曦金 `dawn-gold`（默认）：暖调 · 轻奢
  - 科技蓝 `tech-blue`：冷调 · 专业
  - 清雅绿 `fresh-green`：自然 · 治愈
  - 极夜黑 `midnight`：深邃 · 高端
- 后台在模板库选中 `theme.palette.scheme` → C 端 `mergeThemeTokens` 时将 palette 展开为其 `tokens`，再与全局 token 合并 → 作为 CSS 变量源整站换肤。
- **回退语义保持不变**：palette 展开的 token 走既有 `deepMerge`（当前 locale/defaultLocale→首个值→占位），未选中 scheme 时回退 L0 内建默认；坏 JSON/缺字段返回 null 回退。

## 六、验收标准

1. **配置可见性**：在后台模板库/全局配置/渠道 `detailConfig` 任一层改动 → C 端**强刷可见**（R1–R4 后，替代当前「怎么改都不变」）。
2. **多店铺**：非默认门店不再落到默认渠道，能读到本店模板/配色。
3. **配色换肤**：切换 `theme.palette.scheme` → 商品详情页整体换肤，CSS 变量随 token 变化。
4. **回退健壮**：未引用/无效/停用模板时逐级回退全局默认，不丢样式。
5. **交付物**：手机视口（390×844，dpr=2）真机/Playwright 截图补入操作手册。

## 七、范围与边界

- 范围：R1–R4 根因修复 + 配色方案能力 + 后端 `shop-template-plugin` 支持 `palette` 字段与 `version`。
- 不含：渠道实时热更（轮询/SSE）等过度设计；不含无关重构。
- 部署：本地构建，服务器仅解压 / `pm2 restart`，不在服务器构建。

## 八、涉及文件（拟定，实现时以计划为准）

- 后端：`packages/shop-template-plugin/src/shop-template.entity.ts`、`types.ts`、`shop-template.service.ts`（palette 字段、version）
- C 端：`layers/base/app/composables/useThemeConfig.ts`（refresh、getCachedData）、`utils/merge-config.ts`（palette 展开）、`composables/useDetailConfig.ts`
- 渠道：`layers/base/app/plugins/tenant-channel.ts`、`layers/base/data/tenant-channels.json`
- 配色预设：随模板库内置（L0 兜底）