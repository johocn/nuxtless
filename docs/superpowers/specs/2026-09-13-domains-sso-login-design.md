# 领域知识沉淀设计：SSO 登录手册（两仓）+ 四本补充分册

> 日期：2026-09-13
> 状态：设计定稿待审
> 范围：从记忆中抽取 SSO 登录知识建两仓领域手册（详细），并顺带沉淀用户数据清理 / 价格税档 / 跨渠道变体 / 支付分箱核销 4 个高价值领域

## 1. 背景与目标

- **知识沉淀机制已建立**：`docs/domains/` 7 章模板（规范 `README.md`，样板 `shipping-profile.md`/`checkout.md`），定位规则见 `project_memory.md`「领域手册维护（硬规范）」。本次是**跨仓库**首次沉淀：SSO 体系横跨 strapi（zhao-sso 插件）、strapi-backend（统一登录页 H5）、nshop（Vendure C 端对接）、vendure（cjk-plugin）。
- **记忆素材充足**：project_memory 已含 SSO 8 条规则 + 6 条教训；session memory（2026-08-01/02、2026-09-12）含 SSO/Third 双体系、State 三语义、微信登录避坑等大量经验；strapi/docs 有微信登录设计、邀请码闭环、sso-wechat-config-guide 等现成文档；`wechat-sso-dev-guide.html` 13 章避坑指南。但**无领域手册**，再次定位 SSO 问题仍需漫游多个仓库。
- **用户决策（2026-09-13 澄清）**：
  - SSO 手册**两仓各建一份**：strapi 服务端视角 + nshop C 端对接视角
  - 范围 = **SSO + 顺带补 4 个领域**（用户数据大清理、价格/税档三态、跨渠道商品变体/迁移、支付/分箱/核销）
  - 粒度 = **概念/流程级为主**（不逐文件盘点符号，文件地图给目录/模块级 + 关键符号，行号用 rg 现查）

## 2. 手册体系总览（6 本）

| # | 手册 | 落点 | 视角/内容 |
|---|---|---|---|
| 1 | `sso-login.md` | `d:\zhao\strapi\docs\domains\`（新建目录） | SSO 服务端：zhao-sso 插件、OAuth/State/白名单、登录页、配置 |
| 2 | `sso-login.md` | `d:\zhao\nshop\docs\domains\` | SSO C 端对接：登录链路、token 直验、ssoId/邀请码、Bug 库 |
| 3 | `data-cleaning.md` | `nshop/docs/domains/` | 用户数据大清理（投产前重置） |
| 4 | `pricing-tax.md` | `nshop/docs/domains/` | 价格/税档三态 + 后台价格一致性 |
| 5 | `cross-channel-variants.md` | `nshop/docs/domains/` | 跨渠道商品变体分配/双轨隔离/上架迁移 |
| 6 | `payment-split-redemption.md` | `nshop/docs/domains/` | 分箱规则/支付合并拆单/核销收款流转 |

交叉约定：SSO 两本手册互相引用（服务端↔C 端），并与 `shipping-profile.md`/`checkout.md`（支付/分箱部分）互相引用，不重复展开。

## 3. SSO 手册（重点，详细）

### 3.1 strapi 服务端视角 `strapi/docs/domains/sso-login.md`

**1. 概念模型**
- 体系架构：`h.joho.cn` = SSO 主站（zhao-sso 插件）；`v.joho.cn`/各 C 端 = 消费端；`a.shenglin.vip` 等 = 第三方站（同 SSO 服务器）
- **SSO vs Third 双体系**：zhao-sso（多跳中转，token 直验）vs zhao-third（一站式）；**三套用户表 ID 体系**（SSO `sso_users` / Third `up_users` / Local 本地），分销关系只用 `sso_users.id`
- **State 三语义**：Type A（base64url JSON 信封）、Type B（OAuth2 透传）、Type C（导航路径）
- 核心表：`sso_users`、`sso_third_party_bindings`（openid→sso_users.id）、`sso_invite_codes`、`sso_tokens`、`sso_login_logs`、`sso_apps`（白名单配置）

**2. 文件地图（目录/模块级，行号用 rg 现查）**
- `strapi/plugins/zhao-sso/`：`sso-oauth.ts`（授权码流/exchangeCode、redirect_uri 白名单校验 `split("?")[0]`）、`sso-wechat.ts`（微信回调、openid 复用、username 生成 `wx_昵称前12位_8位uuid短码`、`register_channel`）、`sso-user.ts`（createUser 三选一约束）、`oauth-controller.ts`（回调域名校验日志）
- `strapi-backend/`（统一登录页 H5）：`pages/sso/login`、`login-callback`、`auth-callback`、`App.vue`（SSO 自动跳转）、`pages.json` easycom
- 配置：`sso_apps.redirect_uris`（数据库表，实时生效）；微信公众号后台（网页授权域名 vs JS 安全域名是两个配置项）

**3. 设计决策（ADR 式）**
| 决策 | 理由 |
|---|---|
| SSO 多跳中转 + token 直验 | 跨站登录需中转页；回跳只带 token 不暴露 code |
| redirect_uri 白名单只校验 SSO 自身回调地址 | C 端域名经 URL 参数动态传递，新域名接入 SSO 服务器零改动 |
| 白名单校验前 `split("?")[0]` | 剥离 query 防精确匹配失败 |
| 微信 openid 命中 `sso_third_party_bindings` 复用原 id | 同人多次登录不建新用户 |
| 微信登录用户 username = `wx_昵称前12位_8位uuid短码` | 满足 createUser 至少一字段约束 + 可读 |
| `register_channel` 记录注册来源 | 区分注册路径（微信/密码/短信） |
| 登录优先级：SSO 第一 → 三方 → 本地 | 微信环境自动登录优先走 SSO |

**4. 常见坑**（复现现象 → 根因 → 解法）
- 报错 1003：公众号后台 OAuth2 回调域名未配置/与微信环境实际域名不一致（v.joho.cn 配 third、h.joho.cn 配 SSO）
- redirect_uri 不在白名单：`validateRedirectUri` 精确匹配未剥 query；`sso_apps` 表配置缺失 `https://h.joho.cn/#/pages/sso/login-callback`
- `htpps` 协议替换：对已 https 字符串二次替换 scheme；URL 编码须 `encodeURIComponent` 包完整地址防 `#` 漏编
- enforceHttps 只对 SSO 域名 h.joho.cn 强制；C 端回跳强制 https 会在微信浏览器触发 SSL 错误
- 登录页卡住：`wx-sso-login` 组件未被 easycom 扫描（位置/配置）；构建产物未部署（服务器跑旧代码）
- 微信授权空白：snsapi_userinfo 需**已认证**服务号；网页授权域名与 JS 安全域名是两个配置项
- 本地构建产物上传：`plugins/zhao-sso/dist/` 构建后再部署，服务器 pm2 重启

