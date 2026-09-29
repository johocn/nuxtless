import tenantChannels from "../../data/tenant-channels.json";

export type TenantMapEntry = { code: string; token: string; name?: string };

/** 租户解析结果（Nitro /api/tenant/resolve 与 SSR 首帧 event.context.tenant 的统一形态） */
export type TenantResolve =
  | { status: "ok"; code: string; token: string; name: string }
  | { status: "unknown"; code: string }
  | { status: "none" };

/** 当前租户渠道的统一入口：由 URL 首段解析出的租户 code -> channel token。
 *
 *  数据源优先「运行时租户表」（Nitro 中间件命中结果 / `/api/tenant/resolve`），
 *  仅当运行时表尚无该 code 时才回退构建期种子（data/tenant-channels.json，last-known-good）；
 *  两者都没有则回退根 channelToken（默认渠道）。
 *
 *  这样新增/启用渠道无需重新构建前端：路由段不再受白名单约束，租户清单在运行时获取。 */
export function useTenantChannel() {
  const { public: pub } = useRuntimeConfig();
  const activeTenant = useState<string | null>("activeTenant", () => null);
  const resolvedMap = useState<Record<string, TenantMapEntry>>(
    "tenantResolvedMap",
    () => ({}),
  );
  const tenants = (tenantChannels as unknown as { tenants: TenantMapEntry[] })?.tenants || [];

  const code = computed<string | null>(() => activeTenant.value);

  const current = computed<TenantMapEntry | null>(() => {
    const c = code.value;
    if (!c) return null;
    return resolvedMap.value[c] ?? tenants.find((t) => t.code === c) ?? null;
  });

  const token = computed<string>(
    () => current.value?.token ?? ((pub.channelToken as string) ?? ""),
  );

  /** 写入解析结果并切换 GQL 渠道（插件 / 全局中间件共用） */
  function applyResolved(hit: { code: string; token: string; name: string }) {
    resolvedMap.value = {
      ...resolvedMap.value,
      [hit.code]: { code: hit.code, token: hit.token, name: hit.name },
    };
    activeTenant.value = hit.code;
    useGqlHeaders({ "vendure-token": hit.token });
  }

  return { code, token, current, activeTenant, tenants, resolvedMap, applyResolved };
}
