/**
 * 券店模式路由拦截：storefrontMode=coupon 的租户，直连商品/分类/搜索/结算 URL
 * 一律导到「本店仅售买单券」提示页。前缀剥离逻辑对齐 layouts/default.vue 的
 * stripRoutePrefixes（语言前缀 + 租户前缀），避免 /t1/product/x 被误判。
 */
const BLOCKED_PREFIXES = ["/product/", "/category", "/search", "/checkout"];

export default defineNuxtRouteMiddleware((to) => {
  const { isCouponStore } = useStorefrontMode();
  if (!isCouponStore.value) return;

  const { locale } = useI18n();
  const segs = to.path.split("/").filter(Boolean);
  let i = 0;
  if (segs[i]?.toLowerCase() === (locale.value ?? "").toLowerCase()) i++;
  const tenant = to.params.tenantCode as string | undefined;
  if (tenant && segs[i] === tenant) i++;
  const cleanPath = "/" + segs.slice(i).join("/");

  if (BLOCKED_PREFIXES.some((p) => cleanPath.startsWith(p)) && cleanPath !== "/coupon-only") {
    const localePath = useTenantLocalePath();
    return navigateTo(localePath("/coupon-only"), { replace: true });
  }
});
