import tenantChannels from "../../data/tenant-channels.json";

type TenantMapEntry = { code: string; token: string; name?: string };

/** 当前租户渠道的统一入口：由 URL 首段解析出的租户 code -> channel token。
 *  未命中租户时回退到根 channelToken（默认渠道）。 */
export function useTenantChannel() {
  const { public: pub } = useRuntimeConfig();
  const activeTenant = useState<string | null>("activeTenant", () => null);
  const tenants = (tenantChannels as unknown as { tenants: TenantMapEntry[] })?.tenants || [];

  const code = computed<string | null>(() => activeTenant.value);
  const current = computed<TenantMapEntry | null>(
    () => tenants.find((t) => t.code === code.value) || null,
  );
  const token = computed<string>(
    () => current.value?.token ?? ((pub.channelToken as string) ?? ""),
  );

  return { code, token, current, activeTenant, tenants };
}