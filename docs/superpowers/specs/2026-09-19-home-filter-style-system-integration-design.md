# 方案2：首页过滤 × 四级可回退风格体系 集成设计

> 状态：设计定稿 · 与方案1（2026-09-19-home-filter-language-city-delivery.md）合并执行

## 1. 背景与目标

方案1 已确定首页商品/分类/促销模块的「语言·城市·配送」过滤逻辑（SSR 后置过滤 + 模块级配送切换，数据模型补 `deliveryMethods` 字段）。

方案2 的目标：把过滤功能的**行为与 UI** 纳入既有四级可回退风格体系（L0 全局默认 ← L1 `ShopGlobalConfig` ← L2 `ShopTemplate` ← L3 店铺覆盖 ← L4 页面/模块内建默认），使店铺可经后台配置：
- 整页/模块级开关过滤（`enabled`）
- 模块默认配送方式（`defaultDelivery`）
- 过滤条显隐与样式（`bar.visible` / `bar.variant`）

## 2. 体系现状（勘探结论，勿重复勘探）

- **nshop 端**：`layers/base/app/composables/useThemeConfig.ts` 已实现五级合并 `pageConfig(page)`；`PAGE_CF_FIELD.home = 'shopContent'`（见 `utils/merge-config.ts:40-46`）。`useShopContent` 从 `pageConfig('home').sections` 读装修积木数组。
- **后端**：`ShopTemplate.pages` / `ShopGlobalConfig.defaults` 均为 `simple-json` 泛型 JSON（`shop-template.entity.ts:26-28`），任意页面键可用；home 页模板配置已可承载。**后端实体/服务/GraphQL/admin resolver 均无需改动**。
- **L4 兜底链参照**：`utils/detail-config.ts` 的 `parseDetailConfig` 模式（纯函数解析，坏 JSON 回退内建默认）。

## 3. 配置结构（HomeFilterConfig）

```ts
import type { DeliveryMethod } from "../utils/productVisibility";

export interface ModuleFilterConfig {
  /** 该模块是否参与过滤（false=不过滤、不渲染过滤条，回到现状） */
  enabled: boolean;
  /** 模块默认配送方式；null=回退顶层 defaultDelivery */
  defaultDelivery: DeliveryMethod | null;
}

export interface HomeFilterConfig {
  /** 整页过滤总开关（false=整页不过滤、不渲染任何过滤条） */
  enabled: boolean;
  /** 模块默认配送方式（顶层，L4 内建 'MAIL'） */
  defaultDelivery: DeliveryMethod;
  /** 过滤条（配送切换）UI 配置 */
  bar: {
    /** 过滤条显隐（true 且模块 enabled 才渲染） */
    visible: boolean;
    /** 切换样式：segmented=分段控件；tabs=文本页签 */
    variant: "segmented" | "tabs";
  };
  /** 模块级配置：goods=商品楼层 / category=分类模块 / promo=促销模块 */
  modules: {
    goods: ModuleFilterConfig;
    category: ModuleFilterConfig;
    promo: ModuleFilterConfig;
  };
}
```

**内建默认（L4）**：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 整页过滤默认开启 |
| `defaultDelivery` | `"MAIL"` | 与方案1 默认行为一致 |
| `bar.visible` | `true` | 显示过滤条 |
| `bar.variant` | `"segmented"` | 分段控件 |
| `modules.*.enabled` | `true` | 各模块默认参与过滤 |
| `modules.*.defaultDelivery` | `null` | 回退顶层 |

**语言维度**：方案1 已定为「同商品多翻译、不过滤」，配置**不设** language 开关（YAGNI；将来若需「仅当前语言商品」再扩）。

## 4. 放置层级（五级回退链）

| 层级 | 存放位置 | 形态 |
|---|---|---|
| L1 全局配置 | `ShopGlobalConfig.defaults.home.filter` | JSON |
| L2 风格模板 | `ShopTemplate.pages.home.filter` | JSON |
| L3 店铺覆盖 | `channel.customFields.shopContent` JSON 的 `filter` 节点（与 `sections` 同 JSON 共存） | JSON |
| L4 内建默认 | `utils/home-filter-config.ts` 解析器内 | 代码常量 |

合并由 `pageConfig("home")` 现有五级深合并完成（`mergePageConfig`，数组/标量直接覆盖、null 跳过），`useHomeFilterConfig` 只负责**解析 + L4 兜底**，不重复实现合并。

## 5. 需要调整的地方（文件级清单）

