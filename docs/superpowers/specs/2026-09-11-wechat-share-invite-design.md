# 设计文档：nshop H5 微信转发 + 邀请码 + SSO 登录回跳

日期：2026-09-11
状态：待评审

## 1. 目标与非目标

### 目标
- 为 nshop H5（www.youshop.cn / e.joho.cn 等）增加「分享给微信好友 / 分享到朋友圈」能力。
- 分享链接携带**邀请码**，被邀请者通过链接注册/登录后，SSO 系统**自动绑定邀请分销关系**。
- 登录成功后**精确回跳原分享页**（如商品详情页 → 商品详情页）。

### 非目标（本轮不覆盖）
- 不做微信小程序的分享（仅 H5 网页）。
- 不改造 zhao-sso / h.joho.cn 统一登录页（不在工作区）。
- 不做邀请返佣金额规则本身（复用 zhao-sso 已有 `buildReferralRelation` 与 zhao-point 体系）。

## 2. 已确认决策录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 微信授权回跳的登录回调页落点 | **nshop 自带回调页**（新增 `/account/sso-callback`） |
| 2 | 新链路适用范围 | **所有微信登录统一改走直连微信授权** |
| 3 | 微信分享卡片 | **启用 JS-SDK 自定义卡片**（wx.config） |
| 4 | 分享/邀请入口页面 | **商品详情 + 首页 + 活动页** |
| 5 | 带邀请码、未登录的引导 | **主动弹「微信一键登录」引导条** |

## 3. 现状与复用基础（只读调研结论）

- 现有 SSO 会话链路：`useSso.loginWithSso()` 跳 h.joho.cn 统一页 → 回跳 `?token=` → `login.vue` onMounted 检测 → `exchangeSsoAccessToken(providerKey, token)` 调 Vendure `authenticate(sso:{providerKey,accessToken})` 换 Vendure 会话。**这段 `authenticate` 会话建立可完整复用**。
- 后端已原生支持直连（**零改动**）：
  - `oauth-controller.wechatRedirect` 接受 `app_code / redirect_uri / invite_code / channel_code / app_type / scope`，把 `invite_code` 编入 state 并 302 微信授权。
  - `wechatCallback` 回调后自动调 `sso-invite.buildReferralRelation` 建立分销关系（幂等），再回跳 `redirect_uri?code=&state=`。
  - `exchange-token` 前端代理：`POST {code, app_code, redirect_uri}` → 返回 `{accessToken, user(inviteCode), is_new}`。
  - `jssdk-signature`：`POST {url}` → 返回微信 JS-SDK 签名。
- 邀请码对齐：Vendure 本地 `Customer.customFields.referralCode` 已与 SSO 自有码一致（memory 铁律），分享链接用 `referralCode` 即可。

## 4. 系统流程（分享 → 邀请 → 登录 → 回跳）

```
A（已登录）在商品详情页点「分享」
  → WechatShare 组件生成链接：origin + useTenantLocalePath(当前页完整含query) + &invite=<referralCode>
  → 微信内：wx.config 后 updateAppMessageShareData/updateTimelineShareData 绑定标题/图/链接
  → 微信外：复制链接 / 复制「话术+链接」

B 收到链接打开 → 进入原分享页（商品详情/首页/活动），URL 带 ?invite=xxx
  → 页面「读取邀请码」onMounted：未登录则弹「微信一键登录」引导条（可关闭）
  → 点「微信登录」→ useSso.loginWithWechat({inviteCode, returnUrl: 当前完整URL})
      · sessionStorage 记录 providerKey（复用 youshop_sso_provider）
      · window.location = SSO/…/v1/auth/wechat?app_code=<clientId>&channel_code=…&invite_code=xxx
        &redirect_uri=<nshop回调页>?return_url=<原分享页URL>&…   （invite 编入 state）

微信授权 → SSO wechatCallback
  → 自动 buildReferralRelation（绑定分销，幂等）
  → 回跳 nshop 回调页：  <nshop回调页>?return_url=…&code=xxx&state=…

nshop 回调页 sso-callback
  → 读 ?code / ?return_url
  → POST SSO /v1/auth/exchange-token {code, app_code, redirect_uri=[回调页基础地址]}
      → 得 SSO accessToken + user.inviteCode
  → exchangeSsoAccessToken(providerKey, accessToken) → Vendure authenticate 建会话
  → router.replace(return_url || localePath('/account'))
```

