# 领域知识沉淀（SSO 两仓手册 + 四本补充分册）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从记忆中抽取 SSO 登录知识建两仓领域手册（strapi 服务端 + nshop C 端对接，详细），并顺带沉淀用户数据清理 / 价格税档 / 跨渠道变体 / 支付分箱核销 4 本补充分册，更新 README 索引与 project_memory 入口指针，两仓库分别提交。

**Architecture:** 全部为文档产出（Markdown 领域手册），沿用既有 `docs/domains/` 7 章模板（规范 `nshop/docs/domains/README.md`，样板 `nshop/docs/domains/shipping-profile.md`）。内容蓝本 = 已批准设计文档 `nshop/docs/superpowers/specs/2026-09-13-domains-sso-login-design.md`（本节为批准内容），素材补充 = project_memory.md + session memory + 各仓库现有 docs。SSO 两本手册跨仓互相引用，其余四本落 nshop 并与既有 checkout/shipping-profile 手册互引。

**Tech Stack:** Markdown、git（nshop + strapi 两仓库分别提交）、rg（验收断言）

---

## 素材来源索引（所有 Task 共用）

| 来源 | 路径 | 用途 |
|---|---|---|
| 设计文档（内容蓝本，已批准） | `d:\zhao\nshop\docs\superpowers\specs\2026-09-13-domains-sso-login-design.md` | 每本手册的章节内容蓝本，直接格式化扩充 |
| project_memory 速查卡 | `c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md` | SSO 规则/教训、大清理关键坑 1-5、价格税档、商品迁移、分箱核销细节 |
| 既有手册样板 | `d:\zhao\nshop\docs\domains\shipping-profile.md`、`checkout.md` | 7 章格式样板 + 交叉引用目标 |
| strapi 现成文档 | `d:\zhao\strapi\docs\`（2026-06-21-wechat-login-design.md、2026-07-24-zhao-sso-wechat-login-design.md、sso-邀请码闭环与用户对齐-20260904.md、sso-登录回传邀请码与来源页回跳-20260905.md、deployment/sso-wechat-config-guide.md） | strapi 服务端手册历史索引 |
| 微信避坑指南 | `d:\zhao\wechat-sso-dev-guide\wechat-sso-dev-guide.html`（13 章） | strapi 服务端手册索引 + 坑补充 |
| nshop 现成文档 | `docs/superpowers/specs/2026-09-11-wechat-share-invite-design.md`、`docs/superpowers/manual/sso-home-auto-login/index.html` | nshop C 端手册历史索引 |

**7 章模板**（每本手册必须齐全）：① 概念模型 ② 文件地图（目录/模块级） ③ 设计决策（ADR 式表格） ④ 常见坑（现象→根因→解法表） ⑤ Bug 知识库（现象→根因→代码点→验证四列表） ⑥ 验证脚本/流程清单 ⑦ 历史文档索引。

---

### Task 1: strapi 服务端 SSO 手册 + domains 目录

**Files:**
- Create: `d:\zhao\strapi\docs\domains\README.md`（简版：目录说明 + 模板指针）
- Create: `d:\zhao\strapi\docs\domains\sso-login.md`

- [ ] **Step 1: 阅读素材**
  读 `d:\zhao\strapi\docs\superpowers\specs\2026-07-24-zhao-sso-wechat-login-design.md` 前 80 行、`d:\zhao\strapi\docs\deployment\sso-wechat-config-guide.md` 前 60 行，确认服务端术语与配置项名称与设计文档一致。

- [ ] **Step 2: 创建 `d:\zhao\strapi\docs\domains\README.md`**

```markdown
# 领域手册（Domain Handbooks）

面向「再次遇到同类问题能快速定位代码、精准修 Bug」的领域知识库。规范与 7 章模板见 `d:\zhao\nshop\docs\domains\README.md`（两仓共用同一套规范）。

