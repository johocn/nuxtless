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

  /** 切店时清空 nuxt-graphql-client 的操作级缓存（key 为 gql:data:*）。
   *  useAsyncGql 只按 operation+variables 缓存，不含渠道 token —— 不清会继续复用上一家店的数据。
   *  仅在客户端需要（SSR 每次请求的 payload 天然隔离）。 */
  function clearGqlCacheOnSwitch(next: string | null) {
    if (activeTenant.value === next) return;
    if (import.meta.client) {
      clearNuxtData((key) => key.startsWith("gql:data:"));
    }
  }

  /** 写入解析结果并切换 GQL 渠道（插件 / 全局中间件共用） */
  function applyResolved(hit: { code: string; token: string; name: string }) {
    resolvedMap.value = {
      ...resolvedMap.value,
      [hit.code]: { code: hit.code, token: hit.token, name: hit.name },
    };
    clearGqlCacheOnSwitch(hit.code);
    activeTenant.value = hit.code;
    useGqlHeaders({ "vendure-token": hit.token });
  }

  /** 无租户命中：显式恢复默认渠道 token。
   *  只把 activeTenant 置空是不够的 —— token computed 虽会回退默认值，
   *  useGqlHeaders 写过的 vendure-token 仍是上一家店的，后续 GQL 会串店。 */
  function applyDefault() {
    clearGqlCacheOnSwitch(null);
    activeTenant.value = null;
    useGqlHeaders({ "vendure-token": (pub.channelToken as string) ?? "" });
  }

  return {
    code,
    token,
    current,
    activeTenant,
    tenants,
    resolvedMap,
    applyResolved,
    applyDefault,
  };
}
