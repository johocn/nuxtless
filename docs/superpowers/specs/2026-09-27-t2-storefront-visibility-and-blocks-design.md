# t2 前台可见性修复 + 「热门/推荐商品」装修积木 — 设计文档

> 日期：2026-09-27
> 范围：`d:\zhao\nshop`（Nuxt 前台，含 `layers/base`）、`d:\zhao\vshop\web-admin`（装修后台）、`d:\zhao\vendure`（`packages/cjk-plugin`，一处只增不删的 GQL 字段）
> 前置：`2026-09-19-home-filter-language-city-delivery-design.md`（首页城市·配送过滤体系）、`2026-09-19-inventory-system-alignment-and-warehouse-admin-design.md`（仓库 serviceCities 与城市口径）、模板开发规范「多语言 / 多城市 / 四级回退 / 积木式 UI」
> 观察环境：**线上生产站点**（用户确认）
> 参考落地实现：`layers/base/app/components/product-detail/`（详情页多版式构建器）

## 0. 决策基线（用户已确认）

| 决策          | 结论                                                                         |
| ----------- | -------------------------------------------------------------------------- |
| 观察环境        | **线上生产站点**（`https://www.youshop.cn`，t2 = 渠道 `66ruvnhh34svhckaa2i`，「二月兰会员」） |
| ① 首页空白的过滤口径 | **未选城市时不过滤（放行）**                                                           |
| ① 热门/推荐形态   | **后台可配楼层 + 自动兜底**                                                          |
| ② 分类看不见     | 必须修好（全站性问题，非 t2 独有）                                                        |
| ③ 点商品不进详情   | 首页空楼层的表象 + 2 处真断链一并修                                                       |
| ④ 酒店变体      | **房间商品补齐房型并走酒店版式**                                                         |
| ④ 库存        | 用户描述的现象是「点击商品链接，商品详情页不出现，无反应」；**取证显示库存侧无坏点，故不改库存逻辑**                       |
| 本轮收口范围      | **五项全做**                                                                   |
| ⑤ 热门/推荐配置落点 | **装修积木新增两种区块**（`ShopSection` 增 `hot` / `recommend`）                        |
| ⑤ 区块版式      | **A / B / C 三种都实现**，后台每区块可选 `layout`，**默认 A（compact）**                     |
| 城市取值口径      | **按配送能力推导城市列表**                                                            |
| 交付          | 实现 + API/e2e 回归 + **手机浏览视图截图（390×844 / dpr=2）** 进操作手册 + 操作手册/测试用例文档更新      |

### 0.1 不做项（有意排除）

| 不做                      | 理由                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| 改库存 / 上架逻辑              | 线上取证：t2 八个商品变体 `stockLevel` 全为 `IN_STOCK`，前台「能否买」只看 `stockLevel` / `saleable`，不参与「能否看见」判定；无坏点可修 |
| 在**所有页面** SSR 预取分类      | `GetMenuCollections` 后端实测 3.5–4.5s，全站 await 会让 TTFB 回到 4.5–6s、破坏微信链接预览；仅首页/分类页加「带超时护栏」的预取       |
| 推荐算法（个性化推荐引擎）           | 系统无推荐引擎；「推荐商品」= 后台指定集合/商品 + 自动序去重兜底，不虚构算法                                                       |
| 重画 `JdProductGrid` 现有视觉 | 兜底楼层（无装修配置时）保持现状，零回归                                                                            |

## 1. 现状（代码事实）

### 1.1 首页双层结构

* **装修积木层**：`useShopContent()` → `pageConfig("home").sections` → `HomeBlockRenderer`（`sections.length > 0` 时生效）。

  * 区块 type 现状：`banner | notice | nav | goods | richText`（`layers/base/app/utils/shop-content.ts:28`）。

  * 渲染映射：`layers/base/app/components/home/HomeBlockRenderer.vue:13-19` 的 `componentMap`。

* **京东兜底层**：`hasBlocks === false` 时由 `app/pages/index.vue:264-286` 渲染分类导航 + 宫格 + 商品楼层；楼层数据来自 `useAsyncData("home-fallback-search")`（`app/pages/index.vue:90-139`），返回 `{ hot: 前10, more: 10..20 }`。

* `hasBlocks === true` 时**不发**兜底搜索（守请求数红线，`app/pages/index.vue:93`）。

### 1.2 城市·配送可见性

