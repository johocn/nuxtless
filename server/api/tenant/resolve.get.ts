/**
 * 租户解析接口（客户端软导航 / SPA 冷启动兜底）
 *
 * GET /api/tenant/resolve?code=t1
 *   → { status: "ok", code, token, name }  命中已知渠道
 *   → { status: "unknown", code }          渠道不存在或已停用
 *   → { status: "none" }                   code 为空
 *   → { status: "rate_limited", retryAfterSeconds }  单 IP 超过 10 次/分钟
 *
 * 传入 fresh=1 时先强制刷新一次租户表（带 5s 频控），用于「后台刚启用渠道 → 立即切换」
 * 的场景，绕过 SWR 的 60s TTL 窗口。
 *
 * 返回的 token 与现有公开查询 resolveChannelByCode 同口径（浏览器本就以 vendure-token
 * 请求头携带渠道 token），无新增信息暴露面。公开接口按 IP 限流，避免被刷爆上游渠道查询。
 */

import { refreshTenantRegistryForced, resolveTenant } from "../../utils/tenant-registry";
import type { TenantResolve } from "../../utils/tenant-registry";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_BUCKETS = 5_000;

const buckets = new Map<string, { count: number; resetAt: number }>();

function hitRateLimit(ip: string): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [key, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(key);
      }
    }
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { limited: false, retryAfterSeconds: 0 };
  }
  if (bucket.count >= RATE_LIMIT) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { limited: false, retryAfterSeconds: 0 };
}

/**
 * 反代（1Panel OpenResty）用 $proxy_add_x_forwarded_for 追加真实来源，
 * 客户端可伪造 XFF 前缀；取最后一个（反代写入的）地址，避免伪造头绕过限流。
 */
function clientIp(event: H3Event): string {
  const xff = getRequestHeader(event, "x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return getRequestIP(event) || "unknown";
}

export default defineEventHandler(async (event): Promise<TenantResolve> => {
  const ip = clientIp(event);
  const limit = hitRateLimit(ip);
  if (limit.limited) {
    setResponseStatus(event, 429);
    setHeader(event, "Retry-After", String(limit.retryAfterSeconds));
    return { status: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
  }

  const q = getQuery(event);
  const code = String(q.code || "").trim();
  if (!code) return { status: "none" };

  // 切换店铺前先强制刷新一次租户表，避免「后台刚启用渠道但路由仍 404」（SWR 60s 窗口）
  if (String(q.fresh || "") === "1") await refreshTenantRegistryForced();

  const hit = await resolveTenant(code);
  return hit ?? { status: "unknown", code };
});
