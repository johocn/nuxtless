# 商品详情页修复设计（图片 / 促销 / 就近库存 / 营销标签 / 面包屑 / 底部栏）

> 日期：2026-09-13 ｜ 范围：nshop C 端详情页 + vendure 后端 + web-admin
> 触发页：`https://www.youshop.cn/t2/product/国信南山温泉节假日房间`、`/温泉门票`

## 0. 目标

修复商品详情页 6 个问题，全部改动不改变现有风格/颜色/组件模块，仅涉及数据链路与文字布局：

1. 商品图片「后台多图前端不全」——保障后端返回几张就展示几张，缩略图可完整查看
2. 促销方案从运营后台选择设置（频道默认 + 商品覆盖）
3. 就近商品库存无法显示——无定位时按城市兜底
4. 营销标签显示在商品图片上（A 角标叠层）
5. 面包屑分类层级错误——取首个顶级分类
6. 底部导航栏文字变形——仅保留「返回 / 首页 + 加入购物车 / 立即购买」，窄屏保留返回

## 1. 现状与根因

| # | 问题 | 根因（已实证） |
|---|---|---|
| 1 | 图片显示不全 | 前端 `galleryAssets`（`layers/base/stores/useProductStore.ts`）全量渲染后端 assets，无截断；缩略图条 `max-w-xs`(320px) + 卡片 `overflow-hidden`（`components/product/ProductGallery.vue`）在图片多时裁切尾部缩略图；线上门票商品后端实际仅关联 1 张图（web-admin 显示 9 图与商品关联数不一致 → 数据挂载层需核对） |
| 2 | 促销写死 | 促销条/服务保障是固定 i18n 文案（`messages.detail.promoItems` / `serviceItems`），`PromoBlock.vue`/`ServiceBlock.vue` 支持 `text` prop 但版式未传参；`DetailConfig` 为渠道级 JSON（`Channel.customFields.detailConfig`）且 web-admin 无编辑入口 |
| 3 | 就近库存无法显示 | `components/product/NearbyStores.vue` 无定位坐标即早退显示「开启定位可查看就近库存」，即使已选城市也不查询；后端 `variantNearbyStock(productId, variantId, lat, lng, city)`（inventory-plugin）已支持 city |
| 4 | 营销标签无显示 | 后端 `Product.customFields.marketingTags`（JSON 字符串数组，存 code，public）已存在且 web-admin 商品表单可配置，但 C 端 gql（`layers/base/gql/fragments/product.gql`）未查询、前端零渲染 |
| 5 | 面包屑层级错 | `utils/getProductTrail.ts` 把商品所属全部 collections 扁平链式渲染；温泉门票同时属于「休闲娱乐」「特色」两个顶级分类 → 错显「首页 > 休闲娱乐 > 特色」；对照 `utils/getCategoryTrail.ts`（分类页）正确查 menuCollections 树 |
| 6 | 底部栏变形 | `components/product-detail/ProductDetailBottomBar.vue`：左 4 列导航（首页/分类/购物车/我的 图标+文字）+ 右双按钮（icon+「加入购物车」「立即购买」），390px 屏宽下按钮内容溢出，文字竖排被裁切（已手机视口截图实证） |

## 2. 设计

### §1 商品图片（后端返回几张展示几张）

**改动文件：**
- `layers/base/app/components/product/ProductGallery.vue`
- `layers/base/stores/useProductStore.ts`（如需要）
- web-admin `components/ProductForm.vue`（图片区显示已关联数量）
- 新增核对脚本 `tmp/verify-product-images.py`

**设计：**
1. 缩略图条改为可横滑：容器去 `max-w-xs` 固定宽，改 `overflow-x-auto` + 隐藏滚动条 + `snap-x`（CSS `no-scrollbar`），图多时完整滑动查看，不再裁切。
2. 轮播大图左上角加 `n/m` 角标（当前第 n 张 / 共 m 张），跟随 `activeIndex` 更新。
3. 前端保持全量渲染（现状已满足，不改 `galleryAssets` 合并逻辑）。
4. web-admin 商品表单图片区显示「已关联 N 张」提示（读商品 `assets.length`），上传后明确挂载；提供核对脚本对比 web-admin 关联数与 shop-api 返回数，定位「后台多图、商品少图」的数据挂载问题。
5. 不做：轮播/灯箱数量限制（现状无限制，不需要）。

