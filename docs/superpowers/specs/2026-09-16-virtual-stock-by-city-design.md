# 商品详情页库存「按城市计算」修复设计方案

日期：2026-09-16
状态：设计定稿，待用户复核
范围：nshop（Nuxt3 SSR / layers/base）+ vendure `cjk-plugin` / `inventory-plugin`

## 一、背景与目标

nshop 商品详情页库存当前显示「无」（应显示具体数值）。根因为 `variantStockInfo.saleableStock` 取的是**全局虚拟仓 onHand**（仓库该 onHand=0 或无记录），`StockInfoBlock` 走 `outOfStock` 分支显示「无」。

用户要求**已有设计方案不变更**，但强调**虚拟库存按城市计算库存数量**。经确认数据口径：主库存数字 = 当前选择城市可服务仓库的库存合计；纯虚拟变体或无城市可服务仓时回退全局虚拟仓数。

目标：①修「无」根因；②把 `saleableStock` 从「全局虚拟仓」改为「按当前城市聚合」，C 端切城市即刷新库存数。

## 二、现状链路（已核实代码）

- C 端消费：`layers/base/app/components/product/StockInfoBlock.vue` 调 `useProductStockInfo()` → `GqlVariantStockInfo({variantId, lat, lng})`；`saleable>0` 显示「库存N件」，否则 `outOfStock`「无」。
- `layers/base/app/composables/useProductStockInfo.ts`: `refresh(variantId, lat?, lng?)` 拉 `variantStockInfo`。
- 城市来源：`useCityService()` 内 `useLocationStore().cityName`；商品层有 `belongCity/serviceCities`。
- 后端主库存：`vendure/packages/cjk-plugin/src/inventory/virtual-physical-stock.service.ts#getSaleableAndDetail` → `saleableStock = virtualOnHand`（虚拟仓 onHand），**未按城市**；`stockDetail` = 绑定物理仓近距排序。
- 附近库存（复用城市过滤语义）：`vendure/packages/inventory-plugin/src/inventory.service.ts#locationServesCity` —— 仓库 `customFields.serviceCities`，未配置视为全城可服务。

## 三、设计

### 数据口径（核心）

```
physicalStockEnabled && 有绑定物理仓：
  若提供 city：
    可服务仓 = 绑定物理仓 ∩ {serviceCities 含 city 或未配(全城可服务)}
    主库存 = Σ 可服务仓.onHand
    附近明细 = 可服务仓（近距排序）
    若无任何可服务仓 → 主库存回退全局虚拟仓 onHand
  未提供 city：主库存 = 全局虚拟仓 onHand（保持 D4 不回归）
纯虚拟变体（无绑定）：主库存 = 全局虚拟仓 onHand
```

- `saleableStock` 即该接口的主数字字段。
- 城市匹配沿用 inventory-plugin `locationServesCity` 语义（含「未配 serviceCities = 全城」）。

### 后端（`cjk-plugin`）

- `src/inventory/inventory-shop.resolver.ts`：`variantStockInfo` 增参数 `city: String`（nullable）。
- `src/inventory/virtual-physical-stock.service.ts#getSaleableAndDetail(ctx, variantId, lat?, lng?, city?)`：
  - 保持 `virtualOnHand` 兜底。
  - 当 `physicalStockEnabled && bindings.length` 且 `city` 提供时，按 `serviceCities` 过滤绑定仓；`saleableStock = Σ 可服务仓 onHand`；无可服务仓 → 回退 `virtualOnHand`；`stockDetail` 取可服务仓近距排序。
  - 提供轻量 `locationServesCity(loc, city)` private helper（与 inventory-plugin 同语义）。

### 前端（`nshop/layers/base`）

- `gql/queries` 中 `variantStockInfo` 查询加 `city` 变量（类型随 codegen 更新）。
- `composables/useProductStockInfo.ts#refresh` 增 `city` 入参（null 缺省），读取 `useLocationStore().cityName`；`StockInfoBlock` 监听城市变化重新 `refresh()`。
- `StockInfoBlock.vue` 显示形态不改（「库存N件」+附近折叠），仅依赖新的按城市 saleableStock。

### 边界与错误处理

- `city` 为空（未定位）→ 回退全局虚拟仓，不回归 D4。
- 物理驱动但当前城市无可服务仓 → 主库存回退虚拟仓数（不全置「无」）。
- 坏 `serviceCities`（null/非数组/非字符串项）→ 视为全城可服务。

## 四、验收标准

1. **修「无」**：任意变体不再因全局虚拟仓为0而显示「无」；有城市仓有数即显示具体数值。
2. **按城市聚合**：选中某城市 → 主库存 = 该城市可服务仓库合计；无仓库城市 → 回退虚拟仓数。
3. **纯虚拟与未定位**：保持既有 D4 行为（全局虚拟仓数）。
4. **切城市刷新**：C 端切换城市后库存数随之刷新（不依赖 SPA 旧快照）。
5. **交付物**：手机视口(390×844, dpr=2) 截图（选中城市显示库存数 + 附近面板）补入操作手册。

## 五、范围与边界

- 范围：改 `saleableStock` 数据口径 + `variantStockInfo` 增 `city` + 前端传城市并监听刷新。
- 不含：不动 `variantNearbyStock` 现有城市过滤；不新增 UI 版式；不涉及配色/风格体系。
- 部署：本地构建，服务器仅解压 / `pm2 restart`，不在服务器构建。

## 六、涉及文件

- 后端：`vendure/packages/cjk-plugin/src/inventory/inventory-shop.resolver.ts`、`virtual-physical-stock.service.ts`、相关 `*.spec.ts`
- 前端：`nshop/layers/base/app/composables/useProductStockInfo.ts`、`components/product/StockInfoBlock.vue`、`gql/queries`（variantStockInfo）