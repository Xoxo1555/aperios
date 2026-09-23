/**
 * Aperio multi-currency engine — server-safe, no React (can be imported from
 * route handlers and server components as well as the client provider).
 *
 * Base currency is the Malagasy Ariary (MGA). All prices stored in the
 * database are canonical EUR; this module converts a EUR amount into the
 * user-selected display/payment currency at the fixed rates below.
 *
 *   1 EUR = 5 000 MGA
 *   1 USD = 4 600 MGA
 *
 * i.e. 1 EUR ≈ 1.0869 USD.
 */

export type CurrencyCode = "EUR" | "USD" | "MGA";

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ["EUR", "USD", "MGA"];

export interface CurrencyMeta {
  code: CurrencyCode;
  label: string;
  symbol: string;
  /** Intl locale used to format this currency's amounts. */
  locale: string;
}

export const ALL_CURRENCIES: CurrencyMeta[] = [
  { code: "EUR", label: "Euro", symbol: "€", locale: "fr-FR" },
  { code: "USD", label: "US Dollar", symbol: "$", locale: "en-US" },
  { code: "MGA", label: "Malagasy Ariary", symbol: "Ar", locale: "fr-FR" },
];

/** How many MGA 1 unit of the currency is worth (MGA is the base). */
export const MGA_PER_UNIT: Record<CurrencyCode, number> = {
  MGA: 1,
  EUR: 5000,
  USD: 4600,
};

/** Convert a canonical EUR amount into the target currency. */
export function convertFromEur(eur: number, currency: CurrencyCode): number {
  const n = typeof eur === "string" ? parseFloat(eur) : eur;
  if (!Number.isFinite(n)) return 0;
  if (currency === "EUR") return n;
  return (n * MGA_PER_UNIT.EUR) / MGA_PER_UNIT[currency];
}

/** Format a canonical EUR amount in the selected currency for display. */
export function formatInCurrency(
  eur: number | string,
  currency: CurrencyCode,
): string {
  const amount = convertFromEur(
    typeof eur === "string" ? parseFloat(eur) : eur,
    currency,
  );
  const meta = ALL_CURRENCIES.find((c) => c.code === currency) ?? ALL_CURRENCIES[0];
  const fractionDigits = currency === "MGA" ? 0 : 2;
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/**
 * Convert an amount to the smallest currency unit expected by payment
 * gateways (Stripe etc.). MGA is a zero-decimal currency, so the amount is
 * passed as an integer number of ariary; EUR/USD use cents.
 */
export function toMinorUnits(amount: number, currency: CurrencyCode): number {
  if (!Number.isFinite(amount)) return 0;
  return currency === "MGA" ? Math.round(amount) : Math.round(amount * 100);
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as string[]).includes(value)
  );
}

export function normalizeCurrency(value: unknown): CurrencyCode {
  return isCurrencyCode(value) ? value : "EUR";
}

export interface EurTotals {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
}

/** Convert a set of canonical EUR totals into the selected display currency. */
export function convertTotals(t: EurTotals, currency: CurrencyCode): EurTotals & { currency: CurrencyCode } {
  if (currency === "EUR") return { ...t, currency };
  const digits = currency === "MGA" ? 0 : 2;
  const f = Math.pow(10, digits);
  const r = (n: number) => Math.round(convertFromEur(n, currency) * f) / f;
  return {
    subtotal: r(t.subtotal),
    shipping: r(t.shipping),
    tax: r(t.tax),
    total: r(t.total),
    currency,
  };
}
