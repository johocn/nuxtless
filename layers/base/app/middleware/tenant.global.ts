/**
 * 多租户路由全局中间件：判定 404 + 客户端软导航切店
 *
 * 这是唯一有资格判定「首段是不是租户」的地方 —— 依据 `to.params.tenantCode`。
 * vue-router 按「静态段优先」完成消歧，因此 `/en/product/foo` 的 `product` 不会被当成租户，
 * 而 `/foobar` 会被当成租户 → 查不到 → 404。
 *
 * SSR 首帧的命中结果已由 plugins/tenant-channel.ts 从 event.context.tenant 写好，这里只补负向判定。
 * 注意：缺省时 route.params.tenantCode 是空字符串 ""（不是 undefined），必须用 falsy 判断。
 */

import type { TenantResolve } from "../composables/useTenantChannel";

export default defineNuxtRouteMiddleware(async (to) => {
  const code = (to.params.tenantCode as string) || "";
  const state = useState<TenantResolve | null>("tenantResolve", () => null);
  const { activeTenant, applyResolved } = useTenantChannel();

  if (!code) {
    // 无租户段 = 平台默认店（站内链接均由 useTenantLocalePath 带租户前缀，此处仅命中直链）
    state.value = { status: "none" };
    activeTenant.value = null;
    return;
  }

  // SSR 首帧已解析且租户一致 → 无需重复解析
  if (state.value?.status === "ok" && state.value.code === code) return;

  if (import.meta.server) {
    // 服务端命中结果由 Nitro 中间件给出；走到这里说明未命中 → 404
    // kind 供 error.vue 区分「店铺不存在」与「页面不存在」（错误态下 route.params 不可靠）
    const evt = useRequestEvent();
    if (evt) setResponseStatus(evt, 404);
    return showError(
      createError({ statusCode: 404, data: { kind: "shop-not-found" } }),
    );
  }

  // 客户端软导航：解析目标租户（接口不可用时按「未命中」处理，避免未捕获的 reject）
  const res = await $fetch<TenantResolve>("/api/tenant/resolve", { query: { code } }).catch(
    () => ({ status: "unknown", code }) as TenantResolve,
  );
  if (res.status === "ok") {
    state.value = res;
    applyResolved(res);
    return;
  }
  return showError(
    createError({ statusCode: 404, data: { kind: "shop-not-found" } }),
  );
});
