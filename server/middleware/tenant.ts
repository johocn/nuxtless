/**
 * 多租户运行时解析（Nitro 中间件）
 *
 * 职责：
 * 1. **正向命中**：URL 首段（跳过 i18n 前缀）命中已知渠道 → 写 `event.context.tenant`，
 *    供 Vue 插件在 app.vue setup 之前同步取用，保证 SSR 首帧就用对渠道；
 * 2. **域名归一**：首段未命中租户时，按访问域名（customDomains）解析，命中则 301 到
 *    `/<locale?>/<code>/<原路径>`，使站内链接天然带租户前缀（域名不变）。
 *
 * 刻意不做的事：
 * - **不判 404**。Nitro 拿不到 vue-router 的匹配结果，无法区分「租户段」与「静态首段」
 *   （反例 `/en/product/foo`）。404 统一交给 `middleware/tenant.global.ts` 判定。
 * - 不处理静态资源：命中排除清单的路径直接放行，绝不 301。
 */

import { appLocales } from "../../layers/base/i18n/locales";
import { resolveTenant, resolveTenantByDomain } from "../utils/tenant-registry";
import type { TenantHit } from "../utils/tenant-registry";

const LOCALE_CODES = new Set(appLocales.map((l) => String(l.code)));

/** 301 排除清单：这些前缀下的路径永不改写（静态资源 / 接口 / 站点地图） */
const EXCLUDE_PREFIXES = [
  "/_", // /_nuxt/ /_ipx/ /_og/
  "/api/",
  "/shop-api",
  "/admin-api",
  "/images/",
  "/static/",
  "/assets/",
];

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const pathname = url.pathname;

  if (EXCLUDE_PREFIXES.some((p) => pathname.startsWith(p))) return;
  // 带扩展名的请求（favicon.ico / robots.txt / sitemap.xml / *.js 等）一律放行
  if (pathname.includes(".")) return;

  // 只对「导航请求」解析：Accept 为空视作导航（curl / 部分工具不带 Accept），
  // 明确声明非 HTML 且不接受任意类型（如图片、JSON）的请求直接放行。
  const accept = getRequestHeader(event, "accept") || "";
  if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return;

  const segments = pathname.split("/").filter(Boolean);
  let i = 0;
  // i18n strategy=prefix_except_default：默认中文无前缀，其余语言带静态前缀（/en、/ja...）
  if (segments[i] && LOCALE_CODES.has(segments[i] as string)) i++;
  const code = segments[i];

  // 1) 路径首段命中租户 → 正向命中，无需改写
  if (code) {
    const hit = await resolveTenant(code);
    if (hit) {
      (event.context as { tenant?: TenantHit }).tenant = hit;
      return;
    }
  }

  // 2) 首段未命中 → 尝试按域名解析；命中则 301 归一为带 /<code> 的路径
  const host = getRequestHeader(event, "host") || "";
  if (!host) return;
  const byDomain = await resolveTenantByDomain(host);
  if (!byDomain) return;

  const target = "/" + [...segments.slice(0, i), byDomain.code, ...segments.slice(i)].join("/");
  return sendRedirect(event, `${target}${url.search}`, 301);
});
