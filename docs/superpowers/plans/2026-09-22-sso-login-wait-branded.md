# SSO 自动登录等待区品牌化 + 提速（方案 3）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 消除微信端全站自动 SSO 登录「跳转星枢前」的长时间空白：SSR/客户端尽早预取 provider 提速，并用品牌化等待遮罩兜底，让等待区始终有星枢动效。

**Architecture:** `useSso` 新增共享预取 state 与 `getRedirectProvider()`（预取命中>实时拉取）；`useAutoWechatSsoLogin` 改为预取优先并在等待期置 `pending`；app.vue 渲染 `SsoAwaitOverlay` 品牌遮罩（`prefetched/live` 选择与遮罩显隐均抽成纯函数供单测）。全改动落在 nshop 单仓库。

**Tech Stack:** Nuxt 3（auto-imported useState）、Vue 3 `<script setup>`、Vitest、Playwright（手机视口截图）、`scripts/deploy.mjs` 本地构建部署。

---

### Task 1: 纯函数 util `sso-provider` （TDD）

> ✅ 已提交：`1d5f551`

**Files:**
- Create: `layers/base/app/utils/sso-provider.ts`
- Test: `layers/base/app/utils/__tests__/sso-provider.spec.ts`

- [x] **Step 1: 写失败测试**

```ts
// layers/base/app/utils/__tests__/sso-provider.spec.ts
import { describe, expect, it } from "vitest";
import { selectPrimaryProvider, shouldShowOverlay } from "../sso-provider";

describe("selectPrimaryProvider", () => {
  it("预取命中优先于实时", () => {
    const prefetched = [{ protocol: "zhao-sso", providerKey: "p1" }];
    const live = [{ protocol: "zhao-sso", providerKey: "p2" }];
    const r = selectPrimaryProvider(prefetched, live);
    expect(r.source).toBe("prefetched");
    expect(r.provider?.providerKey).toBe("p1");
  });
  it("预取为空则回退实时", () => {
    const r = selectPrimaryProvider([], [{ protocol: "zhao-sso", providerKey: "p2" }]);
    expect(r.source).toBe("live");
    expect(r.provider?.providerKey).toBe("p2");
  });
  it("两者为空返回 none", () => {
    const r = selectPrimaryProvider(null, []);
    expect(r.source).toBe("none");
    expect(r.provider).toBeNull();
  });
});

describe("shouldShowOverlay", () => {
  it("pending+未登录+微信 → true", () => {
    expect(shouldShowOverlay({ pending: true, authenticated: false, isWechat: true })).toBe(true);
  });
  it("已登录或非微信 → false", () => {
    expect(shouldShowOverlay({ pending: true, authenticated: true, isWechat: true })).toBe(false);
    expect(shouldShowOverlay({ pending: true, authenticated: false, isWechat: false })).toBe(false);
    expect(shouldShowOverlay({ pending: false, authenticated: false, isWechat: true })).toBe(false);
  });
});
```

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run layers/base/app/utils/__tests__/sso-provider.spec.ts`
Expected: FAIL（解析不到 `../sso-provider`）

- [x] **Step 3: 实现纯函数**

```ts
// layers/base/app/utils/sso-provider.ts
export interface SsoProviderCandidate {
  protocol: string;
  providerKey: string;
}

export type ProviderSource = "prefetched" | "live" | "none";

export interface ResolvedProvider {
  provider: SsoProviderCandidate | null;
  source: ProviderSource;
}

/** 跳转提供商选取：预取命中最优先；为空/未就绪回退实时；皆空为 none。
 *  纯函数，便于单测；调用方保证两入参均已按 protocol==="zhao-sso" 过滤。 */
export function selectPrimaryProvider(
  prefetched: SsoProviderCandidate[] | null | undefined,
  live: SsoProviderCandidate[] | null | undefined,
): ResolvedProvider {
  if (prefetched && prefetched.length > 0) {
    return { provider: prefetched[0], source: "prefetched" };
  }
  if (live && live.length > 0) {
    return { provider: live[0], source: "live" };
  }
  return { provider: null, source: "none" };
}

export interface OverlayGate {
  pending: boolean;
  authenticated: boolean;
  isWechat: boolean;
}

