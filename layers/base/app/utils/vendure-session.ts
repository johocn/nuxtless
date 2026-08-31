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

/** 仅在客户端持久化会话 token 到 cookie；token 为 null 表示清除 */
export function writeVendureSessionToken(token: string | null): void {
  if (typeof document === "undefined") return;
  document.cookie = token
    ? `${VENDURE_SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=31536000; SameSite=Lax`
    : `${VENDURE_SESSION_COOKIE}=; path=/; max-age=0`;
}