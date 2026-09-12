# 配送档案领域手册（Shipping Profile）

> 入口指针：`project_memory.md`「配送档案/自提点体系」速查卡 → 本手册。
> 覆盖：后端 vendure `packages/cjk-plugin`、C 端 nshop `layers/base`、运营端 vshop `web-admin`。

## 1. 概念模型

| 实体 | 关键字段 | 说明 |
|---|---|---|
| ShippingProfile 配送档案 | `ownerChannelId`（归属租户，null=全局）、`isGlobal`（全局标记）、`isTenantDefault`（租户默认） | 全局档案 `ownerChannelId=null` 且 `isTenantDefault` 恒 false |
| shipping_profile_method 档案-方式关联 | `shippingMethodId`、`mode`、`options`（`{ rangeMode, pickupLocationIds }`） | 档案与配送方式多对多；方式级绑定自提点 |
| PickupLocation 自提点 | `type`（store 门店 / point 自提 / employee 职工单位）、`isPublic`、`address` | 门店自提点与普通自提点是**不同类型** |
| 租户/渠道 | `__default_channel__`（平台）、`t2` 等租户渠道 | 平台渠道 = 默认租户 |

**可见性规则（核心）**：
- 默认租户（平台渠道）：可使用**其他租户**自提点 + 全局档案
- 其他租户（t2 等）：仅可使用**全局档案** + **本租户档案**，自提点仅全局 + 自有
- 自提点按 `type` 过滤：门店自提点与自提点是不同点

**C 端链路**：每租户 × 每种配送档案 × 配送方式 → 自提点集 = 该方式 `options.pickupLocationIds` 过滤后按定位 **50km 内就近**（Haversine）排序。

## 2. 文件地图（符号级，行号用 rg 现查）

### 后端 vendure `packages/cjk-plugin/src/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `shipping/shipping-profile.service.ts` | 档案 CRUD + 权限校验 + 字段一致性 | `create/update/delete`、`assertProfileGlobalPermissions`（纯函数：create/update/delete 全局属性权限）、update 时 isGlobal 切换维护 `ownerChannelId`/`isTenantDefault` |
| `shipping/shipping-profile.resolver.ts` | GraphQL 入口 | 全部 `@Allow(ShippingProfile)`（单一权限码） |
| `shipping/shipping-profile-permissions.ts` | 权限定义 | `PermissionDefinition` name=`'ShippingProfile'` |
| `pickup/pickup-location.service.ts` | 自提点可见性 + 就近过滤 | `applyVisibility`（平台/租户分层）、就近查询 |
| `tenant/tenant-member.service.ts` | 租户权限目录（单一来源） | `PERMISSION_CATALOG` → `BUSINESS_PERMISSIONS` 白名单；`updateTenantRole`（整组替换 + 白名单校验） |
| `tenant/role-templates.ts` | 租户角色模板 | `tenant-admin` 模板含 `'ShippingProfile'`（新建角色自动带） |
| `seed/default-data.service.ts` | 租户/渠道/角色 seed | 每租户默认管理员 `admin` |

### C 端 nshop `layers/base/app/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `components/checkout/BoxPickupBlock.vue` | 自提点选择块 | 名称点击导航、地图图标按钮、切换自提点入口（>1 时必显） |
| `components/AppPickupNavigationModal.vue` | 高德导航弹层 | 动态加载高德 JS SDK |
| `components/AppBackButton.vue` | 全局返回按钮 | 结算页等复用 |
| `composables/useOrderStore.ts` | 订单状态（含自提点选择） | Pinia + persistedstate |
| `composables/useLocationStore.ts` | 定位状态 | Pinia + persistedstate，切换后同步自提点 |

### 运营端 vshop `web-admin/src/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `pages/shipping/profile/index.vue` | 配送档案管理页 | 「设为全局」开关（仅超管）、全局徽标、非超管只读；租户默认互斥 |
| `stores/authStore.ts` | 登录态 | `isSuperAdmin` 计算属性 |
| `pages/platform/roles/index.vue` | 角色权限管理 | 可选权限来自 `PERMISSION_CATALOG`（需后端注册才可见） |

## 3. 设计决策（ADR 式）

