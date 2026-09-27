// 「热门商品 / 推荐商品」装修积木的共享取数 composable（城市 / 语言 / 配送 / 同页去重）。
//
// 取数口径与京东兜底楼层（app/pages/index.vue 的 home-fallback-search）完全一致的双层口径：
//   1) 服务端：仅双能力渠道按渠道能力做 facet 过滤（deliveryFacetFilter）；命中 0 条时去掉
//      facetValueFilters 重查一次并置 serverFiltered=false，杜绝空白区块。
//   2) 客户端：组件层（GoodsCardBlock / JdProductGrid）用 isProductVisible 做城市维度后置过滤。
// 因 SearchItem 不带 customFields，取数返回后按 productId 拉商品主数据补齐
// customFields（belongCity/serviceCities/deliveryMethods）+ 划线价 listPriceCents。
//
// 语言：商品名沿用 ?languageCode 机制（app/app.vue），本层不额外处理；标题由区块组件走
// LocalizedText 回退链。
//
// 同页去重：useState('home-shown-product-ids') 累积已展示 productId，recommend 默认排除
// （本区块自身 id 不排除，故与区块声明顺序无关、SSR/CSR 一致）。取数失败不写入该集合。
//
// 关键坑（仓库已记录）：useAsyncData 的 handler 内不要调用 Nuxt composable（useAsyncGql 等），
// 会丢 Nuxt 实例上下文报 "[nuxt] instance unavailable"；故在 setup 顶层捕获原始 gql client。
import type { SearchResult } from "~~/types/product";
import type { TaxMode } from "../utils/tax-price";
import type { ProductLike } from "../utils/productVisibility";
import { deliveryFacetFilter, modesFromFacetIds } from "../utils/delivery-modes";
import { listCentsMap, pickListCents } from "../utils/display-price";
import { curatedGoodsConfig, CURATED_GOODS_DEFAULTS, type CuratedGoodsSection } from "../utils/shop-content";

type CuratedItem = SearchResult[number] & {
  listPriceCents?: number | null;
  customFields?: ProductLike["customFields"];
  deliveryModes?: ProductLike["deliveryModes"];
};

type RawGql = (name: string, variables?: Record<string, unknown>) => Promise<any>;

/** useAsyncData key 前缀：用于在共享登记表中区分「热门」区块（recommend 只排除热门区块的展示项） */
const HOT_BLOCK_KEY_PREFIX = "curated-goods-hot-";

/** 变体价聚合为 SearchItem 的 SinglePrice（取最小现行价） */
function singlePrice(
  variants: Array<Record<string, any>> | null | undefined,
  field: "price" | "priceWithTax",
): { value: number } | undefined {
  let min: number | null = null;
  for (const v of variants ?? []) {
    const cents = v?.[field];
    if (typeof cents === "number" && (min === null || cents < min)) min = cents;
  }
  return min === null ? undefined : { value: min };
}

