import { ensureSession } from "../utils/session-guard";

export default defineNuxtRouteMiddleware(async () => {
  // 进入账户页前先校验 token 是否仍有效：失效会清 cookie + Pinia 并返回 false，
  // 避免「账户页 401 / 登录页被弹回」的死循环。
  if (await ensureSession()) return;
  return navigateTo(useTenantLocalePath()("/account/login"), { replace: true });
});
