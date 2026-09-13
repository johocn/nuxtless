# SSO 回跳拼接错误修复 + 微信环境全站静默登录 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复微信 SSO 登录成功后回跳地址拼接错误（`/account/https://www.youshop.cn/`），并将微信环境自动登录从「仅首页」泛化为「全站任意页面进入即静默登录、成功后回跳原页」。

**Architecture:** 回跳目标归一化收敛为纯函数工具（`utils/sso-return-url.ts`，TDD）；`useSso.readSsoReturnUrl()` 读时归一化（单点覆盖 sessionStorage 与 query 两条来源，登录页/首页/自动登录全链路一次修好）；`useAutoWechatSsoLogin` 泛化后挂到 `app/app.vue` 全站生效。所有 SSO 参数（app_code/return_url/channel_code/invite_code）零删减，完全对齐既有统一页 token 直验方案。

**Tech Stack:** Nuxt 4（Vue 3 + TS）、Vue Router 5、vitest（单测）、Python Playwright（线上手机视口回归）、部署走 `scripts/deploy.mjs`（本地构建 + scp，服务器只解压）。

**设计文档:** `docs/superpowers/specs/2026-09-13-sso-return-url-fix-design.md`（已批准）

**根因（已从 vue-router 5.0.4 源码实锤）:** Vue Router `resolveRelativePath()` 对不以 `/` 开头的 location 字符串按**相对路径**解析：`router.replace("https://www.youshop.cn/")` 基于当前路由 `/account/sso-callback` 的目录拼出 `/account/https://www.youshop.cn/`。

---

## 文件结构（改动地图）

| 文件 | 操作 | 职责 |
|---|---|---|
| `layers/base/app/utils/sso-return-url.ts` | 新建 | 回跳目标归一化 + 自动登录跳过页判定（纯函数） |
| `layers/base/app/utils/__tests__/sso-return-url.spec.ts` | 新建 | 上述纯函数单测 |
| `layers/base/app/composables/useSso.ts` | 修改 | `readSsoReturnUrl()` 接入归一化（Fix A） |
| `layers/base/app/composables/useAutoWechatSsoLogin.ts` | 重写 | returnUrl 改 `route.fullPath` + 跳过页判定 + route 取值时机调整（Fix B1） |
| `app/app.vue` | 修改 | 挂载 `useAutoWechatSsoLogin()`（Fix B2） |
| `app/pages/index.vue` | 修改 | 移除原首页调用（Fix B3，避免双跳） |
| `tmp/verify-sso-returnurl.py` | 新建 | 线上手机视口回归脚本（场景 A/B/C） |
| `docs/superpowers/manual/sso-home-auto-login/index.html` | 修改 | 补「七、全站静默登录与回跳修复」章节 + 截图 |
| `docs/superpowers/manual/sso-home-auto-login/shots/` | 新建 | 手册截图目录 |
| `docs/domains/sso-login.md` | 修改 | 链路/文件地图/ADR/Bug 库同步 |
| `c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md` | 修改 | 记忆沉淀（本机记忆文件，非仓库提交） |

**保持不动（修复而非重新规划）:** `pages/account/login.vue`（自有微信登录流程，Fix A 归一化后其完整 URL returnUrl 自然正确）、`components/WechatInviteLoginBar.vue`（手动兜底）、`components/WechatShare.vue`、`loginWithWechat` 直连授权兼容路径、SSO 服务端 / Vendure 侧。

---

### Task 1: 纯函数工具 `sso-return-url.ts` + 单测（TDD）

**Files:**
- Create: `layers/base/app/utils/sso-return-url.ts`
- Test: `layers/base/app/utils/__tests__/sso-return-url.spec.ts`

- [ ] **Step 1: 写失败的单测**

创建 `layers/base/app/utils/__tests__/sso-return-url.spec.ts`（对齐同目录既有 spec 风格，如 `nearby-stock.spec.ts`）：

