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

![店面模式配置](06-admin-storefront-config.png)

> 表单已于 2026-10-18 在生产环境浏览器实测通过：superadmin 登录可见平台侧租户管理入口，表单渲染正常（截图）；保存链路经表单同一 `updateTenant` API 实测（t1 版式 grid→floors 回退写入 customFields，C 端即时生效）。双 picker 行在窄屏下的文字重叠已同步修复（picker-val 改弹性省略）。

## 3. 运营侧：券上架（t1）

券店首页数据源 = 券商城可售目录（`couponSaleCatalogue(scene: "IN_STORE")`，渠道过滤自动隔离）：

1. web-admin / 运营后台 → **优惠券模块** → 创建券模板：`usageScene=IN_STORE`、设定 `salePrice`（售价，分）、分发渠道含 **SALE**（可售）。
2. 券包（Bundle）同理：打包多张券 + 包价。
3. 积分兑换楼层（仅 floors 版式展示）：积分商城券模板自动进入「积分兑换」楼层。
4. 售罄判定（2026-10-18 修正）：售卖场景口径 = `totalCount>0 && claimedCount>=totalCount`（前端 `saleCardProgress`）；`claimable=false` 仅表示「不开放免费领取」，**不再误判为售罄**（免费领券场景仍用 `saleProgress` 原口径）。全部售罄/空目录显示空态文案「买单券即将上架，敬请期待」。

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

## 6. 售卖页转化升级（2026-10-18 · 版式 A 大图沉浸卡）

针对「券内容单调、无购买欲」的改造（调研对标美团团购详情七要素 / 抖音信任标签）：

| 升级点 | 说明 | 位置 |
| --- | --- | --- |
| 大图沉浸券卡 | 券名关键词自动映射场景插画（台球/餐饮/饮品/通用四类内联 SVG），头图 +「到店可用」角标 + 折扣大字（「0.80」→「8折」，en 为 Save 20%）+ 算账 caption（消费¥100 立省¥20） | `CouponStoreCouponCard.vue`（新） |
| 折扣语义化 | 纯函数 `formatCouponDiscount`（PERCENT 80→8折/85→8.5折），券店卡与详情弹层统一 | `utils/coupon-mall.ts` |
| 详情弹层算账条 | PERCENT 付费券显示「例：到店消费¥100，按8折立省¥20」 | `DetailSheet.vue`（条件渲染） |
| 详情弹层三步流程 | IN_STORE 券显示「在线购券 → 到店消费 → 出示券码结算」 | 同上 |
| 信任行 | 「到店出示券码 · 全场通用」（券卡+店招，诚实文案：无虚构销量/退款承诺） | 券卡/店招 |
| 店招 hero 升级 | 新增信任小字 +「低至¥X」（取可售券最低价，动态计算非写死） | `CouponStoreHome.vue` |
| 购买须知改写 | 「售出后不支持退款」→「请在有效期内到店核销，未使用可联系客服处理」（双语） | i18n `couponMall.noticeText` |
| P0 修复 | `saleCardProgress`：售卖场景忽略 claimable，付费券不再误显示「已抢罄」 | `utils/coupon-mall.ts` |

> 文案红线（对齐抖音营销噱头规范）：「已售N份」「随时退」等标签在真实销量/退款政策落地前**禁止展示**；销量数据接入见后端 P2（`coupon_sale_order` 支付单聚合），退款政策落地后再补「随时退/过期自动退」标签。

新增 i18n 词条（zh-CN/en-US 同步）：`couponStore.savingsLine / validAfterDays / remaining / trustLine / asLowAs / calcExample / flowStep1-3`。

> 2026-10-18 生产验收：手机视口（390×844 dpr=2）截图确认 C10/C11 全部通过（两张券卡「8折」可抢购、弹层算账条/三步流程/正向须知齐备）；SSR 探针 `hero-trust` 确认新版上线。注意：浏览器端验证若遇旧页，先清 Service Worker/Cache Storage 再硬刷新（部署切换窗口的残留缓存会导致误判）。

