export default defineNuxtRouteMiddleware(() => {
  // persistedstate 默认走 cookies storage，SSR 阶段 useCookie 可读请求头 Cookie，
  // 因此服务端即可准确判断认证状态并直接重定向，避免客户端闪烁与竞态。
  const { isAuthenticated } = storeToRefs(useAuthStore());
  if (!isAuthenticated.value) {
    return navigateTo(useLocalePath()("/account/login"), { replace: true });
  }
});
