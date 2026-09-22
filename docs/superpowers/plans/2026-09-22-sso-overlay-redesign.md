# SSO 等待遮罩动效焕新 + 排版上移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将 `SsoAwaitOverlay.vue` 从「小圆环 spinner」焕新为「放大星轨卫星环 + 上移居中排版」，标题精简为「星枢关系中心」、状态文案改为「星枢正在为您护航…」，保留 4 条广告语轮播与 reduced-motion 降级。

**Architecture:** 纯视觉改动单个组件 `layers/base/app/components/SsoAwaitOverlay.vue`（template + style），登录链路（useSso/useAutoWechatSsoLogin/shouldShowOverlay）完全不动。改完跑手机视口截图回归 3 张、更新操作手册、本地构建部署。

**Tech Stack:** Vue 3 `<script setup>`、CSS animation、Vitest、Playwright（手机视口截图）、`scripts/deploy.mjs` 本地构建部署。

---

### Task 1: 焕新 `SsoAwaitOverlay.vue`（星轨卫星环 + 上移排版 + 文案）

**Files:**
- Modify: `layers/base/app/components/SsoAwaitOverlay.vue`
- 回归（无新增单测，纯视觉）：`npm test`

- [x] **Step 1: 全量替换组件文件内容（含 script 文案与 template/style）**

将 `layers/base/app/components/SsoAwaitOverlay.vue` **整体替换**为以下内容（保留 import/visible/定时器逻辑，仅改文案、动画结构与样式）：

```vue
<!-- 品牌等待遮罩：微信端未登录等待 SSO 跳转期间的品牌化兜底层。动效=放大星轨卫星环；上移居中排版；
     标题「星枢关系中心」；状态「星枢正在为您护航…」；广告语 4 条轮播；reduced-motion 降级 -->
<script setup lang="ts">
import { isWechatBrowser, useSso } from "../composables/useSso";
import { shouldShowOverlay } from "../utils/sso-provider";

const { getPendingState } = useSso();
const pending = getPendingState();
const authStore = useAuthStore();

const visible = computed(() =>
  shouldShowOverlay({ pending: pending.value, authenticated: authStore.isAuthenticated, isWechat: isWechatBrowser() }),
);

const TITLE = "星枢关系中心";
const SLOGANS = ["一个账号，玩转全部系统", "星枢，让系统彼此相连", "登录一次，处处同步", "安全 · 统一 · 更便捷"];
const STATUS = "星枢正在为您护航…";
const badgeIdx = ref(0);
let timer: number | undefined;

onMounted(() => {
  timer = window.setInterval(() => {
    badgeIdx.value = (badgeIdx.value + 1) % SLOGANS.length;
  }, 2600);
});
onUnmounted(() => timer && window.clearInterval(timer));
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="sso-await-overlay">
      <div class="sso-card">
        <div class="sso-orb" aria-hidden="true">
          <div class="sso-orb-core"></div>
          <div class="sso-orb-ring"></div>
          <div class="sso-orb-sat"></div>
        </div>
        <p class="sso-logo">{{ TITLE }}</p>
        <p class="sso-slogan sso-slogan-anim" :key="badgeIdx">{{ SLOGANS[badgeIdx] }}</p>
        <span class="sso-status">{{ STATUS }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sso-await-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(170deg, #f9f7ff 0%, #f1ecfb 100%);
  padding-top: 8vh; /* 视觉重心上移但不顶死 */
}
.sso-card { display: flex; flex-direction: column; align-items: center; gap: 16px; }

/* 星轨卫星环（放大主视觉） */
.sso-orb { width: 104px; height: 104px; position: relative; flex: none; }
.sso-orb-core {
  position: absolute; inset: 8px; border-radius: 50%;
  background: radial-gradient(circle at 32% 30%, #a5b4fc, #667eea 70%);
  box-shadow: 0 0 26px rgba(102, 126, 234, 0.7);
}
.sso-orb-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px dashed rgba(102, 126, 234, 0.35);
}
.sso-orb-sat {
  position: absolute; top: -4px; left: 50%;
  width: 14px; height: 14px; border-radius: 50%; background: #fff;
  box-shadow: 0 0 12px #667eea;
  transform-origin: 7px 56px;
  animation: sso-orbit 1.6s linear infinite;
}
@keyframes sso-orbit { to { transform: rotate(360deg); } }

.sso-logo { margin: 0; font-size: 20px; font-weight: 600; color: #333; }
.sso-slogan { margin: 0; font-size: 14px; color: #667eea; min-height: 1.4em; }
.sso-slogan-anim { animation: sso-fade 0.9s ease; }
@keyframes sso-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.sso-status {
  font-size: 13px; color: #8898aa; padding: 6px 14px; border-radius: 999px;
  background: rgba(102, 126, 234, 0.12);
}
@media (prefers-reduced-motion: reduce) {
  .sso-orb-sat, .sso-slogan-anim { animation: none; }
}
</style>
```

