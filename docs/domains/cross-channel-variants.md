# 跨渠道商品变体/迁移领域手册（Cross-Channel Variants & Migration）

> 入口指针：`project_memory.md`「跨渠道商品变体分配机制（商品61坑）」「租户商品双轨隔离 + 整体迁移机制」「共享变体 → 单一 price 源」速查段落 → 本手册。
> 覆盖：后端 vendure `packages/cjk-plugin`（租户目录双轨隔离）+ `packages/marketplace-plugin`（上架迁移）、运营端 vshop `web-admin`（商品编辑保存）。
> 关联手册：`docs/domains/pricing-tax.md`（价格/税档三态；共享变体 price 单源的取值口径与校准规则）。

## 1. 概念模型

| 实体 | 关键字段 | 说明 |
|---|---|---|
| Product 商品 | `channels`（Channel 归属集合）、customFields：`merchantRef`、`marketplaceStatus`、`listedInMarketplace`、`needsCategorization`、`platformCategoryId`、`tenantCategoryRef` | 可同时归属多个渠道；上架状态机字段集中在 customFields |
| ProductVariant 变体 | `optionIds`（规格组合）、`channels`（**每个变体有自己的 Channel 归属**） | 唯一性按 `(productId, optionIds)` **全局**判定 |
| Channel 渠道 | `code`、`pricesIncludeTax`、`taxMode` | `__default_channel__`(id=1)=平台/默认商城；`t2`(id=37) 等为租户渠道；`pricesIncludeTax` 决定变体 `price` 字段的解释口径 |

**核心规则**：
- **变体唯一性按 `(productId, optionIds)` 全局判定**：同一 Product 下相同规格组合的变体在整个实例内只能存在一个，与渠道无关。多渠道共享商品时，跨渠道只能「共享同一变体记录」，不能「各渠道各建一个同规格变体」。
- **每个变体有自己的 Channel 归属**（`channels` 关联）：同一变体可挂多个渠道（如商品61 = 默认渠道 + t2 共享同一变体）。渠道隔离不靠复制变体，而靠各渠道上下文分别维护/解释 price、库存（stockLocations）。
- **变体分配 mutation**：`assignProductVariantsToChannel(input:{productVariantIds, channelId})` —— mutation 用 **input 对象**传参（非 `variantIds`/`channelId` 顶层参数），核心实现在 `product-variant.service.ts`。
- **租户商品双轨隔离**：`TenantCatalogService.moveProductsToTenantChannel` 把租户自建商品**主动从默认渠道摘除**（经 `channelService.removeFromChannels` 直摘，绕开「默认渠道不可摘除」守卫），实现「租户商品只挂租户渠道、默认商城互见」双轨隔离。因此各租户**自由创建变体/无变体商品都能成功**，只有商品被显式挂到多渠道时才可能撞唯一性。
- **上架迁移（租户 → 默认商城）**：商户 `submitForMarketplaceAdmin`（置 `marketplaceStatus=PENDING`、`listedInMarketplace=false`，校验 barcode 全局唯一）→ 平台 `approveMarketplaceProduct`（置 `merchantRef`=非默认渠道 id、`marketplaceStatus=APPROVED`、`listedInMarketplace=true`）→ 其内部 `placeIntoTenantCategory` 调 `productService.assignProductsToChannel` 把商品**及其所有变体、资产、规格组整体迁移**补挂默认渠道（非逐个新建，故不冲突），并按 `tenantCategoryRef` → 渠道 `categoryMapping` 映射平台分类；未命中置 `needsCategorization=true` 待手动归类。

## 2. 文件地图（符号级，行号用 rg 现查）

### 后端 vendure `packages/cjk-plugin/src/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `tenant/tenant-catalog.service.ts` | 租户商品目录：租户分类、商品挂渠道/分类关联 | `TenantCatalogService`：`createTenantCollection`、`addProductToCollection`（写 Collection `product-id-filter` + `triggerApplyFiltersJob` 重算成员）、**`moveProductsToTenantChannel`**（挂租户渠道 + 从默认渠道摘除，双轨隔离核心。注：设计稿中的 `moveProductsToTenantCategory` 为别名，代码实际方法名是 `moveProductsToTenantChannel`） |
| `tenant/tenant-catalog-admin.resolver.ts` | admin GraphQL 入口 | `moveProductsToTenantChannel` mutation 转发 |

