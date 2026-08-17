# nshop · 阶段 0 基建 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `d:\zhao\nshop` 落地 nuxtless fork，跑通京东红主题的核心商城骨架，打通主渠道认证与本地 build + pm2 部署链路。

**Architecture:** 保留 nuxtless 的 `layers/base` + `app/` 分层；新增自定义 layer `layers/shop` 骨架。认证走 bearer（后端 `tokenMethod` 包含 bearer，不破坏 vshop 的 cookie）；复用主渠道 channel-token。部署照搬铁律：本地 `nuxt build`（Nitro `node-server`）→ 产物上传服务器目录 → `pm2`。

**Tech Stack:** Nuxt 4 / Nuxt UI v4 / Tailwind v4 / Pinia / Valibot / nuxt-graphql-client / @nuxtjs/i18n / VueUse / pnpm 11 / Node 22

---

## 前置约定（运行时取值，非 TBD）

- **fork 地址**：使用用户提供的 fork git 地址克隆到 `nshop`；若未提供，回退上游 `https://github.com/grandant/nuxtless.git`（先问用户，勿猜测）。
- **主渠道 channel-token**：从 Vendure Admin（Channels → 主渠道 → token）或已部署的 `vshop` 配置中读取同一主渠道 token。
- **服务器目录 / pm2 进程名**：沿用现有铁律的服务器（如 `qing`）与约定目录，具体路径以环境 `.env` 与部署脚本变量为准。

---

## 文件结构（本次计划创建/修改）

```
d:\zhao\nshop\                             # 克隆自 nuxtless fork
├── .env                                   # 由 .env.example 派生（git 忽略）
├── app/
│   ├── assets/css/main.css                # Tailwind v4 + 京东红变量
│   └── nuxt.config.ts                     # 主题扩展（若 base 支持扩展点）
├── layers/shop/                           # 新增 layer 骨架
│   ├── nuxt.config.ts
│   ├── components/  composables/  gql/  stores/  validators/  (占位)
│   └── pages/                             # 营销/会员/分销入口占位
└── scripts/
    └── deploy.mjs                         # 部署脚本（本地 build + 上传 + pm2）
```

---

## Task 1: 克隆 nuxtless → nshop 并本地跑通

**Files:**
- Create: `d:\zhao\nshop\`（克隆产出）

- [ ] **Step 1: 克隆仓库**

```bash
git clone <你的fork地址> d:\zhao\nshop
```

若 fork 地址未定，先向用户索取；未提供则确认是否用上游 `https://github.com/grandant/nuxtless.git`。克隆后进入目录。

- [ ] **Step 2: 安装依赖**

```bash
cd d:\zhao\nshop && pnpm install
```
Expected: 依赖安装无 error；存在 `pnpm-lock.yaml`。

- [ ] **Step 3: 派生 .env**

```bash
copy .env.example .env
```
在 `.env` 中先只改：`GQL_HOST`、`NUXT_PUBLIC_SITE_NAME`、`NUXT_PUBLIC_I18N_BASE_URL`，其余沿用示例。具体取值在 Task 2 补全。

- [ ] **Step 4: 本地 dev 冒烟**

```bash
pnpm dev
```
Expected: 无 `Cannot find module` / 端口冲突，浏览器可访问默认首页（未登录也可渲染列表页骨架）。

- [ ] **Step 5: 提交**

```bash
git add .env.example
git commit -m "chore: init nshop from nuxtless fork"
```

> 说明：`.env` 不入库（沿用项目 .gitignore）；此提交仅记录基座来源。

## Task 2: 主渠道连接配置

**Files:**
- Modify: `d:\zhao\nshop\.env`

- [ ] **Step 1: 读取主渠道 token**

从 Vendure Admin（Channels → 目标主渠道 → token）复制该渠道 token 字符串，记为 `$CHANNEL_TOKEN`。校验：该渠道与 vshop（e.joho.cn 主渠道）一致。

- [ ] **Step 2: 写入 .env**

