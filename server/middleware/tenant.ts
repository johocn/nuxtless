/**
 * 多租户运行时解析（Nitro 中间件）
 *
 * 职责：**只做正向命中提示**。URL 首段（跳过 i18n 前缀）命中已知渠道时，把结果写入
 * `event.context.tenant`，供 Vue 插件在 app.vue setup 之前同步取用，保证 SSR 首帧就用对渠道。
 *
 * 刻意不做的事：
 * - **不判 404**。Nitro 拿不到 vue-router 的匹配结果，无法区分「租户段」与「静态首段」
 *   （反例：`/en/product/foo` 的首段是 `product`，并非租户）。404 判定统一交给 Vue 全局路由
 *   中间件，依据 `to.params.tenantCode`（vue-router 已按静态段优先完成消歧）。
 * - 不处理静态资源：`/favicon.ico`、`/_nuxt/**`、`/_og/**` 与 `/shop-api` 直接放行。
 */

import { appLocales } from "../../layers/base/i18n/locales";
import { resolveTenant } from "../utils/tenant-registry";
import type { TenantHit } from "../utils/tenant-registry";

const LOCALE_CODES = new Set(appLocales.map((l) => String(l.code)));

export default defineEventHandler(async (event) => {
  // 只对「导航请求」解析：Accept 为空视作导航（curl / 部分工具不带 Accept），
  // 明确声明非 HTML 且不接受任意类型（如图片、JSON）的请求直接放行。
  const accept = getRequestHeader(event, "accept") || "";
  if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return;

  const pathname = getRequestURL(event).pathname;
  if (pathname.startsWith("/_") || pathname.startsWith("/api/") || pathname.includes(".")) return;

  const segments = pathname.split("/").filter(Boolean);
  let i = 0;
  // i18n strategy=prefix_except_default：默认中文无前缀，其余语言带静态前缀（/en、/ja...）
  if (segments[i] && LOCALE_CODES.has(segments[i] as string)) i++;
  const code = segments[i];
  if (!code) return;

  const hit = await resolveTenant(code);
  // 命中才写；未命中什么都不做（由 Vue 路由层用 route.params.tenantCode 判定 404）
  if (hit) (event.context as { tenant?: TenantHit }).tenant = hit;
});
