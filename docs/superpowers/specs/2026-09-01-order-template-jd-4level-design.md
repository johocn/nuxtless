# 订单模块四级可回退风格体系 + 京东搭积木版式 — 设计文档

> 日期：2026-09-01
> 前端：`d:\zhao\nshop\layers\base`（Nuxt，`account/orders`）　后端：`d:\zhao\vendure\packages\cjk-plugin`（多租户通用）
> 前置：沿用 `2026-08-31-orders-jd-blocks-redemption-design.md`（订单卡片积木化 + 核销码已落地）。其「范围外」项：**后端版式配置/多版式可回退**，即本设计补齐项。

## 0. 决策基线（brainstorming 已澄清）

| 决策 | 结论 |
|---|---|
| 范围 | **先详情页**做渲染器+配置+京东积木版式并四级合规；**列表页顺带**加 `OrderListRenderer` 封装（不改视觉） |
| 默认版式 | **京东版式作为默认上线**；现有固定结构作为 `classic` 兜底，随时可切回 |
| 当前模板 | 保留现有 `[code].vue` 固定结构为 `classic` 布局，作为备用与回归基线 |
| 合规目标 | 订单模块接入与商品详情页一致的**四级可回退风格体系**（L1 全局 Token / L2 页面级配置 / L3 块级定制 / L4 兜底链） |

## 1. 现状

- **订单详情** `account/orders/[code].vue`：无渲染器，区块固定顺序拼装（OrderStatusBanner/OrderProgress/OrderRedemptionCard/OrderAddress/OrderItems/OrderPickupCard/OrderTotals/OrderShippingBreakdown/OrderMetaCard/OrderActions），**不读任何前端配置**。
- **订单列表** `account/orders/index.vue`：`OrderTabBar + OrderCardList`，纯卡片式（已积木化），无版式配置。
- 现有订单组件：固定文案基本已走 i18n；样式用 Tailwind 类名（部分 `bg-brand-600` 间接取全局 Token），**未系统化接入四级体系**。
- 商品详情页已有完整参考：`ProductDetailRenderer` + `useDetailConfig` + `detail-config.ts`（L2/L3/L4）+ L1 全局 Token（`brand-*`/`--ui-*`）。订单模块需复刻此模式。

## 2. 架构总览

```
C 端前端
  列表 account/orders/index.vue
    OrderListRenderer  (新) ─ 读 orderListConfig.layout，当前仅含卡片版式
  ──────────────────────────────
  详情 account/orders/[code].vue
    OrderDetailRenderer (新) ┄ 读 useOrderDetailConfig().layout
      ├─ classic → OrderDetailClassic (现有固定结构，备用)
      └─ jd     → OrderDetailJd       (按配置积木拼装，默认)
                     └─ 块：Status/Progress/Redemption/Address/Items/
                        Pickup/Totals/ShippingBreakdown/Meta/Actions
                          └─ 每块读 cfg.blocks[key]（visible/title/text）+ 内建默认
  ──────────────────────────────
后端 cjk-plugin
  Channel customFields: orderDetailConfig / orderListConfig (JSON)
  Shop API: 在 GetChannelTheme.activeChannel.customFields 下发（SSR 读取）
```

**职责边界**：配置存取与下发归后端（Channel customFields）；前端只做「读配置 → 逐级兜底解析 → 按 layout 拼装」。解析层为纯函数、SSR 友好。

## 3. 后端设计（cjk-plugin）

在 `Channel` 自定义字段新增两个 JSON 字段（类型与详情页 `detailConfig` 同机制）：

| 字段 | 位置 | 说明 |
|---|---|---|
| `orderDetailConfig` | Channel.customFields | JSON：`{ version, layout:'jd'\|'classic', blocks:{<key>:{visible?,title?<LocalizedText>,text?<LocalizedText>}} }` |
| `orderListConfig` | Channel.customFields | JSON：`{ version, layout:'card' }`（本期仅卡片） |

- 下发：Shop API `GetChannelTheme` 的 `activeChannel.customFields` 已含 `detailConfig`，补 `orderDetailConfig`/`orderListConfig` 即随下发（`customFields` 为兜底全量 JSON，无需额外 resolver 逻辑）。
- 默认：`layout` 缺省时解析端回退 `'jd'`（本期默认京东版式）——由前端解析函数决定，后端仅存配置、不做默认值渲染。

## 4. 前端设计（Nuxt）

### 4.1 配置解析层 `utils/order-config.ts`（纯函数，SSR 友好）

