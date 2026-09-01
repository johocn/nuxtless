import {
  VENDURE_AUTH_HEADER,
  readVendureSessionToken,
  writeVendureSessionToken,
} from "./../app/utils/vendure-session";
import { useAuthStore } from "../stores/useAuthStore";

type GqlResponse = {
  headers?: { get(name: string): string | null };
  response?: { headers?: { get(name: string): string | null } };
};

/**
 * Vendure shop 会话统一管理：
 *
 * 1. 请求注入 —— 在每个 GraphQL 请求发出前（nuxt-graphql-client 触发
 *    `gql:auth:init` 钩子）注入 `Authorization: Bearer <token>`。
 *    token 来源：登录态 authStore（持久化 localStorage）→ 游客 cookie。
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

    // 登录态 authStore 优先（权威来源），游客/异常上下文回退 cookie。
    let value: string | null = null;
    if (import.meta.client) {
      try {
        value = useAuthStore().session?.token ?? null;
      } catch {
        value = null;
      }
    }
    value = value ?? readVendureSessionToken();
    if (value) {
      token.value = value.trim();
    }
  });
});