### §2 促销方案（频道默认 + 商品覆盖）

**数据模型：**
- 后端（vendure）：
  - `Product.customFields` 新增 `promos`（text，JSON 字符串数组，如 `["freeShip99","refund7"]`）与 `services`（text，JSON 字符串数组，如 `["genuine","fastShip"]`），`public: true`——注册于 marketplace-plugin `src/custom-fields.ts` Product 段（与 marketingTags 同处）。
  - `Channel.customFields` 新增方案库 `promoSchemes`（text，JSON 数组 `[{code, text:{zh_Hans,en}}]`）与 `serviceSchemes`（同构），`public: true`——注册于 dev-server `dev-config.ts` customFields Channel 段（与 detailConfig 同处）。
- web-admin：
  - 频道设置页新增「促销方案库 / 服务保障库」编辑（勾选启用方案 + 编辑多语文案）。
  - 商品表单新增「促销方案」「服务保障」多选（选项来自频道方案库，可自定义 code），提交 `promos`/`services`。
- 前端：
  - gql `ProductDetailFragment` 补 `customFields { promos services }`；context.gql 的 `GetChannelTheme` 补 `promoSchemes serviceSchemes`。
  - `PromoBlock.vue`/`ServiceBlock.vue` 渲染回退链：**商品 promos/services → 频道方案库文案 → 现有 i18n 兜底**（当前固定文案不破坏）。
  - 纯函数解析 JSON（SSR 友好，坏 JSON 返回 null 逐级回退），参考 `useDetailConfig` 解析风格。

### §3 就近库存（city 兜底）

**改动文件：** `layers/base/app/components/product/NearbyStores.vue`

**设计：**
1. 无定位坐标但有已选城市（`locationStore.city`）→ 调 `variantNearbyStock(city)` 按城市查询，显示城市内就近门店库存。
2. 无坐标且无城市 → 保留现有「开启定位可查看就近库存」引导。
3. 后端 `variantNearbyStock` 无需改动（已支持 city 参数）。

### §4 营销标签（A 角标叠层）

**改动文件：**
- `layers/base/gql/fragments/product.gql`（补 `marketingTags`）
- `layers/base/app/components/product/ProductGallery.vue`（主图 + 灯箱角标）
- i18n 语言包（zh-CN / en-US 同步补 tag 文案映射）

**设计：**
1. gql `ProductDetailFragment` 补 `customFields { marketingTags }`。
2. `ProductGallery` 主图左上角竖排角标：`marketingTags`（code 数组）→ 映射文案（i18n 字典 `messages.detail.marketingTags.<code>`，如 `new→新品`、`hot→热卖`、`refund7→7天无理由退换`）→ 渲染 brand pill（`--brand` 底白字或品牌浅底深字，逐条竖排）。
3. 无标签或 code 无映射时不渲染；未知 code 跳过（不回退英文）。
4. 灯箱（PhotoSwipe）大图同步显示角标。

### §5 面包屑（取首个顶级分类，避免同级分类伪层级）

**改动文件：** `layers/base/app/utils/getProductTrail.ts`

**现状根因（用户追加问题：温泉门票）：**
- 数据层：温泉门票被关联到**两个同级顶级分类**——休闲娱乐、特色（探针 `probe-menu-tree.py` 实证：两者 `parent` 均为 `__root_collection__`，在菜单导航中也是同级平铺）。
- 现有 `getProductTrail` 将 `product.collections` **全部平铺**渲染：`首页 > 休闲娱乐 > 特色 > 温泉门票`，chevron 分隔符形成"特色是休闲娱乐下级"的伪层级误导。
- 同时实证：t2 渠道 `GetMenuCollections`（topLevelOnly）实际只返回 4 个顶级（数码电子/家居生活/个人护理/食品饮品），休闲娱乐/特色不在菜单树中，因此**必须依赖商品 collections 的 parent 字段判定顶级**，不能只查菜单树。

