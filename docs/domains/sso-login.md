# SSO 登录领域手册（C 端对接视角）

> 入口指针：`project_memory.md` SSO 规则速查卡 → 本手册。
> 覆盖：C 端 nshop（`layers/base/app`，www.youshop.cn / e.joho.cn）对接 SSO 登录链路 + Vendure `cjk-plugin` 侧服务端对接。
> 关联：`strapi/docs/domains/sso-login.md`（服务端视角：zhao-sso 插件 / 统一登录页 / 白名单配置）。两册互为镜像，SSO 服务端机制看服务端手册，C 端对接细节看本手册，交叉处互相引用不重复展开。
> 行号用 rg 现查，本手册只给目录/模块级定位。

## 1. 概念模型

### 登录链路（nshop → SSO 统一页 → 回跳 → token 直验换会话）

| 环节 | 说明 |
|---|---|
| 发起 | nshop 侧触发（`login.vue` / `WechatInviteLoginBar.vue` 微信一键登录引导条）→ 跳 `h.joho.cn/#/pages/sso/login` 统一登录页，URL 携带 `app_code`、`return_url`（**含 `#/`**）、`channel_code`、`invite_code` |
| 授权/登录 | 统一页内完成微信授权或密码登录；微信授权集中到 SSO，C 端不直接碰 code |
| 回跳 | SSO 多跳中转后回跳 C 端 sso-callback 页，只带 token（不暴露 code） |
| 换会话 | C 端 **token 直验**换取 Vendure 会话：`authenticate(sso: {providerKey, accessToken})` |

> 链路关键点：`return_url` 必须含 `#/`（统一页以 hash 路由解析回跳落点）；旧版授权码流 + 缺 `#/` 的 redirect_uri 是线上登录失败的常见根因（见 §4）。

### 顾客体系（同一套）

e.joho.cn 与 www.youshop.cn **共用同一 Vendure 实例、同一 `customer` 表、同一 SSO 服务器**——即同一套顾客体系，跨渠道登录必须查映射复用原 Customer，而非各渠道独立建档。

### 字段规则

| 字段/规则 | 说明 |
|---|---|
| `ssoId` | SSO 用户表（`sso_users`）自增主键的**字符串**形式（如 "42"）；C 端写入 `customer.customFields.ssoId`，**幂等**（空才写，不覆盖已有绑定） |
| 微信 openid 复用 | 查 `sso_third_party_bindings.provider_user_id` 定位同一人，多次登录不建新用户 |
| 登录优先级 | SSO 第一 → 三方 → 本地（微信环境自动登录优先走 SSO） |

### 邀请码闭环

| 环节 | 说明 |
|---|---|
| 邀请码来源 | Vendure `Customer.customFields.referralCode` = SSO `sso_invite_codes` 自有码（两仓铁律：本地 referralCode 与 SSO 码一致） |
| 登录时回写 | `/v1/user/me` 返回 `ownInviteCode`，本地**幂等写** referralCode |
| 分享透传 | 分享链接带 `invite_code` → SSO 侧透传 → 服务端 `buildReferralRelation` **幂等绑分销**（首次登录即绑定，重复访问不重绑） |

## 2. 文件地图（目录/模块级，行号用 rg 现查）

以下相对路径均相对 `nshop/layers/base/app/`。

### nshop C 端（SSO 登录链路）

| 文件 | 职责 | 关键符号 |
|---|---|---|
| `composables/useSso.ts` | **SSO 登录核心**：inviteCode 透传、回跳落点、换会话 | `loginWithSso()`（统一页跳转，账号/密码/非微信场景保留）；`loginWithWechat({inviteCode, returnUrl})`（直连微信授权）；`exchangeSsoAccessToken(providerKey, token)`；sessionStorage 记录 providerKey（`youshop_sso_provider`）；SSO_API_BASE 由 provider.baseUrl 动态推导不硬编码 |
| `pages/sso/sso-callback.vue` | 回跳参数分支处理 | 读 `?token` / `?code` / `?return_url`；无有效参数 → `router.replace(return_url \|\| '/account')`；兑换失败兜底跳登录页展示错误，**不静默卡死** |
| `composables/useAutoWechatSsoLogin.ts` | 微信环境自动登录 | `/MicroMessenger/i` UA 判断 |
| `pages/login.vue` | 登录页入口 | onMounted 检测回跳 token → 换会话 |
| `components/WechatInviteLoginBar.vue` | 微信一键登录引导条（发起点） | 带邀请码且未登录时弹起 |
| `components/share/WechatShare.vue` | 分享组件（分享/邀请入口） | 生成 `origin + useTenantLocalePath(当前页完整含 query) + &invite=<referralCode>` |
| `layers/base/i18n` | SSO 登录文案 | zh-CN / en-US 两语言同步 |

### Vendure 服务端（`d:\zhao\vendure\packages\cjk-plugin`）