```dotenv
GQL_HOST=<主渠道 shop-api 地址>        # 生产走 https://e.joho.cn/shop-api，本地按需
NUXT_PUBLIC_CHANNEL_TOKEN=$CHANNEL_TOKEN
NUXT_IMAGE_PROVIDER=ipx
PORT=8080
NUXT_PUBLIC_I18N_BASE_URL=<站点域名>
NUXT_PUBLIC_SITE_NAME=<站点名>
```

- [ ] **Step 3: 验证连接**

```bash
curl -s -X POST "$GQL_HOST" -H 'Content-Type: application/json' \
  -H "vendure-channel-token: $CHANNEL_TOKEN" \
  -d '{"query":"{ activeOrder { id } }"}'
```
Expected: 返回 GraphQL 200（`data.activeOrder` 为 `null`，未登录属正常），而非 `"Unauthorized"` 或 `"No channel found"`。

- [ ] **Step 4: 提交**

```bash
git add .env.example
git commit -m "docs: document channel env vars in example"
```

## Task 3: 前端会话/认证适配（bearer + 首期手机号登录）

**Files:**
- Modify: `d:\zhao\nshop\.nuxtrc`/`nuxt.config.ts`（按仓库实际承载认证的位置，找到 `layers/base` 的认证 composable/plugin）
- Modify: Vendure 在线 server 配置（见下方 Step 1 定位）

- [ ] **Step 1: 确认后端 tokenMethod 含 bearer**

定位线上 Vendure 实际运行的 server 配置（先在本地 `d:\zhao\vendure\packages\dev-server\dev-config.ts`，再确认线上部署目录使用的是同一配置或某 vendure-config）。检查：
```ts
authOptions: { tokenMethod: ['bearer', 'cookie'] }
```
若线上配置不含 `bearer`，在其 `authOptions.tokenMethod` 改为 `['bearer', 'cookie']`（**保留 cookie，勿动 vshop**），本地 `pnpm build && pm2 restart`（或按该仓库构建流程）。用 vshop 登录一次确认 cookie 认证不回归。

- [ ] **Step 2: 启用 bearer 会话 composable**

找到 nuxtless 的会话 composable（搜索 `Authorization`/`Bearer`/`setSessionToken`），确认登录成功后以 `Authorization: Bearer <token>` 附带于后续 Shop API 请求头；channel-token 以 `vendure-channel-token` header 透传。

- [ ] **Step 3: 接通手机号登录（首期）**

在 base 登录页，将登录动作接到后端手机号登录（对齐 vshop 的 phone 登录实现）。先以「登录接口调用成功且 activeOrder 贯通」为最小目标。

- [ ] **Step 4: 验证**

```bash
pnpm dev
# 浏览器操作：注册/登录手机号 → 加购物车 → 刷新，确认会话保持、购物车数量不丢
```
Expected: 登录后 bearer 生效；刷新不掉登录态。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat(auth): bearer session + phone login for phase0"
```

## Task 4: 京东红 + D 定制色主题

**Files:**
- Modify: `d:\zhao\nshop\app\assets\css\main.css`
- Modify: `d:\zhao\nshop\app\nuxt.config.ts`

- [ ] **Step 1: 定义主题变量**

在 `app/assets/css/main.css` 顶部定义（Tailwind v4 CSS-first 主题），京东红为主、D 定制色为辅、一处可切：
```css
@import "tailwindcss";

