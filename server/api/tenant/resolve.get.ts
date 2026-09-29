/**
 * 租户解析接口（客户端软导航 / SPA 冷启动兜底）
 *
 * GET /api/tenant/resolve?code=t1
 *   → { status: "ok", code, token, name }  命中已知渠道
 *   → { status: "unknown", code }          渠道不存在或已停用
 *   → { status: "none" }                   code 为空
 *
 * 返回的 token 与现有公开查询 resolveChannelByCode 同口径（浏览器本就以 vendure-token
 * 请求头携带渠道 token），无新增信息暴露面。
 */

import { resolveTenant } from "../../utils/tenant-registry";
import type { TenantResolve } from "../../utils/tenant-registry";

export default defineEventHandler(async (event): Promise<TenantResolve> => {
  const code = String(getQuery(event).code || "").trim();
  if (!code) return { status: "none" };

  const hit = await resolveTenant(code);
  return hit ?? { status: "unknown", code };
});
