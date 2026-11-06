// 登录态校验（审计第 3 条）：
// Pinia 的 auth store 只持久化用户展示信息，token 过期后 store 仍认为「已登录」，
// 导致账户页 401 而登录页又被 guest 中间件弹回 /account 的死循环。
// 这里在路由守卫进入前做一次轻量 `activeCustomer { id }` 校验（只取 id）：
// - token 缺失 / 失效 / 上游返回未登录 → 清 cookie + 清 Pinia，按未登录处理，放行登录页；
// - 网络错误或超时 → 降级放行（不清会话），避免把用户误踢下线。
import { requestTimeoutSignal } from "./request-timeout";
import {
  VENDURE_SESSION_COOKIE,
  isCookieAuthMode,
  readVendureTokenWithContext,
  vendureAuthHeaders,
} from "./vendure-session";

const ME_QUERY = "query SessionMe { activeCustomer { id } }";

/** 清会话：客户端删 document.cookie；SSR 通过 useCookie 下发 Set-Cookie（留空即删除） */
function clearSessionEverywhere(): void {
  const store = useAuthStore();
  store.clearSession();
  if (typeof document === "undefined") {
    try {
      useCookie<string | null>(VENDURE_SESSION_COOKIE).value = null;
    } catch {
      // 非 Nuxt 上下文（如单测）忽略：此时也无下发响应的机会
    }
  }
}

/** 判断 GraphQL errors 里是否属于「会话失效」类错误（Vendure 通常 HTTP 200 + errors） */
function isSessionError(errors: Array<{ message?: string; extensions?: { code?: string } }>): boolean {
  return errors.some((e) => /unauthor|expired|forbidden|not.?logged/i.test(`${e?.message ?? ""} ${e?.extensions?.code ?? ""}`));
}

/**
 * 校验当前登录态是否仍然有效。
 * @returns true = 已登录且 token 有效；false = 未登录或 token 已失效（会话已清理）
 */
export async function ensureSession(): Promise<boolean> {
  const store = useAuthStore();
  // bearer 模式：Pinia 无用户即视为未登录（可能仅持有游客 token），无需网络校验
  if (!isCookieAuthMode() && !store.session?.user?.id) return false;

  // bearer 模式才依赖本地 token；cookie 模式直接由服务端会话判定（SSR 透传 cookie）
  if (!isCookieAuthMode()) {
    const token = readVendureTokenWithContext();
    if (!token) {
      clearSessionEverywhere();
      return false;
    }
  }

  const { public: cfg } = useRuntimeConfig();
  const host = (cfg.GQL_HOST as string | undefined) || "";
  const channelToken = (cfg.channelToken as string | undefined) || "";
  // 缺少上游地址时无法校验：放行，避免误锁（该分支只可能出现在配置缺失的异常环境）
  if (!host) return true;

  try {
    const res = await fetch(host, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...vendureAuthHeaders(),
        ...(channelToken ? { "vendure-token": channelToken } : {}),
      },
      body: JSON.stringify({ query: ME_QUERY }),
      signal: requestTimeoutSignal(),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { activeCustomer?: { id?: string } | null };
      errors?: Array<{ message?: string; extensions?: { code?: string } }>;
    } | null;

    // 网络/解析失败：降级放行，不清会话（下一次导航会再次校验）
    if (!json) return true;

    const errors = json.errors ?? [];
    const expired = res.status === 401 || isSessionError(errors);
    if (expired || !json.data?.activeCustomer?.id) {
      clearSessionEverywhere();
      return false;
    }
    return true;
  } catch {
    // 超时/断网：降级放行
    return true;
  }
}