**5. Bug 知识库**（现象→根因→代码点→回归/验证）
| 现象 | 根因 | 代码点 | 验证 |
|---|---|---|---|
| redirect_uri 不在白名单 | validateRedirectUri 未剥 query / sso_apps 配置缺失 | `sso-oauth.ts` | SQL 查 `sso_apps.redirect_uris` + 登录自测 |
| 微信环境只看到 v.joho.cn 其余不可见，SSL 协议错误 | 强制 https 回跳 C 端 | `enforceHttps` | 仅对 h.joho.cn 强制 |
| 手机微信授权页空白 | 服务号未认证 / 授权域名未配 | 公众号后台 | snsapi_base 链接测试 |
| v.joho.cn 登录 return_url 错误 | 服务器运行旧构建产物 | 部署 | 本地构建上传后验证 |
| 登录页卡住不动 | 组件 easycom 未扫描 | `pages.json` | 重新编译部署 |

**6. 验证脚本/流程清单**
- 登录链路自测：`snsapi_base` 授权链接测域名可达/集成；SQL 自查 `sso_apps` 白名单（数据库查询实时生效，无需重启）
- 部署：本地构建 `plugins/zhao-sso/dist/` → 提交 → 服务器拉取 + pm2 重启（strapi-backend 走 `scripts/deploy.mjs` scp 原子替换）

**7. 历史文档索引**
- `d:\zhao\strapi\docs\`：`2026-06-21-wechat-login-design.md`、`2026-07-24-zhao-sso-wechat-login-design.md`、`2026-07-24-wechat-scope-fix-design.md`、`sso-邀请码闭环与用户对齐-20260904.md`、`sso-登录回传邀请码与来源页回跳-20260905.md`、`deployment/sso-wechat-config-guide.md`
- `d:\zhao\wechat-sso-dev-guide\wechat-sso-dev-guide.html`（13 章避坑指南）
- 关联：`nshop/docs/domains/sso-login.md`（C 端视角）

### 3.2 nshop C 端对接视角 `nshop/docs/domains/sso-login.md`

**1. 概念模型**
- 登录链路：nshop → `h.joho.cn/#/pages/sso/login` 统一页（`app_code`、`return_url` 含 `#/`、`channel_code`、`invite_code`）→ 微信授权/密码登录 → 回跳 → **token 直验换取 Vendure 会话**
- e.joho.cn 与 www.youshop.cn：共用同一 Vendure 实例、同一 `customer` 表、同一 SSO 服务器（同一套顾客体系）
- 字段规则：`ssoId` = SSO 用户表自增主键字符串（如 "42"），幂等写入（空才写）；微信 openid 复用（`sso_third_party_bindings` 查 `provider_user_id`）
- 邀请码闭环：Vendure `referralCode` = SSO `sso_invite_codes` 自有码（`/v1/user/me` 的 `ownInviteCode` 幂等写）；分享链接透传 `invite_code` → 服务端 `buildReferralRelation` 幂等绑分销

