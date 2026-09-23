"use client";

import { BiIcon } from "components/BiIcon";

import { useLanguage } from "lib/i18n";

/* "Two paths, one gallery" section of the home page. Client component so
   its labels follow the active language (the surrounding page is a server
   component and cannot call useLanguage). */
const STEPS = [
  { icon: "bi-cloud-arrow-down", titleKey: "how_free_title", descKey: "how_free_desc" },
  { icon: "bi-patch-check", titleKey: "how_limited_title", descKey: "how_limited_desc" },
  { icon: "bi-shield-check", titleKey: "how_certified_title", descKey: "how_certified_desc" },
] as const;

export default function HomeHowItWorks() {
  const { t } = useLanguage();

  return (
    <section className="container py-5">
      <div className="text-center mb-5">
        <div className="gallery-label">{t("home_how_label")}</div>
        <h2 className="section-title font-serif font-bold" style={{ color: "var(--ap-title)" }}>{t("home_how_title")}</h2>
      </div>
      <div className="row g-4">
        {STEPS.map((s) => (
          <div className="col-md-4" key={s.titleKey}>
            <div className="rounded-2xl p-6 h-full relative flex flex-col" style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "var(--ap-shadow-card)" }}>
              <span className="inline-flex items-center justify-center mb-4 shrink-0" style={{ width: 52, height: 52, borderRadius: 12, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.30)", color: "#fbbf24" }}>
                <BiIcon name={s.icon} style={{ fontSize: "1.4rem", color: "#fbbf24" }} />
              </span>
              <h5 className="font-serif font-bold mb-2" style={{ color: "#FFFFFF", fontSize: "1.1rem", lineHeight: 1.3 }}>{t(s.titleKey)}</h5>
              <p className="mb-0" style={{ color: "#E5E5E5", fontSize: "0.92rem", lineHeight: 1.65 }}>{t(s.descKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