* `isProductVisible()`（`layers/base/app/utils/productVisibility.ts:32-50`）：

  * `map()` 用**精确相等**比对 `serviceCities`（L43）；

  * `canPickup` 要求 `!!belongCity && ctx.city === belongCity`（L48）→ **未选城市时恒 false**。

* `useCityService.getServiceInfo()`（`layers/base/app/composables/useCityService.ts:30-31`）：匹配用**精确 + 前后缀包含** → 与上者口径分叉。

* 后端同语义实现：`vendure/packages/cjk-plugin/src/inventory/stock-city-filter.ts:5-15` 的 `cityServes`（未配置 = 全城可服务；精确/含前缀/含后缀）。

* 单能力渠道锁定：`JdProductGrid.vue:37-38` 的 `lockedMode` 把模块配送锁成渠道唯一能力（t2 → `SELF_PICKUP`）。

* 渠道能力真源：`channelDeliveryCapability.bothSupported`（后端 `shipping/delivery-capability.ts`；能力来自 `ShippingProfileMethod.mode`，不是商品/仓库手工字段）。

### 1.3 分类取数

* `app/app.vue:72-84`：`useAsyncData("menuCollections", async () => { const res = await useAsyncGql("GetMenuCollections"); ... }, { server:false, lazy:true })`，随后 `watchEffect` 写回 `useState("menuCollections")`，供 Header / Footer / 首页分类导航消费。

* 首页 `app/pages/index.vue:30-33` 读同一 `useState`；分类区以 `v-if="topCategories.length"` 控制显示。

* 仓库既有教训（`app/pages/index.vue:54-59`）：**单个** **`useAsyncData`** **handler 内连续 await 多个 Nuxt composable 会丢 Nuxt 实例上下文**，该仓库的既定解法是在 setup 顶层捕获 `useGql()` 返回的原始 client（`rawGql`）。

### 1.4 详情页版式判定

* `ProductDetailRenderer.vue:23-26`：`layout === 'hotel'` → `DetailHotel`，否则走 `componentMap`；`layout` 来自 `useDetailConfig()` → `pageConfig("product")` → `detail-config.ts:44-53`（**只看** **`detailConfig.layout`**，非法回退 `classic`）。

* `DetailHotel.vue:10-11`：`isHotel = !!parseHotel(productStore.selectedVariant?.customFields.hotelRoomConfig)`；`v-else` 时渲染默认 slot（退回经典版式）。

* 变体字段：`vendure/packages/cjk-plugin/src/hotel/hotel-custom-fields.ts` —— `hotelRoomConfig`，type `text`（Vendure 3.6 无 json 字段类型，存 JSON 字符串），`public: true`。

### 1.5 城市列表数据源

* `CitySelector.vue:36-51`：省/市两级全部来自 `mapDistricts`（高德行政区），与「本站实际能履约的城市」无关联。

* 自提点实体 `pickup/pickup-location.entity.ts:43-46` 已有 `province` / `city` / `district` / `street` 列。

* Shop API 有 `pickupLocations(type, lat, lng)`（`pickup/pickup-location-shop.resolver.ts:14-29`），但 GQL 类型 **未暴露** `province/city/district`（`plugin.ts:1842-1855`）。

### 1.6 线上取证（只读探针，未改任何数据）

| 项                                  | t2 渠道                                                                                                   | 默认渠道（对照）               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------- |
| `activeChannel`                    | id 37，code `t2`                                                                                         | 默认                     |
| `search(term:"")`                  | `totalItems = 8`（59 温泉门票 / 60 节假日房间 / 61 工作日房间 / 71 节假日门票 / 73 洗车 / 76 黄金珠宝 / 77 倒胎 / 79 机油）            | 有商品                    |
| `collections(topLevelOnly)`        | 3（休闲娱乐 14 / 养车 16 / 日常用品 17）                                                                            | 4                      |
| `channelDeliveryCapability`        | `bothSupported = false`，`facetValueIds = {MAIL:"8", SELF_PICKUP:"9"}`                                   | `bothSupported = true` |
| `resolveShippingMethodsForChannel` | 门店自提(id1) + 二月兰门店(id30)                                                                                 | Courier Delivery       |
| `customFields`                     | `themeId=taobao-orange`，`templateId=1`，`detailConfig={"layout":"classic",...}`，**`shopContent = null`** | —                      |
| 变体 `stockLevel`                    | 八个全 `IN_STOCK`                                                                                          | —                      |
| `hotelRoomConfig`                  | 仅**门票**商品 59 的变体 57 有值；房间商品 60/61 全 `null`                                                              | —                      |
| 首页 hydrated DOM                    | 商品卡 0 个、「当前城市/配送方式下暂无可用商品」2 处                                                                           | 正常                     |
| `GetMenuCollections` 请求数           | **0**（无 pageerror / console.error）                                                                      | **0**（同）               |

