# 京东首页移动端打磨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 nshop 京东首页移动端三处：顶栏品牌 logo 改红色 youShop 文字、default 渠道主题切京东红、移动端页脚不被底部 TabBar 遮挡。

**Architecture:** 三处相对独立：A 是替换静态 SVG；C 是给布局层 AppFooter 加移动端下边距；B 是经 Vendure admin-api 更新 default channel 的 `customFields.themeId`（纯数据，前端 `useChannelTheme` 已在 SSR 读取该字段，改后新请求即生效，无需改前端代码、无需重启 nshop）。A/C 改代码后需按部署铁律本地构建 + 上传 + pm2 restart。

**Tech Stack:** Nuxt 3 / Tailwind / SVG / Vendure GraphQL Admin API / PowerShell + curl.exe（SSH 别名 `qing`）

---

### Task A: logo-top.svg 改为红色 youShop 文字版

**Files:**
- Modify: `d:\zhao\nshop\public\logo-top.svg`（整体替换内容）

- [ ] **Step 1: 替换 SVG 内容**

将 `d:\zhao\nshop\public\logo-top.svg` 原内容整体替换为下面文字版（红色 youShop + 右上小字 JD，与 PC 京东头一致）：

```svg
<svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 42">
  <defs>
    <style>
      .t { font-family: Arial, "Microsoft Yahei", sans-serif; font-weight: 900; font-style: italic; }
      .r { fill: #E6162D; }
      .sup { font-family: Arial, sans-serif; font-weight: 700; fill: #4b5563; font-size: 13px; }
    </style>
  </defs>
  <title>youShop</title>
  <text class="t r" x="0" y="32" font-size="30">youShop</text>
  <text class="sup" x="130" y="18">JD</text>
</svg>
```

- [ ] **Step 2: 验证文件可读**

运行（PowerShell）：`Get-Content d:\zhao\nshop\public\logo-top.svg`
预期：.svg 内容就是上面文字版，无报错。

---

### Task B: default 渠道主题切为京东红

**Files:**
- Create: `d:\zhao\nshop\_tmp_update_theme.json`（临时，用后删）
- 认证用 `d:\zhao\nshop\_tmp_cj.txt` / `_tmp_payload_login.json`（已在探测阶段生成，登录 superadmin 已获取 session cookie）

- [ ] **Step 1: 写 updateChannel payload**

创建文件 `d:\zhao\nshop\_tmp_update_theme.json`：

```json
{"query":"mutation Update($input: UpdateChannelInput!){updateChannel(input:$input){id code customFields{themeId}}}","variables":{"input":{"id":"1","customFields":{"themeId":"jd-red"}}}}
```

- [ ] **Step 2: 执行 updateChannel**

运行（PowerShell，cwd=`d:\zhao\nshop`）：

```powershell
curl.exe -s -b _tmp_cj.txt -H "Content-Type: application/json" -d "@_tmp_update_theme.json" https://e.joho.cn/admin-api
```

预期返回：`{"data":{"updateChannel":{"id":"1","code":"__default_channel__","customFields":{"themeId":"jd-red"}}}}`
说明 default channel 主题已由 taobao-orange 改为 jd-red。

- [ ] **Step 3: 清理临时 payload**

删除 `d:\zhao\nshop\_tmp_update_theme.json`（保留 `_tmp_cj.txt` / `_tmp_payload_login.json` 供后续校验）。

---

### Task C: 移动端页脚露出

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\AppFooter.vue`

- [ ] **Step 1: 给 UFooter 加移动端底部留白**

在 `AppFooter.vue` 的 `<UFooter>` 根标签加 class，使移动端内容底部留出 52px（TabBar 高）+ iPhone 安全区，PC（`lg`）不受影响：

```vue
<UFooter class="pb-[calc(52px+env(safe-area-inset-bottom))] lg:pb-0">
```

即把现有 `AppFooter.vue` 中：

```vue
  <UFooter>
    <template #top>
```

改为：

```vue
  <UFooter class="pb-[calc(52px+env(safe-area-inset-bottom))] lg:pb-0">
    <template #top>
```

---

### Task D: 本地构建并部署验证

- [ ] **Step 1: 本地构建 + 部署**

运行（cwd=`d:\zhao\nshop`）：

```powershell
node scripts/deploy.mjs
```

预期：`pnpm build` 通过 → 上传 `.output/` 到 `qing:/opt/1panel/.../www.youshop.cn/index` → `pm2 restart nshop` → status `online`。（遵守部署铁律：绝不在服务器构建。）

- [ ] **Step 2: 提交代码**

运行：

```powershell
git -C d:\zhao\nshop add public/logo-top.svg layers/base/app/components/AppFooter.vue
git -C d:\zhao\nshop commit -m "feat(nshop): 京东移动端 logo 改红字 youShop + 页脚底部留白"
git -C d:\zhao\nshop push
```

（`_tmp_*.` 临时文件勿提交，已在 gitignore 或手工排除。）

- [ ] **Step 3: 线上移动端验证**

用 agent-browser 以移动视口打开 `https://www.youshop.cn`，截图验证：
1. 顶栏显示红色 youShop（非绿图标）。
2. 滚动到底，页脚（logo-full + 分类导航）完整可见，未被底部 TabBar 遮挡。
3. PC 视口（≥1024px）顶栏仍为京东红 youShop，无回归。

然后访问结算页确认主色为京东红（task B 生效，刷新即可）：`https://www.youshop.cn/checkout`。

- [ ] **Step 4: 清理临时文件**

删除 `d:\zhao\nshop\_tmp_cj.txt`、`d:\zhao\nshop\_tmp_payload_login.json`（如无保留价值）。