| 决策 | 理由 |
|---|---|
| 档案级 `boundPickupLocations` + 方式级 `options.pickupLocationIds` 两级绑定 | 档案定义「可选池」，配送方式定义「实际可用点」，解耦 |
| 平台/租户分层可见性 | 默认租户可用其他租户点（服务兜底）；其他租户隔离，仅全局+自有，防越权 |
| 全局档案仅超管维护 | `assertProfileGlobalPermissions`：非超管 create isGlobal / 改 isGlobal / 删全局一律拒绝 |
| 全局档案不可为租户默认 | `ownerChannelId=null` 时强制 `isTenantDefault=false`，语义互斥 |
| 权限目录单一来源 | `PERMISSION_CATALOG` → 角色页可选权限 + `updateTenantRole` 白名单 + 角色模板，三处同源 |
| C 端 50km 就近过滤 | 自提点无城市字段，按距离（Haversine）就近 |

## 4. 常见坑

| 现象 | 根因 | 解法 |
|---|---|---|
| 前端 locale 失效回退英文 | 前端 `zh-CN` vs Vendure `zh_Hans` 枚举不一致 | 客户端 `VENDURE_LOCALE_MAP` 映射 |
| i18n 数组文案取不到 | 数组型词条用 `t()` | 用 `tm()` |
| 后端多语言全英文 | `localizeText` 硬编码 en 兜底 | 后端默认 `current locale → en`，勿当 defaultLocale |
| `updateTenantRole` 报权限不在白名单 | 角色含 `Authenticated`/历史权限（如 `ManageOwnShop`） | `Authenticated` 由 `RoleService.update` 自动补回，回填时过滤白名单外项 |
| PowerShell `&&` 报错 | PS 不支持 `&&` 分隔 | 用 `;` |
| C 端查询「无活动订单」 | 未传会话 cookie | gql 请求带 `Cookie` 头 |

## 5. 问题速查（Bug 知识库）

| 现象 | 根因 | 代码点 | 回归脚本 |
|---|---|---|---|
| 自由大路店在档案 1 误显示（应为国信南山温泉酒店） | methodConfigs.options.pickupLocationIds 与库不一致 | `shipping-profile.service.ts` 绑定逻辑 | `tmp/query-t2-profiles-db.mjs` |
| 切换自提点被遗忘，结算沿用旧选择 | 切换状态未持久化/同步 | `BoxPickupBlock.vue` / `useOrderStore` | `tmp/verify-orderboxes-*.mjs` |
| t2 无配送档案 | 租户可见性规则缺自有档案 | `pickup-location.service.ts` `applyVisibility` | `tmp/verify-admin-pickup-pool.mjs` |
| 非超管可改全局属性 | 权限校验缺口 | `assertProfileGlobalPermissions` | 单测 + `tmp/verify-shipping-profile-global.mjs` |

## 6. 验证脚本清单

运行方式均为 `node tmp/<script>.mjs`（线上 admin API `https://e.joho.cn/admin-api`，superadmin/z123123）：

| 脚本 | 用途 |
|---|---|
| `tmp/regress-shipping-profile.mjs` | **一键回归套件**（本领域首选） |
| `tmp/verify-shipping-profile-global.mjs` | 全局档案创建/查询/删除 + 非超管被拒 |
| `tmp/verify-admin-profiles.mjs` | 运营端档案列表 |
| `tmp/verify-admin-pickup-pool.mjs` | 自提点可见性池 |
| `tmp/verify-profile1-bindings.mjs` | 档案 1 的 methodConfigs + boundPickupLocations |
| `tmp/verify-bound-pickups.mjs` | 档案绑定自提点 |
| `tmp/verify-orderboxes-pickup.mjs` / `verify-orderboxes-multichannel.mjs` / `verify-orderboxes-t2-now.mjs` / `verify-orderboxes-vt.mjs` / `verify-t1t3-orderboxes.mjs` | C 端各租户 orderBoxes 自提场景 |
| `tmp/verify-shop-pickup-visibility.mjs` | 门店自提可见性 |
| `tmp/verify-tenant-admin-shipping-profile.mjs` | 租户管理员登录访问档案（需 TA_USER/TA_PASS 环境变量） |

## 7. 历史文档索引

- `docs/superpowers/specs/2026-09-12-shipping-profile-global-admin-design.md` — 全局档案管理设计（设为全局开关、徽标、权限锁定）
- `docs/superpowers/plans/2026-09-12-shipping-profile-global-admin.md` — 全局档案实现计划（含权限纯函数 TDD）
- `docs/superpowers/specs/2026-09-12-domain-knowledge-design.md` — 本机制设计（三层架构 + 四件套）
- `docs/superpowers/manual/shipping-profile-global/index.html` — 全局档案操作手册（含手机截图）
- `docs/superpowers/plans/2026-09-12-domain-knowledge.md` — 本机制实现计划（5 Task 落地步骤）

