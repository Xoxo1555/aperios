"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  ALL_CURRENCIES as CURRENCY_META,
  formatInCurrency,
  normalizeCurrency,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
} from "lib/money";

export type { CurrencyCode } from "lib/money";
export { SUPPORTED_CURRENCIES, ALL_CURRENCIES } from "lib/money";

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  /** Format a canonical EUR amount in the active currency. */
  format: (eur: number | string) => string;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "EUR",
  setCurrency: () => undefined,
  format: (eur) => formatInCurrency(eur, "EUR"),
});

const STORAGE_KEY = "aperio-currency";

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => {
    if (typeof window === "undefined") return "EUR";
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && (SUPPORTED_CURRENCIES as string[]).includes(stored)) {
        return stored as CurrencyCode;
      }
    } catch {
      /* localStorage unavailable — keep EUR */
    }
    return "EUR";
  });

  const setCurrency = useCallback((next: CurrencyCode) => {
    const normalized = normalizeCurrency(next);
    setCurrencyState(normalized);
    try {
      window.localStorage.setItem(STORAGE_KEY, normalized);
      // Mirror to a cookie so server-rendered pages can read the choice.
      document.cookie = `${STORAGE_KEY}=${normalized}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* ignore write errors */
    }
  }, []);

  const format = useCallback(
    (eur: number | string) => formatInCurrency(eur, currency),
    [currency],
  );

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}

/**
 * Convenience hook for client components: returns a `format(eur)` function
 * that renders a canonical EUR price in the user's selected currency.
 */
export function usePrice() {
  const { format } = useCurrency();
  return format;
}
