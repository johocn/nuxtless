# 微信转发 + 邀请码 + SSO 登录回跳 实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 nshop H5 增加「分享给微信好友/朋友圈」能力，分享链接携带邀请码，被邀请者经微信直连授权登录后自动绑定分销关系并精确回跳原分享页。

**Architecture:** 复用 zhao-sso 既有的 `wechatRedirect`（invite_code 编入 state）、`wechatCallback`（自动 `buildReferralRelation` 建分销关系）、`exchange-token`（前端兑 token）与 `jssdk-signature`（微信分享卡片），后端**零代码改动**（仅需在 SSO 后台 `sso_apps.redirect_uris` 白名单与微信公众号 JS 安全域名加入 nshop 域名）。前端在 nshop `layers/base` 新增「直连微信登录 + nshop 自带回调页」，并把分享/登录引导做成通用组件接入首页与商品详情页。

**Tech Stack:** Nuxt 3（layers/base）、Vendure shop-api、zhao-sso（Strapi 插件）、vue-i18n、微信 JS-SDK、pnpm。

**前置说明（取自已批准设计文档 `docs/superpowers/specs/2026-09-11-wechat-share-invite-design.md`）：**
- 组件放 `components/` 根目录而非子目录 `share/`：Nuxt 3 默认按「目录名作前缀」命名自动注册组件，放 `components/share/WechatShare.vue` 会被注册为 `<ShareWechatShare>`，可读性差。放根目录则注册为 `<WechatShare>` / `<WechatInviteLoginBar>`，积木式语义不变。
- **活动页当前不存在路由**，本计划把分享/引导条做成通用组件并由首页 + 商品详情页接入；活动页建立后以相同方式（Task 7）接入，不凭空创建页面（YAGNI）。

**验收硬性要求：** 每次功能交付用手机浏览视图（390×844，dpr=2）截图分享浮层、登录引导条、商品详情页，并补充到操作手册。

**执行完成度（2026-09-12）：**
- ✅ Task 1–8 全部代码实现完成；`pnpm typecheck` 与 `pnpm build` 均通过（本地构建，产物 `.output/` 已产出，符合部署铁律）。
- ⚠️ 两处对计划的**必要修正/增强**（均已落地并验证）：
  1. **store 访问路径修正**：计划 Task7/8 用 `authStore.user?.inviteCode`，但 `useAuthStore` 只暴露 `session.user`（`user` 无顶层 getter）。实际实现统一改为 `authStore.session?.user?.inviteCode`，否则类型检查报 `Property 'user' does not exist`。
  2. **首页自动登录保留邀请码（增强）**：分享链接落到首页且未登录时，`useAutoWechatSsoLogin` 自动微信授权会把 `?invite` 丢失。已修复为自动登录也携带 `invite_code`，并把 `?invite` 保留在回跳首页 URL 上，确保分享链路不丢码。
- ✅ 顺手修复既有类型错误：`layers/base/app/utils/display-price.ts:74` `listCentsMap` 传参 `ListableVariant[]` 与参数类型不兼容（非本功能文件，但影响 `nuxt typecheck` 全绿）。
- ⏳ 待人工完成（外部配置/真机，本仓库外）：Task9 Step1 SSO `sso_apps.redirect_uris` 白名单 + 微信公众号 JS 安全域名（详见 Task9 Step1）；Task9 Step2 真机端到端；交付截图补充操作手册。

---

### Task 1: `useSso.ts` 新增直连微信登录与应用配置态

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\composables\useSso.ts`

- [ ] **Step 1: 新增微信 UA 检测与 SSO API 地址工具**

`useSso.ts` 中，在 `const UNIFIED_LOGIN_PATH = ...` 后新增：

```ts
const CALLBACK_PATH = "/account/sso-callback";

