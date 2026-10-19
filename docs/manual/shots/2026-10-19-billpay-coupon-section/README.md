# 代买单 ·「自己到店」买单券板块（券板块断点修复）2026-10-19

## 背景
买单功能审计确认「自己到店」（买单券）板块纯断点：t3 代买单店首页无券店入口/推荐位，券能力配置（`billPayConfig.couponEnabled=true`）与 C 端展示断链；且生产双场景券目录为空（选品未上架）。方案 A（mockup 已批）落地：推荐位完整版。

## 实现要点
- 组件：`layers/base/app/components/bill-pay/BillPayCouponSection.vue`，插入 `BillPayHome.vue` 委托表单之后、服务说明之前
- **有券 = 横滑券卡推荐位**：面额/折扣大字（复用 `formatCouponDiscount` + i18n `couponStore.percentOff`，zh「8折」/en「Save 20%」）、售价（`couponYuan` 分转元）、抢购 pill；点卡 → `CouponMallDetailSheet` 详情弹层 → 下单 → `CouponPaySheet` 支付，**完整复用券店 `useCouponSaleFlow` 全链路**（登录引导/微信 JSAPI/余额/关单取消）
- **空目录（当前生产态）= 兜底**：价值主张（自己到店·领张买单券，到店出示券码结算）+ 「买单券即将上架，敬请期待」chip；板块始终可见
- 目录：`couponSaleCatalogue(scene: IN_STORE)` 渠道隔离，`useAsyncData` SSR 预取，取前 10 张；售罄口径 `saleCardProgress`（已抢罄置灰）
- i18n：zh-CN/en-US 各新增 4 词条（`billpay.selfTitle/selfSub/selfEmpty/selfPerCard`）；折扣文案复用 `couponStore.percentOff`，按钮复用 `couponStore.gridBuy`/`couponMall.soldOut`

## 验证
- 生产实况（目录为空）：SSR 命中「自己到店/领张买单券/即将上架」空目录态，en 页全英化
- **券卡态（mock 注入验证）**：本地 mock 上游（`NUXT_PUBLIC_GQL_HOST` 指向 3999 模拟目录）验证 SSR 出 3 卡——`8折/¥5/¥20` 面额格式化、`¥16/张 ¥9.90/张 ¥15/张` 价格、售罄卡置灰+已抢罄；点卡详情弹层正常（算账条「到店消费¥100 按8折立省¥20」、三步流程、立即抢购 CTA）。选品上架后生产即呈此态
- 手机视口 390×844 dpr=2 截图：
  - `t3-billpay-coupon-section.png` 空目录态首屏（zh，板块居中）
  - `t3-billpay-coupon-full.png` 空目录态整页（zh）
  - `t3-billpay-coupon-en.png` 空目录态（en）
  - `t3-billpay-coupon-cards-mock.png` 券卡推荐位（mock 注入）
  - `t3-billpay-coupon-sheet-mock.png` 详情弹层（mock 注入）

## 后续（运营）
- 选品上架后推荐位自动出现券卡（无需发版）；上架口径见券店手册 §3（`usageScene=IN_STORE` + `salePrice` + SALE 分发渠道）