### 后端 vendure `packages/marketplace-plugin/src/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `marketplace/marketplace.service.ts` | 上架/审批/整体迁移/对外展示 | `MarketplaceService`：`submitForMarketplace` / `submitForMarketplaceOwnedByChannel`（提交上架，PENDING）、`approveMarketplaceProduct`（审批通过：merchantRef/APPROVED/listedInMarketplace=true）、**`placeIntoTenantCategory`**（private：`assignProductsToChannel` 整体补挂默认渠道 + 分类归位）、`rejectMarketplaceProduct`、`getMarketplaceProducts`（仅 approved + listedInMarketplace） |
| `api/admin.api-extensions.ts` | admin mutation 定义 | `submitForMarketplaceAdmin`、`approveMarketplaceProduct`、`rejectMarketplaceProduct`、`setProductPlatformCategory` |
| `api/admin.resolver.ts` / `api/shop.resolver.ts` | GraphQL 入口 | 调用 `MarketplaceService` |

### Vendure 核心 `packages/core/src/service/services/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `product-variant.service.ts` | 变体渠道分配 | **`assignProductVariantsToChannel`**（签名接收 `input` 对象：`productVariantIds` + `channelId`） |
| `product.service.ts` | 商品渠道分配（整体迁移） | `assignProductsToChannel(input:{productIds, channelId, priceFactor})` —— 一并迁移变体/资产/规格组 |

### 运营端 vshop `web-admin/src/apis/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `apis/product.ts` | 商品保存链路（商品 + 变体整体保存） | `createProductFull(input: ProductSaveInput)`、`updateProductFull(id, input)`；无规格商品提交前须把 `priceYuan`×100 同步进默认变体行 |

## 3. 设计决策（ADR 式）

| 决策 | 理由 |
|---|---|
| 租户商品双轨隔离（`moveProductsToTenantChannel` 主动从默认渠道摘除） | 租户自建商品只挂租户渠道、默认商城互见；各租户自由建变体/无变体商品不撞全局唯一性（默认渠道无该商品，同规格变体无冲突） |
| 上架 = 整体迁移（`placeIntoTenantCategory` 内 `assignProductsToChannel` 补挂默认渠道） | 商品 + 变体 + 资产 + 规格组一次整体挂载，**不逐个新建变体**，故不触发 `(productId, optionIds)` 全局唯一性冲突 |
| 共享变体 price 单源（vs「独立记录」） | 同一变体记录跨渠道共享：任一侧上下文 `updateProductVariants` 写 price，两侧**同时被改**，无法按渠道存独立值；渠道差异由各渠道 `pricesIncludeTax`/`taxMode` 在前台解释（详见 `pricing-tax.md`） |
| `assignProductVariantsToChannel` 用 `input` 对象传参 | 遵循 Vendure 核心 mutation 签名（resolver 转发 `args.input`），误用顶层参数会导致 schema 校验失败 |
| 上架后变体维护收敛到商品编辑页 | 商品已挂默认渠道后，租户渠道再建同规格变体必撞全局唯一性；统一在编辑页维护变体可规避 |

## 4. 常见坑

| 现象 | 根因 | 解法 |
|---|---|---|
| 商品61：运营端 t2 保存价格永远失败 | 默认渠道上下文 `createProductVariants` 创建的无规格变体**只挂默认渠道**；t2 再建同规格变体报 `A ProductVariant with the selected options already exists`，但 t2 `product{variants}` 返回空（看不到默认渠道的变体） | `assignProductVariantsToChannel(input:{productVariantIds, channelId})` 把默认渠道已建的变体显式分配到 t2，两渠道共享同一变体 |
| 臆测渠道 id | 渠道 id 是部署环境相关的 | 操作前先查 `channels{items{id code}}`，实测 t2=37、__default_channel__=1，勿硬编码臆测 |
| 上架到默认渠道后，再在租户渠道新建同规格变体 | 商品已挂默认渠道，`(productId, optionIds)` 全局唯一性被占 | 正常统一在商品编辑页维护变体即可规避 |
| 共享变体价格「写一侧、两侧同改」 | 共享变体是单源存储，不按渠道存独立值 | 按「后台价格一致性」规则：后台 `price` 直存录入原值，不做任何 ×1.13 换算；前台差异由各渠道税档呈现 |