## 2. 根因

### 2.1 首页空白（①）

```
t2 单能力渠道（仅门店自提）
  → JdProductGrid 的 lockedMode 把配送锁成 SELF_PICKUP
  → 未选城市时 ctx.city = null
  → canPickup 要求 ctx.city === belongCity（恒 false）
  → 8 个商品全部被过滤 → 楼层空 → 「暂无可用商品」
```

默认渠道因 `bothSupported = true` 且默认配送为邮寄，`canMail` 放行，故**只有 t2 这类单能力自提渠道空白**。

### 2.2 分类看不见（②）

根首页与 t2 首页 `GetMenuCollections` **请求数均为 0** 且无任何 console 错误 → 静默失败。产物 JS 中代码存在（含 `server:!1`），故不是构建丢失。头号可疑点：`app/app.vue:72-84` 在**异步 handler 内调用 Nuxt composable**（`useAsyncGql`），与仓库已记录的 `index.vue:54-59` 同类坑一致；其次需排除 `useAsyncData` key 与 `useState` key 同名带来的取数短路。**机制需在实施阶段本地复现确认**（见 §6.3）。

### 2.3 点商品不进详情（③）

* 首页「点击无反应」是①的表象（楼层里没有可点商品）。

* 分类页点击实测**可进详情**（购买按钮正常渲染），说明路由与详情页本身可用。

* 两处真断链：

  1. `RecommendationRow.vue:23` 用复数 `/products/`（路由只有 `/product/[slug]`）→ 404；
  2. slug 为空的商品仍渲染可点卡片 → `href="/product"`，点击必然无反应。

### 2.4 酒店变体（④）

* 数据挂错对象：房型配置被挂在**门票**商品 59 的变体 57 上；真正需要它的房间商品 60/61 是 `null`。

* 版式判定过窄：`ProductDetailRenderer` 只看 `detailConfig.layout`，而 t2 是 `classic`，且判定未参考「该商品是不是酒店房型」。

### 2.5 库存（⑤）

无坏点：`stockLevel` 全 `IN_STOCK`，前台可用性判定只消费 `stockLevel` / `saleable`，不参与可见性过滤。用户感知的「失效」实为 ①③ 的叠加。

## 3. 设计

### 3.1 城市匹配单一真源（新增）

新增纯函数模块 `layers/base/app/utils/city-match.ts`：

* `normalizeCity(name)`：trim + 去行政后缀（省 / 市 / 区 / 县）——复用既有先例 `AmapRegionSelect.vue:40` 的归一化做法（「北京市」↔「北京」）。

* `matchCity(a, b)`：归一化后 精确相等 ∨ 前缀包含 ∨ 后缀包含（与后端 `cityServes` 同语义）。

* `matchAnyCity(list, city)`：`serviceCities` 型数组匹配；空数组 / 非数组视为「不限制」。

消费方（三处同源）：

1. `productVisibility.ts`（前端可见性）；
2. `useCityService.ts:30-31`（服务城市判定）；
3. 后端 `stock-city-filter.ts` **不改**（已同语义，作为参照对齐）。

### 3.2 可见性判定口径（①）

`isProductVisible()` 重写为「只排除**已知**不可达」，判定顺序：

| 条件                                    | 结果                                                             |
| ------------------------------------- | -------------------------------------------------------------- |
| `ctx.city` 为空                         | **放行**（不做城市维度判定）                                               |
| `ctx.deliveryFilteredServer === true` | 只做城市维度判定（配送已由服务端 facet 过滤）                                     |
| `ctx.delivery === 'SELF_PICKUP'`      | `belongCity` 为空 → 放行；否则 `matchCity(belongCity, city)`          |
| `ctx.delivery === 'MAIL'`             | `serviceCities` 为空 → 放行；否则 `matchAnyCity(serviceCities, city)` |

保持不变的：

* **配送维度不做本地判定**（单能力渠道仍锁定唯一方式、不渲染选择框）；

* 服务端 facet 过滤仍只在双能力渠道启用（`app/pages/index.vue:96-97` 逻辑不动）。

### 3.3 分类取数（②）