/** 微信内置浏览器 UA 检测（首个发起点：首页/登录页/引导条共用） */
export function isWechatBrowser(): boolean {
  if (typeof window === "undefined" || !navigator?.userAgent) return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

/** 同源判定，防止 return_url 开放重定向 */
function isSameHost(url: string): boolean {
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: 新增 `loginWithWechat`（直连微信授权）**

在 `loginWithSso` 之后新增方法（仍在返回的对象内导出，见 Step 7）：

```ts
/** 直连微信授权：跳过 h.joho.cn 统一页，直接把邀请码编入 SSO state。
 *  redirect_uri 指向 nshop 自带回调页并携带 ?return_url=<原分享页>；
 *  微信回调后 SSO 自动 buildReferralRelation 建分销关系，再回跳回调页。 */
function loginWithWechat(
  provider: SsoProviderInfo,
  opts?: { inviteCode?: string; returnUrl?: string; redirectPath?: string },
) {
  const callbackUrl = `${window.location.origin}${redirectUri(CALLBACK_PATH)}`;
  const fallback = opts?.returnUrl ?? redirectUri(opts?.redirectPath);
  const returnUrl = opts?.returnUrl && isSameHost(opts.returnUrl)
    ? opts.returnUrl
    : (isSameHost(fallback) ? fallback : redirectUri());
  const redirectUriWithReturn = `${callbackUrl}?return_url=${encodeURIComponent(returnUrl)}`;

  const params: Record<string, string> = {
    app_code: provider.clientId,
    redirect_uri: redirectUriWithReturn,
    invite_code: opts?.inviteCode ?? "",
    channel_code: provider.channelCode ?? "",
    app_type: isWechatBrowser() ? "official_account" : "open_platform",
  };

  sessionStorage.setItem("youshop_sso_provider", provider.providerKey);
  sessionStorage.setItem("youshop_sso_app_code", provider.clientId);
  sessionStorage.setItem("youshop_sso_redirect_uri", callbackUrl);

  window.location.href = `${provider.baseUrl}/v1/auth/wechat?${new URLSearchParams(params).toString()}`;
}
```

> 说明：`provider.baseUrl`（如 `https://h.joho.cn/api/zhao-sso`）从渠道 shop-api `ssoProviders` 动态读取，不硬编码域名；`redirectUri(path)` 是 `useSso` 已有的 `origin + useTenantLocalePath(path)`，回调页地址带租户前缀。SSO 白名单校验会剥离 query 比对基础地址，故 `?return_url=` 不破坏匹配。

- [ ] **Step 3: 新增 `exchangeSsoAuthCode`（调用 SSO exchange-token 兑令牌）**

在 `exchangeSsoAccessToken` 之后新增：

```ts
/** 用微信回调帮我们拿到的 authorization code 向 SSO 兑令牌（前端代理，不暴露 app_secret）。
 *  返回 SSO 原始响应 { accessToken, refreshToken, user:{ inviteCode }, is_new }。 */
async function exchangeSsoAuthCode(
  provider: SsoProviderInfo,
  code: string,
  redirectUriStr: string,
): Promise<{ accessToken?: string; user?: { inviteCode?: string } } | null> {
  try {
    const res = await fetch(`${provider.baseUrl}/v1/auth/exchange-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        app_code: provider.clientId,
        redirect_uri: redirectUriStr,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 新增 `ssoLoginWithCode`（兑令牌 + 建 Vendure 会话 + 落库邀请码）**

```ts
/** 完整登录收口：SSO 兑令牌 → Vendure authenticate 建会话 → 写用户（含邀请码）。
 *  回调页统一走这里，避免回调页重复实现。 */
async function ssoLoginWithCode(
  provider: SsoProviderInfo,
  code: string,
  redirectUriStr: string,
): Promise<SsoLoginResult | null> {
  const sso = await exchangeSsoAuthCode(provider, code, redirectUriStr);
  if (!sso?.accessToken) return null;
  const result = await exchangeSsoAccessToken(provider.providerKey, sso.accessToken);
  if (result?.id) {
    const authStore = useAuthStore();
    authStore.setUser({
      id: result.id,
      email: result.identifier ?? "",
      inviteCode: sso.user?.inviteCode || "",
    });
  }
  return result;
}
```

- [ ] **Step 5: 新增 JS-SDK 签名接口（供分享组件 wx.config）**

```ts
/** 向 SSO 申请微信 JS-SDK 签名（用于自定义分享卡片），返回 null 时调用方应静默降级 */
async function fetchJssdkSignature(url: string): Promise<{
  appId?: string; timestamp?: number; nonceStr?: string; signature?: string;
} | null> {
  try {
    const res = await fetch(`${providerBaseForJssdk()}/v1/auth/jssdk-signature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, appType: "official_account" }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

`providerBaseForJssdk` 从会话缓存的应用取 baseUrl，未取到则返回空字符串、上层跳过签名：

```ts
function providerBaseForJssdk(): string {
  return sessionStorage.getItem("youshop_sso_base_url") ?? "";
}
```

> `fetchJssdkSignature` 依赖 `youshop_sso_base_url`。为使分享组件独立于"是否发起过登录"，在 Step 2 的 `loginWithWechat` 中补存一行：`sessionStorage.setItem("youshop_sso_base_url", provider.baseUrl);`。若用户未登录直接浏览（无该缓存），分享组件会跳过 JS-SDK（仅保留复制链接引导），为可接受降级。

- [ ] **Step 6: 让 `ssoLoginWithCode` 能访问到 provider baseUrl 会话**

在 `loginWithWechat` 已存 `youshop_sso_base_url` 的前提下，`ssoLoginWithCode` 不需要额外改。确认 Step 2 已包含该行后合并到返回导出。

- [ ] **Step 7: 导出新增方法**

把 `loginWithWechat`、`ssoLoginWithCode`、`fetchJssdkSignature` 加入 `useSso` 返回值：

```ts
  return {
    fetchProviders,
    loginWithSso,
    loginWithWechat,
    exchangeSsoAccessToken,
    exchangeSsoAuthCode,
    ssoLoginWithCode,
    fetchJssdkSignature,
    hasPendingCallback,
    clearSsoState,
  };
```

- [ ] **Step 8: 类型校验**

Run: `pnpm typecheck`
Expected: PASS（无未定义方法/类型错误）。若 `provider.providerKey`/`clientId` 等已正确，应无报错。

- [ ] **Step 9: Commit**

```bash
git add layers/base/app/composables/useSso.ts
git commit -m "feat(sso): 直连微信授权 + 邀请码分发 + code 兑令牌 + JS-SDK 签名"
```

---

### Task 2: `useAuthStore` 支持邀请码字段

**Files:**
- Modify: `d:\zhao\nshop\layers\base\stores\useAuthStore.ts`

- [ ] **Step 1: user 类型与 setUser 增加 inviteCode**

把 `user` 结构扩展为可选 `inviteCode`：

```ts
      user?: {
        id: string;
        email: string;
        inviteCode?: string;
      };
```

并把 `setUser` 签名与实现改为支持该字段：

```ts
    function setUser(user: { id: string; email: string; inviteCode?: string }) {
      if (session.value?.token) {
        session.value = { ...session.value, user };
      }
    }
```

- [ ] **Step 2: Commit**

```bash
git add layers/base/stores/useAuthStore.ts
git commit -m "feat(auth): 会话用户结构增加邀请码字段"
```

---

### Task 3: 新增 nshop SSO 登录回调页

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\pages\account\sso-callback.vue`

- [ ] **Step 1: 创建回调页（处理 ?code + ?return_url）**

```vue
<script setup lang="ts">
// nshop 自带 SSO 微信授权回调页（作为 wechatRedirect 的 redirect_uri，内含 ?return_url）。
// 流程：读 SSO 回跳的 ?code → exchange-token 兑 SSO 令牌 → authenticate 建 Vendure 会话
//      → 同源校验后精确回跳原分享页（return_url），否则回 /account。
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const localePath = useTenantLocalePath();
const { fetchProviders, ssoLoginWithCode, clearSsoState } = useSso();

const codeEl = computed(() => (typeof route.query.code === "string" ? route.query.code : ""));
const returnUrl = computed<string>(() => {
  const raw = typeof route.query.return_url === "string" ? route.query.return_url : "";
  try {
    return new URL(raw, window.location.origin).origin === window.location.origin ? raw : "";
  } catch {
    return "";
  }
});
const target = computed(() => returnUrl.value || localePath("/account"));

async function run() {
  if (!codeEl.value) {
    router.replace(target.value);
    return;
  }
  const providerKey = sessionStorage.getItem("youshop_sso_provider");
  const redirectUriStr =
    sessionStorage.getItem("youshop_sso_redirect_uri") ||
    `${window.location.origin}${localePath("/account/sso-callback")}`;
  const providers = await fetchProviders();
  const provider = providers.find((p) => p.providerKey === providerKey) ?? providers[0];
  if (!provider) {
    router.replace(target.value);
    return;
  }
  try {
    const result = await ssoLoginWithCode(provider, codeEl.value, redirectUriStr);
    clearSsoState();
    if (result?.id) {
      toast.add({ title: t("messages.share.loginSuccess"), color: "success" });
    } else {
      toast.add({ title: t("messages.share.loginFail"), description: t("messages.share.callbackFail"), color: "error" });
    }
  } catch {
    clearSsoState();
    toast.add({ title: t("messages.share.loginFail"), color: "error" });
  }
  router.replace(target.value);
}

onMounted(() => { void run(); });
</script>

<template>
  <main class="container flex min-h-[60vh] items-center justify-center">
    <div class="text-center text-sm text-gray-500">
      <UIcon name="i-lucide-loader-2" class="mr-1 animate-spin text-primary" />
      {{ t("messages.share.callbackProcessing") }}
    </div>
  </main>
</template>
```

- [ ] **Step 2: 校验通过后提交（i18n 词条在 Task 6 补齐，先占位可回退中文）**

若 typecheck 对 `messages.share.*` 报缺失，先以任意中文文案临时补在 Task 6，统一词条。这里先提交代码：

```bash
git add layers/base/app/pages/account/sso-callback.vue
git commit -m "feat(sso): 新增微信授权登录回调页"
```

---

### Task 4: 首页微信自动登录改为直连

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\composables\useAutoWechatSsoLogin.ts`

- [ ] **Step 1: 改为直连微信授权**

现有逻辑是"跳统一页 + 处理 ?token 回跳"。改为：未登录 + 微信内置浏览器 + 未跳转过 → `loginWithWechat`（redirect_uri 已指向 sso-callback，回跳由回调页负责，首页只负责发起）。移除统一页 `?token` 处理：

```ts
import { isWechatBrowser, useSso } from "./useSso";

const AUTO_JUMP_KEY = "youshop_sso_auto_jumped";

/** 首页微信环境自动 SSO 登录（直连微信授权）。
 *  仅客户端、仅微信内置浏览器、未登录、且本会话未自动跳转过时，跳转 SSO 微信授权；
 *  授权回调落在 sso-callback 页，再由其回跳首页。 */
export function useAutoWechatSsoLogin() {
  const localePath = useTenantLocalePath();
  const { fetchProviders, loginWithWechat } = useSso();

  async function run(): Promise<void> {
    if (import.meta.server) return;
    const authStore = useAuthStore();
    if (authStore.isAuthenticated) return;

    // 未登录 + 微信内置浏览器 + 未自动跳转过 → 直连微信静默授权，回跳首页
    if (isWechatBrowser() && !sessionStorage.getItem(AUTO_JUMP_KEY)) {
      const providers = await fetchProviders();
      if (providers.length) {
        sessionStorage.setItem(AUTO_JUMP_KEY, "1");
        loginWithWechat(providers[0], { returnUrl: `${window.location.origin}${localePath("/")}` });
      }
    }
  }

  onMounted(() => {
    void run();
  });

  return { run };
}
```

- [ ] **Step 2: 类型校验**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/composables/useAutoWechatSsoLogin.ts
git commit -m "refactor(sso): 首页微信自动登录改直连授权"
```

---

### Task 5: 登录页支持微信直连登录

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\login.vue`

- [ ] **Step 1: 调整登录页逻辑——微信环境直连，保留密码表单**

改判断：不再无条件跳统一页；微信内置浏览器自动直连微信登录，非微信环境停留展示账号密码表单 + 「微信登录」按钮。

```ts
import { isWechatBrowser, useSso } from "../../composables/useSso";

const { hasPendingCallback, exchangeSsoAccessToken, clearSsoState, fetchProviders, loginWithWechat } = useSso();
const wechatLogging = ref(false);

async function wechatLogin() {
  if (wechatLogging.value) return;
  wechatLogging.value = true;
  const providers = await fetchProviders();
  if (providers.length) {
    sessionStorage.setItem("youshop_sso_auto_jumped", "1");
    loginWithWechat(providers[0], { returnUrl: `${window.location.origin}${localePath("/account")}` });
  } else {
    wechatLogging.value = false;
  }
}

onMounted(async () => {
  const token = route.query.token as string | undefined;
  // 兼容旧统一页回跳（?token）历史链接
  if (hasPendingCallback(token)) {
    const providerKey = sessionStorage.getItem("youshop_sso_provider");
    if (!providerKey) return;
    try {
      const result = await exchangeSsoAccessToken(providerKey, token as string);
      clearSsoState();
      sessionStorage.removeItem("youshop_sso_auto_jumped");
      await router.replace({ query: {} });
      if (result?.id) {
        authStore.setUser({ id: result.id, email: result.identifier || "" });
        toast.add({ title: t("messages.account.loginSuccess"), color: "success" });
        router.push(localePath("/account"));
      } else {
        toast.add({ title: t("messages.account.loginFail"), color: "error" });
      }
    } catch {
      clearSsoState();
      sessionStorage.removeItem("youshop_sso_auto_jumped");
      toast.add({ title: t("messages.account.loginFail"), color: "error" });
    }
    return;
  }

  // 微信内置浏览器且页面不打算停留表单 → 自动直连微信登录（保留下方手动按钮兜底）
  if (isWechatBrowser() && !wechatLogging.value) {
    void wechatLogin();
  }
});
```

- [ ] **Step 2: 模板增加「微信登录」按钮**

在 `<AccountLoginForm ... />` 之前插入分隔与按钮：

```vue
    <div class="mx-auto mt-2 flex w-full flex-col sm:w-xs md:w-sm">
      <div class="mb-3 flex items-center gap-3 text-xs text-gray-400">
        <span class="h-px flex-1 bg-gray-200" />
        <span>或</span>
        <span class="h-px flex-1 bg-gray-200" />
      </div>
      <UButton
        color="primary"
        variant="outline"
        size="lg"
        icon="i-lucide-message-circle"
        :loading="wechatLogging"
        @click="wechatLogin"
      >{{ t("messages.share.wechatLogin") }}</UButton>
    </div>
```

- [ ] **Step 3: 类型校验**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/pages/account/login.vue
git commit -m "feat(sso): 登录页支持微信直连登录"
```

---

### Task 6: i18n 双语词条（zh / en 同步）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts`

- [ ] **Step 1: 在 zh-CN.ts 的 `messages` 内新增 `share` 命名空间**

在 `nav` 同级（`messages` 对象内）追加：

```ts
    share: {
      title: '分享给好友 / 朋友圈',
      openingTip: '① 点右上角 ···　② 选「分享给朋友 / 分享到朋友圈」',
      inviteTip: '邀请链接已带上你的专属码，朋友注册下单后自动绑定',
      copyLink: '复制链接',
      copied: '已复制',
      copyTalk: '复制邀请话术',
      talkPrefix: '跟我一起逛，还有好物补贴，点进来看看 →',
      inviteCount: '已邀 {n} 人',
      wechatLogin: '微信一键登录',
      inviteBar: '微信一键登录，领专属补贴并绑定推荐',
      inviteBarClose: '暂不',
      loginSuccess: '登录成功',
      loginFail: '登录失败',
      callbackFail: '登录回调处理失败，请稍后重试',
      callbackProcessing: '正在完成登录并返回页面…',
    },
```

- [ ] **Step 2: 在 en-US.ts 的 `messages.share` 追加英文**

```ts
    share: {
      title: 'Share to Friends / Moments',
      openingTip: '① Tap ··· in the top right　② Choose "Share to Chat / Moments"',
      inviteTip: 'Your invite link includes your code — friends who sign up and order get linked to you',
      copyLink: 'Copy Link',
      copied: 'Copied',
      copyTalk: 'Copy Invite Message',
      talkPrefix: 'Come browse with me, there are awesome deals → ',
      inviteCount: '{n} invited',
      wechatLogin: 'Login with WeChat',
      inviteBar: 'Log in with WeChat to get exclusive perks & bind your inviter',
      inviteBarClose: 'Not now',
      loginSuccess: 'Signed in',
      loginFail: 'Sign-in failed',
      callbackFail: 'Login callback failed. Please try again.',
      callbackProcessing: 'Completing sign-in and redirecting…',
    },
```

- [ ] **Step 3: 校验字典合并无语法错误**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "feat(i18n): 微信分享与登录引导双语词条"
```

---

### Task 7: 分享组件 + 登录引导条

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\WechatShare.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\WechatInviteLoginBar.vue`

- [ ] **Step 1: 创建 `WechatShare.vue`（页内按钮 + 复制链接 + JS-SDK 分享卡片）**

```vue
<script setup lang="ts">
import { isWechatBrowser, useSso } from "../composables/useSso";

// 通用分享组件：页内悬浮/按钮 + 复制链接/话术 + 微信内 JS-SDK 自定义分享卡片（静默降级）。
// shareUrl 始终拼接 ?invite=<当前用户邀请码|页面已带邀请码>，保证转发带码。
const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    imageUrl?: string;
    inviteCode?: string;
  }>(),
  { title: "", description: "", imageUrl: "", inviteCode: "" },
);

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();
const { fetchJssdkSignature } = useSso();

const open = ref(false);
const copied = ref(false);
const copyLabel = computed(() => t(copied.value ? "messages.share.copied" : "messages.share.copyLink"));

// 邀请码优先级：显式 props（页面传入登录用户码）> 会话用户邀请码 > 当前 URL 已带 invite
const inviteCode = computed(
  () => props.inviteCode || authStore.user?.inviteCode || (route.query.invite as string) || "",
);

const shareUrl = computed(() => {
  const path = route.fullPath.split("?")[0];
  const q = new URLSearchParams(route.query as Record<string, string>);
  if (inviteCode.value) q.set("invite", inviteCode.value);
  const qs = q.toString();
  return `${window.location.origin}${path}${qs ? `?${qs}` : ""}`;
});

const shareData = computed(() => ({
  title: props.title || document.title,
  desc: props.description || t("messages.share.inviteTip"),
  link: shareUrl.value,
  imgUrl: props.imageUrl || "",
}));

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  } catch {
    // 剪贴板不可用时回退到选中提示
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  }
}

async function copyTalk() {
  const talk = `${t("messages.share.talkPrefix")} ${shareUrl.value}`;
  try {
    await navigator.clipboard.writeText(talk);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  } catch {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  }
}

function loadWechatSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).wx?.config) return resolve();
    const s = document.createElement("script");
    s.src = "//res.wx.qq.com/open/js/jweixin-1.6.0.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("load wx sdk fail"));
    document.head.appendChild(s);
  });
}

// 微信内且拿到签名 → wx.config 绑定自定义分享卡片；任一环节失败静默降级为「仅复制引导」
async function bindShare() {
  try {
    const sig = await fetchJssdkSignature(window.location.href.split("#")[0]);
    if (!sig?.signature) return;
    await loadWechatSdk();
    const wx = (window as any).wx;
    wx.config({
      appId: sig.appId,
      timestamp: sig.timestamp,
      nonceStr: sig.nonceStr,
      signature: sig.signature,
      jsApiList: ["updateAppMessageShareData", "updateTimelineShareData"],
    });
    wx.ready(() => {
      wx.updateAppMessageShareData(shareData.value);
      wx.updateTimelineShareData({ title: shareData.value.title, link: shareData.value.link, imgUrl: shareData.value.imgUrl });
    });
    wx.error(() => {});
  } catch {
    /* 静默降级 */
  }
}

onMounted(() => {
  if (isWechatBrowser()) void bindShare();
});
</script>

<template>
  <div>
    <!-- 页内分享触发按钮 -->
    <UButton
      color="gray"
      variant="soft"
      :icon="open ? 'i-lucide-x' : 'i-lucide-share-2'"
      class="fixed bottom-[92px] right-3 z-[70] h-11 w-11 !rounded-full !p-0 shadow-md"
      :aria-label="t('messages.share.title')"
      @click="open = !open"
    />

    <!-- 分享浮层 bottom sheet -->
    <div
      v-if="open"
      class="fixed inset-x-0 bottom-0 z-[80] flex justify-center"
      @click.self="open = false"
    >
      <div class="w-full max-w-md rounded-t-2xl bg-white p-5 pb-8 shadow-2xl">
        <div class="mb-1 text-base font-bold text-gray-900">{{ t("messages.share.title") }}</div>
        <div class="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-700">
          {{ t("messages.share.openingTip") }}
          <br />
          {{ t("messages.share.inviteTip") }}
        </div>
        <div class="mt-3 flex items-center gap-2">
          <input
            :value="shareUrl"
            readonly
            class="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500"
          />
          <UButton color="primary" size="sm" @click="copyLink">{{ copyLabel }}</UButton>
        </div>
        <UButton color="secondary" variant="outline" size="sm" block class="mt-2" @click="copyTalk">
          {{ t("messages.share.copyTalk") }}
        </UButton>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 创建 `WechatInviteLoginBar.vue`（携带邀请码且未登录时的引导条）**

```vue
<script setup lang="ts">
import { isWechatBrowser, useSso } from "../composables/useSso";

// 条件引导条：URL 带 ?invite 且未登录 → 底部弹「微信一键登录」，登录走直连授权并精确回跳本页。
// 一次性提示（可关闭），本会话后不再打扰。
const route = useRoute();
const localePath = useTenantLocalePath();
const { t } = useI18n();
const authStore = useAuthStore();
const { fetchProviders, loginWithWechat } = useSso();

const SKIP_KEY = "youshop_invite_bar_skipped";
const invite = computed(() => (route.query.invite as string) || "");
const show = ref(false);

async function goLogin() {
  const providers = await fetchProviders();
  if (providers.length) {
    loginWithWechat(providers[0], { inviteCode: invite.value, returnUrl: route.fullPath });
  }
}

onMounted(() => {
  if (
    invite.value &&
    !authStore.isAuthenticated &&
    !sessionStorage.getItem(SKIP_KEY) &&
    isWechatBrowser()
  ) {
    show.value = true;
  }
});

function dismiss() {
  show.value = false;
  sessionStorage.setItem(SKIP_KEY, "1");
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-x-0 bottom-0 z-[75] border-t border-gray-100 bg-white p-3 shadow-[0_-2px_16px_rgba(0,0,0,0.10)]"
  >
    <div class="mx-auto flex max-w-md items-center gap-3">
      <p class="flex-1 text-sm font-medium text-gray-700">{{ t("messages.share.inviteBar") }}</p>
      <UButton icon="i-lucide-x" variant="ghost" color="gray" class="h-8 w-8 !p-0" :aria-label="t('messages.share.inviteBarClose')" @click="dismiss" />
    </div>
    <UButton class="mt-2 w-full justify-center" color="primary" size="lg" @click="goLogin">
      {{ t("messages.share.wechatLogin") }}
    </UButton>
  </div>
</template>
```

- [ ] **Step 3: 类型校验**

Run: `pnpm typecheck`
Expected: PASS（组件为全局注册，无需 import；`confirm` 等不存在，`window as any` 处理 wx 全局）

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/components/WechatShare.vue layers/base/app/components/WechatInviteLoginBar.vue
git commit -m "feat(share): 通用微信分享组件 + 邀请登录引导条"
```

---

### Task 8: 商品详情页与首页接入

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\product\[slug].vue`
- Modify: `d:\zhao\nshop\app\pages\index.vue`

- [ ] **Step 1: 商品详情页挂载分享与引导条**

在 `[slug].vue` 的 `<script setup>` 中追加（获取分享标题/图/邀请码源）：

```ts
// 微信分享 + 邀请登录引导
const authStore = useAuthStore();
const shareTitle = computed(() => product.value?.name);
const shareImage = computed(() => product.value?.featuredAsset?.preview ?? "");
```

模板中把 `/main` 内容替换为：

```vue
<template>
  <main class="container">
    <ProductDetailRenderer />
    <WechatShare
      :title="shareTitle"
      :description="product?.description"
      :image-url="shareImage"
      :invite-code="authStore.user?.inviteCode"
    />
    <WechatInviteLoginBar />
  </main>
</template>
```

- [ ] **Step 2: 首页挂载分享与引导条**

在 `app/pages/index.vue` 的 `<script setup>` 中追加：

```ts
const siteName = useSiteName();
```

并在移动端 `<main ... data-layout="mobile">` 关闭标签前、`</main>` 之前追加（放最后，页面底部），同时更新 PC 展示仅在移动布局内展示引导（分享按钮为 fixed 悬浮，两布局共用一份即可，放模板最外层）：

```vue
    <WechatShare :title="siteName.value" />
    <WechatInviteLoginBar />
```

放在两个 `</main>` 之后、`</template>` 之前，保证 single 组件实例。

- [ ] **Step 3: 类型校验**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 本地起服务联调（微信 UA 模拟）**

Run: `pnpm dev`
在浏览器开发者工具切微信 UA（或真机），访问 `http://localhost:3000`、`/products/{slug}`：
- 首页未登录 → 自动跳转 zhao-sso `wechatRedirect`（PC/本地可能无 appId 证书，会跳微信授权或报错，属预期；核心验证登录页/详情页的分享按钮与浮层渲染即可）。
- 「分享」按钮 → 浮层出现，复制链接含 `?invite=…`（登录后取会话用户码）。
- 携带 `?invite=XXX` 访问商品详情页且未登录 → 底部引导条出现，关闭后本会话不再出现。

- [ ] **Step 5: 手机视口截图（交付硬性要求）**

用 390×844 宽度手机视口截图：分享浮层、登录引导条、商品详情页，并补充到操作手册 `manual/`。

- [ ] **Step 6: Commit**

```bash
git add layers/base/app/pages/product/\[slug\].vue app/pages/index.vue
git commit -m "feat(share): 首页与商品详情接入分享与邀请登录引导"
```

---

### Task 9: 端到端联调与收尾

**Files:** 无（运行时与配置）

- [ ] **Step 1: 检查 SSO 白名单（本仓库外配置，阻塞项）**

在 zhao-sso 后台该应用的 `redirect_uris` 加入：`https://<nshop域名>/account/sso-callback` 与带租户前缀的 `https://<nshop域名>/<租户前缀>/account/sso-callback`（或含 `*` 通配）。同时在微信公众号后台把 nshop 域名加入 JS 安全域名。未配后者时分享降级为「仅复制链接」，不阻断登录。

- [ ] **Step 2: 真机端到端验证**

在微信内：A（已登录）打开商品详情 → 分享转给好友 B → B 点开链接进入商品详情（URL 含 `?invite=A码`）→ 出现登录引导条 → 点「微信一键登录」→ 微信授权 → SSO `wechatCallback` 建分销关系 → 回跳商品详情页。验证：SSO 后台 `sso_referral_relations` 新增 A→B 关系；B 页面回到商品详情。

- [ ] **Step 3: 回归检查清单**

- 普通登录（无邀请码）仍可直连微信登录并回跳 `/account`。
- 重复点击同一邀请链接不重复建关系（`buildReferralRelation` 幂等）。
- `return_url` 非同源被回落 `/account`（不开放重定向）。
- JS-SDK 未入安全域名时静默降级，页面无报错。
- 分享链接 i18n 双语正常，复制功能可用。

- [ ] **Step 4: 本地构建验证（仅本地，禁止服务器构建——部署铁律）**

Run: `pnpm build`
Expected: 构建成功产出 nshop 的 `.output/`（nshop 部署走 `scripts/deploy.mjs` scp 推送，不 git pull 构建）。

- [ ] **Step 5: Commit（本步若无可提交内容可跳过）**

```bash
git add .
git commit -m "chore(share): 微信转发邀请码功能收尾与回归"
```

---

## Self-Review 记录

- **Spec 覆盖核对**：设计文档各节均已映射到任务——①直连授权+邀请码（Task1）、②nshop 回调页（Task3）、③所有微信登录统一直连（Task4 首页、Task5 登录页）、④JS-SDK 卡片（Task1 签名 + Task7 组件）、⑤商品详情+首页接入（Task8）、⑥登录引导条（Task7）+主动弹（Task8）、⑦i18n 双语（Task6）、⑧安全边界 return_url 同源 + 降级（Task3/Task7/Task9 回归）。
- **占位符扫描**：无 TBD/TODO；所有 task 含完整可用代码。
- **类型一致**：`loginWithWechat(opts:{inviteCode,returnUrl,redirectPath})`、`ssoLoginWithCode(provider,code,redirectUri)`、`ssoLoginWithCode` 返回 `SsoLoginResult|null`、`fetchJssdkSignature(url)` 在 Task1 定义并被 Task7 调用；`authStore.setUser({id,email,inviteCode?})` 在 Task2 定义、Task1/3/5 使用，签名一致。
- **已知取舍**：活动页无现成路由，本计划不创建页面（Task 前置说明），组件可复用，活动页建立后按 Task7+Task8 相同方式接入。