```typescript
import { describe, expect, it } from "vitest";
import { resolveSsoReturnUrl, shouldSkipAutoLogin, toRouterSafePath } from "../sso-return-url";

const ORIGIN = "https://www.youshop.cn";

describe("toRouterSafePath", () => {
  it("同源完整 URL 归一化为路径（线上 bug 场景）", () => {
    expect(toRouterSafePath("https://www.youshop.cn/", ORIGIN)).toBe("/");
    expect(toRouterSafePath("https://www.youshop.cn/account", ORIGIN)).toBe("/account");
  });
  it("保留 query 与 hash", () => {
    expect(toRouterSafePath("https://www.youshop.cn/t2/product/x?invite=ABC#detail", ORIGIN)).toBe(
      "/t2/product/x?invite=ABC#detail",
    );
  });
  it("相对路径原样返回（已是路由安全形态）", () => {
    expect(toRouterSafePath("/account?invite=1", ORIGIN)).toBe("/account?invite=1");
    expect(toRouterSafePath("/", ORIGIN)).toBe("/");
  });
  it("跨域返回 null（开放重定向防护）", () => {
    expect(toRouterSafePath("https://evil.com/path", ORIGIN)).toBeNull();
  });
  it("非法字符串返回 null", () => {
    expect(toRouterSafePath("http://", ORIGIN)).toBeNull();
  });
});

describe("resolveSsoReturnUrl", () => {
  it("sessionStorage 同源完整 URL 归一化后返回", () => {
    expect(resolveSsoReturnUrl("https://www.youshop.cn/", null, ORIGIN)).toBe("/");
  });
  it("sessionStorage 优先于 query", () => {
    expect(resolveSsoReturnUrl("/a?x=1", "/b", ORIGIN)).toBe("/a?x=1");
  });
  it("sessionStorage 为空或跨域时回退 query（query 也归一化）", () => {
    expect(resolveSsoReturnUrl(null, "https://www.youshop.cn/t2/product/x?invite=1", ORIGIN)).toBe(
      "/t2/product/x?invite=1",
    );
    expect(resolveSsoReturnUrl("https://evil.com/", "/safe", ORIGIN)).toBe("/safe");
  });
  it("两者都无效返回空串（回调页走 /account 缺省）", () => {
    expect(resolveSsoReturnUrl(null, null, ORIGIN)).toBe("");
    expect(resolveSsoReturnUrl("https://evil.com/", "https://evil.too/", ORIGIN)).toBe("");
  });
});

describe("shouldSkipAutoLogin", () => {
  it("登录/注册/回调页跳过（含租户前缀与 login 别名）", () => {
    expect(shouldSkipAutoLogin("/account/login")).toBe(true);
    expect(shouldSkipAutoLogin("/t2/account/login")).toBe(true);
    expect(shouldSkipAutoLogin("/login")).toBe(true);
    expect(shouldSkipAutoLogin("/t2/login")).toBe(true);
    expect(shouldSkipAutoLogin("/account/register")).toBe(true);
    expect(shouldSkipAutoLogin("/t2/account/register")).toBe(true);
    expect(shouldSkipAutoLogin("/account/sso-callback")).toBe(true);
    expect(shouldSkipAutoLogin("/t2/account/sso-callback")).toBe(true);
  });
  it("普通页面不跳过", () => {
    expect(shouldSkipAutoLogin("/")).toBe(false);
    expect(shouldSkipAutoLogin("/product/x")).toBe(false);
    expect(shouldSkipAutoLogin("/t2/product/x")).toBe(false);
    expect(shouldSkipAutoLogin("/account")).toBe(false);
    expect(shouldSkipAutoLogin("/account/orders")).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run layers/base/app/utils/__tests__/sso-return-url.spec.ts`
Expected: FAIL — `Failed to resolve import "../sso-return-url"`（模块不存在）。

- [ ] **Step 3: 写最小实现**

创建 `layers/base/app/utils/sso-return-url.ts`：

```typescript
/** SSO 回跳目标归一化 + 全站自动登录跳过页判定（纯函数，供 useSso / useAutoWechatSsoLogin 复用）。
 *  背景：Vue Router 的 resolveRelativePath 对不以 / 开头的 location 按相对路径解析，
 *  把完整 URL 直接交给 router.replace 会基于当前路由目录拼出
 *  /account/https://www.youshop.cn/ 这类错误地址，回跳目标必须先归一化为路由安全路径。 */

/** 同源 URL 归一化为路由安全相对路径（pathname+search+hash）；非同源或非法返回 null */
export function toRouterSafePath(raw: string, origin: string): string | null {
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

/** 解析 SSO 回跳目标：sessionStorage 优先、query 兜底；同源校验 + 归一化；都无效返回空串 */
export function resolveSsoReturnUrl(
  session: string | null,
  queryRaw: string | null,
  origin: string,
): string {
  const fromSession = session ? toRouterSafePath(session, origin) : null;
  if (fromSession) return fromSession;
  return (queryRaw ? toRouterSafePath(queryRaw, origin) : null) ?? "";
}

/** 全站自动登录跳过页（按路径后缀匹配，兼容租户前缀 /t2/... 与登录页别名 /login）：
 *  登录页自带微信自动跳转流程、注册页有明确注册意图、回调页是 SSO 流程中段 */
export function shouldSkipAutoLogin(path: string): boolean {
  return /\/(account\/)?(login|register|sso-callback)$/.test(path);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run layers/base/app/utils/__tests__/sso-return-url.spec.ts`
