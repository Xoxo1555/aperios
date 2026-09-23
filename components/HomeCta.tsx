"use client";

import Link from "next/link";
import { useLanguage } from "lib/i18n";
import BubbleField from "./BubbleField";

/* Final CTA of the home page. Client component so its labels follow the
   active language, and its "dashboard" button uses the premium dark /
   amber-outlined style instead of the plain white ghost button. */
export default function HomeCta() {
  const { t } = useLanguage();

  return (
    <section className="container py-5">
      <div className="rounded-2xl p-5 text-center relative overflow-hidden" style={{ border: "1px solid var(--ap-border)", background: "linear-gradient(120deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))" }}>
        <div className="pattern-lamba" style={{ position: "absolute", inset: 0, opacity: 0.3 }} />
        <BubbleField variant="compact" />
        <div className="relative z-10">
          <div className="gallery-stamp mb-4 mx-auto">
            <i className="bi bi-camera" />
            {t("cta_stamp")}
          </div>
          <h2 className="font-serif font-bold mb-3" style={{ fontSize: "2rem" }}>{t("cta_title")}</h2>
          <p className="gallery-sub mx-auto mb-4">
            {t("cta_desc")}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/register" className="btn btn-gold btn-lg"><i className="bi bi-upload me-2" />{t("start_publishing")}</Link>
            <Link href="/dashboard" className="btn btn-premium btn-lg"><i className="bi bi-grid-1x2-fill me-2" style={{ fontSize: 18 }} />{t("view_dashboard")}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