1. `app/app.vue` 的分类取数改为：setup 顶层 `const rawGql = useGql()`，handler 内 `await rawGql("GetMenuCollections")`（普通 async 函数，不依赖 Nuxt 实例上下文）；失败时 `console.warn` + **重试一次**；仍失败则该轮放弃（维持 `v-if` 自然隐藏，不渲染空壳）。
2. **首页 / 分类页 SSR 预取**：新增 `useMenuCollections()`（单一 composable，SSR + 客户端共享同一 `useAsyncData` key，客户端不再重复请求），内部带 **800ms 超时护栏**（`Promise.race` + `AbortController`）：超时视为无数据，由客户端填充。其它页面不加预取（避免 TTFB 回归）。
3. `useState("menuCollections")` 仍是唯一消费入口（Header / Footer / 首页导航读它），不改消费方契约。

### 3.4 断链（③）

* `RecommendationRow.vue:23`：`/products/` → `/product/`。

* 商品卡渲染口径：**无 slug 的商品不渲染可点卡片**（在归一化步骤过滤，并 `console.warn` 一次，便于运营发现数据问题）。适用于 `JdProductGrid`、新 `HotGoodsBlock` / `RecommendGoodsBlock`、`RecommendationRow`。

### 3.5 酒店变体（④）

**数据侧**（Vendure）：

* 给房间商品 **60 / 61** 的各变体补齐 `hotelRoomConfig`（JSON 字符串，字段结构对齐 `hotel/hotel-config.ts` 的 schema：房型名 / 床型 / 面积 / 早餐 / 可住人数 / 取消政策 / 价格日历等）。

* **清理门票商品 59 的变体 57** 上误挂的 `hotelRoomConfig`（置 `null`）。

* 落地方式：复用 room-template 的种子逻辑（`room-template-seed-logic.ts`）+ 幂等脚本（可复跑，重复执行结果一致）；先备份目标变体的原值再写入。

**前端侧**（版式命中）：

* 版式判定改为「**该商品的任一变体存在** **`hotelRoomConfig`** **→ 命中** **`hotel`** **版式**」，用 `variants.some(...)` 而非 `productStore.selectedVariant`（SSR 与 CSR 判定一致，避免 hydration mismatch）。

* `DetailHotel.vue` 的 `isHotel` 同步改用同一判据（同一纯函数，两处调用）。

* `detailConfig.layout` 保留为**后台显式覆盖项**：显式配置了非 `hotel` 的 layout 且商品含房型时，以配置为准（后台可覆盖），默认（未配置 / `classic` 且商品含房型）自动命中 hotel。

### 3.6 「热门商品 / 推荐商品」装修积木（⑤）

**Schema（`layers/base/app/utils/shop-content.ts`）**

```ts
export type GoodsCardLayout = 'compact' | 'sliding' | 'hero'; // A | B | C，默认 compact

export interface HotGoodsSection {
  type: 'hot';
  title?: LocalizedText;
  source?: 'auto' | 'collection';   // 默认 auto
  collectionId?: string;
  limit?: number;                   // 默认 10，上限 30
  layout?: GoodsCardLayout;
}

export interface RecommendGoodsSection {
  type: 'recommend';
  title?: LocalizedText;
  source?: 'auto' | 'collection' | 'slugs'; // 默认 auto
  collectionId?: string;
  slugs?: string[];
  limit?: number;                   // 默认 10，上限 30
  layout?: GoodsCardLayout;
  dedupe?: boolean;                 // 默认 true：排除同页 hot 区块已展示的 productId
}

export type ShopSection = ... | HotGoodsSection | RecommendGoodsSection;
```

**前端**

* `HomeBlockRenderer.vue` 的 `componentMap` 注册 `hot` / `recommend`。

* 新增 `layers/base/app/components/home/blocks/HotGoodsBlock.vue`、`RecommendGoodsBlock.vue`：各自解析 section 配置（缺省兜底），取数交给共享 composable `useCuratedGoods()`，渲染交给共享展示组件 `GoodsCardBlock.vue`（按 `layout` 三分支：`compact` 复用现有 `JdProductGrid` 视觉；`sliding` 横滑，右侧留出下一张的露出；`hero` 一大二小）。

* 同页去重：`useState('home-shown-product-ids')` 累积已展示 productId，`recommend` 默认排除。

**取数口径（城市 / 语言 / 配送都考虑）**

* 语言：标题走 `LocalizedText` 回退链（当前 locale → defaultLocale → 首个值 → i18n 字典）；商品名沿用现有 `?languageCode` 机制（`app/app.vue:14`）。