### 5.1 前端新增
- **`layers/base/app/utils/home-filter-config.ts`**：`HomeFilterConfig` 类型 + `DEFAULT_HOME_FILTER` 常量 + `parseHomeFilterConfig(raw: unknown): HomeFilterConfig` 纯函数（SSR 友好：坏值逐字段回退，不抛错）。
- **`layers/base/app/composables/useHomeFilterConfig.ts`**：从 `useThemeConfig().pageConfig("home")` 取 `.filter` → `parseHomeFilterConfig` → `computed config`。与 `useShopContent` 同源同缓存，payload 去重。
- **`layers/base/app/components/home/blocks/DeliveryFilterBar.vue`**：配送切换条组件。
  - props：`variant`（`"segmented" | "tabs"`）、`modelValue: DeliveryMethod`、`options`（可选，默认 MAIL/SELF_PICKUP 词条）
  - emit：`update:modelValue`
  - 两种 variant 同组件内切换渲染（`v-if` 分支），保持一个注册名。

### 5.2 前端修改
- **`layers/base/app/composables/useModuleDelivery.ts`**：初始值支持注入——`useModuleDelivery(moduleId, initial?: DeliveryMethod)`，`initial` 缺省时回退 `"MAIL"`（保持方案1 行为）。调用方（GoodsFloor / index.vue）传配置解析出的模块默认配送。
- **`layers/base/app/components/home/blocks/GoodsFloor.vue`**（方案1 Task 5 改造后追加）：
  - 读取 `useHomeFilterConfig().config`；
  - `config.enabled === false` 或 `config.modules.goods.enabled === false` → 跳过过滤与过滤条（现状渲染）；
  - 否则按方案1 过滤，头部渲染 `<DeliveryFilterBar>`，`variant`/`visible` 走配置，`modelValue` = `useModuleDelivery(blockId, cfgDefault).current`。
- **`app/pages/index.vue`**（兜底楼层同构）：同上，模块 id 用固定 key（如 `"home-hot"` / `"home-more"`）。

### 5.3 后端
- **无需任何改动**（pages/defaults 泛型 JSON 已支持）。admin 编辑沿用现有模板 JSON 编辑/模板管理界面，`filter` 作为 `home` 页面配置的一个节点即可保存。

### 5.4 配置样例（文档/种子）
- 在方案1 Task 2 种子脚本外，追加一份**配置样例文档或 admin 操作说明**：L1 `defaults.home.filter` 与 L2 `template.pages.home.filter` 的 JSON 示例，供模板库录入：
```json
{
  "filter": {
    "enabled": true,
    "defaultDelivery": "MAIL",
    "bar": { "visible": true, "variant": "segmented" },
    "modules": {
      "goods": { "enabled": true, "defaultDelivery": null },
      "category": { "enabled": true, "defaultDelivery": null },
      "promo": { "enabled": false, "defaultDelivery": null }
    }
  }
}
```

## 6. 测试与验证

- **单测（TDD）**：`utils/home-filter-config.test.ts` 覆盖——缺省 → 全默认；部分配置 → 逐字段回退；坏类型（filter 为 string/数组/null）→ 全默认；模块级覆盖顶层；`variant` 非法值 → 回退 `"segmented"`。
- **集成验证**：`npm run build` 类型通过；`npx nuxt prepare` codegen 无报错（无新 GQL 字段，纯前端）。
- **Playwright 手机截图**（沿用方案1 Task 7 场景）：在店铺配置 `bar.variant="tabs"` 与 `modules.promo.enabled=false` 两种配置下各截一张，验证配置生效。

## 7. 与方案1 的执行关系

| 顺序 | 计划 | 内容 |
|---|---|---|
| 1 | 方案1（2026-09-19-home-filter-language-city-delivery.md） | 核心过滤：后端字段 + 纯函数 + 模块级切换 + 首页接入 + i18n + 截图 + 部署 |
| 2 | 方案2（本计划 2026-09-19-home-filter-style-system-integration.md） | 风格体系接入：配置解析层 + 过滤条组件 + 接线 + 截图 + 部署 |

两计划合并为一个执行清单，按 1→2 顺序执行，各自独立提交，最后统一部署一次。

## 8. YAGNI 边界

- 不改后端任何代码（实体/服务/GraphQL/admin 均不动）。
- 不做语言维度开关（方案1 定论：多翻译不过滤）。
- 不做过滤后的分页/加载更多联动（楼层固定 take，过滤后数量减少可接受，空态兜底）。
- 不做过滤条全局 sticky/多模块联动（bar 仅模块内 top 位置，避免侵入既有布局）。