> redirect_uri 白名单校验隔离了 query（`validateRedirectUri` 用 `split('?')[0]` 比对），所以 `redirect_uri` 可携带 `return_url` query 而仍能过白名单；`wechatCallback` 回跳用 `&` 拼接，兼容已含 query 的 redirect_uri。**全链路状态都在 URL，不依赖跨端 sessionStorage**。

## 5. 前端改动点（全部在 nshop layers/base，积木式组件）

### 5.1 `useSso.ts` 新增直连方法
```ts
loginWithWechat(opts: { inviteCode?: string; returnUrl?: string; redirectPath?: string }) {
  const params = new URLSearchParams({
    app_code: provider.clientId,
    redirect_uri: `${ssoCallbackOrigin()}${localePath(scbPath)}?return_url=${encodeURIComponent(returnUrl)}`,
    invite_code: opts?.inviteCode ?? "",
    app_type: isWechatUA() ? "official_account" : "open_platform",
    channel_code: provider.channelCode ?? "",
  });
  sessionStorage.setItem("youshop_sso_provider", provider.providerKey);
  window.location.href = `${SSO_API_BASE}/v1/auth/wechat?${params}`;
}
```
- 保留旧 `loginWithSso()`（账号/密码/非微信统一页）不变。
- `SSO_API_BASE` 由 `provider.baseUrl`（已动态从渠道 shop-api `ssoProviders` 读取）推导，不硬编码域名；`isWechatUA()` 用 `/MicroMessenger/i` 判断（复用 useAutoWechatSsoLogin 现有逻辑）。

### 5.2 新增 SSO 回调页 `pages/account/sso-callback.vue`
- `onMounted`：读 `route.query.code`、`route.query.return_url`。
- 不存在 `code` → `router.replace(return_url || '/account')`。
- 有 code → POST `exchange-token`（`app_code` 取 sessionStorage 存的应用 `clientId`，`redirect_uri` 传回调页自身基础地址），成功后 `exchangeSsoAccessToken` 建会话，再 `router.replace(return_url || '/account')`。
- 兜底：兑换失败跳 `/account/login?error=` 并展示错误，**不静默卡死**。

### 5.3 新增分享组件 `components/share/WechatShare.vue`（可复用，积木式）
Props：
- `title` / `description` / `imageUrl`(商品图或活动封面)
- `inviteCode`（登录后取 `referralCode`；未登录传空 → 落 pending）
- 可选 `showCount`（已邀人数，来自后端统计，本轮可留空隐藏）

能力：
- 生成 `shareUrl = origin + useTenantLocalePath(currentPath含query) + &invite=<referralCode>`。
- 复制链接 + 复制「邀请话术」两个按钮。
- 仅微信内：POST `jssdk-signature {url: location.href}` → `wx.config` → `wx.ready(() => updateAppMessageShareData + updateTimelineShareData，link=shareUrl)`。
- 暴露 `share()` 供页面/底部操作条调起浮层。

### 5.4 新增登录引导条组件 `components/share/WechatInviteLoginBar.vue`
- 条件：`route.query.invite` 存在 且 未登录。
- 展示「微信一键登录，领专属补贴并绑定推荐」，操作→调 `useSso.loginWithWechat({inviteCode: query.invite, returnUrl: route.fullPath})`；可关闭，关闭后本会话不再弹。