Expected: PASS — 全部用例通过（17 passed 左右）。

- [ ] **Step 5: 提交**

```bash
git add layers/base/app/utils/sso-return-url.ts layers/base/app/utils/__tests__/sso-return-url.spec.ts
git commit -m "feat(sso): 回跳目标归一化与自动登录跳过页纯函数 + 单测"
```

---

### Task 2: Fix A — `useSso.ts readSsoReturnUrl` 接入归一化

**Files:**
- Modify: `layers/base/app/composables/useSso.ts:107-121`（`readSsoReturnUrl` 函数体）与文件头部 import

- [ ] **Step 1: 添加 import**

在 `useSso.ts` 第 1 行现有 import 之后添加：

```typescript
import { resolveSsoReturnUrl } from "../utils/sso-return-url";
```

（与既有 `import { readVendureSessionToken } from "../utils/vendure-session";` 同风格。）

- [ ] **Step 2: 替换 `readSsoReturnUrl` 实现**

将现有实现（当前 107-121 行）：

```typescript
  /** 读取回跳目标页（优先 sessionStorage，兼容旧 return_url query），并做同源校验 */
  function readSsoReturnUrl(): string {
    try {
      const session = sessionStorage.getItem(SSO_RETURN_URL_KEY) ?? "";
      if (session && new URL(session, window.location.origin).origin === window.location.origin) {
        return session;
      }
    } catch { /* 走 query 兜底 */ }
    const raw = new URLSearchParams(window.location.search).get("return_url") ?? "";
    try {
      return raw && new URL(raw, window.location.origin).origin === window.location.origin ? raw : "";
    } catch {
      return "";
    }
  }
```

替换为：

```typescript
  /** 读取回跳目标页（优先 sessionStorage，兼容旧 return_url query）；
   *  同源校验并归一化为 / 开头的路由安全路径——完整 URL 直接交给 router.replace
   *  会被 Vue Router 按相对路径解析，拼出 /account/https://... 错误地址（见 utils/sso-return-url.ts） */
  function readSsoReturnUrl(): string {
    return resolveSsoReturnUrl(
      sessionStorage.getItem(SSO_RETURN_URL_KEY),
      new URLSearchParams(window.location.search).get("return_url"),
      window.location.origin,
    );
  }
```

语义保持：sessionStorage 优先 → query 兜底 → 都无效返回 `""`（回调页走 `/account` 缺省）；跨域拒绝不变。唯一变化是返回值归一化。

- [ ] **Step 3: 回归既有单测（确认无破坏）**

Run: `npm test`
Expected: PASS — 既有全部 spec 通过（新 spec 在 Task 1 已绿）。

- [ ] **Step 4: 提交**

```bash
git add layers/base/app/composables/useSso.ts
git commit -m "fix(sso): readSsoReturnUrl 归一化回跳目标，修复 /account/https:// 拼接错误"
```

---

### Task 3: Fix B — 全站静默登录（composable 泛化 + app.vue 挂载 + 首页去重）

**Files:**
- Modify: `layers/base/app/composables/useAutoWechatSsoLogin.ts`（整文件重写，43 行）
- Modify: `app/app.vue:27-30`（菜单集合块后插入）
- Modify: `app/pages/index.vue:28-29`（删除两行）

- [ ] **Step 1: 重写 `useAutoWechatSsoLogin.ts`**

将整个文件替换为：

