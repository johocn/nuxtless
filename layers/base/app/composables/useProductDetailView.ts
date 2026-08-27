import { storeToRefs } from "pinia";

export function useProductDetailView() {
  const productStore = useProductStore();
  const { product, selectedVariant } = storeToRefs(productStore);
  const { isServiceable } = useCityService();
  const productServiceable = computed(() => isServiceable(product.value));
  const productName = computed(
    () => selectedVariant.value?.name ?? product.value?.name ?? "",
  );
  return { product, selectedVariant, productName, productServiceable };
}