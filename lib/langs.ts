/**
 * Aperio language codes & constants — server-safe, no React (can be imported
 * from Server Components, Route Handlers and lib/* without a "use client"
 * proxy). Client components re-import from here via lib/i18n.tsx.
 */

export type LangCode =
  | "en"
  | "fr"
  | "mg"
  | "es"
  | "pt"
  | "de"
  | "it"
  | "ar"
  | "zh"
  | "ja";

export const ALL_LANGUAGES: { code: LangCode; name: string; flag: string }[] = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "mg", name: "Malagasy", flag: "🇲🇬" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "pt", name: "Português", flag: "🇵🇹" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
];

export const SUPPORTED_LANGS = [
  "en",
  "fr",
  "mg",
  "es",
  "pt",
  "de",
  "it",
  "ar",
  "zh",
  "ja",
] as const;

/** Right-to-left languages (for html dir attribute). */
export const RTL_LANGS: readonly LangCode[] = ["ar"];

/** Maps the active {@link LangCode} to a BCP-47 locale for Intl.* formatters. */
export const LANG_LOCALE: Record<LangCode, string> = {
  en: "en",
  fr: "fr",
  mg: "mg",
  es: "es",
  pt: "pt",
  de: "de",
  it: "it",
  ar: "ar",
  zh: "zh",
  ja: "ja",
};

export function langLocale(lang: LangCode): string {
  return LANG_LOCALE[lang] ?? "en";
}