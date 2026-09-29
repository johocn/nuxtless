# nshop C 端 + web-admin 后台售后服务页面优化 · 设计文档

- 日期：2026-09-30
- 状态：待用户复核
- 涉及仓库：`d:\zhao\vendure`（after-sales-plugin）、`d:\zhao\nshop`（C 端）、`d:\zhao\vshop\web-admin`（后台）
- 参考先例：`docs/superpowers/specs/2026-08-18-nshop-after-sales-design.md`

## 1. 背景

售后服务功能已上线并可用，但两端页面都停留在「能用」的阶段。经逐页盘点，确认以下痛点。

### C 端（nshop）

| # | 痛点 | 现状位置 |
|---|---|---|
| C1 | 列表无搜索、无筛选（仅 7 个本地页签）、无排序 | `layers/base/app/pages/account/after-sales/index.vue` |
| C2 | 卡片信息少：无申请时间、无「下一步该做什么」 | `components/afterSales/AfterSalesCard.vue` |
| C3 | 详情页进度是一条横向徽章串，看不出流程含义；所有动作按钮沉在页面底部 | `pages/account/after-sales/[id].vue` |
| C4 | 申请表单不能上传凭证图；金额按「分」填写但直接显示原始数字；重开表单残留上次填写内容 | `components/afterSales/AfterSalesCreateModal.vue` |
| C5 | `RefundFailed` 状态未纳入前端状态映射，界面上会显示为未知状态 | `utils/after-sales-state.ts` |

### 后台（web-admin）

| # | 痛点 | 现状位置 |
|---|---|---|
| A1 | 页签只有「全部 / 待处理 / 已退款 / 已拒绝」4 个，缺「待收货」「待退款」「退款失败」——真正的待办入口不在列表上 | `src/pages/after-sale/list/index.vue` |
| A2 | 列表卡片只有订单 ID、状态、金额、原因，看不到商品与顾客，也无法在卡片上直接处理 | 同上 |
| A3 | 详情页看不到商品、顾客、凭证图 | `src/pages/after-sale/detail/index.vue` |
| A4 | **动作可用性判断与服务端状态机不一致**：「确认收货」判 `Approved`（服务端要求 `Returning`）、「执行退款」允许 `Approved`（服务端要求 `Received`）——这两个按钮在多数情况下点了必然报错 | 同上 |

### 根因

A4 与两端各自的痛点说明同一个问题：**状态流转的判断散落在各页面里，各写一套**。本次优化把「动作可用性」收敛为每端一处纯函数，作为该端唯一判断入口。

## 2. 范围

按 A 列表好找 + B 进度看得懂 + C 信息看得全 + D 处理更快 四项推进，两端全覆盖。

**后端边界：只做极小 SDL 增强**（补只读嵌套字段，零新业务逻辑），外加一个破例的「最小顾客端上传端点」（用户已确认）以支撑凭证图上传。

**推进节奏：方案 1「顾客体验先行」** —— R0 后端 → 一期 C 端 → 二期后台。

### 明确不做

| 不做项 | 原因 |
|---|---|
| 改造状态机 / 新增逐状态历史事件表 | 因此**时间线不显示逐节点时间**，只显示可确知的时间（见 5.2） |
| 后台批量操作、导出 | 本期目标是「单条处理更快」，批量属另一诉求 |
| C 端列表分页 | 单顾客售后单量级很小，保持 `take: 100` 全量拉取（YAGNI）；后台已有分页 |
| 退货地址的后台配置 | 本期走「寄回地址请联系客服获取」+ 客服入口 |
| 后端校验凭证图张数 / 寄回时限 | 「最多 3 张」「7 天内寄回」为前端 UI 约定，后端不新增校验（见 9. 风险） |

## 3. 总体架构与数据流

```
R0 后端（vendure/packages/after-sales-plugin）
  R0-1 Admin 类型补只读嵌套字段 order / orderLine / customer
  R0-2 新增最小 Shop 上传端点 uploadAfterSalesEvidence
  R0-3 C 端 gql fragment 扩字段（纯前端 codegen，无后端改动）
        │
        ├── 一期：C 端 nshop
        │     列表页（搜索/筛选/排序/卡片补信息/卡上动作）
        │     详情页（引导条 + 纵向时间线 + 吸底动作）
        │     申请表单（类型联动 + 元金额 + 凭证上传 + 交互细节）
        │
        └── 二期：后台 web-admin
              列表页（页签全量化 + 卡片补信息 + 卡上直接处理）
              详情页（修正动作可用性 + 顾客/商品/凭证 + 时间线 + 吸底操作）
```

