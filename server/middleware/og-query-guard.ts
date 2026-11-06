/**
 * /_og 查询参数守卫（S3）
 *
 * nuxt-og-image 的 strict 签名只覆盖路径里的 encoded options，不覆盖 query string，
 * 因此签名 URL 后追加任意 `?_v=...` 仍会 200，可被用来绕开 CDN/浏览器缓存指纹。
 * strict 模式（存在 secret）下拒绝所有 query 参数：签名声明里没有任何 query 键。
 */

export default defineEventHandler((event) => {
  const url = getRequestURL(event);
  if (!url.pathname.startsWith("/_og/")) return;

  const cfg = useRuntimeConfig()["nuxt-og-image"] as
    | { security?: { secret?: string; strict?: boolean } }
    | undefined;
  if (!cfg?.security?.secret || !cfg.security.strict) return;

  if (url.searchParams.size > 0) {
    throw createError({
      statusCode: 403,
      statusMessage: "[OG Image] Unexpected query parameters on signed URL",
    });
  }
});
