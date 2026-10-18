# 券店首购立减 + 学生价 实施方案（2026-10-18 定稿）

> 上游：[coupon-storefront-mode](2026-10-18-coupon-storefront-mode.md) · 手册 [coupon-storefront/README.md](../manual/coupon-storefront/README.md)
> mockup 已确认：首购立减 **¥2**；学生认证 **A 人工审核流**。

## 1. 政策参数（已定）

| 参数 | 值 |
| --- | --- |
| 首购立减 | 渠道级统一 **¥2**（web-admin 租户管理配置，分存 customFields，0=关闭） |
| 首购资格 | 本渠道无 PAID 券出售单的登录用户，每用户 1 次 |
| 学生价 | 券模板级 `studentPrice`（分，可选），仅认证通过学生生效 |
| 学生认证 | 人工审核：C 端提交学校/学号/学生证照片 → 后台审核 → 通过/驳回 |
| 叠加规则 | 学生价与首购立减**取低不叠加**；到手价最低 ¥0.01 |
| 展示红线 | 无资格用户看原价不误导；学生价仅认证后展示价格（未认证只显示引导入口）；后端下单重算，不信任前端 |

## 2. 数据模型

- `coupon_template.studentPrice` int nullable（分）——幂等迁移补列
- `Channel.customFields.firstBuyDiscount` int nullable（分）——coupon-plugin 贡献
- `Customer.customFields.studentStatus` varchar（none/pending/approved/rejected）
- `Customer.customFields.studentInfo` varchar（JSON：school/studentNo/idImg）
- `Customer.customFields.studentReviewedAt` datetime nullable
- `coupon_sale_order.discountType` varchar nullable（FIRST_BUY/STUDENT）+ `discountAmount` int nullable（分，记录让利额）

## 3. 后端（coupon-plugin）

- 迁移 `add-coupon-promo-fields`：补上述列（幂等，启动执行）
- `student.service.ts`：
  - shop：`applyStudentVerification(school, studentNo, idImg)`（Authenticated，置 pending）、`myStudentStatus`
  - admin：`studentVerifications(status)` 列表、`reviewStudentVerification(customerId, approve)`（写 status/reviewedAt）
- `coupon-sale.service.ts`：
  - `createSaleOrder` 重算：`final = min(学生路径, 首购路径, 原价)`，floor 1 分；写 discountType/discountAmount
  - `saleCatalogue` 下发：tpl.`studentPrice`、channel `firstBuyDiscount`；登录用户附 `firstBuyEligible` 与 per-tpl `studentEligible`（匿名=null）
- schema：CouponTemplate 加 `studentPrice`；新增 StudentVerification 相关 type/mutation/query

## 4. web-admin（vshop）

- 券模板表单：SALE 渠道下「学生价（元）」可选填（同 anchorPrice 模式）
- 租户管理：店面模式块旁「首购立减（元）」（写 Channel customFields，0=关闭）
- 新页面「学生认证审核」（优惠券模块）：状态筛选 + 学校/学号/照片 + 通过/驳回

## 5. nshop 前台

- 券卡（floors/grid）：登录且 firstBuyEligible → 显示首购价 +「首购立减¥2」；approved 学生且有 studentPrice → 学生价；否则原价
- DetailSheet：价格明细行（券价/优惠/到手）+ 未认证学生引导「认证学生享学生价」入口
- 新页 `/coupon/student-verify`：认证表单（学校/学号/照片上传）+ 状态卡（审核中/通过/驳回原因）
- i18n zh-CN/en-US 同步

## 6. t1 上线配置

- Channel 7（t1）customFields.firstBuyDiscount = 200（¥2）
- 券 83/84 studentPrice 暂不配（学生价按券逐个开）；后续运营自配

## 7. 验收清单

- B：匿名 catalogue 带 firstBuyDiscount；登录新客 firstBuyEligible=true；老客 false
- B：createSaleOrder 新客单 amount=300 分 + discountType=FIRST_BUY；学生 approved + studentPrice 券取低
- B：审核流 apply→pending→approve→myStudentStatus=approved
- C：手机视口截图（券卡首购价/弹层明细/认证页/审核页）
- 边界：重复首购仅第一次立减；券包参与首购立减；取消/退款单不复活资格（PAID 口径）
