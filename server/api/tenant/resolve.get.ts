/**
 * 租户解析接口（客户端软导航 / SPA 冷启动兜底）
 *
 * GET /api/tenant/resolve?code=t1
 *   → { status: "ok", code, token, name }  命中已知渠道
 *   → { status: "unknown", code }          渠道不存在或已停用
 *   → { status: "none" }                   code 为空
 *
 * 传入 fresh=1 时先强制刷新一次租户表（带 5s 频控），用于「后台刚启用渠道 → 立即切换」
 * 的场景，绕过 SWR 的 60s TTL 窗口。
 *
 * 返回的 token 与现有公开查询 resolveChannelByCode 同口径（浏览器本就以 vendure-token
 * 请求头携带渠道 token），无新增信息暴露面。
 */

import { refreshTenantRegistryForced, resolveTenant } from "../../utils/tenant-registry";
import type { TenantResolve } from "../../utils/tenant-registry";

export default defineEventHandler(async (event): Promise<TenantResolve> => {
  const q = getQuery(event);
  const code = String(q.code || "").trim();
  if (!code) return { status: "none" };

  // 切换店铺前先强制刷新一次租户表，避免「后台刚启用渠道但路由仍 404」（SWR 60s 窗口）
  if (String(q.fresh || "") === "1") await refreshTenantRegistryForced();

  const hit = await resolveTenant(code);
  return hit ?? { status: "unknown", code };
});