C 端与后台共享同一套状态语义与文案口径，但各端独立实现 UI。

## 4. R0 后端最小增强

### R0-1 Admin 只读嵌套字段

`AfterSalesRequestAdmin`（`src/plugin.ts` 的 `adminApiExtensions.schema`）补三个**可空**关系字段：

```graphql
type AfterSalesRequestAdmin implements Node {
    # ... 现有字段不变
    order: Order
    orderLine: OrderLine
    customer: Customer
}
```

- 实体 `AfterSalesRequest` 已声明 `order` / `orderLine` / `customer` 关系，`AfterSalesService.findAll()` 已经 `relations: ['order', 'orderLine', 'customer', 'channels']` 预加载，**无需改动 service 与 resolver**，仅补 SDL。
- 字段声明为**可空**而非 `!`：审批/退款等 mutation 返回实体时未预加载关系，非空会触发解析错误。
- 不新增 Admin 单查 query。后台详情继续沿用现有「列表过滤 `id: { eq }`」的实现方式。

### R0-2 最小顾客端上传端点

```graphql
extend type Mutation {
    uploadAfterSalesEvidence(images: [String!]!): [String!]!
}
```

- 入参为 base64 data URL 数组，返回图片 URL 数组。
- Resolver 使用 `@Allow(Permission.Authenticated)`，与 C 端其余售后接口一致。
- Service 内解码 data URL → `AssetService.createFromBuffer` 写入 asset → 返回 preview URL。
- 校验（边界校验，非业务逻辑）：单张解码后 ≤ 5MB；仅允许 `image/png`、`image/jpeg`、`image/webp`；超限抛 `UserInputError`。
- **不创建售后单、不写入售后业务数据**，故不构成新业务逻辑。
- 张数上限不在后端做（见第 9 节）。

### R0-3 C 端 gql fragment 扩展

`layers/base/gql/queries/after-sales.gql` 的 `AfterSalesFragment` 补三个字段：`actualRefundAmount`、`refundedAt`、`refundError`。

经核实，Shop 类型 `AfterSalesRequest` 已暴露这三个字段（`plugin.ts` L42-L45），因此**这是纯前端改动**，无需后端配合。

## 5. 状态机与两端动作口径

### 5.1 唯一事实来源

状态与流转以服务端 `STATE_TRANSITIONS`（`src/types.ts` L17-L25）为唯一事实来源，前端不自行发明流转：

```
Pending ──→ Approved ──→ Returning ──→ Received ──→ Refunded
   │            │             │             └──────→ RefundFailed ──→ Refunded
   ├──→ Rejected（终止）       └──→ Closed（终止）
   └──→ Closed（终止）
```

### 5.2 动作可用性表

| 动作 | 执行方 | 可执行状态 | 接口 |
|---|---|---|---|
| 提交申请 | 顾客 | 订单状态 ∈ {`Shipped`, `Delivered`, `PartiallyDelivered`, `Cancelled`} 且交易完成后 22 天内 | `createAfterSalesRequest` |
| 取消申请 | 顾客 | `Pending` | `cancelAfterSalesRequest` |
| 填写退货单号 | 顾客 | `Approved` | `updateReturnTracking` |
| 同意 | 商家 | `Pending` | `approveAfterSalesRequest` |
| 拒绝 | 商家 | `Pending` | `rejectAfterSalesRequest(id, reason)` |
| 确认收货 | 商家 | `Returning` | `confirmReturnReceived(id, receivedQuantity?)` |
| 执行退款 | 商家 | `Received` | `processAfterSalesRefund` |
| 重试退款 | 商家 | `RefundFailed` | `retryAfterSalesRefund` |

**每端只保留一处动作判断入口**：C 端 `utils/after-sales-state.ts`；后台新建 `src/constants/afterSaleActions.ts`（列表页与详情页共用）。A4 缺陷由此根除。

### 5.3 时间线只显示可确知的时间

因不做逐状态历史事件表，时间线节点时间来源限定为：