```typescript
import { isWechatBrowser, useSso } from "./useSso";
import { shouldSkipAutoLogin } from "../utils/sso-return-url";

const AUTO_JUMP_KEY = "youshop_sso_auto_jumped";

/** 微信环境全站自动 SSO 登录（走 h.joho.cn 统一登录页，app.vue 挂载对全站生效）。
 *  仅客户端、仅微信内置浏览器、未登录、非登录/注册/回调页、且本会话未自动跳转过时，
 *  跳转统一登录页（参数对齐既有 SSO 方案：app_code/return_url/channel_code/invite_code 一个不少）；
 *  登录成功后回跳 sso-callback 落点，再由其兑换并回跳进入时的原页面（?invite 天然保留在 fullPath）。 */
export function useAutoWechatSsoLogin() {
  const { fetchProviders, loginWithSso } = useSso();

  async function run(): Promise<void> {
    if (import.meta.server) return;
    // 在 onMounted 同步前缀内取 route：app.vue 根组件 setup 期不一定有路由上下文，
    // 而 onMounted 回调同步前缀内 getCurrentInstance 可用，useRoute 在此必然安全
    const route = useRoute();
    const authStore = useAuthStore();
    if (authStore.isAuthenticated) return;
    if (shouldSkipAutoLogin(route.path)) return;

    // 未登录 + 微信内置浏览器 + 未自动跳过 → 统一登录页自动登录，回跳进入时的原页
    if (isWechatBrowser() && !sessionStorage.getItem(AUTO_JUMP_KEY)) {
      const providers = await fetchProviders();
      const provider = providers[0];
      if (provider) {
        sessionStorage.setItem(AUTO_JUMP_KEY, "1");
        // 分享链接 ?invite 透传统一页绑定分销关系；回跳目标用 fullPath 保留全部查询参数
        const invite = typeof route.query.invite === "string" ? route.query.invite : "";
        loginWithSso(provider, {
          inviteCode: invite || undefined,
          returnUrl: route.fullPath,
        });
      }
    }
  }

  onMounted(() => {
    void run();
  });

  return { run };
}
```

相对旧版的三处变化：
1. `returnUrl` 从「拼好的首页完整 URL」改为 `route.fullPath`（当前页完整路径，`?invite` 天然保留）。
2. 新增 `shouldSkipAutoLogin(route.path)` 跳过登录/注册/回调页。
3. `useRoute()` 从 setup 作用域移入 `run()` 顶部（app.vue 挂载安全），删除不再使用的 `useTenantLocalePath`。

- [ ] **Step 2: `app/app.vue` 挂载全局自动登录**

在 `app/app.vue` 的菜单集合块之后（当前 27-28 行 `const { data: menuCollections } = await useAsyncGql("GetMenuCollections");` 与 `useState("menuCollections", () => menuCollections.value);` 之后、`// Set GQL session and fetch current order` 注释之前）插入：

```typescript
// 微信内置浏览器全站自动 SSO 登录：任意页面进入即静默跳统一登录页，成功后回跳原页（含 ?invite）
useAutoWechatSsoLogin();
```

（无需 import——root `app/` 目录对 `layers/base` composables 自动导入，`app.vue` 第 3 行的 `useTenantChannel` 与 `app/pages/index.vue` 此前的 `useAutoWechatSsoLogin()` 均为 auto-import，同一机制。）

- [ ] **Step 3: 移除首页旧调用**

删除 `app/pages/index.vue` 中这两行（当前 28-29 行）：

```typescript
// 微信内置浏览器访问首页且未登录时，自动走 SSO 微信静默授权登录（回跳首页换会话）
useAutoWechatSsoLogin();
```

（被 app.vue 全局挂载取代；不删会导致两个 onMounted 异步竞态重复 fetchProviders/双跳。）

- [ ] **Step 4: 全量单测 + 构建验证**

Run: `npm test`
Expected: PASS。

Run: `npm run build`
Expected: 构建成功（exit 0，无类型/SSR 错误）。若构建报 auto-import 或类型错误，检查拼写与 import 路径后重试。

- [ ] **Step 5: 提交**

```bash
git add layers/base/app/composables/useAutoWechatSsoLogin.ts app/app.vue app/pages/index.vue
git commit -m "feat(sso): 微信环境全站自动 SSO 登录（app.vue 挂载，回跳进入时原页）"
```

---

### Task 4: 部署线上

**Files:** 无代码改动（部署操作）

- [ ] **Step 1: 部署**

Run: `node scripts/deploy.mjs`
（nshop 部署铁律：本地构建 → scp 产物 → 服务器解压；服务器不构建。Task 3 已完成本地构建验证。）
Expected: 脚本输出上传/解压/完成信息，exit 0。

- [ ] **Step 2: 冒烟确认线上版本更新**

Run: 浏览器或 curl 访问 `https://www.youshop.cn/`，确认站点正常返回（部署未破坏）。