**2. 文件地图（目录/模块级）**
- `nshop/layers/base/app/composables/useSso.ts`（SSO 登录逻辑、inviteCode 透传、回跳落点）、`pages/sso/sso-callback.vue`（回跳参数分支）、`useAutoWechatSsoLogin.ts`（微信环境自动登录）、`login.vue`、`WechatInviteLoginBar.vue`（发起点）
- `nshop/layers/base/i18n`（SSO 登录文案）
- `vendure/packages/cjk-plugin`：SSO 对接（跨渠道建档、`InviteCodeService.bindIfPresent`、`DistributionService.apply`、`customerService.findOneByUserId`）

**3. 设计决策（ADR 式）**
| 决策 | 理由 |
|---|---|
| 统一页 token 直验换会话（vs 直连 code 兑令牌） | 微信授权集中到 SSO，C 端不直接碰 code |
| 分享链接 `invite_code` 透传 + `buildReferralRelation` 幂等 | 首次登录即绑定分销关系，重复访问不重绑 |
| `ssoId` 幂等写入（空才写） | 不覆盖已有绑定，防多账号串 |
| 跨渠道登录查映射复用原 Customer | 防 `customer.userId` 唯一约束冲突 |
| 邀请码/分销一律用 `Customer.id` 而非 `User.id` | 数值错位 bug 教训 |

**4. 常见坑**
- 线上未重新部署（旧版授权码流 + `redirect_uri` 缺 `#/`）→ 登录失败
- 测试账号混淆：`e2e_full_80753`（ssoId=32，密码注册无 openid）≠ 真实微信用户（ssoId=2）
- 生产库 `customer` 表 customFields 是**独立列**（`"customFieldsSsoid"` 等，须双引号查询），非 JSONB `custom_fields`
- 老用户登录须同步 `up_users.sso_id/invite_code/nickname`（`ensureUpUser` 之外补同步）

**5. Bug 知识库**
| 现象 | 根因 | 代码点 | 验证 |
|---|---|---|---|
| the provided credentials are invalid | SSO 跨渠道重复建档撞 `customer.userId` 唯一约束 | cjk-plugin 跨渠道建档 | 多渠道登录回归 |
| 邀请码/自动分销落不到本地顾客 | 传入 `User.id` 而非 `Customer.id` | `InviteCodeService`/`DistributionService` | 邀请码回归 |
| referralCode 对不上 | `/v1/user/me` 未返回 `ownInviteCode` | SSO 接口 | 接口返回校验 |
| e.joho.cn 登录失败 | C 端 H5 未部署新版本 | 部署 | 线上登录验证 |
| 老用户 up_users 数据过时 | 登录链路未同步字段 | SSO 登录链路 | 数据对比 |

**6. 验证脚本**
- `nshop/tmp/`：SSO/邀请码相关 verify 脚本（登录、token 直验、invite_code 透传）
- 微信真机验证：分享链接 → 登录 → 回跳原分享页 → 绑定关系幂等

**7. 历史索引**
- `nshop/docs/superpowers/specs/2026-09-11-wechat-share-invite-design.md` + `plans/2026-09-12-wechat-share-invite.md`
- `nshop/docs/superpowers/manual/sso-home-auto-login/index.html`
- `strapi/docs/sso-登录回传邀请码与来源页回跳-20260905.md`、`sso-邀请码闭环与用户对齐-20260904.md`
- 关联：`strapi/docs/domains/sso-login.md`（服务端视角）

## 4. 四本补充分册（均概念/流程级）

