"use client";

import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "lib/i18n";
import { BiIcon } from "components/BiIcon";
import type { CollectionDto } from "lib/types";
import NewCollectionForm from "components/NewCollectionForm";

export default function CollectionsView({ collections }: { collections: CollectionDto[] }) {
  const { t } = useLanguage();

  return (
    <div className="container py-4">
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display font-bold mb-0">{t("my_collections")}</h1>
          <NewCollectionForm />
        </div>
        <p className="text-muted-2 mt-2 mb-0">
          {t("collections_intro")}
        </p>
      </div>

      {collections.length === 0 ? (
        <div className="text-center py-5 bg-surface rounded-2xl">
          <BiIcon name="bi-heart" style={{ fontSize: "3rem", color: "var(--ap-muted)" }} />
          <h5 className="mt-3">{t("collections_empty_title")}</h5>
          <p className="text-muted-2 mb-3">{t("collections_empty_sub")}</p>
          <Link href="/photos" className="btn btn-gold">{t("browse_gallery")}</Link>
        </div>
      ) : (
        <div className="row g-4">
          {collections.map((c) => (
            <div className="col-6 col-md-4 col-lg-3" key={c.id}>
              <Link href={`/collections/${c.slug}`} className="category-card" style={{ aspectRatio: "1 / 1" }}>
                {c.coverUrl ? (
                  <Image
                    src={c.coverUrl}
                    alt={c.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover"
                    unoptimized={process.env.NODE_ENV === "development"}
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--ap-surface-2)" }}>
                    <BiIcon name="bi-images" style={{ fontSize: "2.4rem", color: "var(--ap-muted)" }} />
                  </div>
                )}
                <div className="cat-label">
                  <div className="font-bold font-display" style={{ fontSize: "1rem" }}>{c.name}</div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.85 }}>
                    {t("photos_count", { count: String(c.photoCount) })} · {c.isPublic ? t("public_label") : t("private_label")}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}