import type { ActiveOrder } from "~~/types/order";
import type { LogInResult } from "~~/types/customer";

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
): Promise<LogInResult | null>;
export async function useGqlSession(
  locale: string,
  gqlHost: string | undefined,
  channelToken: string,
  queryType: "default" | "login" = "default",
  variables?: Record<string, unknown>,
): Promise<ActiveOrder | LogInResult | null> {
  if (!gqlHost) {
    console.error("useGqlSession: GQL_HOST is not defined");
    return null;
  }

  const authStore = useAuthStore();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = authStore.session?.token;
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (channelToken) {
    headers["vendure-channel-token"] = channelToken;
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
    const res = await fetch(`${gqlHost}?languageCode=${locale}`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const newToken = res.headers.get("vendure-auth-token");
    if (newToken) {
      headers.authorization = `Bearer ${newToken}`;
      authStore.setSession(newToken);
    }

    useGqlHeaders(headers);

    const json = (await res.json()) as {
      data?: { login?: LogInResult; activeOrder?: ActiveOrder };
    };

    if (queryType === "login") {
      return json.data?.login ?? null;
    }
    return json.data?.activeOrder ?? null;
  } catch (error) {
    console.error("Failed to fetch session token:", error);
    return null;
  }
}
