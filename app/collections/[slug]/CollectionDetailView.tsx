"use client";

import Link from "next/link";
import { useLanguage } from "lib/i18n";
import type { PhotoDto } from "lib/types";
import PhotoCard from "components/PhotoCard";
import { BiIcon } from "components/BiIcon";

interface CollectionDetailViewProps {
  name: string;
  description: string | null;
  photoCount: number;
  photos: PhotoDto[];
}

export default function CollectionDetailView({ name, description, photoCount, photos }: CollectionDetailViewProps) {
  const { t } = useLanguage();

  return (
    <div className="container py-4">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0" style={{ fontSize: "0.85rem" }}>
          <li className="breadcrumb-item"><Link href="/collections">{t("nav_collections")}</Link></li>
          <li className="breadcrumb-item active" aria-current="page" style={{ color: "var(--ap-muted)" }}>{name}</li>
        </ol>
      </nav>

      <div className="flex items-center gap-3 mb-4">
        <span className="icon-btn" style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.35)" }}>
          <BiIcon name="bi-heart" className="text-gold" style={{ fontSize: "1.3rem" }} />
        </span>
        <div>
          <h1 className="font-display font-bold mb-0">{name}</h1>
          <p className="text-muted-2 mb-0">
            {description ?? t("curated_collection")} · {t("photos_count", { count: String(photoCount) })}
          </p>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="text-center" style={{ background: "var(--ap-card)", border: "1px solid var(--ap-border)", borderRadius: 16, padding: "3rem 1rem", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <span className="inline-flex items-center justify-center rounded-circle mx-auto mb-3" style={{ width: 72, height: 72, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
            <BiIcon name="bi-bookmark-heart" style={{ fontSize: "1.9rem", color: "var(--ap-gold)" }} />
          </span>
          <h2 className="font-display font-bold mb-0" style={{ fontSize: "1.25rem", color: "var(--ap-card-foreground)" }}>{t("collection_empty_title")}</h2>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map((p) => (
            <PhotoCard key={p.id} photo={p} />
          ))}
        </div>
      )}
    </div>
  );
}