# 订单详情中式增强（京东风） + 自提核销码机制升级 — 设计文档

> 日期：2026-09-03
> 前端：`d:\zhao\nshop\layers\base`（Nuxt，`account/orders`）　后端：`d:\zhao\vendure\packages\cjk-plugin`（多租户通用）
> 前置：沿用 `2026-09-01-order-template-jd-4level-design.md`（订单四级可回退风格体系 + 京东积木版式，已上线）；`2026-08-31-orders-jd-blocks-redemption-design.md`（全单核销码加密链路，System 2，已落地）。
> 关联：`d:\zhao\nshop\.superpowers\brainstorm\orders-cn\content\redemption-card-states.html`（核销码五状态视觉 mockup，已获用户确认）。

## 0. 决策基线（brainstorming 已澄清）

| 决策 | 结论 |
|---|---|
| 范围 | **A 订单详情中式增强 + B 自提核销码机制升级，合并为一个设计**，不做范围蔓延 |
| A 版式层级 | 京东风增强为主要方向；**在既有京东版式 `jd` 内增强**，**不新增独立版式层级**（L2 仍 `jd`/`classic` 两档，增强落在块级与局部样式） |
| B 系统选择 | 扩展 **cjk-plugin redemption 模块（System 2，加密核销码链路）**，而非 pickup-plugin 明文提货码 |
| B 机制升级（三项） | ① 有效期与过期提醒 ② 作废重发/补发 ③ 一次性核销 |
| 核销码展示 | 京东风高光卡（渐变、大号码、二维码、门店信息、有效期、状态标签），五种状态态视觉已确认 |
| 合规目标 | 改动仍遵守**四级可回退风格体系**（L1 Token / L2 页面级配置 / L3 块级定制 / L4 兜底链） |

## 1. 现状

- **订单详情**：`OrderDetailRenderer`（读 `useOrderDetailConfig().layout`）→ `jd`(默认)/`classic` 两版式。`OrderDetailJd.vue` 按 `visible(key)` 积木拼装：`Status→Progress→Redemption→Address→Items→Pickup→Totals→ShippingBreakdown→Meta→Actions`。
- **核销码展示块**：`OrderDetailRedemptionBlock.vue`（薄封装，读 `block` prop）→ `OrderRedemptionCard.vue`（`onMounted` 调 `orderRedemptionCode`，展示解密码+二维码；`claimed` 时置灰「已核销」）。
- **核销后端（cjk-plugin System 2）**：
  - `redemption-code.service.ts`：`ensure`（幂等生成+加密+指纹，存 `redeemCodeCipher/Iv/Hash`）/ `getWithQr`（解密码+二维码载荷）/ `lookupByCode`（输入码→按租户 Channel 指纹检索订单）/ `claim`（置 `redeemClaimed=true`+`redeemClaimedAt`，幂等）。
  - `redemption.resolver.ts`：Shop `orderRedemptionCode(input)`（受保护解密下发）；Admin `redemptionLookup(code)` / `redemptionClaim(code)`（`Permission.UpdateOrder`，租户隔离）。
  - `redemption.schema.ts`：`OrderRedemptionResult`（`redemptionCode/qrPayload/barcodePayload/claimed/canAccess`）与 Admin Lookup/Claim 类型。
  - **字段注册**：`order/order-custom-fields.ts`（`redeemCodeCipher/redeemCodeIv/redeemCodeHash/redeemClaimed/redeemClaimedAt`）。
- **四级风格 L4 兜底链**：解析层 `utils/order-config.ts`（坏 JSON/缺字段→`null`→回退 `jd`/内建 `true`），文案 `localizeOrderText`（locale→default→首值→''）。

## 2. 架构总览

