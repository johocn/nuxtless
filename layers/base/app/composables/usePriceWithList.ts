// 仅详情页价格块用：以「渠道录入基准价」为基准，按渠道税档+价字段解释换算展示现价与划线价。SSR 友好纯计算。
import { displayCentsFromNet, type TaxMode } from "../utils/tax-price";

export function usePriceWithList() {
  const { selectedVariant } = storeToRefs(useProductStore());
  const { locale } = useI18n();
  const { taxMode, pricesIncludeTax } = useTaxMode();

  const v = selectedVariant;

  const fmt = (amount: number | null | undefined) =>
    new Intl.NumberFormat(locale.value, {
      style: "currency",
      currency: v.value?.currencyCode || "CNY",
    }).format((amount ?? 0) / 100);

  // 展示现价(分)：与列表页 pickDisplayPrice 同一口径，保证详情价=列表价=结算价。
  // price 恒为净价、priceWithTax 恒为含税总价；运营端录入基准价在 pricesIncludeTax=false 渠道=price、
  // true 渠道=priceWithTax。价签展示：inclusive/zero → 录入基准价；exclusive → priceWithTax(价税分离总价)。
  const current = computed(() => {
    const mode = (taxMode.value ?? "inclusive") as TaxMode;
    const useWithTax = mode === "exclusive" || !!pricesIncludeTax.value;
    const raw = useWithTax ? v.value?.priceWithTax : v.value?.price;
    return Math.round(raw ?? 0);
  });

  // 划线原价(分)：录入净基准 listPrice，仅 exclusive 档换算×1.13；inclusive/zero 原样展示；无/非法 → null
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