---

### Task 5: 线上手机视口回归（Playwright，390×844 dpr2 + MicroMessenger UA）

**Files:**
- Create: `tmp/verify-sso-returnurl.py`

- [ ] **Step 1: 编写回归脚本**

创建 `tmp/verify-sso-returnurl.py`：

```python
# -*- coding: utf-8 -*-
"""SSO 回跳拼接错误修复 + 微信全站静默登录 线上回归（手机视口 390x844 dpr2）。
场景：
  A. 微信 UA 进首页 → 自动跳 h.joho.cn 统一登录页（app_code/return_url 全量参数）
     → 模拟回跳 sso-callback?token=invalid（兑换失败仍 leave()）→ 断言落点为 /
  B. 微信 UA 进商品详情页（?invite=TESTINV01）→ 统一页含 invite_code
     → 模拟回跳 → 断言落点为原详情页（invite 保留）
  C. 普通 UA 进首页 → 不发生 SSO 跳转（顺便抓默认渠道商品链接供 B 用）
"""
import time
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

SITE = "https://www.youshop.cn"
UNIFIED_HOST = "h.joho.cn"
OUT = r"d:\zhao\nshop\tmp-shots"
INVITE = "TESTINV01"
WECHAT_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "
    "MicroMessenger/8.0.42.0.0"
)
NORMAL_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
)


def mobile_ctx(browser, ua):
    return browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent=ua,
        locale="zh-CN",
    )


def unified_params(url):
    """统一页为 hash 路由：参数在 fragment 的 ? 之后（页面 URL 含 fragment，可直接解析）"""
    frag = urlparse(url).fragment
    qs = frag.split("?", 1)[1] if "?" in frag else ""
    # parse_qs 已自动做 URL 解码，勿再手动 unquote（二次解码会破坏含 % 的值）
    return {k: v[0] for k, v in parse_qs(qs).items()}


def wait_unified_page(pg, timeout_ms=9000):
    """轮询页面 URL 直到落在统一登录页（参数在 fragment，HTTP 请求 URL 不含 fragment，
    必须读 pg.url 而非 request 事件）"""
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        url = pg.url
        if UNIFIED_HOST in url and "pages/sso/login" in url:
            return url
        pg.wait_for_timeout(300)
    return ""


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------- 场景 C：普通 UA 不跳转 + 抓默认渠道商品链接 ----------
        ctxC = mobile_ctx(browser, NORMAL_UA)
        pgC = ctxC.new_page()
        pgC.goto(f"{SITE}/", wait_until="domcontentloaded", timeout=60000)
        pgC.wait_for_timeout(3500)
        assert UNIFIED_HOST not in pgC.url, f"普通 UA 不应跳统一页: {pgC.url}"
        pgC.screenshot(path=f"{OUT}/sso-fix-C-normal-home.png")
        hrefs = pgC.eval_on_selector_all(
            "a[href*='product/']", "els => els.map(e => e.getAttribute('href'))"
        )
        default_products = [h for h in hrefs if h and h.startswith("/product/") and "t2/" not in h]
        ctxC.close()
        print("DEFAULT_PRODUCT:", default_products[:3])
        print("C normal-UA no-redirect: OK")

        # ---------- 场景 A：微信 UA 进首页 ----------
        ctxA = mobile_ctx(browser, WECHAT_UA)
        pgA = ctxA.new_page()
        # 拦截微信 OAuth 域名，防止统一页在 MicroMessenger UA 下继续跳走（跳转被中止后页面停留在统一页）
        ctxA.route("**open.weixin.qq.com/**", lambda r: r.abort())
        pgA.goto(f"{SITE}/", wait_until="domcontentloaded", timeout=60000)
        unified = wait_unified_page(pgA)
        assert unified, f"微信 UA 进首页未自动跳统一页: {pgA.url}"
        params = unified_params(unified)
        assert params.get("app_code"), f"缺 app_code: {unified}"
        ru = params.get("return_url", "")
        assert ru.startswith(SITE) and ru.endswith("/account/sso-callback"), f"return_url 异常: {ru}"
        print("A1 unified params ok:", params)
        pgA.screenshot(path=f"{OUT}/sso-fix-A-unified.png")
        # 模拟统一页登录成功回跳：token 无效 → 兑换失败 → toast → leave() 回原页
        pgA.goto(
            f"{SITE}/account/sso-callback?token=invalid-token-test",
            wait_until="domcontentloaded", timeout=60000,
        )
        pgA.wait_for_timeout(4500)
        final = pgA.url
        assert final.rstrip("/") == SITE, f"首页回跳落点错误: {final}"
        assert "account/https" not in final, f"仍存在拼接错误: {final}"
        pgA.screenshot(path=f"{OUT}/sso-fix-A-home-final.png")
        print("A2 home final url ok:", final)
        ctxA.close()

        # ---------- 场景 B：微信 UA 进商品详情页（?invite） ----------
        if default_products:
            prod = default_products[0]
        else:
            prod = "/"
            print("WARN: 未抓到默认渠道商品链接，场景 B 退化为首页 ?invite 验证")
        sep = "&" if "?" in prod else "?"
        ctxB = mobile_ctx(browser, WECHAT_UA)
        pgB = ctxB.new_page()
        ctxB.route("**open.weixin.qq.com/**", lambda r: r.abort())
        pgB.goto(f"{SITE}{prod}{sep}invite={INVITE}", wait_until="domcontentloaded", timeout=60000)
        unifiedB = wait_unified_page(pgB)
        assert unifiedB, f"微信 UA 进详情页未自动跳统一页: {pgB.url}"
        paramsB = unified_params(unifiedB)
        assert paramsB.get("invite_code") == INVITE, f"invite_code 未透传: {paramsB}"
        assert paramsB.get("app_code") and paramsB.get("return_url"), f"参数不全: {paramsB}"
        print("B1 unified params ok:", paramsB)
        pgB.screenshot(path=f"{OUT}/sso-fix-B-unified.png")
        pgB.goto(
            f"{SITE}/account/sso-callback?token=invalid-token-test",
            wait_until="domcontentloaded", timeout=60000,
        )
        pgB.wait_for_timeout(4500)
        finalB = pgB.url
        assert finalB.startswith(f"{SITE}{prod}"), f"详情页回跳落点错误: {finalB}"
        assert INVITE in finalB, f"invite 丢失: {finalB}"
        assert "account/https" not in finalB
        pgB.screenshot(path=f"{OUT}/sso-fix-B-detail-final.png")
        print("B2 detail final url ok:", finalB)
        ctxB.close()

        browser.close()
        print("SSO_RETURNURL_REGRESSION_PASSED")


if __name__ == "__main__":
    main()
```

