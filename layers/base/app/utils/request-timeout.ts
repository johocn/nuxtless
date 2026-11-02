// 统一请求超时：SSR 5s（更快失败并降级），客户端 10s。
// 用法：fetch(url, { ..., signal: requestTimeoutSignal() })；
//       $fetch(url, { ..., signal: requestTimeoutSignal() })。
// 超时会让 Promise 以 AbortError 拒绝，调用方必须 catch 并走降级（空态/默认主题/重试入口）。

export const SSR_TIMEOUT_MS = 5_000;
export const CLIENT_TIMEOUT_MS = 10_000;

/** SSR 环境没有 window；用 typeof window 判定，避免依赖 Nuxt 编译期宏。 */
export function isServerRequest(): boolean {
  return typeof window === "undefined";
}

export function requestTimeoutMs(): number {
  return isServerRequest() ? SSR_TIMEOUT_MS : CLIENT_TIMEOUT_MS;
}

/** AbortSignal.timeout 的兼容封装（老浏览器不支持时退回 AbortController + setTimeout）。 */
export function requestTimeoutSignal(ms: number = requestTimeoutMs()): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
