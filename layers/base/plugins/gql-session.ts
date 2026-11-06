import {
  VENDURE_AUTH_HEADER,
  isCookieAuthMode,
  readVendureTokenWithContext,
  writeVendureSessionToken,
} from "./../app/utils/vendure-session";

type GqlResponse = {
  headers?: { get(name: string): string | null };
  response?: { headers?: { get(name: string): string | null } };
};

/**
 * Vendure shop 会话统一管理：
 *
 * cookie 模式（默认）：
 * - 客户端同源请求由浏览器自动携带 vshop_sid，不注入 Authorization；
 * - SSR 把浏览器请求的 `cookie` 头透传给 Vendure（Nitro 直连，不新造代理层），
 *   保证首屏 HTML 就带登录身份；
 * - 不把 `vendure-auth-token` 回写到 JS 可读 cookie（凭证只留在 HttpOnly cookie 里）。
 *
 * bearer 模式（回退开关 NUXT_PUBLIC_SHOP_AUTH_MODE=bearer）：
 * - 保持旧逻辑：请求注入 `Authorization: Bearer <token>`，响应头 token 持久化到
 *   vendure_shop_token，游客加购/刷新/登录切换保持同一会话。
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("gql:auth:init", ({ token, client }) => {
    if (client !== "default") return;

    // cookie 模式：不注入 Authorization，也不捕获 token 回写；
    // SSR 侧把浏览器请求的 cookie（含 vshop_sid）透传给 Vendure，首屏即可带身份。
    if (isCookieAuthMode()) {
      if (import.meta.server) {
        const cookie = useRequestHeaders(["cookie"]).cookie;
        if (cookie) useGqlHeaders({ cookie });
      }
      return;
    }

    // 首次请求时把响应头捕获器挂到 default client 上（此刻实例已就绪，
    // 且响应捕获与请求注入同源，保证顺序/时机正确）。
    const instance = (nuxtApp as any)._gqlState?.value?.default?.instance;
    if (instance?.requestConfig && !instance.requestConfig.responseMiddleware) {
      instance.requestConfig.responseMiddleware = (response: GqlResponse) => {
        if (typeof document === "undefined") return;
        const headers = response?.headers ?? response?.response?.headers;
        const sessionToken = headers?.get?.(VENDURE_AUTH_HEADER);
        if (sessionToken) writeVendureSessionToken(sessionToken);
      };
    }

    // token 单一来源：vendure_shop_token cookie（登录态与游客共用同一 cookie，
    // 由 responseMiddleware / authStore.setSession 双写维护）。SSR 经 useCookie 读
    // 请求头 cookie，能力等价旧版「persistedstate auth cookie」路径，但凭证只持久化
    // 一份。这里**不能**用 `import.meta.client` 限定：SSR 期的鉴权查询（如订单详情
    // GetOrderByCode）必须带 Authorization → 否则结果 null 被写进 payload，客户端
    // hydrate 后不再重取 → 直链/硬刷新订单详情会误报「未找到订单」（2026-09-25 修复）。
    const value = readVendureTokenWithContext();
    if (value) {
      token.value = value.trim();
    }
  });
});
