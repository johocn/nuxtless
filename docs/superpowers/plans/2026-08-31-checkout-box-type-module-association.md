# 结算页箱型模块归属重构 — 实现计划

日期：2026-08-31
设计：`specs/2026-08-31-checkout-box-type-module-association-design.md`

## 任务分解

### Task 1 — 后端 OrderBox.type + GraphQL 暴露
- 改 `d:\zhao\vendure\packages\cjk-plugin\src\order\order-box.service.ts`：
  - `OrderBox` 接口新增 `type: 'delivery' | 'pickup'`。
  - `computeOrderBoxes` 填充 `type = profile?.pickupLocations?.length ? 'pickup' : 'delivery'`。
- 找 OrderBox 的 GraphQL resolver/schema 暴露点，加 `type` 字段，保证 `GetOrderBoxes` 可查。
- 复跑当前 `computeOrderBoxes` 相关 API 自省，确认 `orderBoxes { boxKey profileName type }` 可查。
- 产物：cjk-plugin 构建 + commit dist + 服务器 git pull + pm2 restart（后端部署铁律）。

### Task 2 — 生产数据修正（SQL + 备份）
- 建备份表（如 `shipping_profile_pickup_cleanup_backup_20260831`）。
- 移除物流档案误挂的 `pickupLocations`（保物流档案 `type=delivery`）。
- 修正 flag：物流档案 `requiresAddress=true, requiresContact=false`；自提档案 `requiresAddress=false, requiresContact` 按需。
- API 验证 `orderBoxes[].type`：物流商品箱=delivery，自提商品箱=pickup。
- 脚本留档：`scripts/` 下 SQL。

### Task 3 — 前端 GQL/codegen
- `gql/queries/order.gql` `GetOrderBoxes` 增 `type`。
- `_refresh_schema.mjs` 刷 schema + 跑 codegen，类型出现 `type`。

### Task 4 — CheckoutLayoutJd 按箱型重排模块归属
- 计算 `hasDeliveryBox / hasPickupBox / hasPickupContactBox`（基于 `box.type` + `requiresContact`）。
- 门控：地址块 ⟺ hasDeliveryBox；自提点模块 ⟺ hasPickupBox；收货人/电话 ⟺ hasPickupContactBox。
- 自提点 + 收货人/电话装配为一体的自提单模块。

### Task 5 — BoxDeliveryBlock 按箱型渲染（去跨类型切换）
- `delivery` 箱：仅物流方式单选。
- `pickup` 箱：仅自提点单选 + （若 requiresContact）收货人/电话。
- 移除 per-box 的物流/自提 toggle。

### Task 6 — i18n + 细节接线
- 补充自提点/收货人电话一模块所需中文词条（如需要），zh-CN/en-US 同步。
- `AddressBlock`/`CheckoutPickupContactBlock` 门控与提交接线按新口径对齐。

### Task 7 — 构建 + 回归 + 手机截图交付
- `pnpm typecheck` + `pnpm build` exit 0。
- API 回归：orderBoxes.type 断言。
- 手机视口截图（390×844,dpr=2）：纯自提 / 纯物流 / 混购三场景，`checkoutSplitted` 混购正常拆 2 单。
- 补充操作手册/测试用例文档。

## 执行方式
子代理逐任务驱动：每个 Task 派发全新子代理实现，任务间主代理审查。Task 1（后端）先驱动一次后端部署；Task 2 在服务器执行还原 SQL 前先备份并征询确认。