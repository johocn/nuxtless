# 首页过滤配置样例（五级风格体系）

首页「语言·城市·配送」过滤功能已接入五级可回退风格体系，以下为各级配置 JSON 样例，供模板库录入 / 店铺覆盖使用。

## 放置层级

| 层级 | 放置位置 | 说明 |
|---|---|---|
| L0 全局默认 | 代码常量 `DEFAULT_HOME_FILTER`（`layers/base/app/utils/home-filter-config.ts`） | 内置兜底 |
| L1 全局配置 | `ShopGlobalConfig.defaults.home.filter` | 平台级默认 |
| L2 风格模板 | `ShopTemplate.pages.home.filter` | 模板库（跟随模板切换） |
| L3 店铺覆盖 | `channel.customFields.shopContent` JSON 的 `filter` 节点 | 与 `sections` 同 JSON 共存 |
| L4 页面/模块内建默认 | 解析器 `parseHomeFilterConfig` 逐字段兜底 | 坏值回退，不抛错 |

合并由 `pageConfig("home")` 现有五级深合并完成，前端 `useHomeFilterConfig` 只做解析 + L4 兜底。

## L1/L2/L3 配置 JSON 示例

```json
{
  "filter": {
    "enabled": true,
    "defaultDelivery": "MAIL",
    "bar": { "visible": true, "variant": "segmented" },
    "modules": {
      "goods": { "enabled": true, "defaultDelivery": null },
      "category": { "enabled": true, "defaultDelivery": null },
      "promo": { "enabled": false, "defaultDelivery": null }
    }
  }
}
```

## 字段说明

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 整页过滤总开关；`false` 回到不过滤现状（无过滤条） |
| `defaultDelivery` | `MAIL` / `SELF_PICKUP` | `MAIL` | 整页默认配送方式（模块未覆盖时生效） |
| `bar.visible` | boolean | `true` | 过滤条显隐 |
| `bar.variant` | `segmented` / `tabs` | `segmented` | 过滤条版式：分段控件 / 文本页签 |
| `modules.goods.enabled` | boolean | `true` | 商品模块过滤开关 |
| `modules.goods.defaultDelivery` | `MAIL` / `SELF_PICKUP` / `null` | `null` | 商品模块默认配送（覆盖整页默认）；`null` 跟随整页 |
| `modules.category.enabled` / `modules.promo.enabled` | boolean | `true` | 分类 / 促销模块开关（当前展示组件为商品楼层，goods 键生效） |

## 验证方式

1. 在模板库（L2 `ShopTemplate.pages.home.filter`）或店铺覆盖（L3 `shopContent.filter` 节点）录入上述 JSON。
2. 刷新首页观察：
   - `bar.variant="tabs"` → 过滤条变为文本页签样式；
   - `modules.goods.enabled=false` 或 `enabled=false` → 无过滤条、商品不过滤（回到现状）；
   - `modules.goods.defaultDelivery="SELF_PICKUP"` → 模块首次进入默认「自提」口径（无本地存储时生效）。