@theme {
  --color-brand: #E1251B;      /* 京东红 —— 主色，改这里即可全局换色 */
  --color-brand-deep: #b01118;
  --color-brand-soft: #fff1f0;
  --color-accent: #ff6a3d;     /* D 定制辅助色，可按品牌替换 */
}
```
若 Nuxt UI v4 主题需在 `nuxt.config.ts` 的 `ui` 配置声明 `primary`，一并映射到 `brand`。

- [ ] **Step 2: 应用到 header/主按钮**

确认 base 的顶栏与主按钮引用 `--color-brand`（或在 base 主题 token 指向该色）。至少首页标题、购物车徽标高亮、主购买按钮使用京东红。

- [ ] **Step 3: 验证**

```bash
pnpm dev
```
Expected: 首页/列表/详情/购物车/结算骨架中主视觉呈现京东红，非默认蓝紫。

- [ ] **Step 4: 提交**

```bash
git add app/ && git commit -m "style(theme): jd-red primary + accent, switchable via @theme"
```

## Task 5: 类型化 GraphQL + SEO/i18n 基座

**Files:**
- Modify: `d:\zhao\nshop\.graphqlrc.yml`（若已指向 shop-api 则无需改）
- Modify: `d:\zhao\nshop\app\nuxt.config.ts`

- [ ] **Step 1: 确认 typed graphql 指向主渠道**

确认 `.graphqlrc.yml` / `nuxt-graphql-client` 的 schema 源为主渠道 shop-api 的 introspection（`GQL_HOST` + `vendure-channel-token` header 可内省读取）。运行代码生成：
```bash
pnpm nuxt prepare
```
Expected: 生成 `graphql.ts`/类型文件无红错；在任一页面引用一个已存在类型编译通过。

- [ ] **Step 2: i18n 默认中文**

确认 `@nuxtjs/i18n` 默认 locale 为 `zh-CN`，`NUXT_PUBLIC_I18N_BASE_URL` 生效于 SEO hreflang/OG 标签。

- [ ] **Step 3: SEO 冒烟**

```bash
pnpm dev && curl -s http://localhost:8080/ | FindStr /C:"<title>"
```
Expected: 输出页面 `<title>`（证明 SSR + head 正常渲染）。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "chore(base): typed graphql + i18n/seo ready"
```

## Task 6: 本地 build + 部署脚本 + pm2

**Files:**
- Create: `d:\zhao\nshop\scripts\deploy.mjs`
- Modify: `d:\zhao\nshop\package.json`（build script 确认 `node-server` 预设）

- [ ] **Step 1: 确认 Nitro preset**

确认 `nuxt.config.ts` 使用 Nitro `node-server`（默认 node-server），非 `cloudflare`。若非默认，在 `nuxt.config.ts`：
```ts
nitro: { preset: 'node-server' }
```

- [ ] **Step 2: 本地构建**

```bash
pnpm build
```
Expected: 生成 `.output/server/index.mjs` 与 `.output/public/`。

- [ ] **Step 3: 编写部署脚本 `scripts/deploy.mjs`**

```js
// 读取环境：SERVER_HOST / SERVER_USER / REMOTE_DIR / APP_NAME
// 流程：本地 pnpm build -> rsync/scp .output/ 到 REMOTE_DIR -> ssh "cd REMOTE_DIR && pm2 restart APP_NAME"
// 具体上传命令按 Windows 可用的方式（scp 或 iscp/ssh），变量从 .env/环境取，勿硬编码域名
```
脚本要点：上传 `.output/` 到服务器指定目录，然后 `pm2 restart <app>`，输出 pm2 状态。

- [ ] **Step 4: 服务器首启**

在服务器目标目录，以 `node server/index.mjs`（`.output` 内）用 `pm2 start`/`startOrRestart` 托管，`PM2_HOME` 与 `PORT` 按环境传入。参考现有 vshop/custom 服务启动方式保持一致。

- [ ] **Step 5: 验证**

```bash
node scripts/deploy.mjs
ssh <SERVER> "curl -s -o /dev/null -w '%{http_code}' http://localhost:<PORT>/"
```
Expected: 部署脚本成功、`pm2 list` 显示 online、curl 返回 `200`。

- [ ] **Step 6: 提交**

```bash
git add scripts/ package.json && git commit -m "chore(deploy): local build + upload + pm2 restart"
```

---

## 非目标（Phase 0 不处理）

营销/会员/配送方案/分销/评价/售后页面一律不在本计划实现；本计划只搭 `layers/shop` 骨架占位与其类型连接。

## 自检对照

- Spec §5.1 仓库落地 → Task 1
- Spec §5.2 认证适配（both + bearer + 手机号登录） → Task 3
- Spec §5.3 主题 → Task 4
- Spec §5.4 部署（铁律） → Task 6
- Spec §5.5 基座稳定（typed graphql/i18n/seo） → Task 2, Task 5
- 非目标均已排除。