```ts
export type OrderDetailLayout = 'jd' | 'classic';
export type OrderListLayout = 'card';
export type LocalizedText = string | Record<string, string>;

export interface OrderBlockCfg {
  visible?: boolean;
  title?: LocalizedText;
  text?: LocalizedText;
}
export interface OrderDetailConfig {
  version: number;
  layout?: OrderDetailLayout;
  blocks?: Record<string, OrderBlockCfg>;
}
export interface OrderListConfig {
  version: number;
  layout?: OrderListLayout;
}

const ORDER_DETAIL_BLOCK_KEYS = ['status','progress','redemption','address',
  'items','pickup','totals','shippingBreakdown','meta','actions'] as const;
const ORDER_DETAIL_DEFAULT_VISIBLE: Record<string, boolean> = {
  status:true, progress:true, redemption:true, address:true, items:true,
  pickup:true, totals:true, shippingBreakdown:true, meta:true, actions:true,
};

export function orderDetailLayout(cfg: OrderDetailConfig | null): OrderDetailLayout {
  return cfg?.layout === 'classic' ? 'classic' : 'jd';   // 缺省/非法 → jd（默认京东版式）
}
export function orderListLayout(cfg: OrderListConfig | null): OrderListLayout {
  return 'card';                                          // 本期仅卡片
}
export function orderDetailBlockVisible(cfg: OrderDetailConfig | null, key: string): boolean {
  return cfg?.blocks?.[key]?.visible ?? ORDER_DETAIL_DEFAULT_VISIBLE[key] ?? true;
}
export function parseOrderDetailConfig(raw: string | null | undefined): OrderDetailConfig | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (typeof d !== 'object' || d === null) return null;
    return d as OrderDetailConfig;
  } catch { return null; }
}
export function parseOrderListConfig(raw: string | null | undefined): OrderListConfig | null {
  if (!raw) return null;
  try { const d = JSON.parse(raw); return (typeof d === 'object' && d) ? d as OrderListConfig : null; }
  catch { return null; }
}
// 文案兜底链：当前 locale → defaultLocale → 首个值 → ''（由块内建占位/i18n 兜底）
export function localizeOrderText(text: LocalizedText | undefined | null, locale: string, defaultLocale = 'zh-CN'): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  return text[locale] ?? text[defaultLocale] ?? Object.values(text)[0] ?? '';
}
```

> 注：`localizedText` 后续可复用 `utils/detail-config.ts` 的 `localizeText`（可选合并），此处独立定义以隔离订单语义。

### 4.2 Composables

`composables/useOrderDetailConfig.ts`（仿 `useDetailConfig`）：

```ts
export function useOrderDetailConfig() {
  const { data } = useAsyncData("order-detail-config", async () => {
    const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
    return res.data.value?.activeChannel?.customFields?.orderDetailConfig ?? null;
  }, { server: true });
  const config = computed<OrderDetailConfig | null>(() => parseOrderDetailConfig(data.value ?? null));
  const layout = computed<OrderDetailLayout>(() => orderDetailLayout(config.value));
  const visible = (key: string) => orderDetailBlockVisible(config.value, key);
  return { config, layout, visible };
}
```

`composables/useOrderListConfig.ts`：同构读取 `activeChannel.customFields.orderListConfig`，返回 `{ config, layout }`（本期 layout 恒 `'card'`）。

> SSR 去重：`GetChannelTheme` 与详情页/核销等共用同一查询，确认 `useAsyncData` key 不冲突（详情页现有读取在 `product-detail`，订单用独立 `order-*-config` key）。

### 4.3 详情渲染器与版式

- `components/order/OrderDetailRenderer.vue`：
  ```vue
  <script setup>
  import OrderDetailClassic from "./OrderDetailClassic.vue";
  import OrderDetailJd from "./OrderDetailJd.vue";
  import { useOrderDetailConfig } from "../../composables/useOrderDetailConfig";
  const { layout, config } = useOrderDetailConfig();
  </script>
  <template>
    <component :is="componentMap[layout] ?? OrderDetailJd" :config="config" />
  </template>
  ```
  (componentMap: `classic:OrderDetailClassic`, `jd:OrderDetailJd`，缺省回退 `OrderDetailJd`)

- **`OrderDetailClassic.vue`** = 现 `[code].vue` 的 `<main>` 内容整体迁入，保持固定结构作为**备用/回归基线**；接收 `order`、`refresh`、售后 Modal 等由外层页传入。

- **`OrderDetailJd.vue`** = 京东积木版式（默认）：用 `useOrderDetailConfig().visible(key)` 控制每块显隐，逐块渲染：
  `Status`→`Progress`→`Redemption`→`Address`→`Items`→`Pickup`→`Totals`+`ShippingBreakdown`→`Meta`→`Actions`。

- **`[code].vue` 改造成引渲染器**：保留取数 `GetOrderByCode`、`applyModalOpen` 售后态、`isPickup` 判定在页面层，模板瘦身为：
  ```vue
  <OrderDetailRenderer v-if="order" :order="order" :refresh="refresh" :apply-state="{ applyLine, applyModalOpen, onApply }" />
  ```
  其中 `OrderDetailJd/Classic` 内部按 `visible` 拼装，售后 Modal 统一在页面层（不重复挂载）。

### 4.4 块级组件（L3 定制入口）