### 4.1 `data-cleaning.md` — 用户数据大清理
- 概念：清理范围（Vendure 除 superadmin 全 user/customer/order；Strapi 三用户表仅留 id=1 admin；内容表显式清空清单）、终态
- **关键坑 1-5**：① 锚点（不能以非 superadmin userId 锚，cids/oids 全量）；② Vendure 外键 NO ACTION 需按依赖序删（含 order_item/external_authentication_method 不存在、group_buy_order.orderId varchar、refund 只有 paymentId、junction 复合主键）；③ Strapi 外键几乎全 CASCADE 但内容表不级联（显式清空 sso_third_party_bindings 等）；④ dry-run 必须 count 而非 delete + 所有 DELETE 受 `!DRY` 守卫；⑤ 序列重置 `setval(pg_get_serial_sequence(...))` 对复合主键 join 表抛错须先判 null
- 执行：`_clean_vendure_users.mjs`/`_clean_strapi_users.mjs`（scp 到服务器 /tmp 运行，读 strapi .env 连库）；备份位置 `/www/apps/_dbbackup/`
- 验证：删除后 count 断言 + 主数据保留检查

### 4.2 `pricing-tax.md` — 价格/税档三态
- 概念：后台价格一致性（录入原值直存、全渠道一致、禁止税率再换算）；`taxMode` 三态（inclusive/zero/exclusive）与展示规则（`displayCentsFromNet`/`taxFromGross`）；前端取价 basis = 后台 `price`（禁用 `priceWithTax`）
- 坑：默认渠道（pricesIncludeTax=false，price 存净价）vs t2（true，price 存含税价）**校准口径相反**；`calibrate-prices.mjs` 固定 ×1.13 只对 t2 类正确；共享变体单源价格（写一侧两侧同改）；`GetChannelTheme` 必须用 `taxMode`（旧 `taxEnabled` 已删）；本地 `graphql.schema.json` 滞后需 `tmp-refresh-schema.mjs`
- 验证：渠道价格校准脚本、结算页税额行显隐检查

### 4.3 `cross-channel-variants.md` — 跨渠道商品变体/迁移
- 概念：变体唯一性按 `(productId, optionIds)` 全局；变体 Channel 归属；`assignProductVariantsToChannel`（mutation 用 `input` 对象）；租户商品双轨隔离（`moveProductsToTenantChannel`）；上架迁移（`submitForMarketplaceAdmin` → `approveMarketplaceProduct` → `placeIntoTenantCategory` 整体补挂默认渠道 + merchantRef/marketplaceStatus/listedInMarketplace）
- 坑：商品61（t2 建同规格变体报 already exists 但 variants 返回空）；渠道 id 先查（t2=37、__default_channel__=1）；上架后租户渠道再建同规格会撞全局唯一
- 验证：多渠道 product{variants} 查询、assign 后库存/价格隔离检查

### 4.4 `payment-split-redemption.md` — 支付/分箱/核销
- 概念：分箱规则（① 按租户分箱优先 ② 租户内按档案分箱；跨档/跨租户必分箱）；支付合并规则（选余额→全合并；在线/COD 交集非空→合并统一收款按商户分账；交集空/余额不足→按箱拆分）；核销（核销码仅自提单显示、COD 需 `redeemCollectMode` force/optional、收款台账 `merchant_settlement_ledger` PENDING_SIGN→PAID、状态流 PaymentAuthorized→Delivered→Completed、台账过滤 tenantChannelId+collectorChannelId、核销人取 displayName）
- 关联：与 `checkout.md`（结算页渲染）互引，重点在**后端规则**
- 验证：分箱/合并/核销回归脚本

## 5. 收尾（每本手册落成后）

- `nshop/docs/domains/README.md` 索引表追加 5 本新手册（sso-login C 端 + 4 本）
- `strapi/docs/domains/README.md` 新建（简版：目录说明 + 模板指针）
- `project_memory.md` 各领域速查卡补「入口指针 → `docs/domains/<domain>.md`」行（SSO/价格税档/商品迁移/支付核销/大清理）

## 6. 验收标准

- [ ] 6 本手册齐全：SSO 两仓各一（7 章完整，Bug 库 ≥5 条真实案例）、4 本补充分册（概念/流程级，含关键坑与 Bug 库）
- [ ] 两仓手册交叉引用正确（服务端↔C 端↔既有 checkout/shipping-profile）
- [ ] 记忆抽取完整：project_memory 8 条 SSO 规则 + 6 条教训全部落册，无遗漏
- [ ] README 索引 + project_memory 入口指针已更新
- [ ] 两仓库分别提交（strapi、nshop）

## 7. 风险

- 两仓文档同步漂移：以互相引用 + 各自维护为准，不追求内容重复
- 概念/流程级不盘点行号：行号信息随代码演进易过期，定位用 rg 现查（符合既有手册规范）
- strapi 仓库无 domains 目录：新建 `docs/domains/` + 简版 README，不强制套用 nshop 全部规范
