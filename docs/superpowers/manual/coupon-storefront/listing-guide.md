# 券选品上架操作指引（买单券 · 到店场景）

> 适用：t3 代买单服务店「自己到店」券板块及任何券店（coupon storefront）模式的选品上架。
> 原理：C 端板块数据源 = `couponSaleCatalogue(scene: "IN_STORE")` 可售目录，**按渠道自动隔离**；目录为空时板块显示「买单券即将上架，敬请期待」兜底。**上架后券卡自动出现，无需发版。**

## 1. 前置

- 入口：`https://e.joho.cn/guanli/`（web-admin，superadmin 登录）
- 板块位置：t3 首页（www.youshop.cn/t3/billpay）委托表单下方「自己到店」
- 当前状态：t3 目录为空（选品未上架）；t1 已有 10 张在架（id 83-92，全配业态 category）可作参照

## 2. 创建券模板（逐字段规范）

web-admin → **优惠券模块** → 创建券模板。关键字段（单位与默认值是高频踩坑点）：

| 字段 | 规范 | 说明 |
|---|---|---|
| **usageScene** | **IN_STORE**（到店买单） | ⚠️ 默认 ONLINE——漏改则 C 端目录永远为空；两可场景选 ALL |
| **type** | FIXED / PERCENT / FULL | **满减用 FIXED**：minSpend=门槛（分）+ discountValue=减额（分），如「满50减10」= minSpend 5000 + discountValue 1000（t1 id85 实证）；FULL=无门槛立减（**服务端强制 minSpend=0**） |
| **discountValue** | FIXED/FULL：**分**；PERCENT：**折数 1-99** | ⚠️ PERCENT 填 85 = 8.5 折（不是 85%） |
| minSpend | 满减门槛（**分**，0=无门槛） | ⚠️ 仅 FIXED 生效；FULL 会被服务端强制清 0 |
| **salePrice** | 售价（**分**） | ⚠️ **必须 >0 才可售**；0 = 不可售 |
| anchorPrice | 划线锚定价（分，可空） | 展示划线「原价」对比，null/0 不展示 |
| studentPrice | 学生价（分，可空） | 仅认证学生可见与生效；0/空=无学生价 |
| label | 营销标签（≤6 字，可空） | 如「热卖TOP」 |
| **category** | 业态短串（≤30 字符，可空） | 如 food/billiards；同业态 **>20 张激活业态分组**，不足走类型分组（t1 现状：10 张全配 category） |
| totalCount / claimedCount | 发行总量 / 已领取（claimed 一般 0） | 售罄口径 = `totalCount>0 && claimedCount>=totalCount`；totalCount=0 不限量 |
| claimable | **false**（售卖券） | 表示不开放免费领取，**不影响售罄判定**（免费领券场景才用 true） |
| enabled | true | 上下架开关 |
| 有效期 | validDays（领后 N 天）或 startsAt/endsAt | 二选一 |
| **渠道上下文** | **先切 t3 租户** | ⚠️ 创建时自动绑定当前管理会话渠道（service 强制 `tpl.channels=[ctx.channel]`）：web-admin 登录后先在租户选择页切到 t3，再进优惠券模块；API 创建带 `vendure-channel-token: <t3-token>` 头 |
| **distributionChannels** | **含 SALE** | ⚠️ 分发渠道集合（逗号分隔 CENTRE,SALE,POINTS,CODE…），不含 SALE = 不进可售目录 |

> t1 参照（实值，2026-10-19 生产核查）：三档满减券 id 85/86/87 均为 **FIXED**（满50减10=minSpend 5000+discountValue 1000；满100减30；满200减60），usageScene=IN_STORE，在架「立减」楼层；楼层锚点由 `couponFloorGroups` 渠道 customFields 下发（**列宽 varchar(255)，title 只能单语言中文**，勿超长）。券名多语言存储键为 `zh_Hans`/`en`（nameZh/nameEn 入参自动映射）。

## 3. 上架后验证

1. **目录探针**（t3 渠道 token）：
   ```bash
   curl -s -H "Content-Type: application/json" -H "vendure-token: <t3-token>" \
     -d '{"query":"query { couponSaleCatalogue(scene: \"IN_STORE\") { templates { id name type discountValue salePrice studentPrice totalCount claimedCount enabled usageScene } } }"}' \
     https://www.youshop.cn/shop-api
   ```
   判据：templates 含新券且 `usageScene=IN_STORE`（或 ALL）、`enabled=true`。
2. **C 端亮卡**：打开 `https://www.youshop.cn/t3/billpay`，「自己到店」板块由「即将上架」变为横滑券卡（面额大字 / 售价 / 抢购 pill；有学生价且已认证显示「学生价」tag，首购资格显示「首购立减」tag）。
3. **手机核验**（390×844 dpr=2）：微信开发者工具或 Playwright 移动视口截图，确认券卡换行不溢出、售罄卡置灰。

## 4. 常见坑速查

| 现象 | 根因 |
|---|---|
| 上架后板块仍「即将上架」 | usageScene 漏改（仍 ONLINE）/ 未勾 t3 渠道 / distributionChannels 无 SALE / salePrice=0 / enabled=false |
| 券卡显示「已抢罄」 | claimedCount 已达 totalCount（totalCount>0 时） |
| 价格差 100 倍 | 金额单位是**分**（salePrice=1600 显示 ¥16） |
| 折扣显示 85 而非 8.5 折 | PERCENT 的 discountValue 是折数 1-99（85=8.5折） |
| 学生价不显示 | 正常——仅**认证学生**可见（未认证引导在详情弹层）；studentPrice 需 < salePrice |
| 券详情页打不开/内容空 | 单券详情用 ONLINE+IN_STORE 双场景合并查询；usageScene=ALL 的券可正常展示，无需运营处理 |

## 5. 批量上架（运维向，可选）

web-admin 逐张创建适合少量选品；批量可走 admin-api（凭据与调用方式见项目记忆「生产 admin 凭据」条目，经 ssh joho → localhost:3020/admin-api，session cookie 认证）。**注意：请求必须带 `vendure-channel-token: <t3-token>` 头切到 t3 渠道上下文**（创建自动绑当前渠道，不带头会落默认渠道）：

```bash
mutation {
  createCouponTemplate(input: {
    nameZh: "全场买单券"
    nameEn: "Storewide bill-pay voucher"
    type: PERCENT
    discountValue: 80
    minSpend: 0
    salePrice: 1600
    totalCount: 100
    usageScene: IN_STORE
    distributionChannels: "SALE"
    enabled: true
    claimable: false
  }) { id nameZh }
}
```

> 多语言名称用 `nameZh`/`nameEn`（单 String，非对象；`applyMultilingualInput` 合并为 LocalizedText）；input 无渠道字段（自动绑会话渠道）；mutation 直接返回 `CouponTemplate!`（非 ErrorResult union）。字段以线上 SDL 为准（`__type(name:"CreateCouponTemplateInput")` 可查，t3 渠道 token 见项目记忆）。建议先用 1 张券全链路验证再批量。