**配送/自提点直接相关（spec + plan 成对）**：
- `docs/superpowers/specs/2026-08-28-nshop-checkout-delivery-modes-design.md` + `docs/superpowers/plans/2026-08-28-nshop-checkout-delivery-modes.md` — 配送方式选择（per-box 方式、方式级绑定自提点前身）
- `docs/superpowers/specs/2026-08-26-nshop-checkout-shipping-fixes-design.md` + `docs/superpowers/plans/2026-08-26-nshop-checkout-shipping-fixes.md` — 配送/结算修复（自由大路店误显示相关）
- `docs/superpowers/specs/2026-08-30-checkout-pickup-address-contact-design.md` + `docs/superpowers/plans/2026-08-30-checkout-pickup-address-contact.md` — 自提点联系人（姓名/电话采集与切换）
- `docs/superpowers/specs/2026-08-31-guest-order-lookup-pickup-redeem-design.md` + `docs/superpowers/plans/2026-08-31-guest-order-lookup-pickup-redeem.md` — 游客订单查询/自提兑换
- `docs/superpowers/specs/2026-08-28-nshop-delivery-payment-splitting-design.md` + `docs/superpowers/plans/2026-08-28-nshop-delivery-payment-splitting.md` — 配送费/支付拆分
- `docs/superpowers/manual/pickup-profile-pickup-admin/index.html` — 自提档案后台管理手册
- `docs/superpowers/manual/pickup-contact-switch/pickup-contact-switch.html` — 自提联系人切换手册

**结算/订单流程相关（命中 pickup/配送关键词的间接文档）**：
- specs：`2026-09-12-checkout-per-user-refresh-navigation-design.md`、`2026-09-03-per-box-qty-stepper-restore-design.md`、`2026-09-03-orders-cn-redemption-design.md`、`2026-09-02-nshop-cn-per-box-checkout-design.md`、`2026-09-02-nshop-cn-checkout-perbox-card-design.md`、`2026-09-02-nshop-checkout-cn-design.md`、`2026-09-01-order-template-jd-4level-design.md`、`2026-08-31-orders-jd-blocks-redemption-design.md`、`2026-08-31-fill-default-args-template-design.md`、`2026-08-31-checkout-box-type-module-association-design.md`、`2026-08-31-address-default-fix-design.md`、`2026-08-27-nshop-product-detail-builder-design.md`、`2026-08-27-nshop-checkout-jd-style-design.md`、`2026-08-27-nshop-c-detail-ux-design.md`、`2026-08-27-nshop-buy-actions-domain-fix-design.md`、`2026-08-26-jd-mobile-polish-design.md`、`2026-08-22-nshop-本地电商底座-design.md`、`2026-08-19-nshop-auth-middleware-type-safety-design.md`、`2026-08-18-nshop-order-center-address-book-design.md`、`2026-08-18-nshop-after-sales-design.md`、`2026-08-17-nshop-phase0-bootstrap-design.md`（均在 `docs/superpowers/specs/` 下）
- plans：`2026-09-03-orders-cn-redemption.md`、`2026-09-03-nshop-cn-perbox-card.md`、`2026-09-02-nshop-cn-per-box-checkout.md`、`2026-09-02-nshop-checkout-cn.md`、`2026-09-01-order-template-jd-4level.md`、`2026-08-31-orders-jd-blocks-redemption.md`、`2026-08-31-fill-default-args-template.md`、`2026-08-31-checkout-box-type-module-association.md`、`2026-08-31-address-default-fix.md`、`2026-08-28-nshop-i18n-full-localization.md`、`2026-08-27-nshop-product-detail-builder.md`、`2026-08-27-nshop-checkout-jd-style.md`、`2026-08-27-nshop-c-detail-ux.md`、`2026-08-27-nshop-buy-actions-domain-fix.md`、`2026-08-22-nshop-本地电商底座.md`、`2026-08-19-nshop-auth-middleware-type-safety.md`、`2026-08-18-nshop-order-center-address-book.md`、`2026-08-17-nshop-phase0-bootstrap.md`（均在 `docs/superpowers/plans/` 下）
- manual：`docs/superpowers/manual/price-jd-style/index.html`（JD 风格价格展示）、`docs/superpowers/manual/checkout-confirmation-detail/index.html`（结算确认详情）、`docs/superpowers/manual/checkout-per-user-refresh-nav/checkout-per-user-refresh-nav.md`（按用户刷新导航）