## 6.1 营销数据升级（2026-10-18 · P2：真实已售数 + 划线价 + 营销标签 + 券包）

| 升级点 | 说明 | 位置 |
| --- | --- | --- |
| 真实已售数 | `couponSaleCatalogue` 按渠道聚合**已支付（PAID）出售单**计数，单券/券包均下发 `soldCount`；退款（REFUNDED）/取消单不计入。**C 端仅 soldCount>0 才展示「已售N」**——无真实成交不显示（营销噱头红线） | coupon-plugin `coupon-sale.service.ts` |
| 划线锚定价 `anchorPrice` | coupon_template 新列（分）。web-admin 券表单「划线原价」可选填；C 端**仅当 anchorPrice > salePrice 才展示划线价**（`couponAnchorYuan` 防误导），划线价禁写死 | 实体/迁移 `add-coupon-marketing-fields` |
| 营销标签 `label` | coupon_template 新列（≤30 字）。web-admin「营销标签」可选填（建议 6 字内如「热卖TOP」）；C 端券卡头图左上红色角标 + 详情弹层头部标签，空不展示 | 同上 |
| 券包真实已售数 | CouponBundle 下发 `soldCount`，券包卡名称旁展示（同样 >0 才显示） | coupon-plugin |
| t1 首批配置 | 券 83 anchorPrice=990/label=热卖TOP；券 84 anchorPrice=990/label=人气爆款；券包 id=2「超值2张券包」（餐饮1张+台球1张，包价 ¥9，挂渠道 7） | admin-api |
| 券包条目折扣语义 | BundleCard 条目 PERCENT 券显示「8折 ×1」而非「¥0.80 ×1」（discountValue 是折扣值不是面额） | `BundleCard.vue` |

**运营配置路径**：web-admin → 优惠券模块 → 编辑券模板 → 「券商城」渠道下填**出售价 + 划线原价（可选）+ 营销标签（可选）**；券包在券包管理创建（选券 + 数量 + 包价）。

验收截图（手机视口 390×844 dpr=2）：[2026-10-18-t1-marketing-upgrade/](../../../manual/shots/2026-10-18-t1-marketing-upgrade/)（01 首页营销标签/划线价/8折；02 详情弹层标签+划线价+算账条+三步流程；03 券包楼层）。DOM 断言见 `verify-log.json`（soldCount=0 时「已售」正确隐藏）。验证脚本 `scripts/_shot_coupon_marketing.mjs`。

> 首购立减 / 学生价 / 倒计时活动位：**挂起**，待运营定活动政策（门槛/力度/时段）后再实施。

## 7. 测试用例清单

### 7.1 后端（shop-api，curl 匿名/带渠道 token）

| # | 用例 | 预期 |
| --- | --- | --- |
| B1 | 匿名 + t1 渠道 token 调 `couponSaleCatalogue(scene:"IN_STORE")` | 200，templates 全部 IN_STORE/ALL |
| B2 | 默认渠道 token 同查询 | 只见该渠道券（渠道隔离回归） |
| B3 | 匿名调 `createCouponSaleOrder` | 未授权错误（购买仍需登录） |
| B4 | `UpdateChannel`（admin）写 `storefrontMode=coupon` | customFields 落库，shop-api `GetChannelTheme` 可读 |

### 7.2 C 端（手机视口 390×844 dpr=2）