* 城市 / 配送：与兜底楼层**完全一致**的双层口径 —— 服务端按渠道能力做 facet 过滤（仅双能力渠道，`deliveryFacetFilter`）+ 客户端 `isProductVisible` 后置过滤（§3.2 修复后的口径）。取数返回后需补商品主数据 `customFields`（复用 `app/pages/index.vue:112-134` 的做法：`SearchProducts` → `GetProductsByIds`）。

* 自动兜底：`source='auto'` → `SearchProducts`（与兜底楼层同源）；`source='collection'` → 该集合商品；`source='slugs'` → 按 slug 取指定商品。

* 装修层存在时**不额外**触发兜底楼层的 `home-fallback-search`（维持现状）。

**后台（web-admin）**

* `src/templates/shared/schema.ts`：新增 `HotGoodsSection` / `RecommendGoodsSection` 接口（该工程无 `LocalizedText`，标题用 `string`），`VALID_TYPES` 增 `hot` / `recommend`，`isValidShopContent` 补校验（`limit` 若存在须为正整数 ≤30；`layout` 若存在须在枚举内；`source='slugs'` 时 `slugs` 须为字符串数组）。

* `src/pages/decorate/home/index.vue`：`addHot()` / `addRecommend()` 两个按钮 + 配置面板（标题 / 来源 / 集合 ID / 商品 slug 列表 / 数量 / 版式三选一 / 推荐去重开关），`typeLabel()` 增两分支；i18n 文案 zh-CN / en-US **同步补齐**。

### 3.7 城市列表按配送能力推导（⑤）

**后端（只增不删）**

* `plugin.ts:1842-1855` 的 `type PickupLocation` 增 `province: String`（nullable）、`city: String`、`district: String`。

* `layers/base/gql/queries/map.gql` 的 `GetPickupLocations` 增这三个字段。

**前端**

新增 `useAvailableCities()`：

1. 读 `useChannelDeliveryCapability().modes`；
2. **仅自提渠道**（`modes === ['SELF_PICKUP']`）→ 城市 = 该渠道可见 `pickupLocations()` 的 `city` 去重（t2 → 长春市）；
3. **含快递的渠道** → 城市 = 在售商品的 `serviceCities` 聚合；聚合为空则返回空数组表示「不设限」；
4. 结果存 `useState('availableCities')` 共享缓存（SSR 首帧即可用）。

`CitySelector.vue`：把现有「热门城市」区改为「**可用城市**」区（来自 `useAvailableCities`，置顶），其余保持省/市两级选择；可用城市为空 → 退回现状热门城市（不破坏无自提配置的渠道）。

## 4. 错误处理与兜底

| 场景                        | 行为                                                                    |
| ------------------------- | --------------------------------------------------------------------- |
| 分类查询失败 / 超时               | `console.warn` + 重试一次；仍失败则分类区自然隐藏（`v-if`），不渲染空壳                       |
| 热门/推荐区取数失败                | 该区块降级为不渲染（不阻断其它区块）；不写入已展示 productId 集合                                |
| 装修 sections 为坏 JSON / 缺字段 | 沿用既有 `parseShopContent` 返回 `null` → 走京东兜底楼层（现状行为）                     |
| 新字段缺省                     | `source` → `auto`；`limit` → 10；`layout` → `compact`；`dedupe` → `true` |
| 无 slug 商品                 | 过滤掉（不渲染可点卡片）+ `console.warn` 一次                                       |
| 城市匹配                      | 任何一侧为空 → 不判定（放行）                                                      |

## 5. 测试与验收

### 5.1 单元测试（纯函数）

* `city-match`：归一化（北京市/北京、长春市/长春）、精确/前缀/后缀命中、空值、非数组。

* `productVisibility`：未选城市放行；`SELF_PICKUP` 未配 `belongCity` 放行；`MAIL` 空 `serviceCities` 放行；命中/不命中组合；`deliveryFilteredServer` 短路。

* `hot` / `recommend` schema 校验：缺省值、非法 `layout`、`limit` 越界、`slug` 类型。

### 5.2 线上回归（只读探针扩展）

扩展 `scripts/verify-t2-shop.mjs` 为断言模式，覆盖：

