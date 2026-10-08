import {
  VENDURE_AUTH_HEADER,
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
 * 1. 请求注入 —— 在每个 GraphQL 请求发出前（nuxt-graphql-client 触发
 *    `gql:auth:init` 钩子）注入 `Authorization: Bearer <token>`。
 *    token 来源：vendure_shop_token cookie 单一来源（登录态/游客共用）。
 *
 * 2. 响应捕获 —— 通过 graphql-request `responseMiddleware` 读取响应头
 *    `vendure-auth-token` 并持久化到 cookie，使游客加购/页面刷新/登录切换
 *    都保持同一 Vendure 会话（缺失则每次都是新匿名会话，购物车会丢）。
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("gql:auth:init", ({ token, client }) => {
    if (client !== "default") return;

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