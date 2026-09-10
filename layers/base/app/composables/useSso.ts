import { readVendureSessionToken } from "../utils/vendure-session";

export interface SsoProviderInfo {
  name: string;
  providerKey: string;
  protocol: string;
  baseUrl: string;
  authorizeUrl?: string;
  clientId: string;
  channelCode?: string;
}

interface SsoLoginResult {
  id?: string;
  identifier?: string;
  errorCode?: string;
  message?: string;
}

const UNIFIED_LOGIN_PATH = "/#/pages/sso/login";

/** www.youshop.cn C 端商城 SSO（zhao-sso → h.joho.cn）登录。
 *  流程（统一页 token 直验）：
 *  1) 提供商配置从当前渠道 vendure shop-api `ssoProviders` 动态读取（不硬编码域名）；
 *  2) 跳转 h.joho.cn 统一登录页，登录成功后回跳 return_url 并携带 token/user；
 *  3) 回调页把 token 作为 accessToken 提交 Vendure authenticate 直验换会话。 */
export function useSso() {
  const { token: channelToken } = useTenantChannel();
  const gqlHost = useGqlHostUrl();

  function baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (channelToken.value) headers["vendure-token"] = channelToken.value;
    return headers;
  }

  /** 取当前渠道启用的 zhao-sso 提供商列表（协议过滤，只保留 zhao-sso） */
  async function fetchProviders(): Promise<SsoProviderInfo[]> {
    if (!gqlHost) return [];
    const res = await fetch(gqlHost, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        query: `{ ssoProviders { name providerKey protocol baseUrl authorizeUrl clientId channelCode } }`,
      }),
    });
    const json = await res.json();
    const list: SsoProviderInfo[] = json?.data?.ssoProviders ?? [];
    return list.filter((p) => p.protocol === "zhao-sso");
  }

  /** 当前登录页的完整回调地址（origin + 租户前缀 + 页面路径）。统一页登录成功后回跳本地址携带 token */
  function redirectUri(): string {
    const localePath = useTenantLocalePath();
    return `${window.location.origin}${localePath("/account/login")}`;
  }

  /** 由 SSO baseUrl（如 https://h.joho.cn/api/zhao-sso）推导统一登录页地址（https://h.joho.cn/#/pages/sso/login） */
  function unifiedLoginUrl(provider: SsoProviderInfo): string {
    const origin = new URL(provider.baseUrl).origin;
    return `${origin}${UNIFIED_LOGIN_PATH}`;
  }

  /** 跳转到 h.joho.cn 统一登录页；登录成功后回跳 redirectUri 并携带 token */
  function loginWithSso(provider: SsoProviderInfo) {
    const params: Record<string, string> = {
      app_code: provider.clientId,
      return_url: redirectUri(),
    };
    if (provider.channelCode) params.channel_code = provider.channelCode;
    sessionStorage.setItem("youshop_sso_provider", provider.providerKey);
    const url = `${unifiedLoginUrl(provider)}?${new URLSearchParams(params).toString()}`;
    window.location.href = url;
  }

  /** 用统一页回跳的 accessToken 直验换 Vendure SSO 会话；成功返回 CurrentUser，失败返回 null */
  async function exchangeSsoAccessToken(
    providerKey: string,
    accessToken: string,
  ): Promise<SsoLoginResult | null> {
    if (!gqlHost) return null;
    const authStore = useAuthStore();
    const headers = baseHeaders();
    const guestToken = authStore.session?.token ?? readVendureSessionToken();
    if (guestToken) headers.authorization = `Bearer ${guestToken}`;

    const res = await fetch(gqlHost, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        query: `mutation Authenticate($input: AuthenticationInput!) {
          authenticate(input: $input) {
            ...on CurrentUser { id identifier }
            ...on ErrorResult { errorCode message }
          }
        }`,
        variables: { input: { sso: { providerKey, accessToken } } },
      }),
    });
    const newToken = res.headers.get("vendure-auth-token");
    if (newToken) authStore.setSession(newToken);
    const json = await res.json();
    return json?.data?.authenticate ?? null;
  }

  /** 是否有待处理的 SSO 回调（URL 带 token 且 sessionStorage 记录了发起时选择的 provider） */
  function hasPendingCallback(token?: string | null): boolean {
    if (!token) return false;
    return !!sessionStorage.getItem("youshop_sso_provider");
  }

  function clearSsoState() {
    sessionStorage.removeItem("youshop_sso_provider");
  }

  return {
    fetchProviders,
    loginWithSso,
    exchangeSsoAccessToken,
    hasPendingCallback,
    clearSsoState,
  };
}