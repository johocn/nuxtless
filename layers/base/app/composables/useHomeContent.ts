import { useAsyncData } from "#imports";
import { isProductVisible, type ProductLike } from "../utils/productVisibility";

export function useHomeContent() {
  const { data: content, status, error } = useAsyncData(
    "home-content",
    async () => {
      const res = await useAsyncGql("GetHomeContent", { position: "home" });
      // useAsyncGql 返回 { data: Ref<GetHomeContentQuery> }，与 category/[slug].vue 的 `collectionProducts.value?.search` 约定一致
      return res.data.value?.publishedContent ?? [];
    },
    { server: true },
  );

  // 促销绑定商品（Recommendation/Floor 等携带商品条目列表的运营块）按「城市·配送」SSR 后置过滤；
  // 纯 banner / notice 等无商品维度块全显（不误伤）。模块级配送状态 id 用 "home-promo"。
  const cityName = useLocationStore().cityName;
  const { current: delivery } = useModuleDelivery("home-promo");
  const visibleContent = computed(() =>
    (content.value ?? []).map((block) => {
      const data = (block?.data ?? {}) as { items?: unknown[] };
      const items = data.items;
      if (!Array.isArray(items)) return block;
      // 仅处理「携带商品条目」的块（条目为对象且含 slug/productId）；数字 id 数组（Floor）与
      // 纯文本条目（Notice）不具 customFields 判定维度，原样透传。
      const hasProduct = items.some(
        (it) => !!it && typeof it === "object" && ("slug" in it || "productId" in it),
      );
      if (!hasProduct) return block;
      return {
        ...block,
        data: {
          ...data,
          items: items.filter((it) =>
            isProductVisible(it as ProductLike, { city: cityName.value || null, delivery: delivery.value }),
          ),
        },
      };
    }),
  );

  return { content, visibleContent, status, error };
}