| 节点 | 时间来源 |
|---|---|
| 提交申请 | `createdAt` |
| 当前节点 | `updatedAt`，并标注「最近更新」 |
| 退款到账 | `refundedAt` |
| 其余历史节点 | **不显示时间**，仅显示状态 |

宁可少显示，不编造时间。

## 6. 一期 · C 端设计

### 6.1 列表页

布局：

```
返回账号中心
标题「售后服务」                                  刷新
┌ 进行中 ▸ 全部 · 已完成 · 已拒绝 · 已取消 ┐        页签
[ 搜索订单号 / 售后单号 / 商品名 ]  [排序 ▾]        工具栏
────────────────────────────────
[卡片] 类型标签 · 状态徽章
       缩略图  商品名
                订单号 · 退款金额
                申请时间
       ●─●─○─○─○  进度条 + 当前步骤文案
       [下一步动作按钮]
────────────────────────────────
联系客服卡片
```

改动清单：

1. **页签重构为 5 个**：`进行中（默认） / 全部 / 已完成 / 已拒绝 / 已取消`。
   - 进行中 = `Pending + Approved + Returning + Received + RefundFailed`
   - 已完成 = `Refunded`；已拒绝 = `Rejected`；已取消 = `Closed`
   - 现状 7 个页签（`ALL / Pending / Approved / Returning / Refunded / Rejected / Closed`）信息密度低且缺 `Received` 归属，收成 5 个后可读性更好。
2. **筛选/搜索/排序全部本地完成**。原因：`AfterSalesRequestListOptions` 在插件 SDL 中为空声明，不能假定其 `filter` / `sort` 字段可用；而列表本就走 `take: 100` 全量拉取，本地处理零风险、零后端改动。这也意味着「排序走后端」的早期设想作废。
   - 搜索匹配：订单号 `order.code`、售后单号 `id`、商品名 `orderLine.productVariant.name`（这三个字段都已在 fragment 中）。
3. **不引入分页**，保持 `take: 100`；超过 100 条时列表底部提示「仅显示最近 100 条」。
4. **排序选项**：最新申请（默认）/ 退款金额（高→低）。
5. **卡片补信息**：类型标签、状态徽章、商品缩略图与名称、订单号、退款金额、**申请时间**、**五段进度条 + 当前步骤文案**、**下一步动作按钮**（联系客服 / 填写退货单号 / 查看退款）。
6. **状态补齐**：`RefundFailed` 纳入 C 端状态类型、颜色与进度映射。
7. **空态三分**：无售后单 / 搜索无结果 / 加载失败（带重试），三套文案各自独立。

### 6.2 详情页

布局：

```
状态徽章 + 订单号（可跳订单详情）
┌ 你需要做什么 ─────────────┐
│ 主行动一句话 + 一条说明      │  引导条
└──────────────────────────┘
商品卡（缩略图 / 类型 / 名称 / 退款金额 / 实退金额）
处理进度（纵向时间线：● 已过 · ◉ 当前 · ○ 待办）
申请信息（原因 / 描述 / 拒绝原因）
凭证图网格（点击放大）
────────────────────────────
[ 联系客服 ]              [ 主操作 ]   吸底
```

改动清单：

1. **新增「你需要做什么」引导条**，按状态给一句话主行动 + 一条说明。映射固化在一处纯函数：

| 状态 | 主行动 | 说明 |
|---|---|---|
| `Pending` | 等待商家审核 | 暂无需操作，审核结果将通过站内通知告知 |
| `Approved` | 寄回商品并填写退货单号 | 请在 7 天内寄回；寄回地址请联系客服 |
| `Returning` | 已寄出，等待商家收货 | 商家收到并确认后将发起退款 |
| `Received` | 商家已收货，退款处理中 | 通常 1-3 个工作日到账 |
| `Refunded` | 退款已到账 | 显示到账时间与实退金额 |
| `Rejected` | 申请被拒绝 | 显示拒绝原因 + 联系客服 |
| `RefundFailed` | 退款异常，商家正在处理 | 可联系客服催促 |
| `Closed` | 申请已关闭 | —— |

