# 方案1+2+3 合并执行计划（Master）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按依赖顺序合并执行三份方案：方案1（首页语言/城市/配送过滤）→ 方案2（过滤接入五级风格体系）→ 方案3（库存体系对齐 + web-admin 网点管理），一次构建、一次部署、手册合并补丁。

**Architecture:** 本文件是**编排文档**，不重复源计划代码。每个阶段引用源计划的具体 Task，执行者须先打开对应源计划文件按其完整步骤实施。按仓库归组：vendure 后端一批 → nshop 前端按 方案1→方案2→方案3 顺序 → vshop web-admin → 统一部署。

**源计划：**
- P1: `d:\zhao\nshop\docs\superpowers\plans\2026-09-19-home-filter-language-city-delivery.md`（方案1，Task 0-8）
- P2: `d:\zhao\nshop\docs\superpowers\plans\2026-09-19-home-filter-style-system-integration.md`（方案2，Task 0-6）
- P3: `d:\zhao\nshop\docs\superpowers\plans\2026-09-19-inventory-alignment-and-warehouse-admin.md`（方案3，Task 0-9）

**依赖总览（关键）：**
- P1.Task0（Product.deliveryMethods）是 P3 后端字段/匹配的前置（同枚举对齐）
- P2.Task3/4 依赖 P1.Task3/4/5（isProductVisible / useModuleDelivery / 首页接入）
- P3.Task6 详情页切换组件：P2.Task2（DeliveryFilterBar）若已落地则复用，否则独立组件（P3.Task6 Step1 判断）
- P3.Task5（gql+codegen）依赖后端新 schema（阶段 A 完成后）

---

## 阶段 A：后端（vendure 仓库）

> 一次性完成 P1 与 P3 的全部后端改动，全部 commit 后统一部署（阶段 H）。

- [ ] **A1. 方案1 Task 0**（Product customFields 新增 `deliveryMethods`）
  打开 P1 → Task 0，按步骤实施 + commit（cwd: `d:\zhao\vendure`）。

- [ ] **A2. 方案3 Task 0**（前置确认：读三个库存文件、确认测试框架）
  打开 P3 → Task 0。

- [ ] **A3. 方案3 Task 1**（StockLocation 新增 `channelCode`/`deliveryMethods`）
  打开 P3 → Task 1。注意与 A1 的字段**同枚举同语义**（MAIL/SELF_PICKUP）。

- [ ] **A4. 方案3 Task 2**（网点×配送方式匹配纯函数 TDD）
  打开 P3 → Task 2。测试框架确认见 A2。

- [ ] **A5. 方案3 Task 3**（分配策略接入 deliveryMethods 过滤）
  打开 P3 → Task 3。候选过滤复用 P3.Task2 的 `filterLocationsByDelivery`。

- [ ] **A6. 方案3 Task 4**（C 端可售查询支持 `deliveryMethod` 口径）
  打开 P3 → Task 4。

**阶段 A 完成标准：** `npx tsc --noEmit -p packages/cjk-plugin/tsconfig.json` 通过；cjk-plugin 单测全绿（`npx vitest run`）；本地 dev 起服后 admin/shop schema 含全部新字段。

---

## 阶段 B：前端基础设施（nshop 仓库，方案1 先行）

- [ ] **B1. 方案1 Task 1**（刷新 schema + codegen + fragment 补查 deliveryMethods）
  打开 P1 → Task 1。前置：阶段 A 后端字段已注册（本地 schema 文件按 P1 流程同步）。

- [ ] **B2. 方案1 Task 2**（seed 样例数据：长春自提-only/邮寄全国/区间品）
  打开 P1 → Task 2。

- [ ] **B3. 方案1 Task 3**（`isProductVisible` 纯函数 + 单测 TDD）
  打开 P1 → Task 3。产出 `productVisibility.ts`（P2/P3 复用）。

- [ ] **B4. 方案1 Task 4**（`useModuleDelivery` composable）
  打开 P1 → Task 4。产出模块级配送状态（P2.Task3 会注入初始值）。

- [ ] **B5. 方案1 Task 6**（i18n 四语言词条）
  打开 P1 → Task 6。**提前于 P1.Task5 执行**（模块接入需要词条就位）。

---

## 阶段 C：方案2 风格体系接入（nshop 仓库）

- [ ] **C1. 方案2 Task 0**（`home-filter-config` 解析器 + 单测 TDD）
  打开 P2 → Task 0。纯函数、SSR 友好、逐级回退。

- [ ] **C2. 方案2 Task 1**（`useHomeFilterConfig` composable）
  打开 P2 → Task 1。

