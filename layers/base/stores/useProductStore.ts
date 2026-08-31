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

  // 当前选中变体的主图（featuredAsset 优先，回退该变体 assets 首张 -> null）
  const variantImage = computed(() => {
    const v = selectedVariant.value;
    if (v?.featuredAsset?.preview) return v.featuredAsset.preview;
    return v?.assets?.[0]?.preview ?? null;
  });

  const galleryAssets = computed(() => {
    const variantAssets = selectedVariant.value?.assets ?? [];
    const productAssets = product.value?.assets ?? [];
    const hasVariantImage = variantImage.value != null && variantImage.value !== '';
    // 变体主图切换：有变体图则以变体 featuredAsset 为主图首项，其余变体图跟随（去重）
    const imgs =
      hasVariantImage || variantAssets.length > 0
        ? [
            ...(hasVariantImage ? [{ id: "variant-main", preview: variantImage.value! }] : []),
            ...variantAssets.filter((a) => a.preview !== variantImage.value),
          ]
        : productAssets;
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

    const { product: variantStock } = await GqlGetProductVariantStock({
      productId,
      variantId,
    });

    liveStock.value = variantStock?.variantList.items?.[0]?.stockLevel ?? null;
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
