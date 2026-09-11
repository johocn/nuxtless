import { assetPlaceholderSrc } from "../app/utils/image";
import type { ProductDetail } from "~~/types/product";

export interface DetailMedia {
  type: "image" | "video";
  id: string;
  src: string; // 图片=preview / 视频=videoUrl
  preview?: string; // 图片预览（视频无）
}

export const useProductStore = defineStore("product", () => {
  const product = ref<ProductDetail>(null);
  const selectedOptions = reactive<Record<string, string>>({});

  const optionGroups = computed(() => {
    if (!product.value?.variants?.length) return [];

    const groups = new Map<
      string,
      { id: string; name: string; values: { id: string; name: string }[] }
    >();

    for (const variant of product.value.variants) {
      for (const option of variant.options) {
        if (!groups.has(option.group.id)) {
          groups.set(option.group.id, {
            id: option.group.id,
            name: option.group.name,
            values: [],
          });
        }
        const group = groups.get(option.group.id)!;
        if (!group.values.some((v) => v.id === option.id)) {
          group.values.push({ id: option.id, name: option.name });
        }
      }
    }

    return Array.from(groups.values());
  });

  const hasOptions = computed(() => optionGroups.value.length > 0);

  const selectedVariant = computed(
    () =>
      product.value?.variants.find((v) =>
        v.options.every((opt) => selectedOptions[opt.group.id] === opt.id),
      ) ?? null,
  );

  const liveStock = ref<string | null>(null);
  const stockLevel = computed(
    () => liveStock.value ?? selectedVariant.value?.stockLevel,
  );

  // 当前选中变体的主图（featuredAsset 优先，回退该变体 assets 首张）
  const variantImage = computed(() => {
    const v = selectedVariant.value;
    if (v?.featuredAsset?.preview) return v.featuredAsset.preview;
    return v?.assets?.[0]?.preview ?? null;
  });

  const galleryAssets = computed(() => {
    const variantAssets = selectedVariant.value?.assets ?? [];
    const productAssets = product.value?.assets ?? [];
    const productFeatured = product.value?.featuredAsset;
    // 合并「变体主图 → 变体资产 → 商品主图 → 商品资产」并去重：
    // 兼容 web-admin 把多图挂在商品级/变体级 assets，也兼容仅挂 featuredAsset 的单图商品
    // （assets 数组为空时仍回退展示主图，避免顶部画廊落到"暂无图片"占位）。
    const imgs: Array<{ id: string; preview: string }> = [];
    const seen = new Set<string>();
    const add = (id: string, preview: string) => {
      if (!preview || seen.has(preview)) return;
      seen.add(preview);
      imgs.push({ id, preview });
    };
    add("variant-main", variantImage.value ?? "");
    for (const a of variantAssets) add(a.id, a.preview);
    add("product-main", productFeatured?.preview ?? "");
    for (const a of productAssets) add(a.id, a.preview);
    if (imgs.length > 0) return imgs;
    return [{ id: "placeholder", preview: assetPlaceholderSrc() } as any];
  });

  const mediaAssets = computed<DetailMedia[]>(() => {
    const imgs: any[] = (galleryAssets.value as any[]).filter(
      (a: any) => a.id && a.id !== "placeholder",
    );
    const images: DetailMedia[] = imgs.map((a) => ({
      type: "image",
      id: a.id,
      src: a.preview ?? "",
      preview: a.preview,
    }));
    // 视频优先：选中变体 videoUrl 优先，回退商品 videoUrl
    const variantVideo = (selectedVariant.value?.customFields as any)?.videoUrl;
    const productVideo = (product.value?.customFields as any)?.videoUrl;
    const videoUrl = (variantVideo || productVideo || "").trim();
    if (videoUrl) return [{ type: "video", id: "video", src: videoUrl }, ...images];
    return images;
  });

  function init(p: ProductDetail) {
    product.value = p;
    Object.assign(selectedOptions, {});
    if (!p?.variants?.length) return;

    const defaultVariant =
      p.variants.find((v) => v.stockLevel !== "OUT_OF_STOCK") ?? p.variants[0];

    if (!defaultVariant) return;

    for (const opt of defaultVariant.options) {
      selectedOptions[opt.group.id] = opt.id;
    }
  }

  function setOption(groupId: string, optionId: string) {
    selectedOptions[groupId] = optionId;
  }

  async function refreshStock() {
    const productId = product.value?.id;
    const variantId = selectedVariant.value?.id;

    if (!productId || !variantId) {
      liveStock.value = null;
      return;
    }

    const queriedVariant = variantId; // 竞态守卫：快切 SKU 时丢弃旧响应
    try {
      const { product: variantStock } = await GqlGetProductVariantStock({
        productId,
        variantId,
      });
      if (queriedVariant !== selectedVariant.value?.id) return;
      liveStock.value = variantStock?.variantList.items?.[0]?.stockLevel ?? null;
    } catch (e) {
      console.error("[useProductStore] refreshStock 失败，回退静态库存", e);
      liveStock.value = null;
    }
  }

  return {
    product,
    selectedOptions,
    optionGroups,
    hasOptions,
    selectedVariant,
    stockLevel,
    galleryAssets,
    mediaAssets,
    init,
    setOption,
    refreshStock,
  };
});
