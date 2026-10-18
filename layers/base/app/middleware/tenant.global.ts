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
import type { H3Event } from "h3";
import { sendRedirect } from "h3";
import { appLocales } from "../../i18n/locales";

/** 语言前缀集合（与 plugins/tenant-channel.ts 同口径）；guard 里不能用 useI18n（需组件实例） */
const LOCALE_CODES = new Set(appLocales.map((l) => String(l.code).toLowerCase()));

export default defineNuxtRouteMiddleware(async (to) => {
  // ⚠️ Nuxt 上下文规则：composable 必须在第一个 await 之前同步取好（await 之后 instance 丢失），
  // 券店 guard（couponStoreGuard）在 await 链深处执行，依赖全部从这里闭包传入。
  const storefront = useStorefrontMode();
  const channelTheme = useChannelTheme();
  const event = useRequestEvent();

  const code = (to.params.tenantCode as string) || "";
  const state = useState<TenantResolve | null>("tenantResolve", () => null);
  const { activeTenant, applyResolved } = useTenantChannel();

  if (!code) {
    // 无租户段 = 平台默认店（站内链接均由 useTenantLocalePath 带租户前缀，此处仅命中直链）
    state.value = { status: "none" };
    activeTenant.value = null;
    return;
  }

  // SSR 首帧已解析且租户一致 → 无需重复解析（券店拦截仍需执行，见 couponStoreGuard）
  if (state.value?.status === "ok" && state.value.code === code)
    return couponStoreGuard(to, { storefront, channelTheme, event });

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
    return couponStoreGuard(to, { storefront, channelTheme, event });
  }
  return showError(
    createError({ statusCode: 404, data: { kind: "shop-not-found" } }),
  );
});

/** 券店 guard 的闭包依赖（middleware 同步段取好，规避 await 后上下文丢失） */
interface CouponGuardDeps {
  storefront: ReturnType<typeof useStorefrontMode>;
  channelTheme: ReturnType<typeof useChannelTheme>;
  event: ReturnType<typeof useRequestEvent>;
}

/**
 * 券店模式路由拦截（storefrontMode=coupon 的租户，直连商品/分类/搜索/结算 URL 一律导到提示页）。
 * 放在租户裁决完成之后：此时渠道 token 已就位（applyResolved），loadTheme 拉到的才是当前租户数据。
 * 函数体内禁止调用任何 composable（useI18n/navigateTo 均需 nuxt instance，await 后已失）——
 * locale 前缀用 appLocales 静态集合识别；重定向用 sendRedirect（SSR）/location.replace（客户端）。
 */
const BLOCKED_PREFIXES = ["/product/", "/category", "/search", "/checkout"];

async function couponStoreGuard(
  to: Parameters<Parameters<typeof defineNuxtRouteMiddleware>[0]>[0],
  deps: CouponGuardDeps,
) {
  const { storefront, channelTheme, event } = deps;
  if (!storefront.isCouponStore.value) await channelTheme.loadTheme();
  if (!storefront.isCouponStore.value) return;

  const segs = to.path.split("/").filter(Boolean);
  let i = 0;
  let localePrefix = "";
  if (segs[i] && LOCALE_CODES.has(segs[i].toLowerCase())) {
    localePrefix = `/${segs[i]}`;
    i++;
  }
  const tenant = to.params.tenantCode as string | undefined;
  if (tenant && segs[i] === tenant) i++;
  const cleanPath = "/" + segs.slice(i).join("/");

  if (BLOCKED_PREFIXES.some((p) => cleanPath.startsWith(p)) && cleanPath !== "/coupon-only") {
    const target = `${localePrefix}/${tenant}/coupon-only`;
    if (import.meta.server && event) return sendRedirect(event, target, 302);
    window.location.replace(target);
    return false;
  }
}
