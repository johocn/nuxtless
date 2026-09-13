# 商品详情页后续三问题修复 · 设计文档

日期：2026-09-13
状态：已批准（用户确认三处决策）
关联：`docs/superpowers/plans/2026-09-13-product-detail-fixes.md`（上一轮六项修复计划，已执行）

## 背景

上一轮六项修复（商品图/促销/就近库存/营销标签/面包屑/底栏）完成后，用户反馈三个遗留问题：

1. **就近库存"库信息还是看不见"**：详情页就近库存区显示"暂无可查看的门店库存"，实际默认仓有货（10 件）。
2. **无意义编码 p1788780326947**：商品名称结尾处及商品信息 SKU 处显示该编码。
3. **9 张图片编辑保存失败**：商品 72（`https://e.joho.cn/guanli/#/pages/product/edit/index?id=72`）选择 9 张图片保存后图片未落库（无报错）。

## 根因分析（已确认）

### 问题 1 · 就近库存空态

后端 `inventory.service.ts#findNearbyStock` 双重过滤：
- `if (options.city && !this.locationServesCity(loc, options.city)) continue;` —— 非服务城市仓库被跳过
- `if (origin && !this.locationHasCoords(loc)) continue;` —— 带定位时无坐标仓库被跳过

线上仓库现状：长春仓（有坐标、serviceCities=[长春市]）、默认仓（无坐标、有货 10 件）、Test 仓（无坐标、无货）。
- 非长春用户带定位：长春仓被城市过滤、默认仓/Test 仓被坐标过滤 → 全部跳过 → 返回空 → 前端"暂无可查看的门店库存"。
- 即使长春用户：仅剩长春仓（0 件），默认仓 10 件仍不可见。

### 问题 2 · P+时间戳编码

- web-admin `apis/product.ts#createProductFull` 单变体创建：`sku: 'P' + Date.now()`。
- `createVariantsForProduct`：`translations: [{ languageCode, name: input.sku }]` —— **变体名 = SKU 编码**。
- 详情页标题 = 商品名 + 变体名拼接；SKU 信息区直接渲染 `sku` → 用户看到 `p1788780326947`。

### 问题 3 · 9 张图保存失败

- web-admin 已有 `ensureAssetsInCurrentChannel` 保险（保存前把选中资产 assign 到当前渠道，防止跨渠道共享商品在本渠道保存时把全局 ProductAsset 关联清空）。
- **但本地 dist 构建产物（2026-09-01，疑为线上部署源）中该保险的 GraphQL mutation 字段名是无效的 `n(input: $input)`**，必然执行失败 → 被 `catch {}` 静默吞掉 → 保险从未生效。
- 随后的 `updateProduct({ assetIds, featuredAssetId })` 按当前渠道过滤资产（`findByIdsInChannel`），跨渠道图片被静默丢弃/清空 → 无报错但图没保存上。
- 2026-09-13 提交 `10c04c5` 的 dist 产物（`apis-product.BY6rZbxi.js`）又不含完整商品编辑逻辑（仅 13.9KB，无 AssignAssets/UpdateProductAssets），线上部署版本存疑。

## 方案（用户已确认三处决策）

### 问题 1 · 就近库存「全部展示 + 城市标记」

**后端**（`d:\zhao\vendure\packages\inventory-plugin\src\inventory.service.ts`）：

1. 删除城市过滤：
   ```ts
   if (options.city && !this.locationServesCity(loc, options.city)) { continue; }
   ```
2. 删除坐标过滤：
   ```ts
   if (origin && !this.locationHasCoords(loc)) { continue; }
   ```
3. 排序逻辑保留（有坐标距离升序，无坐标 `MAX_SAFE_INTEGER` 排末尾）。

**前端**（`d:\zhao\nshop\layers\base\app\components\product\NearbyStores.vue`）：

1. `formatDistance`：`distanceKm` 为空或 ≥ 阈值（如 `1e9`）时显示「距离未知」（当前 `MAX_SAFE_INTEGER` 会渲染成超长数字）。
2. `serviceCities` 为空时显示「服务城市：全城」；有值时保持现状（`join('、')`）。
3. 0 件仓库保留展示，数字灰显（完整库存视图，不做过滤）。