- [x] **Step 2: 全量测试回归**

Run（在 d:\zhao\nshop，PowerShell）：`npm test`
Expected: PASS（全量 109 测试全绿；本 Task 无新增单测，仅确认无回归）

- [x] **Step 3: 提交**

```bash
git add layers/base/app/components/SsoAwaitOverlay.vue
git commit -m "feat(sso): 等待遮罩焕新（星轨卫星环+上移排版+星枢关系中心文案）"
```
> ✅ 提交：`baa19b6`「feat(sso): 等待遮罩焕新（星轨卫星环+上移排版+星枢关系中心文案）」；`npm test` 全量通过无回归。

### Task 2: 手机视口截图回归 3 张 + 操作手册

**Files:**
- 截图目录：`docs/superpowers/manual/sso-await-branded/shots/`（覆盖同名旧图）
- Modify: `docs/superpowers/manual/sso-await-branded/index.html`

- [x] **Step 1: 起本地服务并拍 3 张手机截图**

用 Playwright（标准 390×844，dpr=2=780×1688，hasTouch/isMobile，微信 UA）。参考上一轮相同方法：`npm run dev` 起服（`http://localhost:8080/`，devProxy 代理 `/shop-api` 到线上 Vendure）。

1. `shot-1-pending-branded-overlay.png` — 微信 UA + 未登录 + 用 `page.route` 拦截 ssoProviders graphql 请求并延迟 ~3s 保持 pending → 捕捉新星轨卫星环遮罩（含放大动效、标题「星枢关系中心」、状态「星枢正在为您护航…」）。
2. `shot-2-prefetch-jump-unified.png` — 预取命中 + 未登录 → 立即跳 h.joho.cn（回归，遮罩几乎不闪）。
3. `shot-3-normal-home-no-overlay.png` — 普通移动 UA 首页，断言 `.sso-await-overlay` count=0（回归）。

> 图片尺寸统一 780×1688。可用既有浏览器调试/Playwright 脚本复拍；不得造假图。

- [x] **Step 2: 更新 `docs/superpowers/manual/sso-await-branded/index.html`**

将标题说明更新为：放大星轨卫星环动效、上移居中排版、标题精简「星枢关系中心」、状态文案「星枢正在为您护航…」、4 条广告语轮播、reduced-motion 降级。替换 3 张新截图引用为该目录同名文件。说明登录链路（预取/跳转）未变。

- [x] **Step 3: 提交**

```bash
git add docs/superpowers/manual/sso-await-branded/
git commit -m "docs(sso): 等待遮罩焕新手机截图与手册"
```
> ✅ 提交：`cd019d4`「docs(sso): 等待遮罩焕新手机截图与手册」（含 3 张手机截图与手册更新）。

### Task 3: 部署上线 + 收尾

**Files:**
- 无代码改动

- [x] **Step 1: 本地构建 + 部署**

Run: `node scripts/deploy.mjs`
Expected: `pnpm build` 成功 → 上传 `.output` → `pm2 restart nshop` → nshop online。

- [x] **Step 2: 线上验证**

Run: `ssh joho "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/"`（Expected `200`）与 `ssh joho "pm2 list"`（nshop online）。curl 首页 HTML 含 `.sso-orb`/`.sso-await-overlay` 且无 500。微信真机复测（等待区新动效、回跳来源页）记为人工验收项。
> ✅ 线上验证：`curl localhost:3000` 返回 `200`；`pm2 list` nshop **online**（cluster，pid 2744883）；首页 HTML 含新标记 `sso-await-overlay`×2、`sso-orb`×9（新动画 CSS 已打包上线，无 500）。SSR 时 pending=false 故遮罩 DOM 不渲染，属预期。微信真机复测留待人工验收。

- [x] **Step 3: 收尾**

回填本 spec 与 plans 勾选状态与提交哈希；`git push origin nshop`；确认工作区干净。
> ✅ 部署完成：`node scripts/deploy.mjs` 全流程成功（build 成功→上传 `.output`→`pm2 restart nshop`→online）；提交哈希 `baa19b6`(Task1)/`cd019d4`(Task2)，`git push origin nshop` 推送本次方案 3 个提交。

---

## 自检

- **Spec 覆盖**：2.1 星轨卫星环 → Task1；2.2 上移居中 → Task1；2.3 标题/状态文案/广告语轮播 → Task1；2.4 品牌与 reduced-motion → Task1；3 交互降级逻辑不动 → Task1 仅视觉；5 验收 → Task2；6 部署 → Task3。全部覆盖。
- **占位扫描**：无 TBD/TODO；每步含完整组件代码与命令。
- **类型一致**：仅动 `SsoAwaitOverlay.vue` 的模板/样式与 `TITLE`/`STATUS` 常量；`shouldShowOverlay`/`getPendingState`/`useAuthStore`/`isWechatBrowser` 用法与原文件完全一致，无签名改动。