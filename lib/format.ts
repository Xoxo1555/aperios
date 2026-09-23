export function fmtEur(n: number | string | null | undefined) {
  if (n === null || n === undefined) return "0,00 €";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return "0,00 €";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
}