### 问题 2 · P 编码「新建修复 + 前端隐藏 + 存量修正」

**新建修复**（`d:\zhao\vshop\web-admin\src\apis\product.ts`）：

1. `createVariantsForProduct`：`CreateVariantInput` 增加 `productName?: string`，`translations.name` 改为 `input.productName || input.sku`。
2. `createProductFull` 单变体创建调用处传 `productName: input.name`。
3. 多规格矩阵（`createVariantMatrixForProduct`）不变——变体名 = 规格组合（`labels.join('·')`），本身有意义。

**前端隐藏**（`d:\zhao\nshop` 详情页）：

1. 标题规则（用户确认）：**无规格商品只显示商品名；多规格商品显示「商品名 · 规格组合」**。
   - 多规格判定：首个变体 `options?.length > 0`。
2. SKU 信息区：
   - 自动编码（`/^P\d+$/`）不展示。
   - 无规格显示「规格：默认」；多规格显示规格组合名。
3. 实现位置：`useProductDetailView.ts` / `DetailClassic.vue` / `DetailFloor.vue` 中标题拼接与 SKU 渲染处（实现计划中定位）。

**存量修正**（SQL，vendure 数据库）：

```sql
UPDATE product_variant_translation pvt
JOIN product_variant pv ON pvt.variantId = pv.id
JOIN product p ON pv.productId = p.id
SET pvt.name = (SELECT name FROM product_translation pt WHERE pt.productId = p.id AND pt.languageCode = 'zh_Hans' LIMIT 1)
WHERE pvt.name REGEXP '^P[0-9]+$';
```

（执行前需备份；线上数据为 mysql，语法按实际方言微调）

### 问题 3 · 9 张图「修保险 + 重建部署 + 数据修复」

**修保险**（`d:\zhao\vshop\web-admin\src\apis\product.ts#ensureAssetsInCurrentChannel`）：

1. 核对 mutation 字段名 `assignAssetsToChannel`（当前源码正确，需确认线上产物）。
2. 去掉静默吞错：`catch` 中至少 `console.error`，避免无声失败。
3. `featuredAssetId` 一并纳入 assign 范围（当前仅 `assetIds`）。

**重建部署**：

1. web-admin 本地构建（vue 3.5.41 锁定）。
2. 按既有部署机制部署新 dist 到线上（确认机制：`scripts/deploy.mjs` 或手动上传，实现计划中确认）。
3. 部署后验证线上产物含 `assignAssetsToChannel` 字符串。

**数据修复**（商品 72）：

1. 把商品 72 现有 featuredAsset(42) 及关联资产 assign 到商品所在各渠道（恢复跨渠道可见）。
2. 之后用户重新编辑保存 9 张图应成功。

## 验收标准

### 问题 1
- [ ] 线上任意城市定位访问有货商品，就近库存区显示全部仓库（有坐标按距离、无坐标「距离未知」排末尾）
- [ ] 服务城市为空仓库显示「服务城市：全城」
- [ ] 手机视口截图入库（操作手册补充）

### 问题 2
- [ ] 新建单规格商品，详情页标题仅商品名，无 P 编码
- [ ] 存量商品（国信南山温泉）标题/SKU 区无 `p1788780326947`
- [ ] 多规格商品标题仍显示「商品名 · 规格组合」
- [ ] 手机视口截图入库

### 问题 3
- [ ] 商品 72 编辑保存 9 张图成功，后台回填与 C 端详情一致
- [ ] 线上 web-admin 产物含有效 `assignAssetsToChannel`
- [ ] 保存失败不再静默（有错误日志）

## 风险与待确认

1. 问题 2 标题拼接/多规格判定口径在实现计划中定稿（需读 `useProductDetailView` / `DetailClassic` / `DetailFloor`）。
2. 问题 3 需确认 web-admin 线上部署方式（`scripts/deploy.mjs` 或手动上传）与线上产物版本。
3. 存量 SQL 修改变体名可能影响订单历史展示（订单行快照通常独立，需冒烟确认）。
4. 就近库存改为全展示后，距离排序对无坐标仓为固定末尾，无需前端额外排序。
