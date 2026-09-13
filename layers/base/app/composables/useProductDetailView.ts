import { storeToRefs } from "pinia";
import { composeProductTitle, resolveSkuLabel } from "../utils/product-title";

export function useProductDetailView() {
  const productStore = useProductStore();
  const { product, selectedVariant, hasOptions } = storeToRefs(productStore);
  const { isServiceable } = useCityService();
  const productServiceable = computed(() => isServiceable(product.value));
  // 无规格商品隐藏变体名（新建单 SKU 商品变体名=自动编码，无意义）；多规格显示「商品名 规格组合」
  const productName = computed(() =>
    composeProductTitle(
      product.value?.name ?? "",
      selectedVariant.value?.name,
      hasOptions.value,
    ),
  );
  // SKU 区：真实 SKU 展示编码；自动编码降级为规格名/默认
  const skuLabel = computed(() =>
    resolveSkuLabel(
      selectedVariant.value?.sku,
      selectedVariant.value?.name,
      hasOptions.value,
    ),
  );
  return { product, selectedVariant, productName, skuLabel, productServiceable };
}
