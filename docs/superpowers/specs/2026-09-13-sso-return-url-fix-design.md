# SSO 登录回跳拼接错误修复 + 微信环境全站静默登录 设计文档

- 日期：2026-09-13
- 状态：已批准（用户定稿：读时归一化 + app.vue 全站静默登录）
- 约束（用户原话要点）：**携带的参数不能少，对齐 SSO 登录方案，是修复方案不是重新规划，调整微信环境的登录方式为自动直接去 SSO 登录**；不破坏原有流程，只解决 SSO 登录成功后返回原登录页面的问题。
- 关联：`docs/domains/sso-login.md`（SSO 领域手册）、`docs/superpowers/specs/2026-09-11-wechat-share-invite-design.md`（邀请分享设计，本方案的上游）

## 1. 问题

1. **回跳地址拼接错误**：微信环境访问 `www.youshop.cn` 首页，SSO 自动登录成功后地址栏变为
   `https://www.youshop.cn/account/https://www.youshop.cn/`（页面 404，登录虽成功但落点坏）。
2. **详情页直达**：商品详情页转发好友后，好友登录成功应直达该详情页（目前无自动登录入口，仅剩引导条手动点击）。
3. **用户定稿的交互形态**：微信环境只要进入 `www.youshop.cn` 任意页面，就自动静默走 SSO 登录，登录成功后回到进入时的原页面。

## 2. 根因分析（逐行验证）

### 2.1 拼接错误根因

故障链：

1. 首页 `app/pages/index.vue:29` → 微信环境未登录触发 `useAutoWechatSsoLogin()`，其构造的回跳目标是**完整 URL**：`home = window.location.origin + localePath('/')` = `https://www.youshop.cn/`。
2. `layers/base/app/composables/useSso.ts loginWithSso()` 将该完整 URL 存入 sessionStorage（`youshop_sso_return_url`），携全量参数跳 `h.joho.cn` 统一登录页。
3. 登录成功 → 回跳 `/account/sso-callback` → token 直验成功 → `leave()` 执行 `router.replace(target)`，`target` 即完整 URL `https://www.youshop.cn/`。
4. **错误点**：Vue Router 5.0.4 `resolveRelativePath()`（`vue-router.cjs:275`）规定——不以 `/` 开头的 location 字符串按**相对路径**解析，基于当前路由 `/account/sso-callback` 的目录拼接：
   `"/account" + "/" + "https://www.youshop.cn/"` → `"/account/https://www.youshop.cn/"`。
   与线上现象逐字符吻合。

### 2.2 受影响范围（同一根因）

| 发起点 | 传入的 returnUrl | 现状 |
|---|---|---|
| 首页自动登录（`useAutoWechatSsoLogin`） | 完整 URL（origin + `/`） | **坏**（本次线上现象） |
| 登录页微信按钮（`login.vue:26`） | 完整 URL（origin + `/account`） | **坏**（同根因） |
| 详情页引导条（`WechatInviteLoginBar.vue:21`） | `route.fullPath`（相对路径） | 本来正确 |
| 直连微信授权（`loginWithWechat`，兼容路径） | `?return_url` query（可为完整 URL） | 潜在坏 |

结论：**收口在回跳读取处单点修复，一处覆盖全部链路**，无需改动任何调用方。

### 2.3 详情页直达缺失根因

`useAutoWechatSsoLogin()` 仅挂在首页（`app/pages/index.vue`），其他页面（含商品详情页）没有自动登录入口，未登录好友只能靠底部引导条手动点击。

## 3. 修复方案（已批准）

### 3.1 Fix A：回跳目标读时归一化（`layers/base/app/composables/useSso.ts`）

`readSsoReturnUrl()` 在同源校验通过后，将完整 URL 归一化为**路由安全路径**再返回：

```
https://www.youshop.cn/                    →  "/"
https://www.youshop.cn/?invite=ABC         →  "/?invite=ABC"
https://www.youshop.cn/t2/product/x?a=1    →  "/t2/product/x?a=1"
```

实现：`new URL(v, window.location.origin)`，取 `pathname + search + hash`。sessionStorage 与 `?return_url` query 两条来源同时覆盖；`router.replace` 永远收到以 `/` 开头的值。

**不动的部分**：同源校验逻辑、query 兜底顺序、跨域拒绝（返回 `""` 走 `/account` 缺省）、`loginWithSso`/`loginWithWechat` 写入侧、所有参数拼装（`app_code`/`return_url`/`channel_code`/`invite_code` 全量保留）。

### 3.2 Fix B：微信环境全站静默登录（3 处改动）

**B1. 泛化 `layers/base/app/composables/useAutoWechatSsoLogin.ts`**

- `returnUrl` 从「固定首页完整 URL」改为 `route.fullPath`（当前页完整路径，`?invite` 等查询参数天然保留；与引导条已验证正确的模式一致）。
- 新增路由跳过清单：`/account/login`（登录页有自己的微信自动跳转流程，避免双跳；注意 `login.vue` 配有 `alias: ["/login"]`，匹配时需同时覆盖别名与租户前缀，如 `/login`、`/t2/account/login`）、`/account/sso-callback`（回调流程中段）、`/account/register`（注册页用户有明确意图）。
- 触发条件保持不变：仅客户端 + 微信内置浏览器（UA `MicroMessenger`）+ 未登录 + 本会话未自动跳过（`AUTO_JUMP_KEY` 防循环）。
- 调用 `loginWithSso` 携全量参数：`app_code`、`return_url`（sso-callback 落点）、`channel_code`、`invite_code`（当前页 `?invite` 存在时透传）——**参数一个不少，完全对齐既有 SSO 统一页 token 直验方案**。

