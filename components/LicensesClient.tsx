"use client";

import { BiIcon } from "components/BiIcon";

import Link from "next/link";
import { useLanguage } from "lib/i18n";

export default function LicensesClient() {
  const { t } = useLanguage();

  const freeLicense = [
    { icon: "bi-briefcase", text: t("licenses_free_li_1") },
    { icon: "bi-hdd", text: t("licenses_free_li_2") },
    { icon: "bi-hand-thumbs-up", text: t("licenses_free_li_3") },
    { icon: "bi-x-octagon", text: t("licenses_free_li_4") },
  ];

  const artLicense = [
    { icon: "bi-patch-check", text: t("licenses_art_li_1") },
    { icon: "bi-pen", text: t("licenses_art_li_2") },
    { icon: "bi-lock", text: t("licenses_art_li_3") },
  ];

  const notes = [t("licenses_note_1"), t("licenses_note_2")];

  return (
    <div className="bg-background text-foreground">
      <div className="container py-5" style={{ maxWidth: 980 }}>
        {/* En-tête */}
        <div className="text-center mb-12 pt-4">
          <div className="gallery-label mb-3" style={{ color: "var(--ap-gold-2)" }}>{t("licenses_title")}</div>
          <h1 className="font-serif font-bold mb-3 text-3xl md:text-4xl">
            {t("licenses_title")}
          </h1>
          <p className="text-muted-foreground mx-auto mb-0 text-base md:text-lg leading-relaxed" style={{ maxWidth: 640 }}>
            {t("licenses_subtitle")}
          </p>
        </div>

        {/* Cartes comparatives — hauteur identique */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Licence Libre */}
          <div className="bg-card rounded-2xl p-8 border border-border shadow-sm flex flex-col">
            <span className="inline-flex items-center gap-2 w-fit mb-4 bg-card/80 text-card-foreground border border-border font-medium text-xs uppercase tracking-wider px-4 py-1.5 rounded-full">
              <BiIcon name="bi-unlock" className="text-amber-500" />
              {t("licenses_free_badge")}
            </span>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-5">{t("licenses_free_title")}</h2>
            <ul className="list-none p-0 m-0 flex flex-col gap-4 grow">
              {freeLicense.map((li) => (
                <li key={li.icon} className="flex items-start gap-3">
                  <span className="inline-flex items-center justify-center shrink-0 bg-card/80 text-amber-400 border border-border rounded-xl p-2.5">
                    <BiIcon name={li.icon} />
                  </span>
                  <span className="text-muted-foreground font-medium text-sm leading-relaxed">{li.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Licence Tirage d'Art — carte sombre Premium */}
          <div className="bg-card border border-border shadow-xl rounded-2xl p-8 flex flex-col ring-1 ring-white/10">
            <span className="inline-flex items-center gap-2 w-fit mb-4 bg-card/80 text-card-foreground border border-border font-medium text-xs uppercase tracking-wider px-4 py-1.5 rounded-full">
              <BiIcon name="bi-stars" className="text-amber-600 dark:text-amber-500/90" />
              {t("licenses_art_badge")}
            </span>
            <h2 className="font-serif font-bold text-2xl text-foreground mb-5">{t("licenses_art_title")}</h2>
            <ul className="list-none p-0 m-0 flex flex-col gap-4 grow">
              {artLicense.map((li) => (
                <li key={li.icon} className="flex items-start gap-3">
                  <span className="inline-flex items-center justify-center shrink-0 bg-card/80 text-amber-400 border border-border rounded-xl p-2.5">
                    <BiIcon name={li.icon} />
                  </span>
                  <span className="text-muted-foreground font-medium text-sm leading-relaxed">{li.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bon à savoir */}
        <div className="bg-card rounded-2xl p-8 border border-border max-w-5xl mx-auto my-8">
          <h3 className="font-serif text-xl font-medium flex items-center gap-2 mb-4 text-foreground">
            <BiIcon name="bi-info-circle" className="text-amber-600 dark:text-amber-500/90" />
            {t("licenses_note_title")}
          </h3>
          <ul className="list-none p-0 m-0 flex flex-col gap-4">
            {notes.map((n, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-amber-600 dark:text-amber-500/90 text-base mt-0.5"><BiIcon name="bi-check-circle" /></span>
                <span className="text-muted-foreground font-medium text-base leading-relaxed">{n}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="flex items-center justify-center gap-4 my-8 pb-6 flex-wrap">
          <Link
            href="/photos"
            className="bg-transparent hover:bg-white/10 text-white border border-white/30 font-semibold px-6 py-3 rounded-xl transition-all inline-flex items-center gap-2"
          >
            <BiIcon name="bi-images" />{t("help_btn_free")}
          </Link>
          <Link
            href="/prints"
            className="bg-card text-card-foreground hover:opacity-90 font-semibold px-6 py-3 rounded-xl shadow-md transition-all inline-flex items-center gap-2"
          >
            <BiIcon name="bi-bag" />{t("help_btn_prints")}
          </Link>
        </div>
      </div>
    </div>
  );
}
