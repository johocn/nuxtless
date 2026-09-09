// 仅详情页价格块用：以「净价 price」为基准，按渠道税档 taxMode 换算展示现价与划线价。SSR 友好纯计算。
import { displayCentsFromNet, type TaxMode } from "../utils/tax-price";

export function usePriceWithList() {
  const { selectedVariant } = storeToRefs(useProductStore());
  const { locale } = useI18n();
  const { taxMode } = useTaxMode();

  const v = selectedVariant;

  const fmt = (amount: number | null | undefined) =>
    new Intl.NumberFormat(locale.value, {
      style: "currency",
      currency: v.value?.currencyCode || "CNY",
    }).format((amount ?? 0) / 100);

  // 展示现价(分)：以「净价 price」为基准，按 taxMode 换算。exclusive 档下绝不能用 priceWithTax。
  const current = computed(() =>
    displayCentsFromNet(v.value?.price ?? 0, (taxMode.value ?? "inclusive") as TaxMode),
  );

  // 划线原价(分)：同为净基准，按同系数换算展示；无/非法 → null
  const list = computed<number | null>(() => {
    const cf = (v.value as any)?.customFields as any;
    const p = typeof cf?.listPrice === "number" && cf.listPrice > 0 ? cf.listPrice : null;
    return p == null ? null : displayCentsFromNet(p, (taxMode.value ?? "inclusive") as TaxMode);
  });

  // 仅当划线价大于现价时才展示划线（避免倒挂）
  const showList = computed(() => (list.value ?? 0) > current.value);
  const save = computed(() => Math.max((list.value ?? 0) - current.value, 0));

  return { v, fmt, current, list, showList, save };
}