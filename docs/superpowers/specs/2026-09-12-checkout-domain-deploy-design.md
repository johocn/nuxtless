# Checkout 领域知识沉淀 + C 端部署 设计

> 日期：2026-09-12
> 状态：设计定稿待审
> 范围：nshop C 端结算页（checkout）领域手册 + 按最新设计文档部署上线

## 1. 背景与目标

- **知识沉淀**：checkout 是高频改动领域（9 份 spec / 8 份 plan / 3+ manual，23 个功能块组件），此前无领域手册。按已建立的 `docs/domains/` 机制（规范见 `docs/domains/README.md`，样板见 `docs/domains/shipping-profile.md`）建 checkout 领域手册，沉淀结算页架构、组件地图、设计决策、坑与 Bug 库。
- **部署**：工作区存在已实现**未提交**的 checkout 产物（对应最新设计文档 `docs/superpowers/specs/2026-09-12-checkout-per-user-refresh-navigation-design.md`：返回按钮、50km 就近、切换用户重置、删硬编码示例、高德导航弹层），需先提交再按 nshop 部署机制（`node scripts/deploy.mjs`，本地构建 `.output` → scp → 服务器 pm2 restart）部署上线，**仅 C 端 nshop**。

## 2. 知识沉淀：docs/domains/checkout.md（7 章）

与配送档案手册的关系：配送档案手册覆盖档案/自提点领域（含 `BoxPickupBlock` 在 C 端的角色）；checkout 手册覆盖**结算页领域整体**（分箱渲染、各功能块、联系人、导航），交叉处互相引用，不重复展开。

### 2.1 概念模型
- 结算页架构：`pages/checkout/index.vue` → `CheckoutRenderer` → 4 种 layout（cn/jd/jd-legacy/回退）→ 23 个功能块组件（`components/checkout/*`）
- 分箱模型：`orderBoxes` 每箱返回 profileId/profileName/type(pickup|delivery)/pickupLocations/availableShippingMethods；物流箱 ↔ 配送方式+地址块；自提箱 ↔ 自提点+联系人一体模块（归属规则见 project_memory「结算页模块归属规则」）
- 关键 composables：`usePerBoxSelection`（每箱选择，按订单结构指纹重建）、`usePickupSelection`（自提选择，可 reset）、`usePickupDefaults`（50km 就近默认）、`usePickupNavigation`（高德导航）、`useGeoLocation`（定位 + AMap SDK 动态加载）、`useLocationStore`/`useOrderStore`（Pinia 持久化）

### 2.2 文件地图（符号级）
- 页面：`layers/base/app/pages/checkout/index.vue`（返回按钮 + `watch(isAuthenticated)` 重置重拉）
- 23 组件清单（`components/checkout/`）逐文件：职责 + 关键导出
- 通用组件：`components/common/AppBackButton.vue`（`router.back()` + 无历史回退）、`components/common/AppPickupNavigationModal.vue`（高德地图弹层，`defineModel("open")`）
- composables/utils/stores：`usePickupDefaults.ts`（`nearbyPickups`）、`usePickupNavigation.ts`（AMap 加载/URI 拼接/容错）、`usePickupSelection.ts`（`resetSelection`）、`usePerBoxSelection.ts`（`resetPerBox`）、`utils/checkout-config.ts`（`PICKUP_RADIUS_KM=50`）、坐标解析 `parseCoordinates`/`haversineKm`
- i18n：`messages.common.back` + 导航词条（zh-CN/en-US 同步）

### 2.3 设计决策（ADR 式）
- 分箱渲染器架构：布局与功能块解耦，4 种版式共用功能块
- 按当前登录用户刷新：`watch(isAuthenticated)` → `resetSelection()` + 重拉分箱/地址簿 + 就近重算
- 50km 就近（Haversine）而非城市字段过滤（自提点无城市字段）
- 导航用 `https://uri.amap.com/navigation?to={lng},{lat},{name}&mode=car` 唤起高德 App（Web 回退网页导航），AMap SDK key 服务端下发不硬编码
- 切换选择状态集中到可 `$reset` 的 composable，而非模块单例

### 2.4 常见坑
- `UModal` 内容必须放 `<template #body>` 插槽（默认插槽不渲染）
- `defineModel` 必须显式声明 name（`defineModel<boolean>("open")`），否则父 `v-model:open` 收不到
- 弹层内模板 ref 不可靠 → 用唯一 `data-` 属性 + rAF 轮询容器就绪（有元素且高度>0）
- `new AMap.Marker({..., map})` 必须传 `map` 参数才挂载
- Playwright `get_by_text(exact=True)` 命中切换器内层名字 span（点选=选 radio 非导航）；触发导航点概览区名称或 `get_by_role("button", name="导航")`
- 本地 dev 商品详情页 `defineOgImage` client-only 500（nuxt-og-image，仅本地路径），加购绕过用同源 fetch `/shop-api`
- 返回按钮默认回退地址从 `/cart` 修正为 `/`（无浏览历史时）

