# 券店模式（Coupon Storefront）操作手册

> 功能迭代：2026-10-18 · 计划 [2026-10-18-coupon-storefront-mode.md](../../../plans/2026-10-18-coupon-storefront-mode.md) · 设计 [2026-10-18-coupon-storefront-mode-design.md](../../../plans/../../docs/superpowers/specs/2026-10-18-coupon-storefront-mode-design.md)

## 1. 功能说明

**租户券店模式**：平台可把某个租户（渠道）整店切换为「券店」——C 端（nshop）该租户只卖买单券：

| 配置项 | 取值 | 说明 |
| --- | --- | --- |
| 店面模式 `storefrontMode` | `normal`（默认） / `coupon` | coupon = 券店：首页渲染券店版式、商品/分类/搜索/结算路由拦截、TabBar/Header 券店化 |
| 券店首页版式 `storefrontHomeLayout` | `floors`（默认） / `grid` | 仅 coupon 模式生效：floors = 楼层导购（吸顶锚点 + 单券/券包/积分楼层）；grid = 券卡宫格（2 列面额大字卡 + 券包 + 积分行） |

- 目录匿名可浏览（新客未登录可看券楼层，点抢购引导登录）；购买/支付仍需登录。
- 只售 `usageScene=IN_STORE`（到店）买单券；到店出示券码、商户核销，链路复用既有优惠券体系。
- 值存于 `Channel.customFields`（vendure cjk-plugin），仅平台管理员可改（租户自助更新白名单不含这两个字段）。
- 坏值兜底：`storefrontMode` 非 `coupon` 一律按 `normal`；`storefrontHomeLayout` 非 `grid` 一律按 `floors`。
- 切回 `normal` 立即恢复普通商城（nshop 每次请求 SSR 读渠道主题，无需重建）。

## 2. 平台侧配置路径（web-admin）

1. 登录 web-admin → **平台管理 → 租户管理** → 选择目标租户（如「新生 t1」）。
2. 详情页「行业类型」下方新增**店面模式**表单块：
   - 「店面模式」picker：普通商城 / 券店（只卖买单券）；
   - 选「券店」后出现「券店首页版式」picker：楼层导购 / 券卡宫格；
   - 点「保存」即时生效（写 `Channel.customFields.storefrontMode/storefrontHomeLayout`）。

（截图位：`03-admin-storefront-config.png`）

## 3. 运营侧：券上架（t1）

券店首页数据源 = 券商城可售目录（`couponSaleCatalogue(scene: "IN_STORE")`，渠道过滤自动隔离）：

1. web-admin / 运营后台 → **优惠券模块** → 创建券模板：`usageScene=IN_STORE`、设定 `salePrice`（售价，分）、分发渠道含 **SALE**（可售）。
2. 券包（Bundle）同理：打包多张券 + 包价。
3. 积分兑换楼层（仅 floors 版式展示）：积分商城券模板自动进入「积分兑换」楼层。
4. 售罄判定：`claimedCount/totalCount` 或 `claimable=false`；全部售罄/空目录显示空态文案「买单券即将上架，敬请期待」。

## 4. C 端动线（nshop）

```
首页（券店版式：店招 + 楼层/宫格）
  → 点券卡 → 详情弹层（图文介绍/范围/须知）
  → 抢购 → 未登录 → 跳登录 → 回来再买
  → 已登录 → 下单（出售单）→ PaySheet（微信 JSAPI / 余额）→ 支付成功
  → 我的券包（/coupon）→ 到店出示券码 → 商户核销
```

- 券店 TabBar 四 tab：**首页 / 券包 / 券单 / 我的**（`/coupon/orders` 券单页可看历史出售单，PENDING 单可继续支付）。
- Header 精简：无分类导航/搜索/购物车，保留 Logo、城市/租户选择器、账号菜单。
- 直连商品 URL（`/t1/product/x`、`/t1/search`、`/t1/checkout`、`/t1/category/...`）被全局中间件拦截到 `/t1/coupon-only` 提示页「本店仅售买单券」。

## 5. 测试用例清单

### 5.1 后端（shop-api，curl 匿名/带渠道 token）

| # | 用例 | 预期 |
| --- | --- | --- |
| B1 | 匿名 + t1 渠道 token 调 `couponSaleCatalogue(scene:"IN_STORE")` | 200，templates 全部 IN_STORE/ALL |
| B2 | 默认渠道 token 同查询 | 只见该渠道券（渠道隔离回归） |
| B3 | 匿名调 `createCouponSaleOrder` | 未授权错误（购买仍需登录） |
| B4 | `UpdateChannel`（admin）写 `storefrontMode=coupon` | customFields 落库，shop-api `GetChannelTheme` 可读 |

### 5.2 C 端（手机视口 390×844 dpr=2）

| # | 用例 | 预期 | 截图 |
| --- | --- | --- | --- |
| C1 | `/t1/` 券店首页 floors | 店招 + 吸顶锚点 + 楼层（单券/券包/积分） | 01 |
| C2 | `/t1/` grid 版式 | 2 列券卡宫格 + 券包 + 积分行 | 02 |
| C3 | 匿名访问 `/t1/` | 可浏览楼层；点抢购跳登录 | 01 |
| C4 | 直连 `/t1/product/x` | 落 `/t1/coupon-only` 提示页 | 03 |
| C5 | `/t1/coupon/orders`（登录态） | 券单列表；PENDING 单可继续支付 | 04 |
| C6 | TabBar | 首页/券包/券单/我的 四 tab 可点、高亮正确 | 01 |
| C7 | Header | 无搜索/购物车/分类菜单 | 01 |
| C8 | 对照：默认渠道 `/` | normal 京东布局无变化 | 05 |
| C9 | 切回 normal 后同路径 | 直达商品页（拦截失效） | — |

## 6. 已知边界

- 切回 `normal`：立即恢复普通商城；券店期间已购券不受影响（券在「我的券包」）。
- 存量商品：券店模式只是入口拦截，商品数据仍在——运营需自行下架或保留（恢复 normal 即回）。
- 全部售罄/空目录：显示空态文案「买单券即将上架，敬请期待」，楼层锚点隐藏（t1 当前即空目录状态，上架 IN_STORE 券后楼层自动出现）。
- `storefrontHomeLayout` 在 normal 模式下不生效（仅 coupon 模式读取）。
- 券单页不自动取消 PENDING 单（区别于购买页 PaySheet 关闭即取消）——用户可稍后继续支付；匿名访问券单页直接引导登录（不报错）。
- 券店 Header 左上角保留汉堡按钮：点开抽屉仅剩租户切换（分类菜单已隐藏），用于多店切换场景。
- t1 首批配置通过 SQL 直配（web-admin 表单 UI 已上线，superadmin 经 vshop 管理员体系登录暂无平台侧入口，后续可用平台管理员账号在租户管理页验证表单）。

## 7. 部署清单

1. vendure：本地 `pnpm build` → push → 服务器 `git pull` + `pm2 restart`（cjk/coupon plugin lib 已随提交入库）。
2. web-admin（vshop 仓库）：本地 `build:h5` → 提交 dist → push → 服务器拉取（平台侧表单）。
3. nshop：本地 `pnpm build` → `node scripts/deploy.mjs`。
