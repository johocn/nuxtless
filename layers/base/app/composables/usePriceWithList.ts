// 仅详情页价格块用：按 taxEnabled 取展示现价，叠加划线价(listPrice)与降价额。SSR 友好纯计算。
export function usePriceWithList() {
  const { selectedVariant } = storeToRefs(useProductStore());
  const { locale } = useI18n();
  const { taxEnabled } = useTaxEnabled();

  const v = selectedVariant;

  const fmt = (amount: number | null | undefined) =>
    new Intl.NumberFormat(locale.value, {
      style: "currency",
      currency: v.value?.currencyCode || "CNY",
    }).format((amount ?? 0) / 100);

  // 现价展示值（分）：含税价或不含税净价，与 PriceBlock 原逻辑一致
  const current = computed(() => {
    if (!v.value) return 0;
    return taxEnabled.value ? (v.value.priceWithTax ?? 0) : (v.value.price ?? v.value.priceWithTax) ?? 0;
  });

  // 划线原价（分）；无/非法 → null
  const list = computed<number | null>(() => {
    const cf = (v.value as any)?.customFields as any;
    const p = cf?.listPrice;
    return typeof p === "number" && p > 0 ? p : null;
  });

  // 仅当划线价大于现价时才展示划线（避免倒挂）
  const showList = computed(() => (list.value ?? 0) > current.value);
  const save = computed(() => Math.max((list.value ?? 0) - current.value, 0));

  return { v, fmt, current, list, showList, save };
}