### 2.5 Bug 知识库（现象→根因→代码点→回归）
| 现象 | 根因 | 代码点 | 回归 |
|---|---|---|---|
| 导航弹层仅剩标题栏 | 内容放默认插槽未放 `#body` | `AppPickupNavigationModal.vue` | 手机截图 s2 |
| 地图永不初始化 | `defineModel` 未声明 name，`watch(open)` 恒 false | 同上 | 手机截图 s2 |
| 门店标记不显示 | Marker 未传 `map` 参数 | 同上 | 手机截图 s2 |
| 无浏览历史时返回按钮失效 | 默认回退地址 `/cart` 无效 | `AppBackButton.vue` | 手机截图 s1 |
| Playwright 点「导航」选中 radio | get_by_text 命中内层 span | 测试选择器 | `tests/checkout-navigation.test.mjs` |

### 2.6 验证脚本清单
- `tests/checkout-navigation.test.mjs`（21 用例：parseCoordinates/haversineKm/nearbyPickups/导航 URI）
- `tmp/verify-checkout-real3.py`（手机视口端到端，截图 tmp-shots/checkout-pickup-*）
- `tmp/verify-orderboxes-*.mjs`（各租户分箱）、`tmp/verify-shop-pickup-visibility.mjs`
- 引用：配送档案回归套件 `tmp/regress-shipping-profile.mjs`

### 2.7 历史索引
- 9 份 spec（2026-08-26 shipping-fixes … 2026-09-12 per-user-refresh-navigation）+ 8 份 plan
- manual：`checkout-per-user-refresh-nav/`、`checkout-confirmation-detail/`、`checkout-qty-delete-nav/`、`checkout-wholeline-acceptance/`、`pickup-contact-switch/`
- 关联手册：`docs/domains/shipping-profile.md`

## 3. 部署（仅 C 端 nshop，按最新设计文档）

### 3.1 部署前提交（先提交再部署）
- 提交工作区 checkout 产物：
  - 组件/composables：`BoxPickupBlock.vue`、`CheckoutCnContactCard.vue`、`CheckoutPickupContactBlock.vue`、`usePerBoxSelection.ts`、`checkout/index.vue`、`checkout-config.ts`、i18n 两语言、删除 `useSampleAddressBook.ts`
  - 新增：`AppBackButton.vue`、`AppPickupNavigationModal.vue`、`usePickupDefaults.ts`、`usePickupNavigation.ts`、`usePickupSelection.ts`、`tests/checkout-navigation.test.mjs`
  - 文档：`docs/superpowers/specs/2026-09-12-checkout-per-user-refresh-navigation-design.md`（含验证记录更新）、`docs/superpowers/manual/checkout-per-user-refresh-nav/`
- 提交信息：`feat(checkout): 返回按钮+自提点就近+切换用户重置+高德导航弹层（按用户刷新）`

### 3.2 构建与部署
- 单元测试先跑：`node tests/checkout-navigation.test.mjs`（期望 21/21）
- 部署：`node scripts/deploy.mjs`（本地构建 `.output/` → scp 暂存区 → 服务器拷入站点目录 → pm2 restart；服务器不构建）

### 3.3 线上验证
- 线上结算页可访问（HTTP 200 + 关键组件渲染）
- 回归脚本重跑（配送档案回归套件 + checkout 单测）
- 手机视口截图（390×844，dpr=2）：结算页返回按钮、自提点切换、导航弹层——补入操作手册
- 回滚预案：部署脚本已有备份轮转机制，异常时服务器回退上一版产物 + pm2 restart

## 4. 验收标准

- [ ] `docs/domains/checkout.md` 7 章齐全，文件地图覆盖全部 23 组件 + 本轮新增 5 个 composable/组件
- [ ] Bug 知识库含 ≥4 条真实案例（现象→根因→代码点→回归四列）
- [ ] 工作区 checkout 产物已提交（无遗漏：组件/测试/manual/设计文档）
- [ ] 单测 21/21 + 线上结算页验证通过，部署完成
- [ ] 手机视口截图补充到 `docs/superpowers/manual/checkout-per-user-refresh-nav/`

## 5. 风险

- 部署失败：deploy.mjs 备份轮转可回滚（低风险）
- 手册与配送档案手册交叉内容重复：以互相引用方式避免（已约定）