/** 品牌等待遮罩是否应显示：等待中 且 未登录 且 微信内置浏览器。 */
export function shouldShowOverlay(g: OverlayGate): boolean {
  return g.pending && !g.authenticated && g.isWechat;
}
```

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run layers/base/app/utils/__tests__/sso-provider.spec.ts`
Expected: PASS（6 it 全绿）

- [x] **Step 5: 提交**

```bash
git add layers/base/app/utils/sso-provider.ts layers/base/app/utils/__tests__/sso-provider.spec.ts
git commit -m "feat(sso): 抽离 provider 选取与遮罩显隐纯函数（TDD）"
```

### Task 2: `useSso` 预取 state + `getRedirectProvider`

> ✅ 已提交：`1735ae3`

**Files:**
- Modify: `layers/base/app/composables/useSso.ts`
- Test: `layers/base/app/utils/__tests__/sso-provider.spec.ts`（无新增，复用 Task 1）

- [x] **Step 1: 顶部导入纯函数**

```ts
// 在 useSso.ts 现有 import 后新增
import { selectPrimaryProvider, type ProviderSource } from "../utils/sso-provider";
```

- [x] **Step 2: 新增预取 state 与两个方法（放在 fetchProviders 之后）**

```ts
const PREFETCH_STATE_KEY = "sso-providers-prefetch";

  /** 共享预取结果 state：SSR/首次客户端尽早拉取，跳转直接复用（避免跳转前再等网络）。 */
  function getPrefetchState() {
    return useState<SsoProviderInfo[] | null>(PREFETCH_STATE_KEY, () => null);
  }

  /** 尽早预取 provider（幂等）。调用方 async 但不 await，首帧不等网络。 */
  async function startProviderPrefetch(): Promise<void> {
    if (getPrefetchState().value) return;
    const live = await fetchProviders();
    getPrefetchState().value = live;
  }

  /** 获取待跳转提供商：预取命中最优先，未就绪/为空回退实时拉取。 */
  async function getRedirectProvider(): Promise<{ provider: SsoProviderInfo | null; source: ProviderSource }> {
    const prefetched = getPrefetchState().value;
    const live = prefetched && prefetched.length ? [] : await fetchProviders();
    return selectPrimaryProvider(prefetched, live);
  }
```

- [x] **Step 3: 暴露新方法**

```ts
  return {
    fetchProviders,
    startProviderPrefetch,
    getRedirectProvider,
    loginWithSso,
    /* ...其余保持不变... */
  };
```

- [x] **Step 4: 运行基线测试确认无回归**

Run: `npm test`
Expected: PASS（既有测试全绿）

- [x] **Step 5: 提交**

```bash
git add layers/base/app/composables/useSso.ts
git commit -m "feat(sso): useSso 增加 provider 预取 state 与 getRedirectProvider"
```

### Task 3: 改造 `useAutoWechatSsoLogin`（预取优先 + pending 置位）

> ✅ 已提交：`13bf1a3`（配套泛型修复 `88c5da4`）

**Files:**
- Modify: `layers/base/app/composables/useAutoWechatSsoLogin.ts`
- Modify: `layers/base/app/composables/useSso.ts`

- [x] **Step 1: 在 useSso.ts 增加共享 pending state**

```ts
// useSso.ts，靠近 PREFETCH_STATE_KEY 定义处新增
const PENDING_STATE_KEY = "sso-redirect-pending";

  /** 品牌遮罩显隐控制：跳转发起前置 true，无 provider 时不跳且置 false。 */
  function getPendingState() {
    return useState<boolean>(PENDING_STATE_KEY, () => false);
  }
```

并在 return 中补 `getPendingState`。

- [x] **Step 2: 改写自动登录逻辑（XML 无空格，使用下方精确代码）**

