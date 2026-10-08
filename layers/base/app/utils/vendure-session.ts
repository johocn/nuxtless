/**
 * Vendure shop 会话 token 统一管理。
 *
 * Vendure shop API 通过响应头 `vendure-auth-token` 签发会话（含匿名游客），
 * 客户端必须将其以 `Authorization: Bearer <token>` 回传才能保持同一会话：
 * - 游客加购后 token 只存在于响应头，若丢弃则每次请求都是新匿名会话，购物车无法累积；
 * - 登录（login）必须带上游客 token，Vendure 才会把匿名购物车合并到登录用户。
 *
 * 客户端把 token 持久化到 cookie（页面刷新不丢），并让 nuxt-graphql-client
 * 在 `gql:auth:init` 钩子里每个请求注入。SSR 侧无 document，返回 null 不注入。
 */
export const VENDURE_AUTH_HEADER = "vendure-auth-token";
export const VENDURE_SESSION_COOKIE = "vendure_shop_token";

/** 会话 cookie 有效期：30 天（收敛自 1 年——缩小被窃 token 的可用窗口，
 *  与「复访免登」体验平衡；服务端会话另有 Vendure 自身 TTL） */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function decodeCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!m || m[1] === undefined) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1] ?? null;
  }
}

/** 仅客户端读取会话 token（SSR 无 document 时返回 null） */
export function readVendureSessionToken(): string | null {
  if (typeof document === "undefined") return null;
  return decodeCookie(VENDURE_SESSION_COOKIE);
}

/** 上下文自适应读取会话 token：客户端读 document.cookie；SSR 在 Nuxt 上下文内
 *  经 useCookie 读请求头里的 cookie（能力等价于旧版从 persistedstate auth cookie
 *  读 token 的 SSR 路径，但 token 只存这一份 cookie，不再双份持久化）。
 *  非 Nuxt 上下文/读不到返回 null。 */
export function readVendureTokenWithContext(): string | null {
  if (typeof document !== "undefined") return decodeCookie(VENDURE_SESSION_COOKIE);
  try {
    const cookie = useCookie<string | null>(VENDURE_SESSION_COOKIE);
    return cookie.value || null;
  } catch {
    return null;
  }
}

/** 仅在客户端持久化会话 token 到 cookie；token 为 null 表示清除 */
export function writeVendureSessionToken(token: string | null): void {
  if (typeof document === "undefined") return;
  // 生产环境（HTTPS）为会话 cookie 追加 Secure，避免明文链路/中间人窃取；
  // 本地 dev 走 http，加 Secure 会导致 cookie 无法写入，故按 NODE_ENV 区分。
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  document.cookie = token
    ? `${VENDURE_SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
    : `${VENDURE_SESSION_COOKIE}=; path=/; max-age=0`;
}