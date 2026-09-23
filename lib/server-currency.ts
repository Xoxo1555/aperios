import { cookies } from "next/headers";
import { formatInCurrency, SUPPORTED_CURRENCIES, type CurrencyCode } from "lib/money";

/**
 * Cookie used to persist the visitor's currency choice so that server-rendered
 * pages (transaction history, payouts, certificates) can honour it on the
 * first request — the client context alone only exists after hydration.
 */
export const CURRENCY_COOKIE = "aperio-currency";

export async function getActiveCurrency(): Promise<CurrencyCode> {
  const store = await cookies();
  const raw = store.get(CURRENCY_COOKIE)?.value;
  if (raw && (SUPPORTED_CURRENCIES as readonly string[]).includes(raw)) {
    return raw as CurrencyCode;
  }
  return "EUR";
}

/** Format a canonical EUR amount using the currency stored in the request cookie. */
export async function formatActiveCurrency(eur: number | string): Promise<string> {
  return formatInCurrency(eur, await getActiveCurrency());
}
