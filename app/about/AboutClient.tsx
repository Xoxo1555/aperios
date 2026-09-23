"use client";

import Image from "next/image";
import { BiIcon } from "components/BiIcon";
import Link from "next/link";
import { useLanguage } from "lib/i18n";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1516426122078-c23e76319801?q=80&w=1600&auto=format&fit=crop";
const CRAFT_IMAGE = "/images/art/sculpture-1.jpg";

const SECTIONS = [
  { key: "about_vision", titleKey: "about_vision_title", icon: "bi-eye" },
  { key: "about_mission", titleKey: "about_mission_title", icon: "bi-bullseye" },
  { key: "about_concept", titleKey: "about_concept_title", icon: "bi-brush" },
  { key: "about_manifesto_poem", titleKey: "about_manifesto_title", icon: "bi-feather" },
] as const;

const STATS = [
  { valueKey: "about_stat_creators_value", labelKey: "about_stat_creators_label" },
  { valueKey: "about_stat_certified_value", labelKey: "about_stat_certified_label" },
  { valueKey: "about_stat_limited_value", labelKey: "about_stat_limited_label" },
] as const;

function StatValue({ value }: { value: string }) {
  const idx = value.indexOf("%");
  return (
    <div className="text-4xl lg:text-5xl font-extrabold font-serif" style={{ color: "var(--ap-gold-light)" }}>
      {idx === -1 ? (
        value
      ) : (
        <>
          {value.slice(0, idx)}
          <span className="text-amber-700 dark:text-amber-400">%</span>
        </>
      )}
    </div>
  );
}

export default function AboutClient() {
  const { t } = useLanguage();

  return (
    <div className="bg-background text-foreground">
      {/* HERO — image nette + overlay gradient propre */}
      <section
        className="relative flex items-end overflow-hidden"
        style={{ minHeight: "72vh", borderRadius: "0 0 32px 32px" }}
      >
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          sizes="100vw"
          priority
          unoptimized={process.env.NODE_ENV === "development"}
          className="object-cover"
          quality={95}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="relative z-10 w-full">
          <div className="container pb-20 pt-28">
            <span className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-border text-zinc-200 text-xs uppercase px-4 py-1.5 rounded-full font-serif">
              <BiIcon name="bi-camera" style={{ fontSize: 16 }} />
              Aperio · Art Gallery · Photography
            </span>
            <h1 className="mt-6 !text-white font-extrabold font-serif text-4xl sm:text-5xl lg:text-6xl max-w-3xl drop-shadow-md">
              {t("about_hero_title")}
            </h1>
            <p className="mt-4 text-neutral-300 text-lg max-w-xl font-normal">{t("about_hero_sub")}</p>
          </div>
        </div>
      </section>

      {/* CHIFFRES CLÉS */}
      <section className="container my-16">
        <div className="text-center mb-10">
          <div className="gallery-label" style={{ color: "var(--ap-gold-2)" }}>{t("about_stats_title")}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STATS.map((s) => (
            <div
              key={s.valueKey}
              className="bg-card border border-border rounded-2xl p-8 text-center shadow-sm hover:border-amber-500/50 hover:shadow-lg transition-all"
            >
              <StatValue value={t(s.valueKey)} />
              <p className="text-muted-foreground font-medium text-sm mt-2">{t(s.labelKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* NOTRE HISTOIRE & VALEURS — grille 2x2 */}
      <section className="container my-16">
        <div className="text-center mb-10">
          <div className="gallery-label" style={{ color: "var(--ap-gold-2)" }}>{t("about_tagline")}</div>
          <h2 className="font-serif font-bold text-3xl md:text-4xl mb-3 text-foreground">
            {t("about_manifesto")}
          </h2>
          <p className="text-muted-foreground leading-relaxed text-base max-w-2xl mx-auto">{t("about_manifesto_poem")}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {SECTIONS.map((s, i) => (
            <div
              key={s.key}
              className="bg-card rounded-2xl p-8 border border-border shadow-sm flex flex-col justify-between"
            >
              <div>
                <span className="inline-flex items-center gap-2 bg-card/80 text-card-foreground border border-border font-medium px-3 py-1 rounded-full text-sm w-fit mb-4">
                  <BiIcon name={s.icon} className="text-amber-600 dark:text-amber-500" />
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="font-serif text-2xl font-bold text-foreground mb-3">{t(s.titleKey)}</h2>
                <p className="text-muted-foreground leading-relaxed text-base">{t(s.key)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SAVOIR-FAIRE & IMPRESSION FINE ART */}
      <section className="container my-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 bg-card/80 text-card-foreground border border-border font-medium px-3 py-1 rounded-full text-sm w-fit mb-4">
              <BiIcon name="bi-printer" style={{ fontSize: 16 }} className="text-amber-600 dark:text-amber-500" />
              {t("about_craft_title")}
            </span>
            <p className="text-muted-foreground leading-relaxed text-base mb-4">{t("about_craft_p1")}</p>
            <p className="text-muted-foreground leading-relaxed text-base">{t("about_craft_p2")}</p>
          </div>
          <div className="relative w-full max-h-[520px] min-h-[320px] aspect-[4/3] lg:aspect-auto overflow-hidden rounded-2xl border border-border shadow-xl">
            <Image
              src={CRAFT_IMAGE}
              alt=""
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              loading="lazy"
              className="object-cover"
              quality={90}
            />
          </div>
        </div>
      </section>

      {/* CTA FINAL — bannière sombre harmonisée clair/sombre */}
      <section className="container py-5 pb-16">
        <div className="bg-[#141416] text-white rounded-2xl p-10 md:p-16 text-center relative overflow-hidden shadow-xl border border-white/10 ring-1 ring-white/10">
          <div className="relative">
            <h2 className="font-serif text-3xl md:text-4xl font-bold !text-white mb-4" style={{ color: "#ffffff" }}>{t("about_manifesto")}</h2>
            <p className="text-neutral-300 text-lg max-w-2xl mx-auto mb-8">{t("about_hero_sub")}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/photos"
                className="hover:opacity-90 font-semibold px-8 py-3.5 rounded-xl transition-all shadow-md"
                style={{ background: "#ffffff", color: "#141416" }}
              >
                {t("about_explore_gallery")}
              </Link>
              <Link
                href="/register"
                className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-semibold px-8 py-3.5 rounded-xl transition-all backdrop-blur-sm"
              >
                {t("about_become_artist")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}