export async function useCuratedGoods(section: CuratedGoodsSection) {
  const rawGql = useGql() as unknown as RawGql;
  const { taxMode } = useTaxMode();

  // 与兜底楼层 / JdProductGrid 共用同一份模块级配送选择状态（moduleId 'jd-grid'）
  const { config: filterConfig } = useHomeFilterConfig();
  const filterEnabled = computed(() => filterConfig.value.enabled && filterConfig.value.modules.goods.enabled);
  const defaultDelivery = computed(
    () => filterConfig.value.modules.goods.defaultDelivery ?? filterConfig.value.defaultDelivery,
  );
  const { current: delivery, setDelivery } = useModuleDelivery("jd-grid", defaultDelivery.value);
  const { showDeliveryPicker, lockedMode, facetValueIds } = useChannelDeliveryCapability();
  // 单能力渠道锁定唯一方式（t2 → SELF_PICKUP），与 JdProductGrid 同一处理，避免取数口径分叉
  watch(lockedMode, (m) => { if (m) setDelivery(m); }, { immediate: true });

  // 同页去重登记表（跨区块共享，键 = 区块取数 key，值 = 该区块实际展示的 productId）。
  // 必须在任何 await 之前取得：await 之后再调用 useState 会丢 Nuxt 实例上下文
  // → SSR 报 "[nuxt] instance unavailable" 使整页 500。
  const shownByBlock = useState<Record<string, string[]>>("home-shown-product-ids", () => ({}));

  const cfg = computed(() => curatedGoodsConfig(section));

  /** 服务端配送筛选入参；不可用（单能力渠道 / facet 未同步 / 未开启过滤）时为 null，退回本地过滤 */
  const facetFilter = computed(() =>
    filterEnabled.value && showDeliveryPicker.value
      ? deliveryFacetFilter(facetValueIds.value, delivery.value)
      : null,
  );
  // 只在「实际生效的筛选」变化时才重查（取字符串避免数组引用变化触发无谓重查）
  const facetKey = computed(() => facetFilter.value?.[0]?.or.join(",") ?? "");

  /** SSR 期渠道能力与商品查询并行，须在 handler 内独立取一次，保证 SSR 与客户端首帧同一筛选口径 */
  async function loadChannelFacet(): Promise<{ dual: boolean; ids: Record<string, string> | null }> {
    try {
      const res = await rawGql("ChannelDeliveryCapability", {});
      const cap = (res as any)?.channelDeliveryCapability;
      return { dual: cap?.bothSupported === true, ids: cap?.facetValueIds ?? null };
    } catch {
      return { dual: false, ids: null };
    }
  }

  // key 含 limit：同类型同来源但数量不同的两个区块不可共用同一份取数结果
  const key = `curated-goods-${section.type}-${cfg.value.source}-${cfg.value.collectionId ?? ""}-${cfg.value.slugs.join("|")}-${cfg.value.limit}`;

  const { data } = await useAsyncData(
    key,
    async () => {
      const cap = filterEnabled.value ? await loadChannelFacet() : { dual: false, ids: null };
      const filters = cap.dual ? deliveryFacetFilter(cap.ids, delivery.value) : null;
      const mode = (taxMode.value ?? "inclusive") as TaxMode;

      // source='slugs'：按 slug 直取商品主数据（主数据自带 customFields / 含税价，无需二次补拉）。
      // 该路径无 facetValueIds（products 查询不返回分类 facet），故不派生 deliveryModes，
      // 由 isProductVisible 回退到商品自身 customFields.deliveryMethods 判定（与历史行为一致）。
      if (cfg.value.source === "slugs") {
        const items: CuratedItem[] = [];
        try {
          const res = await rawGql("GetProductsBySlugs", { slugs: cfg.value.slugs });
          const bySlug = new Map<string, any>();
          for (const p of res?.products?.items ?? []) if (p?.slug) bySlug.set(p.slug, p);
          for (const slug of cfg.value.slugs) {
            const p = bySlug.get(slug);
            if (!p) continue;
            items.push({
              productId: p.id,
              productName: p.name,
              slug: p.slug,
              productAsset: p.featuredAsset ?? null,
              currencyCode: p.variants?.[0]?.currencyCode ?? "CNY",
              price: singlePrice(p.variants, "price"),
              priceWithTax: singlePrice(p.variants, "priceWithTax"),
              facetValueIds: [],
              customFields: p.customFields ?? null,
              listPriceCents: pickListCents(p.variants ?? null, mode),
            } as CuratedItem);
          }
        } catch {
          /* 取数失败保持空区块，不阻断首页其它区块，且不写入已展示集合 */
        }
        return { items: items.slice(0, cfg.value.limit), serverFiltered: false, facetIds: cap.ids };
      }

      let items: CuratedItem[] = [];
      let serverFiltered = false;
      // 去重开启的 recommend 需先"多取"再排除同页 hot 已展示项，否则排除后可能不足 limit：
      // 取数上限直接用到 30（后台校验的上限），最终仍按 cfg.limit 截断。
      // 注意：hot 区块的输出与其它区块无关（单向依赖），故不存在区块间反复重算。
      // （source='slugs' 已在上方提前返回，不在本分支。）
      const take = cfg.value.dedupe ? CURATED_GOODS_DEFAULTS.maxLimit : cfg.value.limit;
      const searchArgs = {
        term: "",
        ...(cfg.value.source === "collection" && cfg.value.collectionId
          ? { collectionSlug: cfg.value.collectionId }
          : {}),
        take,
        skip: 0,
      };
      try {
        const searchRes = await rawGql("SearchProducts", {
          ...searchArgs,
          ...(filters ? { facetValueFilters: filters } : {}),
        });
        items = (searchRes?.search?.items ?? []) as CuratedItem[];
        serverFiltered = !!filters;
        // facet 索引未同步时服务端过滤会命中 0 条、把整块清空：去掉 facetValueFilters 重查一次，
        // 改由组件层按配送能力做本地过滤，杜绝空白区块。
        if (serverFiltered && !items.length) {
          const retryRes = await rawGql("SearchProducts", searchArgs);
          items = (retryRes?.search?.items ?? []) as CuratedItem[];
          serverFiltered = false;
        }
      } catch {
        /* 搜索失败保持空区块，不阻断首页其它区块 */
      }

      // SearchItem 不带 customFields：按 productId 拉主数据，补齐城市判定字段 + 划线价
      const ids = items.map((i) => i.productId).filter(Boolean);
      if (!ids.length) return { items, serverFiltered, facetIds: cap.ids };
      try {
        const res = await rawGql("GetProductsByIds", { ids });
        const listCents = listCentsMap(res?.products?.items ?? [], mode);
        const cfMap = new Map<string, ProductLike["customFields"]>();
        for (const p of res?.products?.items ?? []) {
          if (p?.slug) cfMap.set(p.slug, (p as { customFields?: ProductLike["customFields"] }).customFields ?? null);
        }
        items = items.map((i) => ({
          ...i,
          listPriceCents: listCents.get(i.slug) ?? null,
          customFields: cfMap.get(i.slug) ?? null,
          // 服务端未按配送过滤时由本地按同一套 facet 映射派生配送能力（与 GoodsFloor 同口径）
          deliveryModes: serverFiltered ? undefined : modesFromFacetIds(i.facetValueIds, cap.ids),
        })) as CuratedItem[];
      } catch {
        /* 主数据补拉失败：保留搜索结果（无 customFields → 城市判定放行） */
      }
      return { items, serverFiltered, facetIds: cap.ids };
    },
    // 用户切换「邮寄 / 自提」后重查：SSR 首帧的筛选值即默认配送，客户端仅在真正变化时重查
    { server: true, watch: [facetKey] },
  );

  const resolvedItems = computed<CuratedItem[]>(() => data.value?.items ?? []);

  const dedupe = computed(() => section.type === "recommend" && cfg.value.dedupe);

  /**
   * 商品列表：recommend（dedupe 开启，默认）排除同页 hot 区块已展示的 productId，再按 limit 截断
   * （去重路径取数时已多取，见上方 take）。
   * 只依赖 hot 区块的登记项 → 单向依赖，不存在区块间互相排除导致的反复重算。
   */
  const products = computed<CuratedItem[]>(() => {
    const items = resolvedItems.value;
    if (!dedupe.value || !items.length) return items.slice(0, cfg.value.limit);
    const excluded = new Set<string>();
    for (const [k, ids] of Object.entries(shownByBlock.value)) {
      if (!k.startsWith(HOT_BLOCK_KEY_PREFIX)) continue;
      for (const id of ids) excluded.add(id);
    }
    if (!excluded.size) return items.slice(0, cfg.value.limit);
    return items.filter((i) => !excluded.has(i.productId)).slice(0, cfg.value.limit);
  });

  // 本区块实际展示的 productId 登记进同页登记表（键 = 本区块取数 key），供后续 recommend 区块去重；
  // 取数失败 / 空结果不写入（设计 §4）。同值不重复写入，避免无谓的响应式抖动。
  watch(
    products,
    (items) => {
      const ids = items.map((i) => i.productId).filter(Boolean);
      if (!ids.length) return;
      const prev = shownByBlock.value[key];
      if (prev && prev.length === ids.length && prev.every((v, i) => v === ids[i])) return;
      shownByBlock.value = { ...shownByBlock.value, [key]: ids };
    },
    { immediate: true },
  );

  /** 取数是否已成功返回（失败时区块整体不渲染，符合设计 §4 兜底口径） */
  const ready = computed(() => data.value != null);
  const serverFiltered = computed(() => data.value?.serverFiltered === true);

  return { products, layout: computed(() => cfg.value.layout), ready, serverFiltered };
}