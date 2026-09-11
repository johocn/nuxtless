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
const CALLBACK_PATH = "/account/sso-callback";

/** 微信内置浏览器 UA 检测（首个发起点：首页/登录页/引导条共用） */
export function isWechatBrowser(): boolean {
  if (typeof window === "undefined" || !navigator?.userAgent) return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

/** 同源判定，防止 return_url 开放重定向 */
function isSameHost(url: string): boolean {
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

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

  /** 指定页面（默认登录页）的完整回调地址（origin + 租户前缀 + 页面路径）。统一页登录成功后回跳该地址携带 token */
  function redirectUri(path = "/account/login"): string {
    const localePath = useTenantLocalePath();
    return `${window.location.origin}${localePath(path)}`;
  }

  /** 由 SSO baseUrl（如 https://h.joho.cn/api/zhao-sso）推导统一登录页地址（https://h.joho.cn/#/pages/sso/login） */
  function unifiedLoginUrl(provider: SsoProviderInfo): string {
    const origin = new URL(provider.baseUrl).origin;
    return `${origin}${UNIFIED_LOGIN_PATH}`;
  }

  /** 跳转到 h.joho.cn 统一登录页；登录成功后回跳 returnUrl（默认登录页），并携带 token。
   *  首页自动登录可传 opts.returnUrl 指定回跳首页。 */
  function loginWithSso(provider: SsoProviderInfo, opts?: { returnUrl?: string; redirectPath?: string }) {
    const params: Record<string, string> = {
      app_code: provider.clientId,
      return_url: opts?.returnUrl ?? redirectUri(opts?.redirectPath),
    };
    if (provider.channelCode) params.channel_code = provider.channelCode;
    sessionStorage.setItem("youshop_sso_provider", provider.providerKey);
    const url = `${unifiedLoginUrl(provider)}?${new URLSearchParams(params).toString()}`;
    window.location.href = url;
  }

  /** 直连微信授权：跳过 h.joho.cn 统一页，直接把邀请码编入 SSO state。
   *  redirect_uri 指向 nshop 自带回调页并携带 ?return_url=<原分享页>；
   *  微信回调后 SSO 自动 buildReferralRelation 建分销关系，再回跳回调页。 */
  function loginWithWechat(
    provider: SsoProviderInfo,
    opts?: { inviteCode?: string; returnUrl?: string; redirectPath?: string },
  ) {
    const callbackUrl = `${window.location.origin}${redirectUri(CALLBACK_PATH)}`;
    const fallback = opts?.returnUrl ?? redirectUri(opts?.redirectPath);
    const returnUrl = opts?.returnUrl && isSameHost(opts.returnUrl)
      ? opts.returnUrl
      : (isSameHost(fallback) ? fallback : redirectUri());
    const redirectUriWithReturn = `${callbackUrl}?return_url=${encodeURIComponent(returnUrl)}`;

    const params: Record<string, string> = {
      app_code: provider.clientId,
      redirect_uri: redirectUriWithReturn,
      invite_code: opts?.inviteCode ?? "",
      channel_code: provider.channelCode ?? "",
      app_type: isWechatBrowser() ? "official_account" : "open_platform",
    };

    sessionStorage.setItem("youshop_sso_provider", provider.providerKey);
    sessionStorage.setItem("youshop_sso_app_code", provider.clientId);
    sessionStorage.setItem("youshop_sso_redirect_uri", callbackUrl);
    sessionStorage.setItem("youshop_sso_base_url", provider.baseUrl);

    window.location.href = `${provider.baseUrl}/v1/auth/wechat?${new URLSearchParams(params).toString()}`;
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

  /** 用微信回调拿到的 authorization code 向 SSO 兑令牌（前端代理，不暴露 app_secret）。
   *  返回 SSO 原始响应 { accessToken, refreshToken, user:{ inviteCode }, is_new }。 */
  async function exchangeSsoAuthCode(
    provider: SsoProviderInfo,
    code: string,
    redirectUriStr: string,
  ): Promise<{ accessToken?: string; user?: { inviteCode?: string } } | null> {
    try {
      const res = await fetch(`${provider.baseUrl}/v1/auth/exchange-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          app_code: provider.clientId,
          redirect_uri: redirectUriStr,
        }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /** 完整登录收口：SSO 兑令牌 → Vendure authenticate 建会话 → 写用户（含邀请码）。回调页统一走这里。 */
  async function ssoLoginWithCode(
    provider: SsoProviderInfo,
    code: string,
    redirectUriStr: string,
  ): Promise<SsoLoginResult | null> {
    const sso = await exchangeSsoAuthCode(provider, code, redirectUriStr);
    if (!sso?.accessToken) return null;
    const result = await exchangeSsoAccessToken(provider.providerKey, sso.accessToken);
    if (result?.id) {
      const payload: { id: string; email: string } = {
        id: result.id,
        email: result.identifier ?? "",
      };
      const authStore = useAuthStore();
      authStore.setUser(payload);
    }
    return result;
  }

  /** 向 SSO 申请微信 JS-SDK 签名（用于自定义分享卡片），失败返回 null 由调用方静默降级 */
  async function fetchJssdkSignature(url: string): Promise<{
    appId?: string; timestamp?: number; nonceStr?: string; signature?: string;
  } | null> {
    try {
      const host = sessionStorage.getItem("youshop_sso_base_url") ?? "";
      if (!host) return null;
      const res = await fetch(`${host}/v1/auth/jssdk-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, appType: "official_account" }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
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
    loginWithWechat,
    exchangeSsoAccessToken,
    exchangeSsoAuthCode,
    ssoLoginWithCode,
    fetchJssdkSignature,
    hasPendingCallback,
    clearSsoState,
  };
}