```
C 端前端 (nshop layers/base)
  account/orders/[code].vue
    OrderDetailRenderer(读 orderDetailConfig.layout)
      ├─ classic → OrderDetailClassic（备用）
      └─ jd     → OrderDetailJd（默认，本设计在其内增强）
                    Status/Progress/Redemption/Address/Items/
                    Pickup/Totals/ShippingBreakdown/Meta/Actions
                    └─ Redemption 块：
                       OrderDetailRedemptionBlock → OrderRedemptionCard
                         · 京东风高光卡（五状态机：待取货/即将过期/已过期/已重发/已核销）
                         · 过期时提供「重新生成」入口（审核存在则跳走后核销）
──────────────────────────────────────────────
后端 cjk-plugin redemption 模块（System 2）
  Order.customFields 新增: redeemExpiresAt / redeemVersion / redeemReissuedAt
  Shop: orderRedemptionCode 扩展下发 status/expiresAt/reissueable/version
  Admin: redemptionLookup 增状态；新增 redemptionReissue(code) mutation(作废旧码→重发)
  规则中心：有效期=orderPlacedAt+graceDays；重发=版本+1+覆盖密文/指纹+重算有效期；核销后禁重发（一次性）
```

**职责边界**：前端只负责「读配置→逐级兜底→按状态机渲染高光卡 + 调用重发 mutation」；有效期计算、作废、重发、一次性核销的规则**全部收于后端**，前端不计算、不落明文。

## 3. 后端设计（cjk-plugin redemption）

### 3.1 新增 Order 自定义字段（`order-custom-fields.ts` 登记）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `redeemExpiresAt` | datetime | null | 核销码有效期截止（`orderPlacedAt` + graceDays）。空=未设置/兼容旧单 |
| `redeemVersion` | int | 1 | 核销码版本号；重发即 +1，用于前端识别「已重发」 |
| `redeemReissuedAt` | datetime | null | 最近一次重发时间（可空，无重发为 null） |

> 旧单读取兼容：缺 `redeemExpiresAt`/`redeemVersion` 时，前端按「未过期 + version 默认 1」处理（selective null-safe），不因历史单崩溃。

### 3.2 有效期规则（`RedemptionCodeService`）

- 新增配置（`ConfigService`/`environmentalVariable`，默认值内建便于无配置运行）：
  - `pickup.redeemGraceDays` = **7**（下单后有效期天数）
  - `pickup.redeemExpireRemindHours` = **24**（临近过期提醒阈值，剩余 ≤24h 判定「即将过期」）
- `ensure(ctx, orderId)`：生成新码时一并写 `redeemExpiresAt = orderPlacedAt + graceDays`、`redeemVersion = 1`。已存在（幂等命中）则保持现状，仅在缺 `redeemExpiresAt` 时补算（历史单升级）。
- Shop 下发状态计算（服务端为真源，前端仅呈现）：
  - `status` 推导：`claimed` → `'claimed'`；否则 `now > expiresAt` → `'expired'`；否则 `now > expiresAt - remind` → `'expiring_soon'`；否则 `'active'`。若存在重发（`version>1`）且未核销，标识 `reissued=true`（其当前码本身按上述 active/expiring 判定；`'reissued'` 语义由前端徽标呈现）。
  - `expiresAt / version / reissueable` 直接下发。

### 3.3 作废重发 / 一次性核销

设计核心：**`redeemCodeHash` 只保留"当前激活版"的指纹**——重发时以新码重新 `encrypt+fingerprint` 并**覆盖** `redeemCodeCipher/Iv/Hash`，故 `lookupByCode` 按指纹检索到的**必然是当前激活码**，旧码自然失效（无需多余作废表）。

- **一次性核销**：`claim` 幂等已保证 `redeemClaimed=true` 后不可再核销；增强为**核销后禁重发**（已核销单的重发 mutation 抛错），形成「一单一码一次」的闭合链路。
- **新增 Admin mutation `redemptionReissue(code)`**（`Permission.UpdateOrder`，租户隔离）：
  1. `lookupByCode` 定位订单（必然命中激活码）。
  2. 校验 `redeemClaimed` 已置 → 抛 `REDEMPTION_ALREADY_CLAIMED`（一次性核销保护）。
  3. 生成新码 → `encrypt+fingerprint` → **覆盖** 密文/IV/哈希 → `redeemVersion+1`、`redeemReissuedAt=now`、`redeemExpiresAt` 重算（=现在 + graceDays，给新码重新计有效期）。
  4. 返回新结果（含新码/新状态），旧码作废告知。

