# 券店倒计时活动位 实施方案（2026-10-18 定稿）

> 上游：[coupon-firstbuy-student-price](2026-10-18-coupon-firstbuy-student-price.md) · 手册 [coupon-storefront/README.md](../manual/coupon-storefront/README.md)
> mockup 已确认：**版式 B 大倒计时卡片**（数字块走秒 + 关联券直达抢购）。

## 1. 政策参数（已定）

| 参数 | 值 |
| --- | --- |
| 版式 | B 大倒计时卡片：店招下方，活动标题/副标题 + hh:mm:ss 数字块 + 关联券 mini 卡直达详情弹层 |
| 配置承载 | **单场**：`Channel.customFields.couponCampaign`（JSON 字符串），到点自动上/下线，无新实体 |
| 活动价 | **不改价**：活动位只高亮现有券（日常价/学生价/首购立减链路零改动） |
| 关联方式 | **手动指定券**：配置 `templateIds` 有序列表，运营精确控制活动位内容与排序 |
| 下线规则 | 未开始不显示；到 `endsAt` 前端走秒归零后自动隐藏；后端按服务端时间判定（不信任本地时钟） |

## 2. 配置结构（Channel.customFields.couponCampaign，JSON 字符串）

```json
{
  "enabled": true,
  "name": { "zh": "周末限时特惠", "en": "Weekend Flash Sale" },
  "subtitle": { "zh": "精选券直降", "en": "Selected coupons on sale" },
  "startsAt": "2026-10-24T00:00:00+08:00",
  "endsAt": "2026-10-26T20:00:00+08:00",
  "templateIds": [83, 84],
  "rules": { "zh": "每人每券限购 2 张 · 活动结束恢复日常价", "en": "Limit 2 per coupon" }
}
```

- `name/subtitle/rules` 为 LocalizedText（`string | Record<locale,string>`），运营在 web-admin 填中/英两栏。
- `startsAt/endsAt` 可空 = 不限端；`templateIds` 空 = 视为未配置。
- 解析为纯函数：坏 JSON / 缺字段返回 null，逐级回退不显示（SSR 友好）。

## 3. 后端（coupon-plugin + cjk-plugin）

- `promo-custom-fields.ts`：Channel 加 `couponCampaign`（string nullable，text 列）。
- 迁移：扩展 `AddCouponPromoFieldsMigration` plan 加 `channel.customFieldsCouponcampaign`（text，幂等 hasColumn；customFields 嵌入列命名坑已趟平，列名与 metadata 一致）。
- `coupon-sale.ts` 纯函数（+单测）：
  - `parseCouponCampaignConfig(raw)`：JSON 解析 + 字段规整，坏数据返回 null；
  - `resolveActiveCampaign(config, saleable, now, lang)`：enabled + 时间窗 + templateIds 命中本店可售券（保持配置顺序）→ 输出 `CouponCampaignView`（name/subtitle/rules 已按 lang 本地化，startsAt/endsAt ISO 字符串，templates 数组）；
  - `localizeTextByLang(v, lang)`：zh_Hans→zh 键映射兜底链（当前 lang → 去地区码 → 首个非空值）。
- `coupon-sale.service.ts` `saleCatalogue`：读 channel customFields → `resolveActiveCampaign` → 返回 `campaign`（null=无活动）。
- `plugin.ts` shop schema：`type CouponCampaign { name subtitle rules startsAt endsAt templates }`，`CouponSaleCatalogue.campaign: CouponCampaign`。
- cjk-plugin（顺手补缺口）：`updateTenant` resolver/service input 加 `couponCampaign?: string` 与 `firstBuyDiscount?: number`（web-admin saveFirstBuy 此前传参但 resolver 未声明，一并修正）。

## 4. web-admin（vshop）

- `apis/tenant-admin.ts`：TENANT_FIELDS / mapTenant / updateTenant 类型加 `couponCampaign`、`firstBuyDiscount`。
- 租户详情页新配置卡「倒计时活动」（首购立减卡下方）：
  - 启用开关；名称（中/英）；副标题（中/英）；规则文案（中/英）；
  - 开始/结束时间：日期 picker + 时间 picker 组合（存 ISO 带 +08:00）；
  - 关联券多选：复用 `apis/coupon.ts` 券模板列表，勾选后按勾选顺序写 `templateIds`；
  - 保存 → `updateTenant(channelId, { couponCampaign: JSON.stringify(config) })`；清空结束时间+关开关=下线。

## 5. nshop 前台

- `useCoupon.ts`：`CouponSaleCatalogue.campaign` 类型 + GraphQL 查询扩展。
- 新组件 `coupon-store/CouponStoreCampaignCard.vue`（版式 B）：
  - 红色活动大卡：标题 + 副标题 + 数字块倒计时（`useCampaignCountdown`：endsAt 秒级刷新，到 0 自动隐藏并 emit）；
  - 关联券 mini 卡 2 列 grid：券名 + 现价（走既有展示逻辑）+「抢购」→ 复用 `openDetail(tpl)` 详情弹层；
  - 底部规则文案行；i18n 固定文案（距结束/抢购等）走字典。
- `CouponStoreHome.vue`：店招下挂载活动卡（grid/floors 两版式都挂），campaign 为 null 不渲染。
- i18n zh-CN / en-US 同步新增词条。

## 6. t1 上线配置

- Channel 7（t1）`customFieldsCouponcampaign` 写示例活动 JSON（关联券 83/84，周末窗口，运营后续在 web-admin 自改）。

## 7. 验收清单

- B：catalogue 匿名返回 campaign（窗口内）含关联券；窗口外/未配置/禁用 → null。
- C：web-admin 配置保存后 t1 前台出现活动卡；结束时间到期自动消失。
- 手机视口截图（活动卡/抢购弹层）+ 手册 6.3 节 + C 用例。
- 边界：坏 JSON 不炸页面（回退不显示）；templateIds 含他店券自动过滤；单测覆盖 parse/resolve/localize。
