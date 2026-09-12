# 结算页按用户刷新 + 返回导航按钮 设计

日期：2026-09-12
范围：nshop C 端结算页（checkout）模块
状态：已审阅，待实现

## 背景与问题

结算页（`layers/base/app/pages/checkout/index.vue` + `layers/base/app/components/checkout/*`）的三类数据未按「当前登录用户」刷新，且缺少返回导航：

1. **联系人展示硬编码示例**：`CheckoutPickupContactBlock.vue` / `CheckoutCnContactCard.vue` 在用户地址簿为空时回退到 `useSampleAddressBook.ts` 的硬编码示例联系人（王小明 138… 等）。
2. **自提点默认/列表与用户无关**：`BoxPickupBlock.vue` 默认选中优先取模块级 `sel`（上次选择），否则 `nearestPickup` 用持久化 `locationStore.coords`；无按用户定位「同城就近」的过滤。
3. **切换用户沿用上次选择**：`BoxPickupBlock.vue` 顶部 `sel/boxExpanded/boxSearch` 与 `usePerBoxSelection.ts` 的 `lineSel` 均为**模块单例**，跨路由、跨登录用户存活；`usePerBoxSelection` 仅按「订单结构指纹」重建，未按用户隔离。
4. **缺返回导航**：结算页无返回上级入口；自提点无「导航」能力。

自提点数据 `coordinates` 为 `{lat,lng}`（可 `parseCoordinates` 解析），无城市字段，故「同城」只能按距当前定位的距离衡量。项目已集成高德 JS SDK（`useGeoLocation.loadAmapSdk()`，`sdkUrl` 由服务端 `GqlGetMapSdkConfig` 下发、前端不硬编码 key），可复用。

## 目标

- 结算页入口按当前登录用户刷新：联系人/收货人数据取真实地址簿；自提点按定位「50km 同城就近」过滤并就近默认；切换用户时重置所有选择状态并重拉订单与地址簿。
- 全站移除硬编码示例地址/联系人数据。
- 新增全局可复用「返回上级」按钮组件。
- 自提点新增「导航」：弹层内嵌高德地图（自提点终标 + 当前定位起标 + 驾车路线），弹层内「去导航」唤起高德 App。

## 设计

### ① 返回上级按钮（独立组件）

- 新增全局组件 `layers/base/app/components/common/AppBackButton.vue`（Nuxt 组件自动注册，全站可用）。
- props：`to`（可选，无浏览历史时的回退地址，默认 `/cart`）、`label`（可选文案，默认取 i18n `messages.common.back`）。
- 交互：点击 `router.back()`；无法回退历史时 `router.push(localePath(to))`。
- 结算页 `checkout/index.vue` 页首左上角（标题上方）放 `<AppBackButton to="/cart" />`，所有版式（cn/jd/jd-legacy/回退）统一生效。

### ② 自提点「50km 就近」过滤 + 默认

- 常量 `compile`：`checkout-config.ts` 新增 `PICKUP_RADIUS_KM = 50`。
- 纯函数 `nearbyPickups(boxOrCoords, coords, limitKm)`：有定位时过滤距离 ≤ `PICKUP_RADIUS_KM` 并按距离升序；无定位或空结果时回退全部（保持原顺序）。
- `BoxPickupBlock.vue`：
  - `filteredPickups` 在原关键词过滤基础上叠加 50km 就近过滤；
  - `currentPickup` / `nearestPickup` 默认即用 `nearbyPickups` 就近。

### ③ 全站删除硬编码示例

- `useSampleAddressBook.ts` 不再被业务引用（删除文件或保留但收档）。
- `CheckoutPickupContactBlock.vue`：`contactSource` 仅取真实地址簿；为空时隐藏 chip 区，仅保留姓名/电话/备注手填。
- `CheckoutCnContactCard.vue`：`switchList` 仅取真实地址簿；为空走 `showCreate`「新增地址」引导。

### ④ 切换用户重置选择状态

- 将 `BoxPickupBlock.vue` 模块级 `sel/boxExpanded/boxSearch` 迁移进 `orderStore`（或独立可 `$reset` 的 composable），暴露 `resetCheckoutSelection()`。
- `checkout/index.vue` `watch(isAuthenticated)`：登录态变化时
  - 调用 `resetCheckoutSelection()`；
  - `fetchOrderBoxes()` 重拉分箱；
  - `fetchAddresses()` 重取当前用户地址簿；
  - 自提默认就近依当前用户定位重算。
- `usePerBoxSelection` 保持按订单结构指纹自行重建，必要时补按用户维度重建。

### ⑤ 自提点导航（高德弹层）

- 自提点卡片在「选择自提点」入口旁加「导航」按钮（需有有效 coordinates）。
- 点击打开 `AppPickupNavigationModal`（`layers/base/app/components/common/`）：
  - 复用 `useGeoLocation.loadAmapSdk()` 加载高德 JS；
  - 内嵌地图：终点 = 自提点标记（`coordinates`），起点 = `locationStore.coords`，缺失则 `locate()` 自动定位；
  - `AMap.Driving` 规划驾车路线（起终点）；
  - 容错：无定位/无坐标/AMap 加载失败 → 按钮置灰或提示「暂不可导航」。
- 弹层内「去导航」按钮 → `https://uri.amap.com/navigation?to={lng},{lat},{name}&mode=car&src=...` 唤起高德 App（Web 端回退网页导航）。
- 封装 `composables/usePickupNavigation.ts`：加载 AMap、拼 URI、容错。
- 明暗主题适配；移动端为优先形态。

## 涉及文件

- 新增 `layers/base/app/components/common/AppBackButton.vue`
- 新增 `layers/base/app/components/common/AppPickupNavigationModal.vue`
- 新增 `layers/base/app/composables/usePickupNavigation.ts`
- 改 `layers/base/app/utils/checkout-config.ts`（常量 + nearbyPickups）
- 改 `layers/base/app/components/checkout/BoxPickupBlock.vue`（选择状态迁移、就近过滤、导航入口）
- 改 `layers/base/app/components/checkout/CheckoutPickupContactBlock.vue`（删示例）
- 改 `layers/base/app/components/checkout/CheckoutCnContactCard.vue`（删示例）
- 改 `layers/base/app/pages/checkout/index.vue`（返回按钮 + 登录态 watch）
- 改 `layers/base/stores/useOrderStore.ts`（resetCheckoutSelection）与 `usePerBoxSelection.ts` 若需
- 删 `layers/base/app/composables/useSampleAddressBook.ts`（或收档）
- i18n 词条：`messages.common.back` + 导航相关词条（zh-CN/en-US 同步）

## 测试与交付

- 每项改动用手机视口（390×844，dpr=2）截图并补入操作手册。
- API/e2e 回归：切换用户重置、自提点就近、联系人地址簿、导航弹层。
- 数据层不改动（纯前端结算体验）。