## 手册清单
- `sso-login.md` — SSO 登录（服务端视角：zhao-sso 插件 / 统一登录页 / 白名单配置）。C 端对接视角见 `nshop/docs/domains/sso-login.md`
```

- [ ] **Step 3: 创建 `d:\zhao\strapi\docs\domains\sso-login.md`（7 章，内容蓝本 = 设计文档 §3.1）**
  按 7 章模板落盘，各章必含（直接取自已批准设计文档，可扩充但不可删减）：

  - **① 概念模型**：体系架构（h.joho.cn 主站 / zhao-sso 插件 / 消费端 / a.shenglin.vip 第三方站）；SSO vs Third 双体系（多跳中转 token 直验 vs 一站式）；三套用户表 ID 体系（sso_users / up_users / Local，分销只用 sso_users.id）；State 三语义（A base64url JSON 信封 / B OAuth2 透传 / C 导航路径）；核心表清单（sso_users、sso_third_party_bindings、sso_invite_codes、sso_tokens、sso_login_logs、sso_apps）
  - **② 文件地图**（目录/模块级）：`strapi/plugins/zhao-sso/` 的 `sso-oauth.ts`（授权码流/exchangeCode、白名单校验 `split("?")[0]`）、`sso-wechat.ts`（微信回调、openid 复用、username 生成 `wx_昵称前12位_8位uuid短码`、`register_channel`）、`sso-user.ts`（createUser 三选一约束）、`oauth-controller.ts`（回调域名校验日志）；`strapi-backend/` 的 `pages/sso/login`、`login-callback`、`auth-callback`、`App.vue`（SSO 自动跳转）、`pages.json` easycom；配置 `sso_apps.redirect_uris`（DB 实时生效）
  - **③ 设计决策表**：多跳中转+token 直验；白名单只校验 SSO 自身回调（C 端域名 URL 参数动态传，新域名接入零改动）；校验前 `split("?")[0]`；openid 复用原 id；username 生成规则；register_channel；登录优先级 SSO→三方→本地
  - **④ 常见坑表**：报错 1003（公众号后台回调域名 vs 微信环境域名不一致，v.joho.cn 配 third、h.joho.cn 配 SSO）；redirect_uri 不在白名单（validateRedirectUri 未剥 query / sso_apps 缺 `https://h.joho.cn/#/pages/sso/login-callback`）；`htpps` 协议替换（已 https 串二次替换；URL 编码须 `encodeURIComponent` 包完整地址防 `#` 漏编）；enforceHttps 仅对 h.joho.cn 强制（C 端回跳强制 https 触发微信 SSL 错误）；登录页卡住（wx-sso-login 组件 easycom 未扫描 / 构建产物未部署跑旧代码）；微信授权空白（snsapi_userinfo 需认证服务号；网页授权域名与 JS 安全域名是两个配置项）；zhao-sso 插件改 TS 源码须本地构建 `plugins/zhao-sso/dist/` 再部署
  - **⑤ Bug 知识库表（5 条）**：redirect_uri 不在白名单 / 微信环境 SSL 协议错误 / 手机微信授权页空白 / v.joho.cn return_url 错误（旧产物）/ 登录页卡住（easycom）——根因+代码点+验证列按设计文档 §3.1 填全
  - **⑥ 验证清单**：snsapi_base 授权链接自测；SQL 自查 `sso_apps.redirect_uris`（实时生效无需重启）；部署流程（本地构建 → 提交 → 服务器拉取 + pm2 重启；strapi-backend 走 `scripts/deploy.mjs` scp 原子替换）
  - **⑦ 历史索引**：strapi/docs 六篇（2026-06-21-wechat-login-design、2026-07-24-zhao-sso-wechat-login-design、2026-07-24-wechat-scope-fix-design、sso-邀请码闭环与用户对齐-20260904、sso-登录回传邀请码与来源页回跳-20260905、deployment/sso-wechat-config-guide）+ `d:\zhao\wechat-sso-dev-guide\wechat-sso-dev-guide.html` + 关联 nshop 手册

- [ ] **Step 4: 验收断言（必须全部通过）**

```bash
cd d:\zhao\strapi
rg -c "^## " docs/domains/sso-login.md   # 期望输出 >= 7（7 章标题）
rg -n "SSO vs Third|State|redirect_uri|1003|encodeURIComponent|snsapi_userinfo" docs/domains/sso-login.md   # 每词条 >= 1 命中
rg -c "^\|" docs/domains/sso-login.md    # Bug 库 + 常见坑表格行存在（>= 20）
```

