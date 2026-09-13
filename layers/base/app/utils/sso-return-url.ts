/** SSO 回跳目标归一化 + 全站自动登录跳过页判定（纯函数，供 useSso / useAutoWechatSsoLogin 复用）。
 *  背景：Vue Router 的 resolveRelativePath 对不以 / 开头的 location 按相对路径解析，
 *  把完整 URL 直接交给 router.replace 会基于当前路由目录拼出
 *  /account/https://www.youshop.cn/ 这类错误地址，回跳目标必须先归一化为路由安全路径。 */

/** 同源 URL 归一化为路由安全相对路径（pathname+search+hash）；非同源或非法返回 null */
export function toRouterSafePath(raw: string, origin: string): string | null {
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

/** 解析 SSO 回跳目标：sessionStorage 优先、query 兜底；同源校验 + 归一化；都无效返回空串 */
export function resolveSsoReturnUrl(
  session: string | null,
  queryRaw: string | null,
  origin: string,
): string {
  const fromSession = session ? toRouterSafePath(session, origin) : null;
  if (fromSession) return fromSession;
  return (queryRaw ? toRouterSafePath(queryRaw, origin) : null) ?? "";
}

/** 全站自动登录跳过页（按路径后缀匹配，兼容租户前缀 /t2/... 与登录页别名 /login）：
 *  登录页自带微信自动跳转流程、注册页有明确注册意图、回调页是 SSO 流程中段 */
export function shouldSkipAutoLogin(path: string): boolean {
  return /\/(account\/)?(login|register|sso-callback)$/.test(path);
}
