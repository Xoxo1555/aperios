"use client";

import { useEffect, useRef, useState } from "react";
import { ALL_LANGUAGES, useLanguage, type LangCode } from "lib/i18n";
import { ALL_CURRENCIES, SUPPORTED_CURRENCIES, useCurrency, type CurrencyCode } from "lib/currency";
import { BiIcon } from "components/BiIcon";

/** Language code → country code for the flag CDN image. */
const LANG_FLAG: Record<string, string> = {
  en: "gb",
  fr: "fr",
  mg: "mg",
  es: "es",
  pt: "pt",
  de: "de",
  it: "it",
  ar: "sa",
  zh: "cn",
  ja: "jp",
};

/** Currency code → country code for the flag CDN image. */
const CUR_FLAG: Record<string, string> = {
  EUR: "eu",
  USD: "us",
  MGA: "mg",
};

function FlagImg({ code, alt }: { code: string; alt: string }) {
  return (
    <img
      src={`https://flagcdn.com/40x30/${code}.png`}
      alt={alt}
      width={20}
      height={15}
      className="w-5 h-[15px] object-cover rounded-[2px] shadow-sm shrink-0"
      loading="lazy"
    />
  );
}

export default function LangCurrencySwitcher() {
  const { lang, setLang, t } = useLanguage();
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentLang = ALL_LANGUAGES.find((l) => l.code === lang) ?? ALL_LANGUAGES[0];
  const currentCurrency = ALL_CURRENCIES.find((c) => c.code === currency) ?? ALL_CURRENCIES[0];

  const displayCurrency = mounted ? currentCurrency.code.toUpperCase() : "EUR";
  const displayLang = mounted ? currentLang.code.toUpperCase() : "EN";

  function selectLang(code: string) {
    setLang(code as LangCode);
  }

  function selectCurrency(code: string) {
    if (!SUPPORTED_CURRENCIES.includes(code as CurrencyCode)) return;
    setCurrency(code as CurrencyCode);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="flex items-center gap-2 rounded-full border border-border bg-white/5 px-3 py-1.5 text-xs font-medium hover:border-gold/50"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("change_language")}
        aria-expanded={open}
      >
        <FlagImg code={LANG_FLAG[mounted ? currentLang.code : "en"] ?? "gb"} alt={currentLang.name} />
        <span suppressHydrationWarning>{displayLang} / {displayCurrency}</span>
        <BiIcon name="bi-chevron-down" style={{ fontSize: 14, opacity: 0.7 }} />
      </button>

      {open && (
        <>
          <div
            className="fixed top-0 w-full h-full"
            style={{ zIndex: 1040 }}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full mt-2 w-[340px] max-w-[90vw] p-3 bg-background shadow-2xl border border-border z-[1100] rounded-xl ap-pop"
            style={{ minWidth: 340 }}
          >
            <div className="row g-3">
              <div className="col-6">
                <div className="dropdown-header px-0 mb-2">{t("change_language")}</div>
                <div className="max-h-[260px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                  {ALL_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      className={`dropdown-item flex justify-between items-center px-2 transition-all duration-200 hover:bg-white/5 hover:translate-x-1${l.code === lang ? " ap-lang-active" : ""}`}
                      onClick={() => selectLang(l.code)}
                    >
                      <span className="flex items-center gap-2">
                        <FlagImg code={LANG_FLAG[l.code] ?? l.code} alt={l.name} />
                        <span style={{ fontSize: "0.85rem" }}>{l.name}</span>
                      </span>
                      {l.code === lang && <BiIcon name="bi-check" style={{ fontSize: 16, color: "#D97706" }} />}
                    </button>
                  ))}
                </div>
              </div>

               <div className="col-6" style={{ borderLeft: "1px solid var(--ap-border)" }}>
                <div className="dropdown-header px-0 mb-2">{t("currency")}</div>
                <div>
                  {ALL_CURRENCIES.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      className={`dropdown-item flex justify-between items-center px-2 transition-all duration-200 hover:bg-white/5 hover:translate-x-1${c.code === currency ? " ap-lang-active" : ""}`}
                      onClick={() => selectCurrency(c.code)}
                    >
                      <span className="flex items-center gap-2">
                        <FlagImg code={CUR_FLAG[c.code] ?? "xx"} alt={c.code} />
                        <span style={{ fontSize: "0.85rem" }}><span className="font-medium">{c.symbol}</span> {c.code}</span>
                      </span>
                      {c.code === currency && <BiIcon name="bi-check" style={{ fontSize: 16, color: "#D97706" }} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}