- [ ] **C3. 方案2 Task 2**（`DeliveryFilterBar` 组件，segmented/tabs 双 variant）
  打开 P2 → Task 2。P3.Task6 将复用此组件。

- [ ] **C4. 方案2 Task 3**（`useModuleDelivery` 初始值注入）
  打开 P2 → Task 3。依赖 B4。

- [ ] **C5. 方案2 Task 4**（GoodsFloor 与首页兜底楼层接线）
  打开 P2 → Task 4。依赖 B3/B4/B5 + C1/C3。

- [ ] **C6. 方案2 Task 5**（配置样例文档）
  打开 P2 → Task 5。

---

## 阶段 D：方案1 首页模块接入（nshop 仓库）

- [ ] **D1. 方案1 Task 5**（首页各商品模块接入 SSR 过滤 + 配送切换 + 空态）
  打开 P1 → Task 5。依赖 B3/B4/B5；若 C3（DeliveryFilterBar）已完成则复用其切换 UI，否则用 P1 自带切换实现（C5 会替换为风格化组件）。

**阶段 B/C/D 完成标准：** `npm run dev` 起服无报错；首页按城市/配送过滤生效；切换后空态与词条正确；方案2 配置样例可切换 segmented/tabs 版式。

---

## 阶段 E：方案3 前端（nshop 仓库）

- [ ] **E1. 方案3 Task 5**（VariantStockInfo 查询加 `deliveryMethod` 参数 + codegen）
  打开 P3 → Task 5。前置：阶段 A 后端 schema 生效。

- [ ] **E2. 方案3 Task 6**（详情页配送切换 + 库存口径联动 + 四语言）
  打开 P3 → Task 6。切换组件优先复用 C3（DeliveryFilterBar）；Step1 若确认存在则复用，否则创建 `ProductDeliverySwitch.vue` 过渡，方案2 落地后替换。

**阶段 E 完成标准：** 详情页切换 邮寄→自提，库存数字随口径变化；自提口径在 `physicalStockEnabled=false` 时仅可达性提示。

---

## 阶段 F：截图批次（nshop + vshop，硬规范）

> 三方案的 Playwright 手机截图合并为一次本地截图会话，统一供操作手册使用（390×844，dpr=2）。

- [ ] **F1. 方案1 Task 7**（首页过滤/切换/空态截图）
- [ ] **F2. 方案2 Task 6**（配置生效验证截图：segmented/tabs 切换）
- [ ] **F3. 方案3 Task 7**（详情页 邮寄→自提 库存口径截图）
- [ ] **F4. 方案3 Task 8 的 Step5**（web-admin 网点列表/表单截图，cwd: `d:\zhao\vshop`）

---

## 阶段 G：web-admin 网点管理（vshop 仓库）

- [ ] **G1. 方案3 Task 8 完整实施**（API 层网点 CRUD + 列表页 + 编辑页 + 路由 + 截图）
  打开 P3 → Task 8（截图部分已在 F4 执行，可跳过重复）。

---

## 阶段 H：统一部署 + 手册（一次）

- [ ] **H1. 后端部署（vendure）**：P1 Task 8 + P3 Task 9 Step1-3 合并 —— git pull + `pm2 restart`（服务器不构建，铁律）
- [ ] **H2. 前端部署（nshop）**：`node scripts/deploy.mjs`（P1 Task 8 / P2 Task 6 / P3 Task 9 Step2 合并为一次）
- [ ] **H3. web-admin 部署（vshop）**：按 vshop 既有部署机制（P3 Task 9 Step3）
- [ ] **H4. 线上回归**：首页过滤/切换、详情页配送切换库存口径、web-admin 网点 CRUD（手机验证）
- [ ] **H5. 操作手册合并补丁**：P1 Task 7 手册 + P2 Task 6 + P3 Task 9 Step5 合并为一个方案1+2+3 章节；含全部 F 阶段截图
- [ ] **H6. 手册 commit**（cwd: `d:\zhao\nshop`）

---

## 提交策略（按仓库分批）

- **vendure**：A1 一次 commit；A3-A6 各一次（每 Task 独立 commit，见 P3）
- **nshop**：B1-B5 / C1-C6 / D1 / E1-E2 各 Task 独立 commit（按各源计划）
- **vshop**：G1 一次 commit
- **手册**：H6 一次 commit

## 完成标准（总）

首页按语言/城市/配送过滤 + 风格体系可配置；详情页库存口径随配送切换；后端分配与查询按 deliveryMethods 过滤；web-admin 可管理租户物理网点；手机截图齐全；操作手册补丁完成；三端已部署。
