/**
 * 租户渠道路由注入（必须在 app.vue setup 之前完成）
 *
 * app.vue 在 setup 顶层就 `await loadTheme()`（SSR 第一发 GQL），因此渠道 token 必须在
 * 插件阶段写好，否则整个 SSR 首帧都会取到默认渠道的数据。
 *
 * 数据来源：
 * - 服务端：Nitro 中间件（server/middleware/tenant.ts）已把命中结果写进 event.context.tenant，
 *   这里同步读取，零网络开销；
 * - 客户端首帧：直接复用 SSR payload 里的 useState("tenantResolve")；
 * - 客户端冷启动（SPA）：走 /api/tenant/resolve 兜底。
 *
 * 刻意不在这里判定 404：本插件按 URL 首段猜租户，无法区分「租户段」与「静态首段」
 * （反例 /en/product/foo）。404 统一由 middleware/tenant.global.ts 依据 route.params 判定。
 */

import { appLocales } from "../../i18n/locales";
import type { TenantHit, TenantResolve } from "../composables/useTenantChannel";

const LOCALE_CODES = new Set(appLocales.map((l) => String(l.code)));

/** 取 URL 首段（跳过 i18n 前缀）；无则返回空串 */
function tenantCodeFromPath(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean);
  let i = 0;
  if (segs[i] && LOCALE_CODES.has(segs[i] as string)) i++;
  return segs[i] ?? "";
}

export default defineNuxtPlugin(async () => {
  const state = useState<TenantResolve | null>("tenantResolve", () => null);
  const { activeTenant, applyResolved } = useTenantChannel();

  if (!state.value) {
    const pathname = import.meta.server ? useRequestURL().pathname : window.location.pathname;
    const code = tenantCodeFromPath(pathname);

    if (!code) {
      state.value = { status: "none" };
    } else if (import.meta.server) {
      const ctx = useRequestEvent()?.context as { tenant?: TenantHit } | undefined;
      state.value = ctx?.tenant ?? { status: "none" };
    } else {
      state.value = await $fetch<TenantResolve>("/api/tenant/resolve", { query: { code } }).catch(
        () => ({ status: "none" as const }),
      );
    }
  }

  if (state.value.status === "ok") applyResolved(state.value);
  else activeTenant.value = null;
});