1. t2 首页 hydrated DOM 中商品卡 **8 个**、「暂无可用商品」**0 处**；
2. 分类链 **3 项**（休闲娱乐 / 养车 / 日常用品）出现；
3. 分类页点击商品 → 详情页出现购买按钮；
4. 房间商品 60 / 61 命中 **hotel** 版式（房型块渲染），门票商品 59 **不再**命中 hotel。

### 5.3 手机截图（硬规范）

390×844 / dpr=2，至少 5 张并进操作手册：t2 首页（热门 A 版式）、t2 首页（推荐 C 版式）、分类页、酒店详情页、城市选择器。

### 5.4 文档

更新操作手册新增「首页装修：热门 / 推荐商品区块」章节（含后台截图与三版式说明）+ 测试用例文档。

## 6. 改动面清单

| 层                 | 文件                                                                                               | 动作                                        |
| ----------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| nshop utils       | `layers/base/app/utils/city-match.ts`（新）                                                         | 归一化 + 匹配单一真源                              |
| nshop utils       | `layers/base/app/utils/productVisibility.ts`                                                     | 改「只排除已知不可达」                               |
| nshop composables | `layers/base/app/composables/useCityService.ts`                                                  | 复用统一 matcher                              |
| nshop app         | `app/app.vue`                                                                                    | `rawGql` + 重试 + 失败 warn                   |
| nshop composables | `layers/base/app/composables/useMenuCollections.ts`（新）                                           | SSR 预取 + 800ms 超时护栏                       |
| nshop app         | `app/pages/index.vue`、`layers/base/app/pages/category/[slug].vue`                                | 接分类 SSR 预取                                |
| nshop utils       | `layers/base/app/utils/shop-content.ts`                                                          | `hot` / `recommend` 类型 + 缺省兜底             |
| nshop components  | `components/home/HomeBlockRenderer.vue`                                                          | 注册两块                                      |
| nshop components  | `components/home/blocks/HotGoodsBlock.vue` / `RecommendGoodsBlock.vue` / `GoodsCardBlock.vue`（新） | 两种积木 + 三版式展示                              |
| nshop composables | `layers/base/app/composables/useCuratedGoods.ts`、`useAvailableCities.ts`（新）                      | 取数（含城市/语言/配送口径）、城市推导                      |
| nshop components  | `components/home/blocks/RecommendationRow.vue`、`components/home/jd/JdProductGrid.vue`            | 断链修复 + 无 slug 过滤                          |
| nshop components  | `components/product-detail/ProductDetailRenderer.vue`、`DetailHotel.vue`、`utils/detail-config.ts` | 版式自动命中 hotel                              |
| nshop components  | `components/header/CitySelector.vue`                                                             | 可用城市优先                                    |
| nshop gql         | `layers/base/gql/queries/map.gql`                                                                | `GetPickupLocations` 增 city 字段            |
| web-admin         | `src/templates/shared/schema.ts`                                                                 | 类型 + VALID\_TYPES + 校验                    |
| web-admin         | `src/pages/decorate/home/index.vue`                                                              | 两种区块编辑器                                   |
| web-admin         | i18n 语言包                                                                                         | zh-CN / en-US 同步补词条                       |
| vendure           | `packages/cjk-plugin/src/plugin.ts`                                                              | `PickupLocation` 增 province/city/district |
| vendure           | `packages/cjk-plugin/src/hotel/*`（种子/脚本）                                                         | 60/61 补房型、59/57 清误挂                       |

## 7. 已知取舍与风险

| 项                        | 说明                                                                        |
| ------------------------ | ------------------------------------------------------------------------- |
| ② 机制未 100% 定论            | 实施第一步先本地复现「0 请求」并确认机制（必要时运行时插桩），再落修法；若根因与判断不同，按同一目标（分类可靠加载 + 失败可见化）调整实现   |
| SSR 预取超时护栏               | 必须确保超时分支不阻塞 SSR 渲染（`Promise.race` 后立即继续，不 await 超时 promise），否则会引入 TTFB 回归 |
| 酒店版式判定改为 `variants.some` | 若将来出现「同商品混合变体（部分房型部分非房型）」，判定会有歧义；当前数据模型下不存在，记为已知取舍                        |
| 城市列表推导依赖自提点 `city` 数据质量  | 自提点未填 `city` 时该点所在城市不入列表；实施时核对 t2 自提点是否已填「长春市」                            |
| 装修层与兜底层并存                | 装修配置存在时不再发兜底搜索（现状），故「自动兜底」仅在未配置对应区块时于兜底楼层体现；不在装修模式下额外叠加自动楼层（守请求数红线）       |

