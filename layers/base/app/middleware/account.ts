export default defineNuxtRouteMiddleware(() => {
  // isAuthenticated 依赖 localStorage（persistedstate），SSR 阶段恒为 false，
  // 因此只在客户端执行守卫，避免服务端误跳转。
  if (import.meta.server) return;

  const { isAuthenticated } = storeToRefs(useAuthStore());
  if (!isAuthenticated.value) {
    return navigateTo(useLocalePath()("/account/login"), { replace: true });
  }
});
