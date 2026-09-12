# 结算页按用户刷新 + 返回按钮 + 自提点导航 操作手册

> 范围：nshop C 端结算页（checkout）
> 日期：2026-09-12
> 设计文档：`docs/superpowers/specs/2026-09-12-checkout-per-user-refresh-navigation-design.md`
> 回归用例：`tests/checkout-navigation.test.mjs`

## 一、本次改动五件事

### ① 新增全局「返回上级」按钮组件
- 新增组件 `layers/base/app/components/AppBackButton.vue`（Nuxt 组件自动注册，全站可用）。
- 交互：点击 `router.back()` 返回上一页；无浏览历史（如直达链接进入）时回退 `router.push(localePath(to))`，默认落点 `/`（首页）。
- 注册在结算页 `layers/base/app/pages/checkout/index.vue` 页首左上角，仅当活动订单有 ≥1 行时显示。
- 词条：`messages.general.back`（zh/en 已同步，均存在）。

### ② 自提点「50km 同城就近」过滤 + 默认
- 常量 `PICKUP_RADIUS_KM = 50`（`layers/base/app/utils/checkout-config.ts`）。
- 纯函数 `nearbyPickups(pickups, coords, getLatLng, restrict?)`：
  - 有定位 → 仅保留距当前定位 ≤50km 的自提点，并按距离升序；
  - 无定位 **或** 过滤后无结果 → 回退全部（保持原序），保证任何坏数据/缺定位下结算页仍可完整展示。
- `BoxPickupBlock.vue` 的 `filteredPickups`（关键词搜索前置 50km 就近）、`nearestPickup`/`currentPickup`（默认取就近最近）均复用该过滤。
- 距离文案（m/km）随点在列表中展示。

### ③ 全站删除硬编码示例地址/联系人
- `useSampleAddressBook.ts`（王小明 138… 等示例）已删除，无任何残留引用。
- `CheckoutPickupContactBlock.vue`：联系人 chip 区仅取用户真实地址簿 `addresses`；为空时隐藏 chip 区，仅保留姓名/电话/备注手填。
- `CheckoutCnContactCard.vue`：收货人切换列表仅取真实地址簿；为空时走「新增地址」引导。

### ④ 切换用户/重新进入结算页时重置选择状态
- 选择/搜索/展开状态抽离为**可重置单例**：
  - `usePickupSelection.ts`（自提点 `sel`/`boxSearch`/`boxExpanded` + `resetSelection()`）；
  - `usePerBoxSelection.ts`（行勾选 `resetPerBox()`）。
- `checkout/index.vue` 两处触发重置：
  - 进入页面 setup 时；
  - `watch(isAuthenticated)` 登录态变化时 → 重置自提/行选择 → `fetchOrder("detail")` 重拉订单 → `fetchOrderBoxes()` 重拉分箱 → `ensurePickupDefaults()` 按当前用户定位就近重新默认 → 重新取地址簿。
- 默认自提点由 `usePickupDefaults.ensurePickupDefaults()` 在 `BoxPickupBlock` 挂载时按当前定位就近补齐（跨实例幂等）。

### ⑤ 自提点导航（高德地图）
- `composables/usePickupNavigation.ts`：封装 `loadAmapSdk()`（复用 `useGeoLocation`，SDK URL 服务端下发、前端不硬编码 key）、`hasCoords`（校验有效坐标）、`buildNavigationUri`（生成高德 URI：`https://uri.amap.com/navigation?to={lng},{lat},{name}&mode=car&src=nshop&coordinate=gaode&callnative=1`）。
- `components/AppPickupNavigationModal.vue`：弹层内嵌高德地图（终点=自提点标记，起点=`locationStore.coords`，缺失则仅展示终点标记），`AMap.Driving` 规划驾车路线；无坐标/无定位/AMap 加载失败时给出降级提示。
- `BoxPickupBlock.vue`：当前自提点卡片旁新增「导航」按钮（仅当该点有有效坐标时显示），点击弹出导航弹层；弹层内「去导航」唤起高德 App（Web 端回退网页导航）。
- 词条：`messages.checkout.{navigation, goNavigate, navNoCoords, navSdkFail, needBoxDelivery}`（zh/en 已同步）。

## 二、涉及文件清单

| 类型 | 文件 |
| --- | --- |
| 新增 | `components/AppBackButton.vue` |
| 新增 | `components/AppPickupNavigationModal.vue` |
| 新增 | `composables/usePickupNavigation.ts` |
| 新增 | `composables/usePickupSelection.ts` |
| 新增 | `composables/usePickupDefaults.ts` |
| 改 | `components/checkout/BoxPickupBlock.vue`（就近过滤、导航入口、状态单例） |
| 改 | `components/checkout/CheckoutPickupContactBlock.vue`（删示例） |
| 改 | `components/checkout/CheckoutCnContactCard.vue`（删示例） |
| 改 | `pages/checkout/index.vue`（返回按钮 + 登录态 watch） |
| 改 | `composables/usePerBoxSelection.ts`（`resetPerBox`） |
| 改 | `utils/checkout-config.ts`（`PICKUP_RADIUS_KM`/`nearbyPickups`） |
| 删 | `composables/useSampleAddressBook.ts` |
| 改 | `i18n/locales/{zh-CN,en-US}.ts`（词条同步） |
| 新增 | `tests/checkout-navigation.test.mjs`（纯函数回归） |

