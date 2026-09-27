import type { DeliveryMethod } from "../utils/productVisibility";

/** trim + 去重 + 过滤空值（保留原始写法，如「长春市」） */
function dedupe(list: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const raw of list) {
    const v = raw?.trim();
    if (v) set.add(v);
  }
  return Array.from(set);
}

/**
 * 可用城市（按渠道配送能力推导，单一真源）。
 *
 * - 仅自提渠道（只有 SELF_PICKUP）：城市 = 当前渠道可见自提点的 `city` 去重（保留原写法，如「长春市」）。
 *   属小额请求，能力就绪后自动预取，写入共享缓存（首屏即可用）。
 * - 含快递的渠道：城市 = 在售商品 `customFields.serviceCities` 聚合。**惰性**：
 *   仅在调用方显式调用 ensureLoaded()（如城市选择面板打开）时执行一次，结果缓存；
 *   不在首页/详情页挂载时发请求（守「请求数红线」）。聚合为空 → 返回空数组（表示「不设限」）。
 * - 结果写入 useState('availableCities') 共享缓存；失败静默降级为「未加载 / 空数组」，不阻断页面。
 *
 * 网络取数用 setup 顶层捕获的原始 gql client（rawGql）：单个 async 流程内不能连续 await
 * 多个 Nuxt composable（会丢 Nuxt 实例上下文），与 app/pages/index.vue 顶部教训一致。
 */
export function useAvailableCities() {
  const rawGql = useGql();
  const { capability } = useChannelDeliveryCapability();

  const cities = useState<string[]>("availableCities", () => []);
  /** 是否已成功加载过一次（失败保持 false，允许下次重试） */
  const loaded = useState<boolean>("availableCities:loaded", () => false);
  let inflight: Promise<void> | null = null;

  const modes = computed<DeliveryMethod[]>(() => capability.value?.modes ?? []);
  const isPickupOnly = computed(
    () => modes.value.includes("SELF_PICKUP") && !modes.value.includes("MAIL"),
  );

  async function fetchPickupCities(): Promise<string[]> {
    const res = await rawGql("GetPickupLocations", { type: null, lat: null, lng: null });
    return dedupe((res?.pickupLocations ?? []).map((l) => l.city));
  }

  async function fetchMailCities(): Promise<string[]> {
    const search = await rawGql("SearchProducts", { term: "", take: 100, skip: 0 });
    const ids = (search?.search?.items ?? []).map((i) => i.productId).filter(Boolean);
    if (!ids.length) return [];
    const res = await rawGql("GetProductsByIds", { ids });
    const raw: Array<string | null | undefined> = [];
    for (const p of res?.products?.items ?? []) {
      raw.push(...(p?.customFields?.serviceCities ?? []));
    }
    return dedupe(raw);
  }

  async function load(): Promise<void> {
    const list = isPickupOnly.value ? await fetchPickupCities() : await fetchMailCities();
    cities.value = list;
    loaded.value = true;
  }

  /** 按需加载（幂等、并发去重）；失败静默降级不抛错 */
  function ensureLoaded(): Promise<void> {
    if (loaded.value) return Promise.resolve();
    if (inflight) return inflight;
    inflight = load()
      .catch(() => {
        /* 静默降级：保持未加载 / 空数组，下次可重试 */
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  // 「首屏就要」：仅自提渠道（小额 pickupLocations）在能力就绪后自动预取，写入共享缓存；
  // 含快递渠道不预取，走 ensureLoaded 惰性路径。
  watch(
    isPickupOnly,
    (v) => {
      if (v) void ensureLoaded();
    },
    { immediate: true },
  );

  return { cities, loaded, ensureLoaded, isPickupOnly };
}