**设计：**
1. 顶级判定：`collection.parent` 为空 或 `parent.slug === "__root_collection__"` → 该 collection 自身即顶级；否则沿 parent 链向上取顶级（当前商品 gql 仅取一级 parent，必要时在 fragment 中补 `parent.parent`）。
2. 优先级选首个：
   - ① 菜单树（`useState("menuCollections")`）中命中（顶级或 children 命中的顶级）→ 按菜单树顺序取第一个命中；
   - ② 菜单树不可用/未命中 → 按 `product.collections` 返回顺序取**第一个**顶级分类。
3. 只渲染**一个**顶级分类作为面包屑中间项（「首页 > 顶级 > 商品」；顶级有子链时逐级展开）。同级的其他顶级分类**不再追加**，杜绝伪层级。
4. 效果：温泉门票 → `首页 > 休闲娱乐`（与分类页 `getCategoryTrail` 逻辑一致，与菜单导航同级关系一致）。

### §6 底部导航栏（仅文字布局调整，风格颜色模块不变）

**改动文件：** `layers/base/app/components/product-detail/ProductDetailBottomBar.vue`

**设计（已确认）：**
1. 移出「分类 / 购物车 / 我的」导航项；购物车角标逻辑随之移除（顶栏已有购物车入口）。
2. 宽屏（视口 ≥375px）：`[返回] [首页] | [加入购物车] [立即购买]`，导航项沿用 icon+文字竖排样式，按钮 icon 16px + 文字 13px，`white-space: nowrap` 不换行。
3. 窄屏（视口 <375px）：仅保留 `[返回]`（推荐：详情页从列表进入返回更常用，首页可点顶栏品牌 Logo）+ 双按钮，按钮空间更充裕。
4. 断点：CSS `@media (max-width: 375px)` 控制首页项显隐（`hidden sm:flex` 或媒体查询类）。
5. 不变：按钮颜色（secondary/primary）、双按钮逻辑（`useBuyActions`）、导航跳转逻辑（`useTenantLocalePath`）。

## 3. 非目标（本次不做）

- 不改变详情页整体版式/风格/颜色体系（三版式渲染器、DetailConfig 结构不动）。
- 不做购物车/我的/分类 Tab 的重构（仅从详情页底栏移除）。
- 不做营销标签的标签管理后台（沿用 web-admin 现有 marketingTags 配置 + i18n 映射）。
- 不引入新的图片存储/裁剪方案。

## 4. 验收要点

1. 商品 ≥6 图时缩略图条可横滑完整查看，大图角标显示 `n/m`；web-admin 图片区显示「已关联 N 张」。
2. web-admin 频道设置可维护促销/服务方案库；商品表单可多选促销方案与服务保障；C 端促销条/服务保障按「商品 → 频道 → i18n」回退显示。
3. 无定位但有城市时，就近库存显示城市内门店与库存；无城市显示定位引导。
4. 商品设置 marketingTags 后，主图左上角竖排角标显示；灯箱同步；无标签不显示。
5. 温泉门票面包屑显示 `首页 > 休闲娱乐`。
6. 手机视口（390×844 / 320 视口）底栏：宽屏含返回+首页，窄屏仅返回；双按钮文字不换行、不变形；原文案「加入购物车 / 立即购买」保留。
7. 每次功能测试用手机浏览视图截图（390×844，dpr=2）并补充到操作手册。

## 5. 参考文件

- `layers/base/app/components/product/ProductGallery.vue`、`components/product/NearbyStores.vue`
- `layers/base/app/components/product-detail/{PromoBlock,ServiceBlock,ProductDetailBottomBar}.vue`
- `layers/base/app/utils/{getProductTrail,getCategoryTrail,detail-config}.ts`
- `layers/base/gql/fragments/product.gql`、`layers/base/gql/queries/context.gql`
- vendure `packages/marketplace-plugin/src/custom-fields.ts`、`packages/dev-server/dev-config.ts`
- web-admin `src/components/ProductForm.vue`、`src/apis/product.ts`
