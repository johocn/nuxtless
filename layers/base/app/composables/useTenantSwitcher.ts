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
 *  清单**按需懒加载**（不用 useAsyncGql）：切换器位于 UHeader 插槽内，若在 setup 阶段
 *  发起异步取数，SSR 与客户端水合时该插槽的子节点数可能不一致，直接触发 hydration mismatch
 *  （整页空白）。故一律由用户交互（打开面板）或 onMounted 调 load() 拉取，
 *  首帧两侧都是空数组，保证水合一致。
 *
 *  切换前先打 /api/tenant/resolve?fresh=1 强制刷新 Nitro 租户表，命中才跳转；
 *  跳转采用**整页导航**（external: true），确保渠道态（购物车、城市、GQL 头）彻底重置 ——
 *  Vendure 的 activeOrder 按 channel 隔离，软导航会残留旧渠道的客户端状态。 */
export function useTenantSwitcher() {
  const shops = useState<ShopChannelEntry[]>("tenantSwitcherShops", () => []);
  const loading = useState<boolean>("tenantSwitcherLoading", () => false);
  const router = useRouter();
  const route = useRoute();
  const localePath = useLocalePath();
  const { code, applyResolved } = useTenantChannel();

  /** 拉取店铺清单（幂等；force=true 强制刷新）。失败时保持现状由 UI 降级，不抛出。 */
  async function load(force = false): Promise<ShopChannelEntry[]> {
    if (shops.value.length && !force) return shops.value;
    if (loading.value) return shops.value;
    loading.value = true;
    try {
      const { shopChannels } = await GqlShopChannelsForSwitcher();
      shops.value = ((shopChannels ?? []) as ShopChannelEntry[]).map((c) => ({
        code: c.code,
        token: c.token,
        name: c.name || c.code,
        isDefault: !!c.isDefault,
        isOfficial: !!c.isOfficial,
      }));
    } catch {
      // 静默：清单为空时页头/错误页各自降级展示
    } finally {
      loading.value = false;
    }
    return shops.value;
  }

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

  return { shops, loading, load, currentCode: code, switchTo, goToShopHome };
}