脚本要点说明（执行者须知）：
- 无效 token 模拟回跳是安全的：`sso-callback` 兑换失败会 toast 错误但**仍然执行 `leave()` 回跳原页**，恰好验证归一化后的落点；不会产生真实登录会话。
- sessionStorage 在同一浏览器 tab 内跨域往返（www.youshop.cn → h.joho.cn → 回来）保留，`youshop_sso_return_url` 与 `youshop_sso_provider` 均在。
- 回到原页后 `AUTO_JUMP_KEY` 已置位，不会再触发二次自动跳转，最终 URL 稳定可断言。

- [ ] **Step 2: 运行回归**

Run: `python tmp/verify-sso-returnurl.py`（在 `d:\zhao\nshop` 目录下）
Expected: 输出各场景 OK 与 `SSO_RETURNURL_REGRESSION_PASSED`，生成 5 张截图：
`sso-fix-C-normal-home.png` / `sso-fix-A-unified.png` / `sso-fix-A-home-final.png` / `sso-fix-B-unified.png` / `sso-fix-B-detail-final.png`。

- [ ] **Step 3: 人工核验截图**

用 Read 工具查看 `tmp-shots/sso-fix-A-home-final.png` 与 `sso-fix-B-detail-final.png`，确认：A 落点为首页（地址栏无 `account/https`）；B 落点为商品详情页且底部可能出现邀请登录引导条（?invite 触发，属预期兜底 UI）。

- [ ] **Step 4: 提交脚本与截图**

```bash
git add tmp/verify-sso-returnurl.py
git commit -m "test(sso): 回跳归一化与全站静默登录线上回归脚本"
```

（截图在 `tmp-shots/`，按仓库既有 gitignore 约定不入库，精选后复制进手册目录归档——见 Task 6。）

---

### Task 6: 文档同步（手册 + 领域文档 + 记忆）

**Files:**
- Create: `docs/superpowers/manual/sso-home-auto-login/shots/`（复制 4 张截图）
- Modify: `docs/superpowers/manual/sso-home-auto-login/index.html`（追加第七章）
- Modify: `docs/domains/sso-login.md`（4 处同步）
- Modify: `c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md`（记忆沉淀，非仓库文件）

