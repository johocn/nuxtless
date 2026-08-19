export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) return;

  const { isAuthenticated } = storeToRefs(useAuthStore());
  if (isAuthenticated.value) {
    return navigateTo(useLocalePath()("/account"), { replace: true });
  }
});
