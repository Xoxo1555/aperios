"use client";

import { BiIcon } from "components/BiIcon";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "components/ui/toast";
import { useLanguage } from "lib/i18n";

const STORAGE_KEY = "aperio-cookie-consent";

type ConsentState = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
};

const CATEGORIES = [
  {
    id: "essential" as const,
    icon: "bi-shield-lock",
    titleKey: "cookies_essential_title",
    descKey: "cookies_essential_desc",
    locked: true,
  },
  {
    id: "analytics" as const,
    icon: "bi-bar-chart",
    titleKey: "cookies_analytics_title",
    descKey: "cookies_analytics_desc",
    locked: false,
  },
  {
    id: "marketing" as const,
    icon: "bi-megaphone",
    titleKey: "cookies_marketing_title",
    descKey: "cookies_marketing_desc",
    locked: false,
  },
] as const;

export default function CookiesClient() {
  const { show: toast } = useToast();
  const { t } = useLanguage();
  const [consent, setConsent] = useState<ConsentState>({
    essential: true,
    analytics: false,
    marketing: false,
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ConsentState> & { savedAt?: string };
      setConsent({
        essential: true,
        analytics: parsed.analytics === true,
        marketing: parsed.marketing === true,
      });
      if (parsed.savedAt) setSavedAt(parsed.savedAt);
    } catch {
      // consentement absent ou corrompu → valeurs par défaut
    }
  }, []);

  function save(next: ConsentState) {
    setConsent(next);
    const savedAt = new Date().toLocaleString("fr-FR");
    setSavedAt(savedAt);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...next, savedAt }),
      );
    } catch {
      // stockage indisponible (navigation privée stricte) — on ignore
    }
    toast({ title: t("cookies_saved_toast"), variant: "success" });
  }

  function toggle(id: keyof ConsentState) {
    if (id === "essential") return;
    setConsent((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const handleAcceptAll = () => save({ essential: true, analytics: true, marketing: true });
  const handleRefuseAll = () => save({ essential: true, analytics: false, marketing: false });
  const handleSaveChoices = () => save(consent);

  return (
    <div className="bg-background text-foreground">
      <div className="container py-5" style={{ maxWidth: 860 }}>
        <div className="text-center mb-5 pt-4">
          <div className="gallery-label mb-3" style={{ color: "var(--ap-gold-2)" }}>{t("cookies_label")}</div>
          <h1 className="font-serif font-bold mb-3" style={{ fontSize: "clamp(1.9rem, 4vw, 2.8rem)" }}>
            {t("cookies_title")}
          </h1>
          <p className="text-muted-foreground mx-auto mb-2" style={{ maxWidth: 680, fontSize: "1.02rem", lineHeight: 1.7 }}>
            {t("cookies_intro")}
          </p>
          {savedAt && (
            <p className="text-muted-foreground text-sm mb-0">
              {t("cookies_last_updated", { date: savedAt })}
            </p>
          )}
        </div>

        <div className="grid gap-3 mb-4">
          {CATEGORIES.map((cat) => {
            const active = cat.id === "essential" ? true : consent[cat.id];
            return (
              <div
                key={cat.id}
                className={`bg-card rounded-2xl p-4 p-md-5 border transition-colors ${
                  active ? "border-amber-500/40" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center justify-center rounded-xl shrink-0"
                      style={{
                        width: 44,
                        height: 44,
                        background: "rgba(245,158,11,0.16)",
                        border: "1px solid rgba(245,158,11,0.35)",
                        color: "#f59e0b",
                        fontSize: "1.1rem",
                      }}
                    >
                      <BiIcon name={cat.icon} />
                    </span>
                    <h2 className="font-serif font-bold mb-0" style={{ fontSize: "1.05rem", color: "var(--ap-gold-2)" }}>
                      {t(cat.titleKey)}
                    </h2>
                  </div>

                  {cat.locked ? (
                    <span className="badge rounded-pill inline-flex items-center gap-1 uppercase border bg-emerald-500/10 text-emerald-700 border-emerald-600/30 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-500/40"
                      style={{ fontSize: "0.62rem", letterSpacing: "0.12em", padding: "0.45rem 0.85rem" }}
                    >
                      <BiIcon name="bi-lock" /> {t("cookies_always_active")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={consent[cat.id]}
                      aria-label={t(cat.titleKey)}
                      onClick={() => toggle(cat.id)}
                      className="relative shrink-0"
                      style={{
                        width: 52,
                        height: 28,
                        borderRadius: 999,
                        border: `1px solid ${consent[cat.id] ? "#f59e0b" : "var(--ap-border)"}`,
                        background: consent[cat.id] ? "rgba(245,158,11,0.35)" : "transparent",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <span
                        className="absolute rounded-circle"
                        style={{
                          top: 3,
                          left: consent[cat.id] ? 27 : 3,
                          width: 20,
                          height: 20,
                          background: consent[cat.id] ? "#f59e0b" : "var(--ap-muted)",
                          transition: "all 0.2s ease",
                        }}
                      />
                    </button>
                  )}
                </div>
                <p className="text-muted-foreground mt-3 mb-0" style={{ fontSize: "0.88rem", lineHeight: 1.65 }}>
                  {t(cat.descKey)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="bg-card rounded-2xl p-4 p-md-5 border border-border ring-1 ring-amber-500/10 text-center">
          <div className="flex flex-col md:flex-row items-center justify-center gap-3.5 w-full my-8">
            <button
              type="button"
              onClick={handleAcceptAll}
              style={{ borderRadius: 999 }}
              className="w-full md:w-auto px-6 py-3 rounded-full bg-card text-card-foreground hover:opacity-90 font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg hover:scale-105 cursor-pointer whitespace-nowrap"
            >
              <BiIcon name="bi-check" style={{ fontSize: 16 }} />
              <span>{t("cookies_accept_all")}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveChoices}
              style={{ borderRadius: 999 }}
              className="w-full md:w-auto px-6 py-3 rounded-full bg-card/90 border border-amber-600/60 text-amber-700 dark:text-amber-500 font-medium text-sm flex items-center justify-center gap-2 hover:bg-amber-500/15 transition-all hover:scale-105 cursor-pointer whitespace-nowrap shadow-md"
            >
              <BiIcon name="bi-save" style={{ fontSize: 16 }} />
              <span>{t("cookies_save_choices")}</span>
            </button>
            <button
              type="button"
              onClick={handleRefuseAll}
              style={{ borderRadius: 999 }}
              className="w-full md:w-auto px-6 py-3 rounded-full bg-card/60 border border-border text-neutral-600 dark:text-neutral-300 font-medium text-sm flex items-center justify-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white transition-all hover:scale-105 cursor-pointer whitespace-nowrap"
            >
              <BiIcon name="bi-x-lg" style={{ fontSize: 16 }} />
              <span>{t("cookies_refuse_all")}</span>
            </button>
          </div>
          <p className="text-muted-foreground mb-0 mt-2" style={{ fontSize: "0.78rem" }}>
            {t("cookies_legal_links_label")}{" "}
            <Link href="/privacy" className="link-underline-anim" style={{ color: "var(--ap-gold-2)" }}>
              {t("privacy_policy")}
            </Link>{" "}
            ·{" "}
            <Link href="/terms" className="link-underline-anim" style={{ color: "var(--ap-gold-2)" }}>
              {t("terms_of_sale")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}