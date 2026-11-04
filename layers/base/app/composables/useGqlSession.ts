import type { ActiveOrder } from "~~/types/order";
import type { LogInResult } from "~~/types/customer";
import { readVendureTokenWithContext } from "../utils/vendure-session";
import { requestTimeoutSignal } from "../utils/request-timeout";

// 后端以 GraphQL errors 返回的登录失败（如 LOGIN_RATE_LIMITED），无 data.login。
export type LoginGraphQLError = {
  errorCode: string;
  message: string;
  retryAfterSeconds?: number;
};

type LoginResponse = {
  data?: { login?: LogInResult };
  errors?: Array<{
    message?: string;
    extensions?: { code?: string; retryAfterSeconds?: number };
  }>;
};

/** 解析 login 响应：成功取 data.login；失败取 GraphQL errors（如 LOGIN_RATE_LIMITED）。 */
export function parseLoginResponse(json: LoginResponse): LogInResult | LoginGraphQLError | null {
  if (json.data?.login) return json.data.login;

  const gqlError = json.errors?.[0];
  if (!gqlError) return null;

  return {
    errorCode: gqlError.extensions?.code ?? "UNKNOWN_ERROR",
    message: gqlError.message ?? "",
    ...(typeof gqlError.extensions?.retryAfterSeconds === "number"
      ? { retryAfterSeconds: gqlError.extensions.retryAfterSeconds }
      : {}),
  };
}

// 统一会话入口：login 返回登录结果（CurrentUser | ErrorResult），default 返回活跃订单。
// token 捕获依赖手写 fetch 读取 vendure-auth-token 响应头（typed client 无此能力）。
export async function useGqlSession(
  locale: string,
  gqlHost: string | undefined,
  channelToken: string,
  queryType?: "default",
): Promise<ActiveOrder | null>;
export async function useGqlSession(
  locale: string,
  gqlHost: string | undefined,
  channelToken: string,
  queryType: "login",
  variables: Record<string, unknown>,
): Promise<LogInResult | LoginGraphQLError | null>;
export async function useGqlSession(
  locale: string,
  gqlHost: string | undefined,
  channelToken: string,
  queryType: "default" | "login" = "default",
  variables?: Record<string, unknown>,
): Promise<ActiveOrder | LogInResult | LoginGraphQLError | null> {
  if (!gqlHost) {
    console.error("useGqlSession: GQL_HOST is not defined");
    return null;
  }

  const authStore = useAuthStore();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 会话 token 单一来源 cookie（vendure_shop_token，登录态/游客共用），
  // 保证 login 请求带上游客 token，Vendure 才能把游客购物车合并到登录用户。
  const token = readVendureTokenWithContext();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (channelToken) {
    headers["vendure-token"] = channelToken;
  }
  if (locale) {
    headers["Accept-Language"] = locale;
  }

  const query =
    queryType === "login"
      ? `
    mutation LogInUser($emailAddress: String!, $password: String!, $rememberMe: Boolean!) {
      login(username: $emailAddress, password: $password, rememberMe: $rememberMe) {
        ... on CurrentUser {
          id
          identifier
        }
        ... on ErrorResult {
          errorCode
          message
        }
      }
    }
  `
      : `
    query ActiveOrder {
      activeOrder {
        id
        state
      }
    }
  `;

  try {
    // locale 须经 Vendure LanguageCode 映射（zh-CN → zh_Hans），与全仓口径一致
    const res = await fetch(`${gqlHost}?languageCode=${toVendureLanguageCode(locale)}`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ query, variables }),
      // SSR 5s / 客户端 10s；超时走下方 catch 返回 null（页面按未登录/无活跃订单降级）
      signal: requestTimeoutSignal(),
    });

    const newToken = res.headers.get("vendure-auth-token");
    if (newToken) {
      headers.authorization = `Bearer ${newToken}`;
      authStore.setSession(newToken);
    }

    useGqlHeaders(headers);

    const json = (await res.json()) as LoginResponse & {
      data?: { login?: LogInResult; activeOrder?: ActiveOrder };
    };

    // 限流等失败以 GraphQL errors 返回（无 data），需透传给登录界面，否则会被当成通用失败。
    if (queryType === "login") return parseLoginResponse(json);
    return json.data?.activeOrder ?? null;
  } catch (error) {
    console.error("Failed to fetch session token:", error);
    return null;
  }
}