> 重发保留审计口径：旧码不存表（密文被覆盖即不可复现），审计依据 `redeemVersion`/`redeemReissuedAt` 字段增量，满足「作废重发可查证」。

### 3.4 Schema 扩展（`redemption.schema.ts`）

- Shop `OrderRedemptionResult` 增：`status: String!`（`active|expiring_soon|expired|claimed`）、`expiresAt: DateTime`、`reissueable: Boolean!`、`version: Int`。
- Admin `RedemptionLookupResult` 增状态相关输出：`status`、`expiresAt`、`version`、`reissueable`。
- Admin 新增 `extend type Mutation { redemptionReissue(code: String!): RedemptionClaimResult }`（空查/已核销/成功 → 语义化 message）。

## 4. 前端设计（Nuxt, layers/base）

### 4.1 核销码高光卡（`OrderRedemptionCard.vue` 重写为状态机渲染）

按 §3.4 下发字段渲染五状态机卡片（京东风增强高光卡）：

| 状态（`status`+`reissued`） | 视觉 | 操作 |
|---|---|---|
| `active` 待取货 | 渐变高光底 + 大号码分组（`XXX XXX`）+ QR + 门店信息 + 「未核销·待取货」标签 | 无 |
| `expiring_soon` 即将过期 | 同 active + 计数文案「有效期至 MM-DD · 即将过期」+ 警示色标签 | 无 |
| `expired` 已过期 | 灰调 + 大号「已过期」标签 + 遮罩弱化码区 | **「重新生成」按钮**（`reissueable==true`） |
| `reissued` 已重发 | active 视觉 + 「已重发·当前生效」徽标 + 原码已作废提示 | 无 |
| `claimed` 已核销 | 置灰 + 渐变淡出 + 「已核销」标签 + 核销时间 | 无 |

- 「重新生成」→ 调重发 mutation 成功后刷新；失败（已核销等）toast 语义化错误。**显示条件**：默认模式（管理员重发，`pickup.redeemCustomerReissue`=false）下按钮由管理端触发、C 端不显示；仅当 C 端自助开关开启时才在卡片内显示（见 §4.4）。
- 门店信息来自既有 `OrderPickupCard`/自提点数据，本卡片仅展示门店名+营业时间+有效期（沿用 mockup 结构）。
- 明文与二维码仍仅内存展示（沿用现安全策略），重发后自动换新码展示。

### 4.2 中式增强落点（jd 版式内，不新增版式）

增强集中在 `OrderDetailJd.vue` 内各块的低风险样式层，**块语义/顺序不变**：
- 状态横幅（Status）微调渐变/圆角/信息密度，中式质感；沿用 L1 Token（`brand-*`）。
- 核销码块换用高光卡（核心增强，见 4.1）。
- 地址/商品/合计块：统一圆角、卡片间距、数字对齐、分隔线，保持移动优先（390px 单列），不动交互逻辑。
- 所有增强受 L3 块级配置 `blocks[key]` 控制，可整体回退到既有样式。

### 4.3 四级风格集成

- **L2**：`orderDetailConfig.blocks.redemption` 增可选高光卡开关/样式字段：`highlight?: boolean`（默认 true 高光卡，false 回退简洁卡）、`fontScale?: number`、`cardRadius?: number`（沿用详情页 L3 口径）。
- **L3**：`OrderRedemptionCard` 组件内置默认（渐变、字号、圆角、状态色表），读 `block` prop 覆盖。
- **L4 兜底链**：`utils/order-config.ts` 扩展块类型 `OrderBlockCfg` 增加上述可选字段，解析仍 pure/SSR 友好；`highlight` 缺省→内建 `true`；读取任何 `redeem*` 新字段对旧单 null-safe。
- 文案兜底：新增状态/按钮文案入 `messages.order.*`，zh-CN + en-US 同步补齐（**勿裸显 `messages.order.xxx`**）。

### 4.4 Shop 端重发入口权限（补充）

