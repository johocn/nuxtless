export function formatMoney(amount: number, currency = "CNY", locale?: string) {
  const loc = locale ?? "zh-CN";
  return new Intl.NumberFormat(loc, { style: "currency", currency }).format(amount / 100);
}