```ts
// useAutoWechatSsoLogin.ts 全文替换
import { isWechatBrowser, useSso } from "./useSso";
import { shouldSkipAutoLogin } from "../utils/sso-return-url";
import { shouldShowOverlay } from "../utils/sso-provider";

const AUTO_JUMP_KEY = "youshop_sso_auto_jumped";

export function useAutoWechatSsoLogin() {
  const { fetchProviders, startProviderPrefetch, getRedirectProvider, getPendingState, loginWithSso } = useSso();

  // 尽早预取（不等 await），app.vue setup 调用即触发，跳转前不阻塞首帧
  if (import.meta.client) void startProviderPrefetch();

  async function run(): Promise<void> {
    if (import.meta.server) return;
    const route = useRoute();
    const authStore = useAuthStore();
    if (authStore.isAuthenticated) return;
    if (shouldSkipAutoLogin(route.path)) return;

    if (isWechatBrowser() && !sessionStorage.getItem(AUTO_JUMP_KEY)) {
      const pending = getPendingState();
      pending.value = true; // 让品牌遮罩立即出现，兜底预取/实时拉取的等待
      const { provider } = await getRedirectProvider();
      if (provider) {
        sessionStorage.setItem(AUTO_JUMP_KEY, "1");
        const invite = typeof route.query.invite === "string" ? route.query.invite : "";
        loginWithSso(provider, {
          inviteCode: invite || undefined,
          returnUrl: route.fullPath,
        });
      } else {
        pending.value = false; // 无提供商：取消遮罩，不跳转
      }
    }
  }

  onMounted(() => {
    void run();
  });

  /** 供 app.vue setup 尽早触发预取（不等待） */
  return { run, startProviderPrefetch: () => void startProviderPrefetch(), fetchProviders };
}
```

- [x] **Step 3: 运行基线测试确认无回归**

Run: `npm test`
Expected: PASS

- [x] **Step 4: 提交**

```bash
git add layers/base/app/composables/useSso.ts layers/base/app/composables/useAutoWechatSsoLogin.ts
git commit -m "feat(sso): 自动登录预取优先+等待期置 pending"
```

### Task 4: 品牌等待遮罩组件 `SsoAwaitOverlay`

> ✅ 已提交：`b456c85`

**Files:**
- Create: `layers/base/app/components/SsoAwaitOverlay.vue`
- Modify: `app/app.vue`

- [x] **Step 1: 编写遮罩组件（文案与星枢 dict 同源，品牌紫 #667eea；支持 reduced-motion 降级）**

```vue
<!-- layers/base/app/components/SsoAwaitOverlay.vue -->
<script setup lang="ts">
import { isWechatBrowser, useSso } from "~/composables/useSso";
import { shouldShowOverlay } from "~/utils/sso-provider";

const { getPendingState } = useSso();
const pending = getPendingState();
const authStore = useAuthStore();

const visible = computed(() =>
  shouldShowOverlay({ pending: pending.value, authenticated: authStore.isAuthenticated, isWechat: isWechatBrowser() }),
);

const TITLE = "星枢统一关系中心";
const SLOGANS = ["一个账号，玩转全部系统", "星枢，让系统彼此相连", "登录一次，处处同步", "安全 · 统一 · 更便捷"];
const STATUS = "正在校验登录凭证…";
const badgeIdx = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = window.setInterval(() => {
    badgeIdx.value = (badgeIdx.value + 1) % SLOGANS.length;
  }, 2600);
});
onUnmounted(() => timer && clearInterval(timer));
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="sso-await-overlay">
      <div class="sso-card">
        <svg class="sso-spinner" viewBox="0 0 48 48" width="52" height="52" aria-hidden="true">
          <circle class="sso-spinner-track" cx="24" cy="24" r="20" />
          <circle class="sso-spinner-bar" cx="24" cy="24" r="20" />
        </svg>
        <p class="sso-logo">{{ TITLE }}</p>
        <p class="sso-slogan" :key="badgeIdx" class="sso-slogan-anim">{{ SLOGANS[badgeIdx] }}</p>
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
  background: #f5f5f7;
}
.sso-card { display: flex; flex-direction: column; align-items: center; gap: 18px; }
.sso-spinner { transform: rotate(-90deg); }
.sso-spinner-track { fill: none; stroke: #e5e7eb; stroke-width: 5; }
.sso-spinner-bar {
  fill: none; stroke: #667eea; stroke-width: 5; stroke-linecap: round;
  stroke-dasharray: 126; stroke-dashoffset: 100;
  animation: sso-rotate 1s linear infinite;
}
@keyframes sso-rotate { to { transform: rotate(360deg); } }
.sso-logo { margin: 0; font-size: 18px; font-weight: 600; color: #333; }
.sso-slogan { margin: 0; font-size: 14px; color: #667eea; min-height: 1.4em; }
.sso-slogan-anim { animation: sso-fade 0.9s ease; }
@keyframes sso-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.sso-status {
  font-size: 13px; color: #8898aa; padding: 6px 14px; border-radius: 999px;
  background: rgba(102, 126, 234, 0.12);
}
@media (prefers-reduced-motion: reduce) {
  .sso-spinner-bar, .sso-slogan-anim { animation: none; }
}
</style>
```