为京东版式把现有 Order* 组件以「块」形式复用/薄封装，统一接收 `block?: OrderBlockCfg` prop（供 title/text/后续样式字段），并在块内内置默认文案/样式兜底：

| 块（`components/order/`） | 复用/来源 | 阻塞定制字段 |
|---|---|---|
| `OrderDetailStatusBlock.vue` | `OrderStatusBanner` | title/text/visible |
| `OrderDetailProgressBlock.vue` | `OrderProgress` | visible |
| `OrderDetailRedemptionBlock.vue` | `OrderRedemptionCard` | title/text/visible |
| `OrderDetailAddressBlock.vue` | `OrderAddress` + 现有卡片未封装 | title/visible |
| `OrderDetailItemsBlock.vue` | `OrderItems`（含售后插槽） | title/visible |
| `OrderDetailPickupBlock.vue` | `OrderPickupCard`（isPickup 显隐） | visible |
| `OrderDetailTotalsBlock.vue` | `OrderTotals` + `OrderShippingBreakdown` | visible |
| `OrderDetailMetaBlock.vue` | `OrderMetaCard` | title/visible |
| `OrderDetailActionsBlock.vue` | `OrderActions` | visible |

> 命名：Nuxt 目录前缀注册，`components/order/OrderDetailXxxBlock.vue` → `<OrderDetailXxxBlock>`；模板必须用完整注册名避免 SSR 渲染为空注释（hydrate mismatch）。

### 4.5 列表渲染器

- `components/order/OrderListRenderer.vue`：封装现 `OrderTabBar + OrderCardList`，读 `useOrderListConfig().layout`（本期 `'card'` 恒定），页内保持不变。为未来 `classic/table` 等版式预留分支。

### 4.6 i18n

- 新增词条（zh-CN / en-US 同步）：块默认 title 相关（若用文案）、渲染器无订单/兜底提示。沿用现有 `messages.order.*`。

## 5. 数据流 / 错误处理

- **数据流**：页面取数 `GetOrderByCode` → `OrderDetailRenderer`（读配置选版式）→ 块按 `visible` 拼装；列表 `GetOrderHistory` → `OrderListRenderer` → `OrderCardList`。
- **错误处理**：坏 JSON / 缺字段 → 解析返回 `null` → `orderDetailLayout` 回退 `'jd'`、`orderDetailBlockVisible` 回退内建/`true`、文案回退 i18n，**任何情况下不因配置导致页面崩溃或区块消失**。
- **无订单**：沿用页面层现有 `UError` 404 分支。

## 6. 测试与交付

- **单元测试**（前端，`order-config.spec.ts`）：坏 JSON→null；layout 缺省/非法→`'jd'`；`'classic'` 透传；块显隐兜底（定制→内建→true）；`localizeOrderText`（locale→default→首值→''）。
- **构建/类型**：`npx nuxt prepare` 生成新增 GQL 字段类型；`pnpm build` 通过。
- **手机截图**（390×844, dpr=2）：订单详情 `jd` 版式（含核销码卡）与 `classic` 版式各一张；列表页卡片一张；补入操作手册。
- **回归**：现有订单详情（售后 Modal、取消/再购、自提单提货码）在两版式下均正常；切换配置字段后版式即时生效。
- **部署**：本地构建→push→服务器 `git pull` + `pm2 restart`（前端 `deploy.mjs`；后端 cjk-plugin dist 纳入 `_deploy.ps1`）。

## 7. 范围外（本阶段不做）

- 订单列表的 `classic`/表格等多版式（本期渲染器仅封装不改视觉；未来扩展）。
- L3 完整样式字段（fontScale/imageWidth/radius 等），本期沿用详情页预留口径，先做 `visible/title/text`。
- 门店扫码核销坐席界面（仍走输入码核销）。

## 8. 关联文件

**后端（cjk-plugin）**
- 改：Channel 自定义字段配置新增 `orderDetailConfig`/`orderListConfig`；`plugin.ts` 注册；确保 `GetChannelTheme` 下发（如该查询自定义字段选择器需要补列，则改相应 `customFields` 配置）。
- 改：`_deploy.ps1`（已有 cjk-plugin，无需新增）。

**前端（nshop, layers/base）**
- 新：`utils/order-config.ts`、`composables/useOrderDetailConfig.ts`、`composables/useOrderListConfig.ts`、`components/order/OrderDetailRenderer.vue`、`components/order/OrderDetailClassic.vue`、`components/order/OrderDetailJd.vue`、`components/order/OrderListRenderer.vue`、块组件 `components/order/OrderDetail*Block.vue`、`order-config.spec.ts`。
- 改：`pages/account/orders/[code].vue`（引渲染器）、可选 `pages/account/orders/index.vue`（引列表渲染器）、Channel customFields GQL 类型（`GetChannelTheme`）。
- 新（测试）或现有：`graphql.schema.json` 补新 customFields 字段（`npx nuxt prepare` 必要时手动补）。