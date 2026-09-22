# SSO 自动登录等待区品牌化 + 提速（方案 3）设计

日期：2026-09-22
状态：已上线（2026-09-22 部署完成）
仓库：nshop（www.youshop.cn）

> **实施状态**：方案 3 已按 plans 实施并上线。
> 提交链：`1d5f551`（Task1 纯函数，TDD）→ `1735ae3`（Task2 useSso 预取）→ `13bf1a3`+`88c5da4`（Task3 自动登录改造+泛型修复）→ `b456c85`（Task4 遮罩组件）→ `3a6772b`（Task5 截图+手册）→ Task6 部署（`node scripts/deploy.mjs`，线上 curl 200，pm2 nshop online，遮罩样式已进 SSR HTML）。
> 未提交：本 spec/plans 两文档回填内容（是否提交由用户决定）。

## 1. 背景与问题

微信内置浏览器全站自动 SSO 登录（`useAutoWechatSsoLogin`，挂载于 `app/app.vue`）在**跳转到 h.joho.cn 星枢统一登录页之前**有一段等待：`onMounted` 内 `await fetchProviders()`（一次 GraphQL 网络请求拿到 zhao-sso 提供商配置）完成后才 `loginWithSso` 跳转。

痛点（上线后实测）：
- **白屏**：这段等待发生在 nshop 页面，而品牌化动效门面做在**星枢登录页**上，nshop 这段无任何反馈 → 用户看到长时间空白。
- **时间长**：`fetchProviders` 依赖 Vendure shop-api 网络往返（后端本身偏慢），首访无缓存时更明显。existing 的 localStorage 缓存只在**重复访问**生效，首次仍等网络。
- 结论：星枢门面截图验证过，但用户等待的时段根本不经过星枢页，故"动效没生效"。

## 2. 方案选型

- 方案 1：SSR 预取 provider → 跳转前不再等网络（提速）。
- 方案 2：nshop 品牌化等待遮罩 → 等待区一定有动效（兜底）。
- **方案 3（选定）**：1 + 2 组合。SSR 预取为主提速；残余间隙用品牌遮罩兜底，保证任意时刻有反馈且视觉与星枢一致。

## 3. 方案 3 设计

### 3.1 SSR 预取 provider（提速主路径）

- 在 `app/app.vue` setup 中并行预取提供商配置，与 `loadTheme()` 并发，不额外串行阻塞首帧。
- 复用 `useSso.fetchProviders()` 内部同一段查询与渠道过滤逻辑；把预取结果写入共享 state（`useState<SsoProviderInfo[]>("ssoProviders", ...)`），供 `useAutoWechatSsoLogin` 读取。
- `useAutoWechatSsoLogin.run()` 改为**优先读预取数据**：已就绪 → 立即跳转；未就绪（SSR 未拿到/客户端直入）→ 回退原 `await fetchProviders()`，此时由品牌遮罩承接。

> 边界：SSR 侧由客户端 `isWechatBrowser()`（依赖 userAgent）判定是否真的要跳。服务端只预取**数据**，是否跳转仍由客户端判断，避免 SSR 误跳。

### 3.2 品牌化等待遮罩（动效兜底）

- 新建轻量全屏遮罩组件（nshop 侧本地实现，文案/品牌令牌从既有 SSO 字典收敛，不依赖星枢仓库）。
- 触发条件：客户端 + 微信浏览器 + 未登录 + 非跳过页 + 已进入自动登录流程（跳转动作将 `pending` 置真）。
- 内容与星枢门面对齐：淡背景、logo + 品牌紫 spinner、标题「星枢统一关系中心」、广告语淡入轮播、状态文案「校验中…/正在跳转到统一登录页…」。
- `prefers-reduced-motion` 下降级为静态（不轮播）。
- 跳转成功（`loginWithSso` 发起）后遮罩可由页面卸载；若回跳到 `sso-callback` 兑换、再回来源页，这段留守星枢/回调页，由星枢门面与其既有转场处理。

### 3.3 组件归属

| 能力 | 归属 |
| --- | --- |
| provider 预取 + 共享 state | nshop `useSso.ts` / `app/app.vue` |
| 去除跳转前阻塞 | nshop `useAutoWechatSsoLogin.ts` |
| 品牌等待遮罩组件 | nshop 本地组件（`layers/base/app/components/`） |
| 星枢登录页门面（已有）| strapi-backend `sso-loading-facade`（本次不动） |

### 3.4 动效与文案字典

- 遮罩内固定文案（标题/状态/广告语）收敛为一个 nshop 侧小字典常量，与星枢 `dict.js` 取值保持一致（品牌紫 `#667eea`、文案同源）。
- 不做跨仓库运行时共享（避免脆耦合），以"同源文案常量复制"维持一致即可（YAGNI）。

### 3.5 测试与验收

- `nuxt test`（vitest）基线回归不劣化；新增对 provider 读取逻辑的纯函数单测（预取优先 / 回退网络）。
- 手机视口截图（390×844，dpr=2=780×1688，Playwright 移动视图）：
  1. 微信 UA + 未登录 → 品牌遮罩出现且含动效（可用路由 hold 截取 pending 态）。
  2. 预取命中 + 未登录 → 应立即跳星枢（遮罩几乎不闪/微闪）。
  3. 常规非微信首页 → 不回归（不误出遮罩）。
- 补充操作手册（SSO 登录章节）截图与说明。

### 3.6 部署

- 铁律：本地 `pnpm build` → `node scripts/deploy.mjs`（上传 `.output` → `pm2 restart nshop`），绝不在服务器构建。

## 4. 非目标

- 不重做星枢登录页门面（已上线）。
- 不做跨仓库运行时共享字典。
- 不改链路跳转白名单/回跳归属（沿用现状）。

## 5. 风险

- SSR 预取若后端慢，会略增首帧 TTFB（仅多一个并发请求，非串行）。由遮罩做残余等待兜底，可接受。
- 遮罩误触（非微信/已登录误盖）风险 → 严格限制触发条件并加单测/截图回归。