- [ ] **Step 1: 复制截图进手册目录**

```powershell
New-Item -ItemType Directory -Force d:\zhao\nshop\docs\superpowers\manual\sso-home-auto-login\shots
Copy-Item d:\zhao\nshop\tmp-shots\sso-fix-A-unified.png d:\zhao\nshop\docs\superpowers\manual\sso-home-auto-login\shots\
Copy-Item d:\zhao\nshop\tmp-shots\sso-fix-A-home-final.png d:\zhao\nshop\docs\superpowers\manual\sso-home-auto-login\shots\
Copy-Item d:\zhao\nshop\tmp-shots\sso-fix-B-unified.png d:\zhao\nshop\docs\superpowers\manual\sso-home-auto-login\shots\
Copy-Item d:\zhao\nshop\tmp-shots\sso-fix-B-detail-final.png d:\zhao\nshop\docs\superpowers\manual\sso-home-auto-login\shots\
```

- [ ] **Step 2: 手册追加第七章**

在 `docs/superpowers/manual/sso-home-auto-login/index.html` 的 `</body>` 前追加：

```html
  <h2>七、全站静默登录与回跳修复（2026-09-13 更新）</h2>
  <ul>
    <li><b>触发范围升级</b>：微信环境进入 www.youshop.cn <b>任意页面</b>（原仅首页）即自动跳统一登录页静默登录，成功后<b>回跳进入时的原页面</b>（含 ?invite 参数）——商品详情页转发好友后，好友登录成功即直达该详情页。</li>
    <li><b>回跳拼接 bug 修复</b>：登录成功后地址曾变为 <code>/account/https://www.youshop.cn/</code>（404）。根因：回跳目标为完整 URL，Vue Router 对非 <code>/</code> 开头的 location 按相对路径解析导致目录拼接错误；现回跳目标统一归一化为路由安全路径（<code>utils/sso-return-url.ts</code>，登录页/首页/自动登录全链路一次修好）。</li>
    <li><b>跳过页</b>：<code>/account/login</code>（含 <code>/login</code> 别名）、<code>/account/register</code>、<code>/account/sso-callback</code> 不触发自动登录（登录页自带微信流程、注册页有明确意图、回调页是流程中段）。</li>
    <li><b>防循环不变</b>：一次会话只自动跳一次（<code>youshop_sso_auto_jumped</code>）；退出登录后本会话不再强制自动登录。</li>
    <li><b>参数零删减</b>：app_code / return_url / channel_code / invite_code 全量透传，对齐统一页 token 直验方案。</li>
  </ul>
  <h3>回归验证（手机微信 UA 视口 390×844 dpr2，现网 www.youshop.cn）</h3>
  <ul>
    <li>场景 A：微信 UA 进首页 → 跳统一页（app_code/return_url 齐全）→ 模拟回跳 → 落点 <code>/</code>，无拼接错误。</li>
    <li>场景 B：微信 UA 进商品详情页（?invite=TESTINV01）→ 统一页含 invite_code → 模拟回跳 → 落点原详情页（invite 保留）。</li>
    <li>场景 C：普通 UA 进首页 → 不发生 SSO 跳转。</li>
  </ul>
  <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <figure style="margin:0;width:48%;"><img src="shots/sso-fix-A-unified.png" style="width:100%;border:1px solid #ddd;border-radius:8px;" /><figcaption style="font-size:12px;color:#666;">场景 A：自动跳统一登录页（参数齐全）</figcaption></figure>
    <figure style="margin:0;width:48%;"><img src="shots/sso-fix-A-home-final.png" style="width:100%;border:1px solid #ddd;border-radius:8px;" /><figcaption style="font-size:12px;color:#666;">场景 A：回跳落点首页（无拼接错误）</figcaption></figure>
    <figure style="margin:0;width:48%;"><img src="shots/sso-fix-B-unified.png" style="width:100%;border:1px solid #ddd;border-radius:8px;" /><figcaption style="font-size:12px;color:#666;">场景 B：详情页带 invite 自动跳统一页</figcaption></figure>
    <figure style="margin:0;width:48%;"><img src="shots/sso-fix-B-detail-final.png" style="width:100%;border:1px solid #ddd;border-radius:8px;" /><figcaption style="font-size:12px;color:#666;">场景 B：登录后直达原详情页（invite 保留）</figcaption></figure>
  </div>
```