2. **横向徽章串改为纵向时间线**。5 个主流程节点（提交申请 / 商家同意 / 寄回商品 / 商家收货 / 退款到账）+ 终止节点（`Rejected` / `Closed` / `RefundFailed` 插入并显示原因）。三种节点视觉：已过（实心）、当前（实心 + 光环）、待办（空心圈）。节点时间规则见 5.3。
3. **退货物流并入时间线**：「寄回商品」节点副信息显示承运商 + 单号，不再单独占一块。
4. **商品卡补信息**：类型、退款金额、`actualRefundAmount`（仅已到账时显示）。
5. **凭证图**：网格 + 灯箱保留；无图时保留「未上传凭证」。
6. **动作区改吸底**：主按钮随状态变化（`Approved`→填写退货单号、`Pending`→取消申请），次要按钮常驻「联系客服」；填写单号改为弹层，复用 `AfterSalesTrackForm`。
7. **申请信息区**保留原因 / 描述 / 拒绝原因（拒绝原因同时出现在时间线终止节点）。

### 6.3 申请表单（含凭证图上传）

#### 6.3.1 超出常规表单的三个决策

1. **金额单位**：对外一律「元」（`¥329.00`），内部提交前 `Math.round(元 * 100)` 转分。修掉现状「填分、显示 `8900`」的问题。
2. **换货不涉及退款**：后端 `CreateAfterSalesRequestInput.refundAmount` 是必填 `Int!`，故「换货」时前端**隐藏金额输入并固定提交 `0`**；后台对 `exchange` 类型不显示退款金额行。
3. **重开重置**：`watch(isOpen)` 打开时重置全部字段，修掉现状残留缺陷。

#### 6.3.2 容器与生命周期

| 项 | 定义 |
|---|---|
| 容器 | 底部弹出 BottomSheet（`UModal` 底部变体），上边圆角、内容自适应高度 |
| 滚动 | 内容超出视口 80% 时**仅表单区内部滚动**，头部（商品行）与底部（提交按钮）固定 |
| 入口 | 订单详情页每个订单行的「申请售后」按钮；仅 `canApplyAfterSales(state)` 时渲染 |
| 打开动作 | 重置全部字段，并从可退上限预填金额 |
| 关闭方式 | 点遮罩 / 「取消」；**有已填内容时先二次确认**「放弃本次填写？」（已上传图片一并作废） |
| 键盘 | 输入框聚焦时底部按钮上移，`padding-bottom` 含 `env(safe-area-inset-bottom)` |

#### 6.3.3 逐字段交互

**① 商品行（只读）**：缩略图 44px + 名称 + 「最多可退 ¥329.00」。上限取 `orderLine.proratedLinePrice`（分）经 `formatMoney()` 展示。

**② 售后类型**（三选一，默认 `return_refund`）：

| 类型 | 副说明 | 金额区 | 额外提示 |
|---|---|---|---|
| 退货退款 `return_refund` | 寄回后退款 | 显示，默认全额 | 「需寄回商品，商家同意后请在 7 天内寄回」 |
| 仅退款 `refund_only` | 无需寄回 | 显示，默认全额 | 「无需寄回，商家同意后直接退款」 |
| 换货 `exchange` | 寄回后重发 | **隐藏**，提交 `0` | 「换货不产生退款，需寄回原商品」 |

切换类型**不清空**已填金额与原因；从「换货」切回退款类时，金额重新按上限预填。

**③ 退款金额**：前置 `¥`、`inputmode="decimal"`、字号 16px（避免 iOS 聚焦缩放）；右侧「全额」快捷项。实时校验并在下方给红字：

| 条件 | 文案 |
|---|---|
| 空 | 请填写退款金额 |
| ≤ 0 | 退款金额需大于 0 |
| > 上限 | 最多可退 ¥329.00 |
| 超过两位小数 | 自动截断到两位 |

**④ 申请原因**（必填）：常用原因胶囊单选 —— 质量问题 / 商品破损 / 尺寸不符 / 与描述不符 / 发错货 / 少件漏发 / 不想要了 / 其他。点「其他」在其下展开手输框（必填）；胶囊与手输框互斥。提交值取当前语言下文案或手输原文（后端 `reason` 为纯文本，不做多语言）。

**⑤ 问题描述**（选填）：textarea 3 行高，`maxlength=200`，右下角实时计数 `n/200`。

#### 6.3.4 凭证图上传

**选图**：点「+ 添加」拉起系统选择器（`accept="image/*" multiple`）；一次多选超 3 张自动截断并提示「最多上传 3 张」；已达 3 张时添加格消失。