| 模块 | 职责 | 关键符号 |
|---|---|---|
| SSO 对接 | 跨渠道建档、登录映射 | `customerService.findOneByUserId`（按 userId 查既有 Customer） |
| 邀请码 | 登录时绑定邀请码到本地顾客 | `InviteCodeService.bindIfPresent` |
| 分销 | 自动建立分销关系 | `DistributionService.apply` |

## 3. 设计决策（ADR 式）

| 决策 | 理由 |
|---|---|
| 统一页 token 直验换会话（vs 直连 code 兑令牌） | 微信授权集中到 SSO，C 端不直接碰 code；回跳只带 token 不暴露 code |
| 分享链接 `invite_code` 透传 + `buildReferralRelation` 幂等 | 首次登录即绑定分销关系，重复访问不重绑 |
| `ssoId` 幂等写入（空才写） | 不覆盖已有绑定，防多账号串号 |
| 跨渠道登录查映射复用原 Customer | 防 `customer.userId` 唯一约束冲突（e.joho.cn / www.youshop.cn 同顾客体系） |
| 邀请码/分销一律用 `Customer.id` 而非 `User.id` | 数值错位 bug 的教训（见 §5 第 2 条） |
| `return_url` 统一含 `#/` | 与统一登录页 hash 路由解析对齐，缺 `#/` 会导致回跳落点错误 |

## 4. 常见坑

| 现象 | 根因 | 解法 |
|---|---|---|
| 登录失败（旧版行为） | 线上未重新部署：服务器跑旧版授权码流 + `redirect_uri` 缺 `#/` | 重新构建部署新版 H5，确认 redirect_uri 含 `#/` |
| 测试账号混淆 | `e2e_full_80753`（ssoId=32，密码注册、**无 openid**）≠ 真实微信用户（ssoId=2） | 排查时先按 openid 是否存在 / 注册渠道区分测试号与真实号 |
| customFields 查询取不到值 | 生产库 `customer` 表 customFields 是**独立列**（`"customFieldsSsoid"` 等须**双引号**查询），非 JSONB `custom_fields` | SQL 用 `"customFieldsSsoid"`（双引号列名）查询；前端/schema 侧按独立列取 |
| 老用户数据过时 | 登录链路未同步 `up_users.sso_id / invite_code / nickname` | `ensureUpUser` 之外补同步这三字段 |

## 5. Bug 知识库（现象 → 根因 → 代码点 → 验证）

| 现象 | 根因 | 代码点 | 验证 |
|---|---|---|---|
| `the provided credentials are invalid` | SSO 跨渠道重复建档撞 `customer.userId` 唯一约束 | cjk-plugin 跨渠道建档 | 多渠道登录回归（e.joho.cn / www.youshop.cn 同账号各登一次） |
| 邀请码/自动分销落不到本地顾客 | 传入 `User.id` 而非 `Customer.id`（数值错位） | `InviteCodeService` / `DistributionService` | 邀请码回归：分享 → 新客登录 → 分销关系建立 |
| referralCode 对不上 | `/v1/user/me` 未返回 `ownInviteCode` | SSO 接口 | 接口返回校验（对比 SSO 自有码） |
| e.joho.cn 登录失败 | C 端 H5 未部署新版本（旧授权码流） | 部署 | 线上登录验证 |
| 老用户 up_users 数据过时 | 登录链路未同步字段 | SSO 登录链路 | 数据对比（sso_id / invite_code / nickname） |

## 6. 验证脚本/流程清单

| 脚本/流程 | 用途 | 运行 |
|---|---|---|
| `nshop/tmp/` SSO/邀请码 verify 脚本 | 登录、token 直验、invite_code 透传 | `node tmp/<script>.mjs`（以 tmp 目录实际脚本名为准） |
| 微信真机验证流程 | 分享链接 → 登录 → 回跳原分享页 → 绑定关系幂等 | 真机微信打开分享链接走完整链路，重复打开验证不重绑 |

## 7. 历史文档索引

**邀请分享/SSO 登录链路（本轮）**：
- `docs/superpowers/specs/2026-09-11-wechat-share-invite-design.md` — 微信转发 + 邀请码 + SSO 登录回跳设计（useSso / sso-callback / buildReferralRelation 命名来源）
- `docs/superpowers/plans/2026-09-12-wechat-share-invite.md` — 对应实现计划
- `docs/superpowers/manual/sso-home-auto-login/index.html` — SSO 首页自动登录手册

**SSO 服务端（邀请码相关，详见服务端手册）**：
- `d:\zhao\strapi\docs\sso-登录回传邀请码与来源页回跳-20260905.md`
- `d:\zhao\strapi\docs\sso-邀请码闭环与用户对齐-20260904.md`

**关联手册**：
- `strapi/docs/domains/sso-login.md` — SSO 服务端视角（zhao-sso 插件 / 统一登录页 / 白名单配置）
- `docs/domains/checkout.md` / `docs/domains/shipping-profile.md` — 结算/配送领域（登录后下单链路衔接）