- [ ] **Step 5: 提交（本 Task 完成时暂不提交，Task 8 统一提交）**

---

### Task 2: nshop C 端对接 SSO 手册

**Files:**
- Create: `d:\zhao\nshop\docs\domains\sso-login.md`

- [ ] **Step 1: 阅读素材**
  读 `d:\zhao\nshop\docs\superpowers\specs\2026-09-11-wechat-share-invite-design.md` 的「登录链路/时序」章节（前 100 行内），确认 `useSso.ts`、`sso-callback.vue`、`buildReferralRelation` 等名称与设计文档一致。

- [ ] **Step 2: 创建 `d:\zhao\nshop\docs\domains\sso-login.md`（7 章，内容蓝本 = 设计文档 §3.2）**
  各章必含：

  - **① 概念模型**：登录链路（nshop → `h.joho.cn/#/pages/sso/login` 统一页，带 `app_code`、`return_url` 含 `#/`、`channel_code`、`invite_code` → 回跳 → token 直验换 Vendure 会话）；e.joho.cn 与 www.youshop.cn 同一顾客体系（同 Vendure 实例 / 同 customer 表 / 同 SSO 服务器）；字段规则（ssoId = SSO 自增主键字符串如 "42"，幂等空才写；微信 openid 复用查 `sso_third_party_bindings.provider_user_id`）；邀请码闭环（referralCode = sso_invite_codes 自有码，`/v1/user/me` 的 `ownInviteCode` 幂等写；分享链接透传 invite_code → `buildReferralRelation` 幂等绑分销）
  - **② 文件地图**（目录/模块级）：`nshop/layers/base/app/composables/useSso.ts`（SSO 登录逻辑/inviteCode 透传/回跳落点）、`pages/sso/sso-callback.vue`（回跳参数分支）、`useAutoWechatSsoLogin.ts`（微信环境自动登录）、`login.vue`、`WechatInviteLoginBar.vue`（发起点）；`layers/base/i18n`；`d:\zhao\vendure\packages\cjk-plugin`（跨渠道建档、`InviteCodeService.bindIfPresent`、`DistributionService.apply`、`customerService.findOneByUserId`）
  - **③ 设计决策表**：统一页 token 直验 vs 直连 code 兑令牌；invite_code 透传 + buildReferralRelation 幂等；ssoId 幂等写入；跨渠道登录查映射复用原 Customer（防 customer.userId 唯一约束冲突）；邀请码/分销用 Customer.id 而非 User.id
  - **④ 常见坑表**：线上未重新部署（旧版授权码流 + redirect_uri 缺 `#/`）；测试账号混淆（e2e_full_80753 ssoId=32 密码注册无 openid ≠ 真实微信用户 ssoId=2）；生产库 customer 表 customFields 为独立列（`"customFieldsSsoid"` 等须双引号查询，非 JSONB custom_fields）；老用户登录须同步 up_users.sso_id/invite_code/nickname
  - **⑤ Bug 知识库表（5 条）**：the provided credentials are invalid（跨渠道重复建档撞唯一约束）/ 邀请码自动分销落不到本地顾客（传 User.id）/ referralCode 对不上（/v1/user/me 缺 ownInviteCode）/ e.joho.cn 登录失败（未部署新版）/ up_users 数据过时（未同步字段）——四列按设计文档 §3.2 填全
  - **⑥ 验证清单**：`nshop/tmp/` SSO/邀请码 verify 脚本（登录、token 直验、invite_code 透传）；微信真机验证流程（分享链接 → 登录 → 回跳原分享页 → 绑定幂等）
  - **⑦ 历史索引**：specs/2026-09-11-wechat-share-invite-design.md + plans/2026-09-12-wechat-share-invite.md；manual/sso-home-auto-login/index.html；strapi/docs 两份邀请码文档；关联 `strapi/docs/domains/sso-login.md`（服务端视角）

- [ ] **Step 3: 验收断言**

```bash
cd d:\zhao\nshop
rg -c "^## " docs/domains/sso-login.md    # >= 7
rg -n "token 直验|ssoId|customFieldsSsoid|buildReferralRelation|findOneByUserId" docs/domains/sso-login.md   # 每词条 >= 1
rg -n "strapi/docs/domains/sso-login" docs/domains/sso-login.md   # 交叉引用存在
```