**压缩**（上传前在客户端完成）：读文件 → canvas 长边缩到 ≤1280 → 输出 webp `quality 0.8`（不支持则 jpeg）→ 若仍 >500KB 用 `0.6` 重压一次；两次仍超则单张判失败并提示「图片过大，请重新选择」。

**上传**：逐张调用 `uploadAfterSalesEvidence`，**并发上限 2**、单张超时 30s，便于单张独立重试。

**格子状态机（四态）**：

| 状态 | 视觉 | 可交互 |
|---|---|---|
| 压缩中 | 半透明格 + 转圈 | 不可删 |
| 上传中 | 半透明格 + 百分比 | 不可删 |
| 成功 | 缩略图 + 右上红色 `×` | 点 `×` 移除本地项 |
| 失败 | 红色描边 + 居中「重试」 | 点整格重试该张 |

失败**不影响其他张**；删除已成功的图只移除提交时的引用，不调用后端删除（未引用的 asset 残留属已知取舍，本期不清理）。表单关闭时对在途上传执行 `AbortController.abort()`。

#### 6.3.5 提交与错误

`canSubmit` = 原因已填 **且** 金额有效（换货除外）**且** 无压缩中/上传中/失败的图 **且** 非提交中。按钮四态：

| 态 | 表现 |
|---|---|
| 可提交 | 主色实心「提交申请」 |
| 禁用 | 灰底 + 具体原因文案（如「有图片上传失败，请重试」） |
| 提交中 | loading + 「提交中…」，不可点、遮罩不可关 |
| 成功 | 关闭弹层 → toast「申请已提交」→ 跳转新售后详情页 |

**失败时弹层不关闭**，保留全部已填内容与已上传图片。服务端英文报错映射为 i18n：

| 服务端报错 | 展示文案 |
|---|---|
| `After-sales already exists for order line ...` | 该商品已有进行中的售后申请 |
| `Refund amount ... exceeds max ...` | 退款金额超过可退上限 |
| `exceeded ... days limit` | 已超过售后申请期限（交易完成后 22 天内可申请） |
| 其他 | 通用失败文案 + 建议联系客服 |

#### 6.3.6 移动端细节

输入类控件字号统一 16px；可点元素触控区 ≥44px；金额输入使用 `inputmode="decimal"`；图片缩略图 `object-cover` 并限制最大宽度避免样式抖动。

## 7. 二期 · 后台 web-admin 设计

### 7.1 列表页

布局：

```
标题「售后处理」                                    刷新
[ 搜索售后单号 / 订单号 ]                    [ 筛选 ]
待处理 · 待顾客寄回 · 待收货 · 待退款 · 退款失败 …   页签（横滚）
────────────────────────────────
[卡片] 售后 #1287 · 订单 #D4E5F6        状态徽章
       缩略图  商品名
                退货退款 · 退款 ¥329.00
                张伟 · 138****8821
                已等待 2 天 3 小时 · 申请 09-26 09:05
       [ 同意 ] [ 拒绝 ] [ 详情 ]
────────────────────────────────
已显示 20 / 137 · 加载更多
```

改动清单：

1. **页签全量化为 8 个**：`待处理 / 待顾客寄回 / 待收货 / 待退款 / 退款失败 / 全部 / 已拒绝 / 已关闭`，**默认落在「待处理」**而非「全部」。现状只有 4 个页签，把真正要干活的「待收货」「待退款」入口漏掉了。
2. **筛选区默认折叠**：现有筛选能力（关键词 / 类型 / 日期 / 退款区间 / 排序）逻辑保留不动，仅默认收起，首屏只留搜索框 + 「筛选」按钮。
3. **卡片补信息**（依赖 R0-1）：商品缩略图与名称、订单号 `order.code`、顾客姓名 + 手机、申请时间 + **已等待时长**（超 24 小时标红，用于催办）。
4. **卡片上直接操作**：按状态给主次按钮（待处理→同意/拒绝；待收货→确认收货；待退款→退款；退款失败→重试退款），二次确认沿用现有 `uni.showModal` 模式。
5. 现有分页（`useListPage` + `skip / take / totalItems`）与查询条件拼接逻辑保持不动。

### 7.2 详情页

布局：