**B2. `app/app.vue` 挂载全局自动登录**

在根组件 setup 中调用 `useAutoWechatSsoLogin()`：站点任意页面进入时执行一次；SPA 内部导航不重复触发（符合「进入即登录」语义）；composable 位于 `layers/base/app/composables`，auto-import 对根 `app.vue` 生效（app.vue 现已使用 `useTenantChannel` 等同层 composable）。

**B3. `app/pages/index.vue` 移除原调用**

首页的 `useAutoWechatSsoLogin()` 被全局挂载取代，删除避免并发双跳（两个 onMounted 异步竞态可能重复 fetchProviders）。

**保持不动的部分（修复而非重新规划）**：

| 组件/文件 | 保持原因 |
|---|---|
| `pages/account/login.vue` | 自有微信登录流程（onMounted 自动跳 + 手动按钮），returnUrl 为完整 URL，Fix A 归一化后自然正确 |
| `components/WechatInviteLoginBar.vue` | 手动兜底：自动跳已消耗（如同会话曾失败）或未触发时仍可用；其 returnUrl 本就是相对路径 |
| `components/WechatShare.vue` | 分享链路上游，与本次修复无关 |
| `loginWithWechat` 直连授权兼容路径 | code 兑令牌兼容流程保留，`?return_url` query 读取同样被 Fix A 覆盖 |
| 统一登录页 / SSO 服务端 / Vendure 侧 | 完全不动 |

### 3.3 行为矩阵（修复后）

| 场景 | 修复前 | 修复后 |
|---|---|---|
| 微信进首页（未登录） | 自动登录 → 回跳 `/account/https://...` 404 | 自动登录 → 回跳 `/` |
| 微信进商品详情页（分享链接带 invite） | 无自动登录，仅引导条手动点 | 自动登录 → 回跳原详情页（含 `?invite`），好友直达 |
| 微信进任意其他页（未登录） | 无自动登录 | 自动登录 → 回跳原页 |
| 登录页点「微信登录」按钮 | 回跳坏（同根因） | 回跳 `/account` 正确 |
| 非微信浏览器 | 无自动登录 | 无变化（零影响） |
| 退出登录后继续浏览 | 不强制重登 | 不变（`AUTO_JUMP_KEY` 本会话不清除，尊重显式登出） |
| 渠道未配置 SSO 提供商 | 不跳 | 不变（`fetchProviders` 为空即不跳） |
| 登录失败/授权取消 | 停留，不无限重试 | 不变（一次会话只自动跳一次） |

## 4. 边界与安全

- **开放重定向**：回跳目标读取侧同源校验保留（sessionStorage 值与 query 值都校验 origin），跨域一律拒绝走 `/account` 缺省。
- **防循环**：`AUTO_JUMP_KEY`（sessionStorage）一次会话只自动跳一次；回调页/登录页流程不清除该标记（既有语义）。
- **多租户**：composable 按当前渠道 `ssoProviders` 取提供商，渠道未配置即不跳；e.joho.cn 等租户与原首页行为一致地各自生效。
- **SPA 导航**：app.vue setup 只在整页加载时运行一次，SPA 内部导航不重复触发自动跳转。
- **SSR**：`run()` 首行 `import.meta.server` 早退，服务端零副作用。

## 5. 测试与交付（对齐用户测试硬性规范）

1. **单测（vitest）**：归一化逻辑——完整 URL / 带 query / 带 hash / 租户前缀路径 / 相对路径原样 / 跨域拒绝返回空。
2. **Playwright 手机视口回归（390×844，dpr=2）**：
   - 微信 UA（MicroMessenger）+ 未登录 cookie 清空 → 打开商品详情页（带 `?invite`）→ 断言自动跳转 `h.joho.cn` 统一页且 URL 含 `app_code`/`return_url`/`channel_code`/`invite_code` 全量参数 → 统一页密码登录 → 回跳 sso-callback → 断言最终落点为原详情页（路径 + query 完整），地址栏无 `account/https://` 拼接；
   - 微信 UA 打开首页 → 回跳 `/`；
   - 普通浏览器 UA 打开首页/详情页 → 无跳转。
   - 全程手机视口截图。
3. **操作手册**：补充「微信环境全站静默登录」章节（触发条件、防循环、排查指引、截图）到既有 SSO 手册体系，并同步 `docs/domains/sso-login.md` 的链路描述（首页自动登录 → 全站自动登录）。
4. **部署**：nshop 走 `scripts/deploy.mjs` 本地构建上传（部署铁律：本地构建，服务器只解压）。

## 6. 涉及文件清单

| 文件 | 改动 |
|---|---|
| `layers/base/app/composables/useSso.ts` | `readSsoReturnUrl()` 读时归一化（Fix A） |
| `layers/base/app/composables/useAutoWechatSsoLogin.ts` | returnUrl 改 `route.fullPath` + 路由跳过清单（Fix B1） |
| `app/app.vue` | 挂载 `useAutoWechatSsoLogin()`（Fix B2） |
| `app/pages/index.vue` | 移除原调用（Fix B3） |
| `docs/domains/sso-login.md` | 链路描述同步（实现阶段） |
| 操作手册（SSO 手册 html） | 补充章节 + 手机截图（实现阶段） |
