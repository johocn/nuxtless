import type { TenantResolve } from "./useTenantChannel";

/** 店铺清单条目（后端公开查询 shopChannels 的裁剪形态） */
export interface ShopChannelEntry {
  code: string;
  token: string;
  name: string;
  isDefault: boolean;
  isOfficial: boolean;
}

/** 店铺切换：页头 HeaderTenantSelector 与错误页「选择其他店铺」共用。
 *
 *  切换前先打 /api/tenant/resolve?fresh=1 强制刷新 Nitro 租户表，命中才跳转；
 *  跳转采用**整页导航**（external: true），确保渠道态（购物车、城市、GQL 头）彻底重置 ——
 *  Vendure 的 activeOrder 按 channel 隔离，软导航会残留旧渠道的客户端状态。 */
export function useTenantSwitcher(opts: { server?: boolean } = {}) {
  const { data } = useAsyncGql("ShopChannelsForSwitcher", {}, {
    server: !!opts.server,
    lazy: !opts.server,
  });
  const router = useRouter();
  const route = useRoute();
  const localePath = useLocalePath();
  const { code, applyResolved } = useTenantChannel();

  const shops = computed<ShopChannelEntry[]>(() =>
    ((data.value?.shopChannels ?? []) as ShopChannelEntry[]).map((c) => ({
      code: c.code,
      token: c.token,
      name: c.name || c.code,
      isDefault: !!c.isDefault,
      isOfficial: !!c.isOfficial,
    })),
  );

  /** 强制刷新租户表并校验目标店铺可用；返回是否可用 */
  async function ensureAvailable(next: string): Promise<boolean> {
    const res = await $fetch<TenantResolve>("/api/tenant/resolve", {
      query: { code: next, fresh: 1 },
    }).catch(() => null);
    if (!res || res.status !== "ok") return false;
    applyResolved(res);
    return true;
  }

  /** 当前路径换租户段（vue-router 已按静态段优先消歧，直接用 params 重解析，不做字符串推断） */
  function samePathWith(next: string): string {
    if (!route.name) return localePath(`/${next}`);
    return router.resolve({
      name: route.name,
      params: { ...route.params, tenantCode: next },
      query: route.query,
    }).fullPath;
  }

  /** 页头切换器：保持当前页面，只换店铺 */
  async function switchTo(next: string): Promise<boolean> {
    if (!(await ensureAvailable(next))) return false;
    await navigateTo(samePathWith(next), { external: true });
    return true;
  }

  /** 错误页「选择其他店铺」：直接去目标店铺首页 */
  async function goToShopHome(next: string): Promise<boolean> {
    if (!(await ensureAvailable(next))) return false;
    await navigateTo(localePath(`/${next}`), { external: true });
    return true;
  }

  return { shops, currentCode: code, switchTo, goToShopHome };
}