## 5. 问题速查（Bug 知识库）

| 现象 | 根因 | 代码点 | 验证 |
|---|---|---|---|
| 商品61：t2 渠道保存价格永远失败 | 无规格变体只挂默认渠道，t2 再建同规格撞全局唯一性但本渠道 variants 返回空 | `assignProductVariantsToChannel`（`product-variant.service.ts`）；`TenantCatalogService.moveProductsToTenantChannel` 隔离逻辑 | 多渠道 `product{variants}` 查询 + 渠道 id 核对（t2=37）后 assign 复验 |
| 上架后租户渠道新建同规格变体冲突 | 商品已被 `assignProductsToChannel` 补挂默认渠道，全局唯一性被占 | `MarketplaceService.placeIntoTenantCategory` 内 `productService.assignProductsToChannel` | 编辑页统一维护变体后回归 |
| 跨渠道 price 语义差异：同一变体不同渠道读到不同 price | 各渠道 `pricesIncludeTax` 不同，`price` 字段解释口径相反（默认渠道存净价、t2 存含税价） | 变体 `price` 字段 + 渠道 `pricesIncludeTax`；`vshop/web-admin/scripts/calibrate-prices.mjs` 固定 ×1.13 只对 t2 类正确 | 分渠道查询 price/priceWithTax 对比（默认渠道校准须直接写 `price=目标净价`） |
| 共享变体写一侧 price，两侧同时被改 | 共享变体为单源存储，无「独立记录」 | `updateProductVariants`（任渠道上下文） | 任一侧写价后两侧查询对比 |

## 6. 验证清单

- **查渠道 id（勿臆测）**：admin gql `channels{items{id code}}`；脚本 `tmp/query-channels.mjs`（连 vendure 库查 channel 表）。实测 t2=37、__default_channel__=1。
- **多渠道 `product{variants}` 查询**：分别用默认渠道与租户渠道上下文查同一商品，确认共享同一变体（而不是各渠道空/重复）；DB 级验证用 `tmp/query-variants-per-channel.mjs`（经 `product_variant_channels_channel` junction 表按 channelId 列各渠道变体）。
- **assign 后库存与价格隔离检查**：`assignProductVariantsToChannel` 之后，库存（stockLocations）与价格仍由各渠道上下文分别维护——分渠道验证库存快照与价格读取互不串写；辅助脚本 `tmp/query-variant-availability.mjs`、`tmp/verify-active-channel.mjs`。
- **回归**：修改变体分配/上架相关代码后，重跑上述查询 + 渠道价/库存对比，断言各渠道结果符合双轨隔离或共享单源语义。

## 7. 历史文档索引

- `project_memory.md`「跨渠道商品变体分配机制（2026-09-09，商品61坑）」段 —— 变体全局唯一性、assignProductVariantsToChannel 解法、t2=37 渠道 id 实测
- `project_memory.md`「租户商品双轨隔离 + 整体迁移机制（2026-09-09，实测确认）」段 —— moveProductsToTenantChannel 摘除、submitForMarketplaceAdmin → approveMarketplaceProduct → placeIntoTenantCategory 整体迁移
- `project_memory.md`「共享变体 → 单一 price 源 + 各渠道解释（2026-09-09 实测定稿）」段 —— 单源共享、任一侧写两侧同改、修正「独立记录」说法
- `project_memory.md`「多渠道 price 语义差异 + 校准脚本坑（2026-09-09，实测定稿）」段 —— 默认渠道存净价 vs t2 存含税价、calibrate-prices.mjs 口径相反
- `project_memory.md`「商品『选分类保存未建立关联』缺陷（2026-09-10）」段 —— `apis/product.ts` create/updateProductFull 保存链路 + marketplace-plugin `SetProductPlatformCategory` 元数据语义
- `docs/superpowers/specs/2026-09-13-domains-sso-login-design.md` §4.3 —— 本手册权威蓝本（跨渠道商品变体/迁移）
- 关联：`docs/domains/pricing-tax.md`（价格/税档三态；共享变体 price 单源取值口径、渠道校准规则）