```
售后 #1287                              状态徽章
退货退款 · 退款 ¥329.00 · 订单 #D4E5F6
┌ 顾客 ┐  张伟 · 138****8821 · 邮箱（点击拨号）
┌ 商品 ┐  缩略图 / 名称 / SKU / 数量 / 订单号（可跳订单）
┌ 处理进度 ┐  纵向时间线（与 C 端同一套节点文案）
┌ 顾客凭证 ┐  网格 + 点击预览
┌ 库存回补明细 ┐  折叠
────────────────────────────
[ 次操作 ]                    [ 主操作 ]   吸底
```

改动清单：

1. **修正动作可用性**：改为 `constants/afterSaleActions.ts` 单一来源，严格按 5.2 表（确认收货仅 `Returning`；执行退款仅 `Received`）。
2. **新增顾客卡**：姓名、手机（`uni.makePhoneCall` 拨号）、邮箱 — 来源于 R0-1 的 `customer`。
3. **新增商品卡**：缩略图、名称、SKU、数量、订单号（可跳订单详情）— 来源于 R0-1 的 `orderLine` / `order`。
4. **新增处理进度时间线**：与 C 端共用同一套节点文案。
5. **新增顾客凭证图区**：网格 + `uni.previewImage` 放大。
6. **物流信息并入时间线**的「顾客寄回」节点。
7. **拒单原因 / 退款失败原因突出显示**；`RefundFailed` 时主操作直接是「重试退款」，失败原因就近展示。
8. **库存回补明细**（`restockJson`）折叠展示（服务端已落库，后台一直未展示）。
9. **操作区吸底**（主操作 + 次操作），避免长页面滚不到按钮。

## 8. i18n 方案

| 端 | 语言包 | 要求 |
|---|---|---|
| C 端 nshop | `layers/base/i18n/locales/` 下 12 个：`zh-CN / en-US / ja-JP / ko-KR / de-DE / fr-FR / es-ES / it-IT / pt-BR / ru-RU / bg-BG / fa-IR` | 新增词条**必须 12 包同步** |
| 后台 web-admin | `src/locale/` 下 `zh-Hans.json` / `en.json` | 两包同步 |

- 数组型文案（常用申请原因、进度节点、时间线节点）用 `tm()` 取，不用 `t()`。
- 兜底链：当前 locale → defaultLocale → 首个值 → i18n 字典占位。
- C 端售后键前缀沿用 `messages.afterSales.*`；后台沿用 `afterSale.*`。
- 状态名称、类型名称、时间线节点文案**两端各用各的字典**，但语义与节点划分必须一致。

## 9. 错误处理

| 场景 | 处理 |
|---|---|
| C 端提交失败 | 保留表单内容，toast + 表单内错误文案；服务端英文报错按 6.3.5 表映射 |
| 凭证图上传失败 | 单张失败可重试，已成功项不清空；存在失败项时禁用提交 |
| 后台动作失败 | 统一 `run()` 捕获 toast，二次确认后才发请求；失败**不改本地状态**，刷新后以服务端为准 |
| 加载失败 vs 空数据 | 两端都区分：加载失败给重试按钮，空数据给空态文案 |
| 列表加载失败 | 保留现有重试按钮实现 |

## 10. 测试与交付

### 回归范围

| 层 | 用例 |
|---|---|
| 后端 | Admin 查询能取到 `order` / `orderLine` / `customer` 嵌套字段；`uploadAfterSalesEvidence` 未登录被拒、合法图片返回 URL、超大图片与非法类型被拒 |
| C 端 e2e | 列表页签切换、搜索、排序 → 详情时间线 → 申请（含 1 张凭证图上传）→ 填写退货单号 → 取消申请 |
| 后台 e2e | 列表各页签切换 → 卡片上同意/拒绝 → 详情确认收货 → 执行退款 → `RefundFailed` 重试路径 |

### 交付物

1. 实现代码
2. API / e2e 回归
3. **手机视图截图**：390×844、dpr=2，每个功能点一张，补进操作手册
4. 操作手册与测试用例文档同步更新

### 收尾与部署

任务收尾一次性收口：提交 → 推送 → 部署（本地构建）。

- `vendure`：服务器 `git pull --ff-only` + `pm2 restart`
- `nshop` / `web-admin`：`scripts/deploy.mjs`（本地构建产物 scp 到服务器解压）

## 11. 风险与取舍