### 5.5 页面接入（积木式装配）
- `pages/product/[slug].vue`（渲染器 `ProductDetailBottomBar`/信息卡）：挂 `WechatShare`（底部操作条「分享」icon + 信息卡右上角）、`WechatInviteLoginBar`。
- `pages/index.vue`：挂 `WechatShare`（活动位/头部）与引导条。
- 活动页：同首页，props 传活动封面/标题。
- 分享的 `invite` 取值：登录读 `authStore.user.inviteCode`（来自 `Customer.customFields.referralCode`）；未登录先落 pending，登录后回填并刷新 `shareUrl`。

### 5.6 邀请码获取
- `useAuthStore.session.user` 增加 `inviteCode`。
- `gql/fragments/customer.gql` 的 `CustomerDetail` 追加 `customFields { referralCode }`（实现时用 codegen 校验字段名，若为独立列则用 `referralCode` 别名）。
- 登录返回值（SSO `user.inviteCode`）同步到 `customer.referralCode`（后端已保证一致，前端只读）。

## 6. 后端改动（极少）

- **零代码改动**：直连、分销绑定、token 兑换、JS-SDK 签名全部由 zhao-sso 现有能力承接。
- **两个配置项**（SSO 后台 `sso_apps` 白名单，非代码）：
  1. nshop 域名加为微信 **JS 安全域名**（公众号后台，用于 wx.config 签名域名校验）。
  2. nshop 回调页基础地址加入该应用的 `redirect_uris`：`https://<e.joho.cn或www.youshop.cn>/<租户前缀?>/account/sso-callback`（按当前租户前缀实际形态；`*` 通配可选）。

## 7. 安全与边界（硬约束）

- **开放重定向防护**：`return_url` 仅接受与当前 `window.location.origin` 同源，否则忽略回跳 `/account`。
- **自邀防刷**：`buildReferralRelation` 幂等 + 防自邀已由后端保证；前端不做重复绑定。
- **分销幂等**：用户只保留首次邀请关系（`invite_code_used` 判重），重复点链接不覆盖。
- **redirect_uri 校验**：回调页地址须在白名单（后端两边均剥离 query 比对）。
- **JS 按钮安全域名**：wx.config 由签名域名白名单控制，未入白名单时静默降级为「仅复制链接」引导，不报错。
- **图片/域名**：分享图/商品图用动态 origin（基于当前访问域名），不硬编码域名。
- **i18n**：分享浮层、引导条、按钮、话术文案全部走 i18n 字典（zh-CN / en-US 同步）。

## 8. 分阶段实施

1. **P0 会话链路**：新增 `sso-callback.vue` + `useSso.loginWithWechat` + 首页/登录页微信入口改直连 → 打通「直连 → 换token → 建会话 → 回跳」。可先不接邀请码验证登录。
2. **P1 邀请码**：`exchange-token` 返回 → `authenticate` → 会话；`customer.gql` 加 `referralCode`、`authStore` 加 `inviteCode`。
3. **P2 分享/入口**：`WechatShare.vue`（复制链接 + 浮层）+ `WechatInviteLoginBar` + 三页面接入。
4. **P3 分享卡片**：`jssdk-signature` + `wx.config` 接入（需公众号 JS 安全域名配置就绪）。
5. **P4 收尾**：i18n 双语、边界/异常、回归测试。

## 9. 验收标准（Testing / 交付）

- （**硬性**）用手机浏览视图（390×844，dpr=2）截图分享浮层、登录引导条、商品详情页。
- 端到端：携带 `?invite=` 的链接 → 未登录打开 → 微信一键登录 → 自动绑定分销关系（SSO 后台 `sso_referral_relations` 可查）→ 精确回跳商品详情页。
- 普通登录（无邀请码）仍可正常走直连微信登录并回跳 `/account`。
- 重复点击同邀请链接不重复建关系。
- `return_url` 非同源被回落 `/account`；JS-SDK 未入白名单时降级不报错。
- 分享链接 i18n 双语正常、复制功能可用。