重发 mutation 供权限：属 `Permission.UpdateOrder` 的 Admin 侧。若产品要求 C 端自助重发（游客/本人），则 C 端重发走现有受保护 `orderRedemptionCode` 同款鉴权（`canAccessOrder` / 手机号+订单号），由 `redemptionReissue` 权限放宽至 shop Public + 内部 `canAccess` 校验；**本期默认管理员重发**，C 端自助留作可配置开关（新增配置 `pickup.redeemCustomerReissue` 默认 false）。

## 5. 数据流 / 错误处理

- **数据流**：详情页 `GetOrderByCode` → `OrderDetailJd` → `OrderDetailRedemptionBlock` → `OrderRedemptionCard`（`orderRedemptionCode` 取码+状态）→ 五状态渲染；过期单点「重新生成」→ `redemptionReissue` → 刷新卡片。
- **错误处理**（任何分支不崩溃、不丢码）：
  - 取码/状态拉取失败 → 卡片显示加载/「暂不可用」，不整页失败（沿用现有）。
  - 重发失败：已核销抛 `REDEMPTION_ALREADY_CLAIMED`；订单不存在抛 `not_found`；前端 toast 语义化。
  - 旧单缺新字段 → null-safe 回退为「未到期 + version 默认 1」。
  - 配置坏 JSON / 缺字段 → `order-config.ts` 解析 `null` → 回退内建高光卡。

## 6. 测试与交付

- **后端（cjk-plugin）**：`redemption-code.service.spec`/e2e——有效期计算（graceDays/remind 阈值）；状态推导（active/expiring/expired/claimed）；重发覆盖指纹→旧码失效（lookup 旧码查不到/视为作废）；已核销禁重发；幂等 ensure；租户隔离重发。验收口径：核销码金额/状态以 `totalWithTax`/`status` 为准（沿用既有「total vs totalWithTax」教训）。
- **前端**：`npx nuxt prepare` 生成新 GQL 字段类型；`pnpm build` 通过；`typecheck` 只看本次涉及文件无新增错误（基线既有错误不计）。
- **手机截图**（390×844, dpr=2）：核销码卡**两种状态各一张**（如待取货/即将过期，另可选过期态）、订单详情 jd 增强整页一张；补入操作手册。
- **回归**：两版式（jd/classic）正常；退货/取消/再购不受影响；既有加密核销链路兼容（旧单可读）。
- **部署**：前端 `node scripts/deploy.mjs`（本地构建→scp）；后端 cjk-plugin `lib/` 提交→服务器 `git pull` + `pm2 restart vendure --update-env`，**绝不在服务器构建**（2G 内存铁律）。

## 7. 范围外（本期不做）

- 新增独立版式（本期在 `jd` 内增强，`classic` 保持不动）。
- pickup-plugin 明文提货码迁移（System 1 保留不动）。
- C 端自助重发的完整 UI 流程（本期默认管理员重发；C 端自助仅保留可配置开关，流程随后续）。
- 门店扫码核销坐席界面、核销记录台账（沿用既有范围外声明）。

## 8. 关联文件

**后端（cjk-plugin）**
- 改：`redemption/redemption-code.service.ts`（有效期/状态/重发逻辑）、`redemption/redemption.schema.ts`（Shop/Admin 类型扩展 + `redemptionReissue`）、`redemption/redemption.resolver.ts`（重发 resolver + 状态下发）、`order/order-custom-fields.ts`（新增三个字段登记）、`_deploy.ps1`（无需新增，dist 纳入既有）。

**前端（nshop, layers/base）**
- 改：`components/order/OrderRedemptionCard.vue`（高光卡五状态机 + 重发入口）、`components/order/OrderDetailJd.vue`（中式增强微调）、`utils/order-config.ts`（`OrderBlockCfg` 增 highlight/fontScale/cardRadius）、`composables/useOrderDetailConfig.ts`（如需透传新字段）。
- 新（可选）：Shop 端重发 mutation GQL（若 C 端自助启用）；`OrderRedemptionCard` 五状态样式常量。
- 改：`i18n/zh-CN.ts` + `en-US.ts`（补状态/按钮/提示词条，**双语言同步**）。

## 9. 转换到实施

用户确认本设计后，转入 `writing-plans` 生成实施计划（分解后端字段+服务、schema/resolver、前端高光卡、四级配置、测试截图、部署步骤）。