| 项 | 说明 | 处置 |
|---|---|---|
| C 端无分页 | 超过 100 条售后单时看不到更早记录 | 列表底部提示「仅显示最近 100 条」；真出现超量再引入分页 |
| 「7 天内寄回」无后端校验 | 后端无寄回时限常量，纯前端文案 | 已知取舍；文案措辞留有余地（「请在 7 天内寄回」） |
| 「最多 3 张」凭证图无后端校验 | 前端 UI 约束 | 前端与后台展示均按 ≤3 处理 |
| 未引用的上传图片残留 asset 表 | 删除已上传图片不调后端删除 | 本期不清理，记录为已知取舍 |
| 时间线节点缺历史时间 | 无逐状态事件表 | 只显示可确知时间（见 5.3），不编造 |
| `AfterSalesRequestListOptions` 为空声明 | 不能假定 filter / sort 可用 | 全部筛选/排序改为本地处理（见 6.1 第 2 条） |
| mutation 返回实体的关系字段为空 | R0-1 中关系字段声明为可空 | 后台动作成功后重新拉取列表/详情，不依赖 mutation 返回值 |

## 12. 实施顺序

| 阶段 | 内容 | 依赖 |
|---|---|---|
| R0 | R0-1 Admin 嵌套字段；R0-2 上传端点；R0-3 C 端 fragment 扩展 | 无 |
| 一期 | C 端列表页 → 详情页 → 申请表单 | R0 |
| 二期 | 后台列表页 → 详情页 | R0、一期（共用状态口径与文案） |

每阶段结束按第 10 节口径出截图与文档，再进入下一阶段。

## 13. 文件清单（预估）

### 后端 `d:\zhao\vendure\packages\after-sales-plugin`

| 文件 | 动作 |
|---|---|
| `src/plugin.ts` | 改：Admin 类型补 3 个关系字段；Shop 补上传 mutation SDL |
| `src/after-sales-shop.resolver.ts` | 改：新增上传 mutation resolver |
| `src/after-sales.service.ts` | 改：新增 `uploadEvidence()` |
| `src/after-sales-request.entity.ts` | 可能改：确认关系字段齐备（`order` / `orderLine` / `customer` 已存在则不动） |

### C 端 `d:\zhao\nshop`（均在 `layers/base/`）

| 文件 | 动作 |
|---|---|
| `gql/queries/after-sales.gql` | 改：fragment 补 3 字段 + 上传 mutation |
| `app/utils/after-sales-state.ts` | 改：补 `RefundFailed`、进度、引导文案 key、动作判断、5 页签 |
| `app/composables/useAfterSales.ts` | 改：新增上传方法 |
| `app/components/afterSales/AfterSalesCard.vue` | 改：补时间/进度/下一步动作 |
| `app/components/afterSales/AfterSalesCreateModal.vue` | 改：整体重写（类型联动 / 元金额 / 上传 / 重置 / 校验） |
| `app/components/afterSales/EvidenceUploader.vue` | 新增：凭证图上传（压缩 + 四态格子） |
| `app/components/afterSales/AfterSalesTimeline.vue` | 新增：纵向时间线 |
| `app/components/afterSales/AfterSalesNextStep.vue` | 新增：引导条 |
| `app/pages/account/after-sales/index.vue` | 改：5 页签 + 本地搜索/排序 + 空态三分 |
| `app/pages/account/after-sales/[id].vue` | 改：引导条 + 时间线 + 吸底动作 |
| `i18n/locales/*.ts`（12 个） | 改：同步新增词条 |

### 后台 `d:\zhao\vshop\web-admin`

| 文件 | 动作 |
|---|---|
| `src/constants/afterSaleActions.ts` | 新增：动作可用性 + 状态标签/色的单一来源 |
| `src/apis/afterSale.ts` | 改：`AFTER_SALE_FIELDS` 补 `order { code }` / `orderLine` / `customer` |
| `src/pages/after-sale/list/index.vue` | 改：8 页签 + 卡片补信息 + 卡上操作 + 筛选折叠 |
| `src/pages/after-sale/detail/index.vue` | 改：修正动作可用性 + 顾客/商品/凭证/时间线 + 吸底 |
| `src/constants/menus.ts`、`src/pages.json` | 预期不改：售后列表页签是页面内部状态而非路由，菜单/路由注册沿用现状；若实施中发现需调整再改 |
| `src/locale/zh-Hans.json`、`src/locale/en.json` | 改：同步新增词条 |
