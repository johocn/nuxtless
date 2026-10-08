export function formatMoney(amount: number, currency = "CNY", locale?: string) {
  const loc = locale ?? "zh-CN";
  return new Intl.NumberFormat(loc, { style: "currency", currency }).format(amount / 100);
}

/**
 * 分 → 元「现状等价」快格式：`¥123.45`（toFixed(2)，无千分位）。
 *
 * 与全站既有内联显示（`¥${(cents / 100).toFixed(2)}`）逐字节一致，SSR/CSR 零 hydration 风险；
 * 金额符号与位数口径集中在此处，换币种/本地化格式时只改一处。
 * 多币种本地化（Intl 千分位 / 币种随 locale 切换）待产品决策后统一切换到 formatMoney。
 */
export function formatCents(amount: number): string {
  return `¥${centsToFixed(amount)}`;
}

/** 分 → 元纯数字串（`123.45`，无货币符号）：区间价、跟随货币码后缀等场景用 */
export function centsToFixed(amount: number): string {
  return (amount / 100).toFixed(2);
}