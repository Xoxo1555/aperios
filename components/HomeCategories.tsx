"use client";

import Link from "next/link";
import { useLanguage } from "lib/i18n";
import { blurDataUrl } from "lib/utils";
import Image from "next/image";
import { BiIcon } from "components/BiIcon";
import type { CategoryDto } from "lib/types";

interface Props {
  categories: CategoryDto[];
}

export default function HomeCategories({ categories }: Props) {
  const { t } = useLanguage();

  return (
    <section className="container py-10 lg:py-12">
      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <div className="gallery-label" style={{ fontFamily: "var(--font-accent)" }}>{t("home_categories_label")}</div>
          <h2 className="font-serif font-bold" style={{ fontSize: "clamp(1.8rem, 3vw, 2.4rem)", color: "var(--ap-title)", lineHeight: 1.1 }}>{t("home_categories_title")}</h2>
          <p className="mt-2 mb-0" style={{ color: "var(--ap-muted)", fontSize: "0.98rem", maxWidth: "640px" }}>{t("home_categories_sub")}</p>
        </div>
        <Link
          href="/photos"
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] whitespace-nowrap bg-card text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("home_all_categories")}
          <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-arrow-right" /></span>
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
        {categories.slice(0, 8).map((c) => (
          <Link key={c.id} href={`/${c.kind === "art" ? "prints" : "photos"}?category=${c.slug}`} className="category-card group">
            <Image
              src={c.coverUrl ?? "/images/isalo.jpg"}
              alt={c.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 25vw"
              unoptimized={process.env.NODE_ENV === "development"}
              className="object-cover"
              loading="lazy"
              quality={90}
              placeholder="blur"
              blurDataURL={blurDataUrl()}
            />
            <div className="cat-label">
              <span className="cat-icon"><BiIcon name={c.icon} /></span>
              <div className="font-semibold" style={{ fontSize: "0.98rem", fontFamily: "var(--font-sans)" }}>{c.name}</div>
              <div className="line-clamp-1" style={{ fontSize: "0.76rem", opacity: 0.85, color: "#D6D3D1" }}>{c.description}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
