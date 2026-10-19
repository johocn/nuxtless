# 代买单 · 审计收尾（shareImageUrl + 学生权益露出）2026-10-19

## 背景
买单功能审计 4 项差距中，限额前置公示与券板块断点已交付；本批收尾剩余两项。

## 1. shareImageUrl 空（数据修复）
- 代码侧已闭环（无需改）：og:image 与 JS-SDK 分享卡兜底链齐全（`app.vue` ogImage：渠道 shareImageUrl → `/share-logo.jpg`；`WechatShare.vue` imgUrl：SSR meta → props → 渠道图 → `/share-logo.jpg`）
- 缺口在数据：t3 渠道 `customFields.shareImageUrl=null`，分享卡落通用 logo
- 修复：生成品牌分享图 `public/share-t3.jpg`（绿色代买小哥+店面插画，无文字，163KB 微信友好）随部署上线 → admin-api `updateChannel`(t3) 写入 `shareImageUrl: https://www.youshop.cn/share-t3.jpg`
- 验证：shop-api `activeChannel.customFields.shareImageUrl` 非空 + t3 首页 SSR `og:image` content 命中

## 2. 学生权益露出（代码，与 t1 券店同口径）
- [BillPayCouponSection.vue](../../layers/base/app/components/bill-pay/BillPayCouponSection.vue) 卡面接入 `couponPromoPrice` 统一口径：
  - 学生认证通过（`studentApproved=true`）且模板有 `studentPrice` → 「学生价」teal tag + 优惠价 + 原价划线
  - 首购立减（`firstBuyDiscount>0` 且资格非 false）→ 「首购立减」amber tag + 优惠价 + 原价划线
  - 未认证不露学生价（引导在详情弹层 studentGuide → `/coupon/student-verify`），与 t1 券店行为完全一致；tag 词条复用 `couponStore.studentTag/firstBuyTag`，零新增 i18n
- 选品上架后自动生效，无需发版

## 验证（390×844 dpr=2）
- mock 注入目录（学生价 ¥1200 分/首购减 ¥100）SSR：`学生价¥12/张 ¥16` / `首购立减¥8.90/张 ¥9.90` / 售罄卡置灰 —— `t3-billpay-student-tag-mock.png`
- t3 分享图：`public/share-t3.jpg` 部署后 `https://www.youshop.cn/share-t3.jpg` 200