---

### Task 3: 用户数据大清理手册

**Files:**
- Create: `d:\zhao\nshop\docs\domains\data-cleaning.md`

- [ ] **Step 1: 阅读素材**
  project_memory.md 第 1-10 行（「用户数据大清理」段）+ 第 90 行（生产库表结构）。内容蓝本 = 设计文档 §4.1。

- [ ] **Step 2: 创建 `d:\zhao\nshop\docs\domains\data-cleaning.md`（7 章）**
  各章必含：
  - ① 概念模型：清理范围（Vendure 除 superadmin(user#1+administrator#1) 外全部 user/customer/order；Strapi 三用户表仅留 id=1 admin；内容表显式清空清单 sso_third_party_bindings/sso_invite_codes/sso_tokens/sso_login_logs/zhao_user_invites/zhao_channel_members/zhao_point_records）；清理后终态（Vendure 仅 superadmin，customer/order=0；主数据保留）
  - ② 文件地图：`_clean_vendure_users.mjs` / `_clean_strapi_users.mjs`（scp 到服务器 /tmp 后 node 运行，读 `/www/apps/strapi/.env` DATABASE_* 连库，复用其 node_modules/pg）；备份 `/www/apps/_dbbackup/`（`_20260911_*.dump`）
  - ③ 设计决策：全量 cids/oids 而非 userId 锚点；外键按依赖序删；dry-run 守卫
  - ④ **常见坑（关键坑 1-5，必须全列）**：① 锚点坑（访客 customer.userId=null / guest 订单 customerId=null 会漏删，必须 cids=全部 customer、oids=全部 order）；② Vendure 外键 NO ACTION 按依赖序删（order 子表→order→history_entry→customer 子表→customer→user 子表→administrator→user；order_item/external_authentication_method 不存在；group_buy_order.orderId varchar 须 ::text；refund 只有 paymentId；junction 表复合主键无 id 序列；stock_movement 须在 order_line 前删；session 须在 order 前删）；③ Strapi 外键几乎全 CASCADE（*_lnk 自动级联）但内容表不级联须显式清空；④ dry-run 必须 count 而非 delete + 所有 DELETE 受 `!DRY` 守卫（2026-09-11 曾真删教训）；⑤ 序列重置 `setval(pg_get_serial_sequence($1,'id'),1,false)` 对复合主键 join 表抛错回滚，须先判 null 或排除 join 表；superadmin 保留 user#1，`setval(user_id_seq,1,true)` 新用户从 2 起
  - ⑤ Bug 知识库（≥3 条）：dry-run 实际执行删除 / 序列重置抛错回滚 / 漏删访客记录
  - ⑥ 验证清单：删除后 count 断言 + 主数据保留检查（商品/渠道/供应/支付/优惠券）；备份恢复点
  - ⑦ 历史索引：project_memory「用户数据大清理」段；关联 SSO 手册（sso_users 清理）

- [ ] **Step 3: 验收断言**

```bash
cd d:\zhao\nshop
rg -n "关键坑|DRY|setval|CASCADE|NO ACTION|_20260911" docs/domains/data-cleaning.md   # 每词条 >= 1
rg -c "^## " docs/domains/data-cleaning.md   # >= 7
```

---

### Task 4: 价格/税档三态手册

**Files:**
- Create: `d:\zhao\nshop\docs\domains\pricing-tax.md`

- [ ] **Step 1: 阅读素材**
  project_memory.md 第 55-70 行（后台价格一致性 + taxMode 定稿）、第 73-83 行（价格相关教训）。内容蓝本 = 设计文档 §4.2。

- [ ] **Step 2: 创建 `d:\zhao\nshop\docs\domains\pricing-tax.md`（7 章）**
  各章必含：
  - ① 概念模型：**后台价格一致性**（后台 price 直存录入原值×100 分，全渠道一致，禁止税率再换算 200→226/113）；**taxMode 三态**（inclusive 价内拆税 / zero 零税 / exclusive 价税分离，运营端「店铺信息」三态分段器 `myUpdateChannelCustomFields` 写入）；**前端取价** basis = 后台 `price`（禁用 `priceWithTax`，因随 pricesIncludeTax 漂移）；`displayCentsFromNet(P, mode)`（inclusive/zero 返回 P，exclusive 返回 P×1.13）、`taxFromGross(总额, mode)`（inclusive 用 P / exclusive 用 P×1.13 / zero 返回 null）；`useTaxMode` + `utils/tax-price.ts`
  - ② 文件地图：`nshop/layers/base/app/utils/tax-price.ts`（displayCentsFromNet/taxFromGross）、`composables/useTaxMode.ts`、`utils/display-price.ts`（pickDisplayPrice 已知坑）、`gql/queries/context.gql`（GetChannelTheme 用 taxMode）、结算页 OrderSummary（showTaxRow 按 taxMode 显隐）、`vshop/web-admin/scripts/calibrate-prices.mjs`
  - ③ 设计决策：后台一致 + 前台差异化允许；换算不写回后台；pickDisplayPrice 应改以 price 为 basis
  - ④ **常见坑**：默认渠道（pricesIncludeTax=false，price 存净价）vs t2（true，price 存含税价）**校准口径相反**——默认渠道校准直接写 price=目标净价，calibrate-prices.mjs 固定 ×1.13 只对 t2 类正确；共享变体单源价格（任一渠道 updateProductVariants 两侧同改，无法按渠道独立存值）；GetChannelTheme 用 taxEnabled 会 GRAPHQL VALIDATION_FAILED→空→回退 inclusive 错显税款行；本地 graphql.schema.json 滞后须 `node tmp-refresh-schema.mjs` 重拉 introspection（shop-api 不含 admin-only 字段，死 gql 应删）；渠道 pricesIncludeTax 单独改 true 会隐性降价 13%
  - ⑤ Bug 知识库（≥4 条）：默认渠道校准把净价再放大（写 22600 非 20000）/ 商品页显示与结算应付不一致（渠道配置错位）/ 结算页错显税款行（旧 taxEnabled）/ 变体 58 校准状态
  - ⑥ 验证清单：`vshop/web-admin/scripts/calibrate-prices.mjs`（注意幂等 state 文件 + 默认渠道绕过脚本）；结算页税额行三态显隐检查
  - ⑦ 历史索引：project_memory「后台价格一致性」「taxMode 三态」「跨渠道价格语义」段落；关联 cross-channel-variants.md

- [ ] **Step 3: 验收断言**

```bash
cd d:\zhao\nshop
rg -n "pricesIncludeTax|displayCentsFromNet|taxFromGross|calibrate|priceWithTax|taxMode" docs/domains/pricing-tax.md   # 每词条 >= 1
rg -c "^## " docs/domains/pricing-tax.md   # >= 7
```

---

### Task 5: 跨渠道商品变体/迁移手册

**Files:**
- Create: `d:\zhao\nshop\docs\domains\cross-channel-variants.md`

- [ ] **Step 1: 阅读素材**
  project_memory.md 第 76-79 行（跨渠道变体分配 / 双轨隔离 / 共享变体单源）。内容蓝本 = 设计文档 §4.3。

- [ ] **Step 2: 创建 `d:\zhao\nshop\docs\domains\cross-channel-variants.md`（7 章）**
  各章必含：
  - ① 概念模型：变体唯一性按 `(productId, optionIds)` **全局**判定；每个变体有自己的 Channel 归属；`assignProductVariantsToChannel(input:{productVariantIds, channelId})`（**mutation 用 input 对象**，非顶层参数）；租户商品双轨隔离（`TenantCatalogService.moveProductsToTenantChannel` 主动从默认渠道摘除 → 租户商品只挂租户渠道、默认商城互见）；上架迁移（`submitForMarketplaceAdmin` → `approveMarketplaceProduct` → `placeIntoTenantCategory` 中 `assignProductsToChannel` **整体迁移**商品+变体+资产+规格组补挂默认渠道，并设 merchantRef=非默认渠道、marketplaceStatus=APPROVED、listedInMarketplace=true）
  - ② 文件地图：vendure `cjk-plugin` 的 `TenantCatalogService`（moveProductsToTenantCategory / moveProductsToTenantChannel）、`MarketplaceService`（placeIntoTenantCategory / approveMarketplaceProduct）；前端 web-admin `apis/product.ts`（createProductFull/updateProductFull）
  - ③ 设计决策：双轨隔离 vs 共享变体单源；整体迁移不逐个新建故不冲突
  - ④ **常见坑**：商品61（默认渠道创建的无规格变体只挂默认渠道 → t2 再建同规格报 `A ProductVariant with the selected options already exists` 但 t2 `product{variants}` 返回空，表现为运营端 t2 保存价格永远失败；解法 assignProductVariantsToChannel 显式分配）；渠道 id 先查（`channels{items{id code}}`，t2=37、__default_channel__=1，勿臆测）；上架到默认渠道后再在租户渠道新建同规格变体会撞全局唯一性（正常统一在编辑页维护变体）；共享变体 price 单源（任一侧写两侧同改）
  - ⑤ Bug 知识库（≥3 条）：t2 保存价格永远失败 / 上架后租户渠道新建变体冲突 / 跨渠道 price 语义差异
  - ⑥ 验证清单：`channels{items{id code}}` 查渠道 id；多渠道 `product{variants}` 查询；assign 后库存（stockLocations）与价格隔离检查
  - ⑦ 历史索引：project_memory「商品61坑」「双轨隔离」「共享变体单源」段落；关联 pricing-tax.md

- [ ] **Step 3: 验收断言**

```bash
cd d:\zhao\nshop
rg -n "optionIds|assignProductVariantsToChannel|placeIntoTenantCategory|submitForMarketplaceAdmin|t2=37|商品61" docs/domains/cross-channel-variants.md   # 每词条 >= 1
rg -c "^## " docs/domains/cross-channel-variants.md   # >= 7
```

---

### Task 6: 支付/分箱/核销手册

**Files:**
- Create: `d:\zhao\nshop\docs\domains\payment-split-redemption.md`

- [ ] **Step 1: 阅读素材**
  project_memory.md 第 35-45 行（分箱规则 / 支付合并 / 核销码 / 核销收款 / 状态流转）+ 第 101 行（C 端 orderBoxes）。内容蓝本 = 设计文档 §4.4。注意与 `docs/domains/checkout.md` 互引（checkout 覆盖前端渲染，本手册覆盖后端规则）。

- [ ] **Step 2: 创建 `d:\zhao\nshop\docs\domains\payment-split-redemption.md`（7 章）**
  各章必含：
  - ① 概念模型：**分箱规则**（① 按租户分箱优先——不同租户必分箱即使共用全局档案 isGlobal；② 租户内按配送档案分箱；同档案/同租户可合箱；跨档/跨租户必分箱零交集；分箱的支付方式 = 该箱配送档案所绑定支付档案白名单）；**支付合并规则**（选余额 → 全部箱跨租户/跨档案合并 1 单全局共享钱包一次扣款；不选余额 → 各箱支付方式交集非空同样合并 1 单统一收款实收按商户分账；交集空或余额不足 → 按箱拆分每箱一单）；**核销**（核销码仅自提单 deliveryType='pickup' 显示；COD 核销需 `Channel.customFields.redeemCollectMode` force/optional 确认收款，确认后 `order.customFields.collected=true` + `merchant_settlement_ledger` PENDING_SIGN→PAID；核销成功自动推进 PaymentAuthorized→Delivered→Completed；收款台账查询过滤 tenantChannelId+collectorChannelId；核销人优先取 TenantMember.displayName）
  - ② 文件地图：vendure `cjk-plugin`（分箱 resolveBoxFulfilment、核销 redemption、merchant_settlement_ledger）；nshop 结算页（关联 checkout.md）
  - ③ 设计决策：合并/拆单自动判定不放开关；核销人即收款人幂等归台账
  - ④ **常见坑**：COD 单未核销未收款支付环节显示「待到店收款」；强制模式未确认收款无法核销；台账查询漏过滤 collectorChannelId 导致本店经手收款不可见
  - ⑤ Bug 知识库（≥3 条）：合并/拆单判定错误 / 核销码在物流单误显 / 台账收款人归属错
  - ⑥ 验证清单：分箱/合并/核销回归脚本（参考 tmp/verify-orderboxes-*.mjs、配送档案回归套件 tmp/regress-shipping-profile.mjs）
  - ⑦ 历史索引：project_memory「分箱规则」「支付合并规则」「核销」段落；关联 checkout.md、shipping-profile.md

- [ ] **Step 3: 验收断言**

```bash
cd d:\zhao\nshop
rg -n "按租户分箱|支付方式交集|redeemCollectMode|merchant_settlement_ledger|Delivered|collected" docs/domains/payment-split-redemption.md   # 每词条 >= 1
rg -n "checkout.md|shipping-profile.md" docs/domains/payment-split-redemption.md   # 交叉引用存在
rg -c "^## " docs/domains/payment-split-redemption.md   # >= 7
```

---

### Task 7: 索引与速查卡指针

**Files:**
- Modify: `d:\zhao\nshop\docs\domains\README.md`（索引表追加）
- Modify: `c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md`（各领域速查卡补入口指针行）

- [ ] **Step 1: 更新 `nshop/docs/domains/README.md`**
  在手册清单表追加 5 行（sso-login C 端、data-cleaning、pricing-tax、cross-channel-variants、payment-split-redemption），每行含一句话职责 + 入口指针说明。若 README 无清单表则按既有格式补一个「手册清单」节。

- [ ] **Step 2: 更新 project_memory.md 入口指针**
  在以下速查卡段落末尾各补一行 `> 入口指针 → docs/domains/<domain>.md`：
  - SSO 相关规则段（第 46-53 行附近）→ `sso-login.md`
  - 「用户数据大清理」段（第 1-10 行）→ `data-cleaning.md`
  - 「后台价格一致性/taxMode」段（第 55-70 行）→ `pricing-tax.md`
  - 「跨渠道变体/双轨隔离」教训段（第 76-79 行）→ `cross-channel-variants.md`
  - 「分箱/支付合并/核销」段（第 35-45 行）→ `payment-split-redemption.md`

- [ ] **Step 3: 验收断言**

```bash
cd d:\zhao\nshop
rg -n "sso-login|data-cleaning|pricing-tax|cross-channel-variants|payment-split-redemption" docs/domains/README.md   # 5 行全命中
rg -n "docs/domains/(sso-login|data-cleaning|pricing-tax|cross-channel-variants|payment-split-redemption)" "c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md"   # >= 5 命中
```

---

### Task 8: 两仓库提交

- [ ] **Step 1: nshop 提交**

```bash
cd d:\zhao\nshop
git add docs/domains/sso-login.md docs/domains/data-cleaning.md docs/domains/pricing-tax.md docs/domains/cross-channel-variants.md docs/domains/payment-split-redemption.md docs/domains/README.md docs/superpowers/specs/2026-09-13-domains-sso-login-design.md
git commit -m "docs(domains): SSO 登录(C端) + 数据清理/价格税档/跨渠道变体/支付分箱核销 五本领域手册 + 索引"
git log --oneline -1   # 确认提交
```

- [ ] **Step 2: strapi 提交**

```bash
cd d:\zhao\strapi
git add docs/domains/README.md docs/domains/sso-login.md
git commit -m "docs(domains): SSO 登录服务端领域手册（zhao-sso/统一登录页/白名单配置）+ domains 目录"
git log --oneline -1   # 确认提交
```

- [ ] **Step 3: 总验收**
  两仓库 `git status --short` 均干净（仅剩无关在途改动时确认不含本次文件）；6 本手册 7 章齐全（Task 1-6 断言复核）。

---

## Self-Review 记录

- **Spec 覆盖**：设计文档 §2 六本手册 → Task 1-6；§5 收尾（README/strapi README/project_memory 指针）→ Task 1 Step 2 + Task 7；§6 验收（6 本齐全、交叉引用、记忆抽取完整、索引更新、两仓提交）→ 各 Task 断言 + Task 8。无遗漏。
- **占位符扫描**：无 TBD/TODO；每本手册的必含要点均从已批准设计文档内联，执行者仅做格式化成 7 章模板 + 素材补充。
- **类型一致性**：手册路径、文件名、章节号（①-⑦）在 Task 1-6 中一致；交叉引用目标 `docs/domains/checkout.md`/`shipping-profile.md` 与既有文件一致；素材来源路径均已核对存在。
