import { round2 } from "./utils";

export interface PriceBreakdown {
  unitPrice: number;
  lineTotal: number;
}

export interface Totals {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
}

/** Dynamic print price: basePrice × sizeMultiplier × mountMultiplier + mountSurcharge */
export function computeUnitPrice(
  basePrice: number | string,
  sizeMultiplier: number | string,
  mountMultiplier: number | string,
  mountSurcharge: number | string,
): number {
  const base = typeof basePrice === "string" ? parseFloat(basePrice) : basePrice;
  const sm = typeof sizeMultiplier === "string" ? parseFloat(sizeMultiplier) : sizeMultiplier;
  const mm = typeof mountMultiplier === "string" ? parseFloat(mountMultiplier) : mountMultiplier;
  const sur = typeof mountSurcharge === "string" ? parseFloat(mountSurcharge) : mountSurcharge;
  return round2(base * sm * mm + sur);
}

export function computeLineTotal(unitPrice: number, qty: number): number {
  return round2(unitPrice * qty);
}

export function shippingFor(subtotal: number): number {
  return subtotal >= 300 ? 0 : 24;
}

export function computeTotals(
  lines: Array<{ unitPrice: number; qty: number }>,
  currency = "EUR",
): Totals {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0));
  const shipping = shippingFor(subtotal);
  const tax = round2(subtotal * 0.2); // 20% TVA
  const total = round2(subtotal + shipping + tax);
  return { subtotal, shipping, tax, total, currency };
}

export function editionLabel(edition: number, total: number): string {
  return `Print ${edition}/${total}`;
}
