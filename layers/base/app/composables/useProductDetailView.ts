import { storeToRefs } from "pinia";

export function useProductDetailView() {
  const productStore = useProductStore();
  const { product, selectedVariant } = storeToRefs(productStore);
  const { isServiceable } = useCityService();
  const productServiceable = computed(() => isServiceable(product.value));
  // 详情页标题应体现商品名 + 所选项变体名（例：智能手环 6 经典黑），缺省时依次回退
  const productName = computed(() => {
    const pName = product.value?.name ?? "";
    const vName = selectedVariant.value?.name;
    if (vName && vName !== pName) return `${pName} ${vName}`.trim();
    return pName || vName || "";
  });
  return { product, selectedVariant, productName, productServiceable };
}