- [ ] **Step 3: 同步领域文档 `docs/domains/sso-login.md`（4 处）**

1. §1 链路表「发起」行，将：

```
| 发起 | nshop 侧触发（`login.vue` / `WechatInviteLoginBar.vue` 微信一键登录引导条）→ 跳 `h.joho.cn/#/pages/sso/login` 统一登录页，URL 携带 `app_code`、`return_url`（**含 `#/`**）、`channel_code`、`invite_code` |
```

改为：

```
| 发起 | nshop 侧触发（`app.vue` 微信环境**全站**自动登录 / `login.vue` / `WechatInviteLoginBar.vue` 引导条）→ 跳 `h.joho.cn/#/pages/sso/login` 统一登录页，URL 携带 `app_code`、`return_url`（**含 `#/`**）、`channel_code`、`invite_code` |
```

2. §2 文件地图 `useAutoWechatSsoLogin.ts` 行，将 `| \`composables/useAutoWechatSsoLogin.ts\` | 微信环境自动登录 | \`/MicroMessenger/i\` UA 判断 |` 改为：

```
| `composables/useAutoWechatSsoLogin.ts` | 微信环境**全站**自动登录（app.vue 挂载，回跳进入时原页） | `/MicroMessenger/i` UA 判断、`shouldSkipAutoLogin` 跳过登录/注册/回调页 |
```

并在 `useSso.ts` 行之后新增一行：

```
| `utils/sso-return-url.ts` | 回跳目标归一化与自动登录跳过页判定（纯函数） | `toRouterSafePath` / `resolveSsoReturnUrl` / `shouldSkipAutoLogin` |
```

3. §3 设计决策表末尾追加一行：

```
| 回跳目标读时归一化为路由安全路径（pathname+search+hash） | Vue Router 对非 `/` 开头 location 按相对路径解析，完整 URL 会拼出 `/account/https://...` 错误地址（2026-09-13 线上 bug） |
```

4. §5 Bug 知识库表末尾追加一行：

```
| 微信登录成功后地址变 `/account/https://www.youshop.cn/`（404） | 回跳目标为完整 URL，`router.replace` 被 Vue Router `resolveRelativePath` 按相对路径基于 `/account/sso-callback` 目录拼接 | `useSso.ts readSsoReturnUrl` → `utils/sso-return-url.ts`（读时归一化） | 手机微信进任意页 → 登录 → 断言落点为原页相对路径（`tmp/verify-sso-returnurl.py`） |
```

- [ ] **Step 4: 记忆沉淀（非仓库提交）**

在 `c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md` 的 SSO 规则区追加：

```
- **SSO 回跳目标必须归一化（2026-09-13）**：回跳落点交给 `router.replace` 前必须转为 `/` 开头的相对路径（`nshop/layers/base/app/utils/sso-return-url.ts` 的 `toRouterSafePath/resolveSsoReturnUrl`）——Vue Router 对非 `/` 开头字符串按相对路径解析，完整 URL 会基于 `/account/sso-callback` 目录拼出 `/account/https://...` 404；微信环境自动 SSO 登录已从「仅首页」泛化为「全站」（`app/app.vue` 挂载 `useAutoWechatSsoLogin`，回跳 `route.fullPath` 原页，跳过 login/register/sso-callback 三类页面，参数零删减）
```

- [ ] **Step 5: 提交文档**

```bash
git add docs/superpowers/manual/sso-home-auto-login docs/domains/sso-login.md
git commit -m "docs(sso): 手册与领域文档同步全站静默登录与回跳归一化修复"
```

---

## 任务间依赖

Task 1 → Task 2（import 纯函数）→ Task 3（composable 引用 `shouldSkipAutoLogin`）→ Task 4（部署）→ Task 5（线上回归，依赖部署完成）→ Task 6（文档，依赖 Task 5 截图）。

## 完成判据（对齐设计文档 §5）

1. `npx vitest run layers/base/app/utils/__tests__/sso-return-url.spec.ts` 全绿。
2. `npm test` 全量通过（无既有用例破坏）。
3. `npm run build` 成功。
4. 线上回归输出 `SSO_RETURNURL_REGRESSION_PASSED`，5 张手机视口截图落盘。
5. 手册/领域文档/记忆三处同步完成，git log 含 5 个提交（Task 1/2/3/5/6）。
