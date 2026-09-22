export interface SsoProviderCandidate {
  protocol: string;
  providerKey: string;
}

export type ProviderSource = "prefetched" | "live" | "none";

export interface ResolvedProvider {
  provider: SsoProviderCandidate | null;
  source: ProviderSource;
}

/** 跳转提供商选取：预取命中最优先；为空/未就绪回退实时；皆空为 none。
 *  纯函数，便于单测；调用方保证两入参均已按 protocol==="zhao-sso" 过滤。 */
export function selectPrimaryProvider(
  prefetched: SsoProviderCandidate[] | null | undefined,
  live: SsoProviderCandidate[] | null | undefined,
): ResolvedProvider {
  if (prefetched && prefetched.length > 0) {
    return { provider: prefetched[0], source: "prefetched" };
  }
  if (live && live.length > 0) {
    return { provider: live[0], source: "live" };
  }
  return { provider: null, source: "none" };
}

export interface OverlayGate {
  pending: boolean;
  authenticated: boolean;
  isWechat: boolean;
}

/** 品牌等待遮罩是否应显示：等待中 且 未登录 且 微信内置浏览器。 */
export function shouldShowOverlay(g: OverlayGate): boolean {
  return g.pending && !g.authenticated && g.isWechat;
}