"use client";

import Link from "next/link";
import FeaturedCarousel from "./FeaturedCarousel";
import PhotoCard from "./PhotoCard";
import { BiIcon } from "components/BiIcon";
import { useLanguage, type DictKey } from "lib/i18n";
import type { PhotoDto } from "lib/types";

interface Props {
  labelKey: DictKey;
  titleKey: DictKey;
  subKey: DictKey;
  linkKey: DictKey;
  linkHref: string;
  linkVariant?: "gold" | "ghost";
  photos: PhotoDto[];
  variant?: "landscape" | "portrait" | "grid";
}

export default function HomeCarouselSection({
  labelKey,
  titleKey,
  subKey,
  linkKey,
  linkHref,
  photos,
  variant = "landscape",
}: Props) {
  const { t } = useLanguage();

  if (photos.length === 0) return null;

  return (
    <section className="container py-10 lg:py-12">
      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <div className="gallery-label" style={{ fontFamily: "var(--font-accent)" }}>{t(labelKey)}</div>
          <h2 className="font-serif font-bold" style={{ fontSize: "clamp(1.8rem, 3vw, 2.4rem)", color: "var(--ap-title)", lineHeight: 1.1 }}>{t(titleKey)}</h2>
          <p className="mt-2 mb-0" style={{ color: "var(--ap-muted)", maxWidth: "640px" }}>{t(subKey)}</p>
        </div>
        <Link
          href={linkHref}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-all hover:opacity-90 active:scale-[0.98] bg-card text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t(linkKey)}
          <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-arrow-right" /></span>
        </Link>
      </div>
      {variant === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {photos.slice(0, 12).map((p, i) => (
            <PhotoCard key={p.id} photo={p} priority={i < 2} />
          ))}
        </div>
      ) : (
        <FeaturedCarousel photos={photos} variant={variant} />
      )}
    </section>
  );
}