## 三、回归验证

### 静态回归
- `npm run typecheck` → 通过（exit 0，均为既有无关 warning）。

### 纯函数回归（确定性）
```bash
node --experimental-strip-types tests/checkout-navigation.test.mjs
```
覆盖：`parseCoordinates` 容错、`haversineKm`（北京-上海约 1067km）、`PICKUP_RADIUS_KM=50`、`nearbyPickups`（无定位回退全部 / ≤50km 过滤并升序 / 空列表 / 全超距回退全部 / `restrict=false` 跳过过滤）、导航 URI 前缀与唤起参数。
结果：**21 passed, 0 failed**。

### 页面冒烟（本地 dev，手机视口 390×844）
- 结算页 `/checkout` 手机视口加载正常（空车态与自提单结算态均无运行时/水合错误）。
- **自提单结算态**：返回按钮、自提点模块（名称/地址/营业时间/导航按钮）正常，见 `assets/s1_checkout_page.png`。
- **导航弹层**：高德地图渲染成功（终点=自提点蓝色标记，起点=当前定位），「去导航」按钮可用，见 `assets/s2_navigation_modal.png`；「去导航」实测生成正确 URI：`https://uri.amap.com/navigation?to=125.3335,43.8356,自由大路店&mode=car&src=nshop&coordinate=gaode&callnative=1`。

## 四、线上/验收验证步骤（提交部署后执行）

> 前置：登录账号需含「自提」配送档案绑定的商品（配送档案要求联系人），并将浏览器定位带到自提点同城位置。
> 视口：390×844，dpr=2（iPhone 模拟），用浏览器开发者工具或移动端真机截图。

1. **返回按钮**：加购 1 件自提单商品 → 进入 `/checkout` → 页首左上角应显示「← 返回」按钮 → 点击返回上一页。
2. **就近默认**：定位在杭州 → 进入结算页 → 自提箱默认选中「距当前定位最近、且 ≤50km」的自提点；列表自提点按距离升序、远近标注 m/km。
3. **50km 过滤**：自提点列表不应出现与当前定位 >50km 的异地点；当全部超距时仍应回退展示全部（保证可选，以避免误以为无自提点）。
4. **导航**：当前自提点卡片旁有「导航」按钮 → 点击弹出高德地图弹层（终点=自提点，起点=当前定位，含驾车路线）→ 若定位已授权限可看到起终点与路线；点击「去导航」唤起高德 App。
5. **切换用户重置**：用户 A 登录选了自提点 X → 退出登录并用用户 B 登录 → 自提选择与行勾选应被清空并按 B 的定位/地址簿重新就近默认，**不沿用 A 的选择**。
6. **联系人地址簿**：新账号（地址簿为空）进入自提单结算 → 联系人区无「王小明」等示例 chip，仅手填姓名/电话；有地址簿时显示真实联系人 chip 可切换。
7. **i18n**：切换英文，结算页「返回/导航/去导航」等文案应显示英文。

## 五、线上验证记录（2026-09-13，部署后）

> 站点：https://www.youshop.cn（openresty → nshop:3000）｜脚本：`tmp/verify-checkout-online.py`｜回归：`tmp/regress-shipping-profile.mjs`

1. **可达性**：首页 / `/checkout` 均 HTTP 200，`/shop-api` 端点正常。
2. **结算页渲染**：加购变体 58（¥880）→ 结算页正常渲染「门店自提配送档案」自提箱，自提点显示 **国信南山温泉酒店**（自由大路店误显示已修复，与档案 1 绑定一致）；返回按钮位于页首左上角，见 `assets/s1_back_button_online.png`。
3. **自提点切换**：线上档案 1 当前仅绑定 1 个自提点，按「数量 >1 才显示」规则不显示「选择自提点」按钮——符合预期；多自提点档案（如本地双点档案）仍按规则显示。
4. **导航弹层**：点击地图图标按钮（`aria-label=导航`）打开高德弹层，含「去导航」按钮，页面无 JS 错误，见 `assets/s3_navigation_modal_online.png`。
5. **回归套件**：`node tmp/regress-shipping-profile.mjs` → **10 PASS / 0 FAIL**（档案可见性、全局权限、租户管理员权限、档案 1 绑定一致性）。

## 六、注意事项
- 自提点无城市字段，「同城」以距当前定位 ≤50km 衡量（Haversine）。
- 高德 SDK Key 由服务端 `GqlGetMapSdkConfig` 下发，前端不硬编码，未配置 provider 时「导航」按钮不显示/导航弹层给出「地图加载失败」提示。
- 上述截图建议：步骤 2、4、5 每步补一张手机截图到本手册 `assets/`，与既有 `pickup-contact-switch` 手册风格一致。