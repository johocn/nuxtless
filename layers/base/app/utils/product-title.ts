const AUTO_SKU = /^P\d+$/i;

export function isAutoSku(sku: string | null | undefined): boolean {
  return !!sku && AUTO_SKU.test(sku);
}

export function composeProductTitle(
  productName: string,
  variantName: string | null | undefined,
  hasOptions: boolean,
): string {
  if (hasOptions && variantName && variantName !== productName) {
    return `${productName} ${variantName}`.trim();
  }
  return productName || "";
}

export type SkuLabel =
  | { type: "sku"; text: string }
  | { type: "spec"; text: string };

export function resolveSkuLabel(
  sku: string | null | undefined,
  variantName: string | null | undefined,
  hasOptions: boolean,
): SkuLabel | null {
  if (!sku) return null;
  if (!isAutoSku(sku)) return { type: "sku", text: sku };
  if (hasOptions && variantName) return { type: "spec", text: variantName };
  return { type: "spec", text: "" };
}
