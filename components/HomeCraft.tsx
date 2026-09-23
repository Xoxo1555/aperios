"use client";

import Link from "next/link";
import { useLanguage } from "lib/i18n";
import type { CategoryDto, PhotoDto } from "lib/types";
import PhotoCard from "./PhotoCard";

interface Props {
  photos: PhotoDto[];
  craftCategory?: CategoryDto;
  artCategory?: CategoryDto;
}

export default function HomeCraft({ photos, craftCategory, artCategory }: Props) {
  const { t } = useLanguage();

  if (photos.length === 0) return null;

  return (
    <section className="py-12 sm:py-16 relative" style={{ background: "#f8f5f0", borderTop: "1px solid var(--ap-border)", borderBottom: "1px solid var(--ap-border)" }}>
      <div className="max-w-7xl mx-auto px-4 relative">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3 text-amber-600">
            <i className="bi bi-palette-fill text-lg" aria-hidden="true"></i>
          </div>
          <span className="text-xs font-bold tracking-widest text-amber-600 uppercase mb-2">MALAGASY ART & CRAFT</span>
          <h2 className="text-3xl sm:text-4xl font-serif text-neutral-900 max-w-2xl leading-tight mb-4">
            Beyond the landscapes: the island&apos;s craftsmanship.
          </h2>
          <p className="text-neutral-600 max-w-2xl leading-relaxed">{t("home_craft_desc")}</p>
          <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
            {craftCategory && (
              <Link
                href={`/prints?category=${craftCategory.slug}`}
                className="btn btn-gold px-6"
              >
                <i className="bi bi-hammer me-1 text-amber-400 dark:text-amber-500" />{t("home_craft_btn")}
              </Link>
            )}
            {artCategory && (
              <Link
                href={`/prints?category=${artCategory.slug}`}
                className="btn btn-outline px-6"
              >
                <i className="bi bi-palette-fill me-1 text-amber-600 dark:text-amber-400" />{t("home_craft_paintings")}
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto px-4">
          {photos.slice(0, 6).map((p) => (
            <PhotoCard key={p.id} photo={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
