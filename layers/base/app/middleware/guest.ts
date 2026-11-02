import { ensureSession } from "../utils/session-guard";

export default defineNuxtRouteMiddleware(async () => {
  // 只用「有效登录态」判定：token 失效时 ensureSession 会清会话并返回 false，
  // 登录/注册页因此可以正常进入（不再被旧的 Pinia 用户信息弹回 /account）。
  if (await ensureSession()) {
    return navigateTo(useTenantLocalePath()("/account"), { replace: true });
  }
});