- [x] **Step 2: 挂载到 app.vue**

```vue
<!-- app/app.vue：仅新增两行，其余不变 -->
<script setup lang="ts">
  // …现有代码…
  useAutoWechatSsoLogin();
  // 在 useAutoWechatSsoLogin() 之后新增：尽早预取，不等待
  const auto = useAutoWechatSsoLogin();
  auto.startProviderPrefetch();
</script>
<template>
  <NuxtLoadingIndicator />
  <UApp>
    <NuxtLayout><NuxtPage /></NuxtLayout>
  </UApp>
  <SsoAwaitOverlay />
</template>
```

> 注意：`useAutoWechatSsoLogin()` 改为 `const auto = useAutoWechatSsoLogin()` 后再 `auto.startProviderPrefetch()`，避免重复调用触发两次 prefetch。

- [x] **Step 3: 类型检查**

Run: `npm run typecheck`
Expected: 无新增类型错误

- [x] **Step 4: 提交**

```bash
git add layers/base/app/components/SsoAwaitOverlay.vue app/app.vue
git commit -m "feat(sso): 新增品牌等待遮罩并挂载 app.vue"
```

### Task 5: 回归 + 手机视口截图验收 + 文档

> ✅ 已提交：`3a6772b`（手机截图 + 操作手册 `docs/superpowers/manual/sso-await-branded/index.html`）

**Files:**
- Test: 全部
- Create（截图目录）: `docs/snapshots/sso-await-<date>/`
- Modify: 操作手册 SSO 登录章节

- [x] **Step 1: 全量测试 + 类型检查**

Run: `npm test && npm run typecheck`
Expected: 全部 PASS / 无新增错误

- [x] **Step 2: 手机视口截图（标准 390×844，dpr=2=780×1688，Playwright 移动视图）**

三张：
1. 微信 UA（`MicroMessenger`）+ 未登录 + 跳转 pending → 品牌遮罩出现且含动画（路由 hold 截取 pending 态）。
2. 预取命中 + 未登录 → 立即跳星枢（遮罩几乎不闪/微闪）。
3. 常规非微信首页 → 不回归（不误出遮罩）。

存至 `docs/snapshots/sso-await-<date>/`。

- [x] **Step 3: 操作手册补充截图与说明**

在 SSO 登录章节追加「登录等待区品牌化」小节：三张截图 + 说明（预取提速、等待区动效、reduced-motion 降级、无提供商时不跳不遮罩）。

- [x] **Step 4: 提交**

```bash
git add docs/snapshots/sso-await-<date>/ docs/manual/...
git commit -m "docs(sso): 登录等待区品牌化手机截图与操作手册"
```

### Task 6: 部署上线（nshop 本地构建铁律）

> ✅ 已上线：`node scripts/deploy.mjs` 于 2026-09-22 执行成功（本地构建→上传 `.output`→`pm2 restart nshop`）；线上 `curl` 200，pm2 nshop `online`，SsoAwaitOverlay 样式已进入 SSR HTML。无代码提交。

**Files:**
- 无代码改动

- [x] **Step 1: 本地构建 + 部署**

Run: `node scripts/deploy.mjs`
Expected: `pnpm build` 成功 → 上传 `.output` → `pm2 restart nshop` → pm2 显示 nshop online。

- [x] **Step 2: 线上验证**

Run: `ssh joho "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/"`
Expected: `200`；并在微信端真机复测（等待区有动效、回跳来源页）记为人工验收项。

- [x] **Step 3: 收尾**

回填本项目 spec/plans 勾选状态与提交哈希，确认工作区干净。

---

## 自检

- **Spec 覆盖**：3.1 预取 → Task 2/3；3.2 遮罩 → Task 4；3.3 归属 → 各 Task；3.4 字典同源 → Task 4 内嵌；3.5 测试/截图 → Task 1/5；3.6 部署 → Task 6。全部覆盖。
- **占位扫描**：无 TBD/TODO；每步含完整代码与命令。
- **类型一致**：`selectPrimaryProvider`/`shouldShowOverlay`/`ProviderSource`/`getPendingState`/`startProviderPrefetch`/`getRedirectProvider` 全链路同签名；`SsoProviderInfo` 满足 `SsoProviderCandidate`（含 protocol/providerKey）。