| # | 用例 | 预期 | 截图 |
| --- | --- | --- | --- |
| C1 | `/t1/` 券店首页 floors | 店招 + 吸顶锚点 + 楼层（单券/券包/积分） | 01 |
| C2 | `/t1/` grid 版式 | 2 列券卡宫格 + 券包 + 积分行 | 02（t1 当前空目录，截图为空态；上架券后宫格/楼层版式出现差异） |
| C3 | 匿名访问 `/t1/` | 可浏览楼层；点抢购跳登录 | 01 |
| C4 | 直连 `/t1/product/x` | 落 `/t1/coupon-only` 提示页 | 03 |
| C5 | `/t1/coupon/orders`（登录态） | 券单列表；PENDING 单可继续支付 | 04 |
| C6 | TabBar | 首页/券包/券单/我的 四 tab 可点、高亮正确 | 01 |
| C7 | Header | 无搜索/购物车/分类菜单 | 01 |
| C8 | 对照：默认渠道 `/` | normal 京东布局无变化 | 05 |
| C9 | 切回 normal 后同路径 | 直达商品页（拦截失效） | — |
| C10 | floors 版式券卡（转化升级后） | 场景插画头图 +「到店可用」角标 +「8折」大字 + 算账 caption + 有效期/信任行；付费券按钮可点（不误显已抢罄） | 11（[2026-10-18-t1-coupon-redesign/11-home-floors-redesign.png](../../../manual/shots/2026-10-18-t1-coupon-redesign/11-home-floors-redesign.png)） |
| C11 | 点券卡开详情弹层 | 算账条「按8折立省¥20」+ 三步流程条 + 须知正向文案 | 12（[2026-10-18-t1-coupon-redesign/12-detail-sheet-redesign.png](../../../manual/shots/2026-10-18-t1-coupon-redesign/12-detail-sheet-redesign.png)） |
| C12 | 切 en-US 语言 | 折扣「Save 20%」、算账/流程/信任行英文正常（语言包双语同步） | — |
| C13 | 营销标签/划线价（P2） | 券卡头图红色角标（热卖TOP/人气爆款）+ ¥9.9 划线价 + ¥5 现价；详情弹层同步；后台未配置则不显示 | 01/02（[2026-10-18-t1-marketing-upgrade/](../../../manual/shots/2026-10-18-t1-marketing-upgrade/)） |
| C14 | 真实已售数（P2） | soldCount=0 全程不显示「已售」；产生真实 PAID 出售单后「已售N」出现（单券/券包同口径） | verify-log.json 断言 |
| C15 | 券包楼层（P2） | 「超值2张券包」入超值券包楼层，条目「餐饮买单优惠券 8折 ×1」语义正确，包价 ¥9 | 03 |

## 8. 已知边界

- 切回 `normal`：立即恢复普通商城；券店期间已购券不受影响（券在「我的券包」）。
- 存量商品：券店模式只是入口拦截，商品数据仍在——运营需自行下架或保留（恢复 normal 即回）。
- 全部售罄/空目录：显示空态文案「买单券即将上架，敬请期待」，楼层锚点隐藏（t1 当前即空目录状态，上架 IN_STORE 券后楼层自动出现）。
- `storefrontHomeLayout` 在 normal 模式下不生效（仅 coupon 模式读取）。
- 券单页不自动取消 PENDING 单（区别于购买页 PaySheet 关闭即取消）——用户可稍后继续支付；匿名访问券单页直接引导登录（不报错）。
- 券店 Header 左上角保留汉堡按钮：点开抽屉仅剩租户切换（分类菜单已隐藏），用于多店切换场景。
- t1 首批配置通过 SQL 直配；店面模式表单已于 2026-10-18 生产环境浏览器实测通过（superadmin 登录 → 平台管理 → 租户管理可见入口，渲染/保存链路正常，含 updateTenant 写入 customFields 验证），后续配置直接用表单。

## 9. 部署清单

1. vendure：本地 `pnpm build` → push → 服务器 `git pull` + `pm2 restart`（cjk/coupon plugin lib 已随提交入库）。
2. web-admin（vshop 仓库）：本地 `build:h5` → 提交 dist → push → 服务器拉取（平台侧表单）。
3. nshop：本地 `pnpm build` → `node scripts/deploy.mjs`。
