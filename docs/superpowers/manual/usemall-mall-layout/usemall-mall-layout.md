# usemall 珊瑚粉 mall 版式 — 操作手册

> 范围：nshop C 端 5 页（首页 / 详情 / 分类 / 购物车 / 结算）按参考商城 usemall 风格改写，以「可回退页面级 mall 版式」落地，后台数据不变；缺内容用「后台模板/装修配置」补齐，不新增表字段。
> 配色 **A2 珊瑚粉点缀版**：主色 `#e0433f` · 强调 `#ff6a6c` · 圆角 8。

---

## 1. 五级可回退体系如何承载 mall 版式

mall 版式完全构建在既有五级回退体系（L0 内建 ← L1 全局配置 ← L2 风格模板 ← L3 店铺覆盖 ← L4 页面/模块内建默认）之上，未新增机制：

| 层级 | mall 相关落点 |
|---|---|
| L1 全局配置 | `primaryColor/accentColor/radius` 等 token（主色由 palette 驱动） |
| L2 模板 | `shop_template`「mall」行（app=nshop），`theme.scheme=usemall-coral` |
| L3 店铺覆盖 | 渠道 `customFields.themeTokensOverride`，L3 last-wins |
| L4 页面/模块内建默认 | 各页内部回退链 |

引用/启用「mall」模板时 C 端生效；未引用/停用/跨 app 时后端返回 null，C 端逐级退回 L1 全局配置（勿误用「自动取平台最新启用模板」）。

## 2. 各页落地方式（后台数据不变）

| 页面 | 实现 | 切换/回退判定 |
|---|---|---|
| 首页 | 数据驱动：mall 模板 `pages.home.sections=[banner,nav,goods]` + coral 配色，复用积木 `BannerBlock/NoticeBlock/NavGrid/GoodsFloor(masonry/single)` | `useShopContent` 读到 sections → 有 blocks 走 `HomeBlockRenderer`，否则京东兜底；启用 mall 模板即切换 |
| 详情页 | `DetailLayout='mall'` → [DetailMall.vue](file:///../../layers/base/app/components/product-detail/DetailMall.vue)（首屏大图 + 信息主卡 + 辅助卡组 + 吸底操作栏 + 双列推荐） | `detail-config.detailLayout()` 校验，`layout!=='mall'` 走 classic/floor/dualBuy/hotel |
| 分类页 | usemall「左分类栏 + 右商品流」双栏（左栏复用 menuItems + childCollections，右栏复用排序/筛选/分页/城市配送数据） | `pageConfig("category").layout==='mall'` |
| 购物车 | 既有抽屉 `CartPanel`（标题 + 明细 + 全宽去结算，`checkoutStyle=full`）即 usemall 形态 | `pageCartConfig` |
| 结算页 | `checkoutConfig.layout='mall'` → [CheckoutLayoutMall.vue](file:///../../layers/base/app/components/checkout/CheckoutLayoutMall.vue)（顶部「确认订单」卡 + 收货人一体卡 + 逐箱卡片 + 支付 + 分账汇总 + 吸底结算栏） | `checkLayout()` 白名单，非法回退 `cn`；cn/jd/jd-legacy/legacy 均可回退 |

> 结算页关键点：**复用 cn 同一套逐箱/支付/分账/吸底块 + `submitJd` 门闩式提交链**，只重排容器结构、不触碰分箱/地址/自提核销/收款台账业务逻辑，规避破坏收款分账的风险。

## 3. 相关文件

- 前端：`layers/base/app/components/product-detail/DetailMall.vue`、`layers/base/app/components/checkout/CheckoutLayoutMall.vue`、`layers/base/app/pages/category/[slug].vue`（mall 双栏）、`layers/base/app/pages/checkout/index.vue`、`layers/base/app/utils/checkout-config.ts`、`layers/base/app/utils/detail-config.ts`、`layers/base/app/utils/palette-presets.ts`（usemall-coral）
- 后端：`vendure/packages/shop-template-plugin/src/palette-presets.ts`（+ `lib/` 构建产物）
- Seed：`vendure/tools/seeds/020-mall-template.sql`

## 4. 部署（本地构建，勿在服务器构建）

1. 后端 vendure：`git pull + pm2 restart vendure`（lib 产物已入库，无需服务器构建）→ 生产 PostgreSQL 执行 seed（Docker `psql`，幂等按 name+app 判存）。
2. 前端 nshop：`node scripts/deploy.mjs`（scp `.output` → 服务器解压/拷入 + `pm2 restart nshop`，端口读取 `.env`）。

## 5. 测试验收

验收一律用手机浏览视图截图（标准视口 390×844，dpr=2=780×1688，Playwright）。回退语义以手机视口截图为判定标准（P5 首帧缓存滞后用 `?cb=` 冷加载；引用模板时改 L1 主色被 palette 覆盖属设计语义）。

### 结算页 mock 验证（本手册附带截图）

结算页依赖完整订单/分箱/地址/支付全链路，未起后端时用高保真静态 mock 验证布局设计：[checkout-mobile-view.png](checkout-mobile-view.png)（A2 珊瑚配色移动视图）。

验证结论：
- 结构 = 顶部「确认订单」标题卡 → 收货信息 → 配送箱商品卡 → 配送方式 → 支付方式 → 分账汇总 → 协议 → 吸底「提交订单」。
- A2 珊瑚配色统一（价格/按钮/选中态/序号标签/抵扣金额均主色），层级清晰，无错位溢出。
- 截图中的「两处提交订单」是 long screenshot 对 `position:fixed` 吸底栏的合成伪影，真实单屏只有一处。

### 真实联调（线上已跑通 2026-09-23）

加购（含跨箱/跨租户分箱）→ 结算页确认逐箱卡片/配送·自提/支付白名单/分账汇总 → 提交订单走 `submitJd` 门闩式校验 → 确认跳转 `/checkout/confirmation/<code>`。商务/收款逻辑以既有结算 e2e 为准。

线上实测（Playwright 手机视口 390×844×dpr2，未提订单/未支付）——受控站会员商户「门店自提」通道的 mall 结算页：

| 截图 | 内容 |
|---|---|
| `checkout-live-top.png` | ① 顶部「确认订单」标题卡 + 收货/门店自提 |
| `checkout-live-delivery.png` | ② 自提箱商品卡（自提点「利洋汽修」+ 洗车/倒胎商品行：图/名/价/数量 stepper） |
| `checkout-live-payment.png` | ③ 支付方式（固定聚合码收款白名单） |
| `checkout-live-split.png` | ④ 分账明细/本箱金额/税费/应付款总额 |
| `checkout-live-submitbar.png` | 吸底「去结算」结算栏 |
| `checkout-live-full.png` | 整页全貌（full_page，含固定栏合成伪影） |

实测结论：结构「确认订单 → 逐箱卡 → 支付 → 分账 → 吸底栏」与 mock 一致；本账号履约为门店自提（故无「配送方式/配送箱/收货地址」块——符合模块归属规则：自提单只挂自提点+收货人）。

> 账号说明：既有测试号 `split-e2e-a@joho.cn` / `zhao@163.com` 在线上 mall 渠道为 `INVALID_CREDENTIALS`（账号失效/被重置，非前端 bug）。因红线禁建新号，本次用既有结算 e2e 匿名购物会话复核截图。
> 已知注意点：吸底固定栏与正文有轻微叠压；full_page 截图含「两处提交」为固定栏合成伪影（真实单屏仅一处）。