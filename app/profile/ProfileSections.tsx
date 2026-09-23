"use client";

import Link from "next/link";
import { BiIcon } from "components/BiIcon";
import { useLanguage } from "lib/i18n";
import { usePrice } from "lib/currency";
import { formatDate } from "lib/utils";
import type { CollectionDto, PhotoDto } from "lib/types";
import PhotoCard from "components/PhotoCard";
import Image from "next/image";
import { EmptyState } from "components/ui/EmptyState";

interface PayoutRow {
  id: number;
  reference: string;
  amount: string;
  method: string;
  account_name: string | null;
  status: string;
  created_at: Date;
}

interface ProfileSectionsProps {
  isCreator: boolean;
  availableBalance: string;
  downloads: number;
  featured: number;
  payouts: PayoutRow[];
  myPhotos: PhotoDto[];
  collections: CollectionDto[];
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

export default function ProfileSections(props: ProfileSectionsProps) {
  const { t } = useLanguage();
  const price = usePrice();
  const { isCreator, availableBalance, downloads, featured, payouts, myPhotos, collections } = props;

  if (isCreator) {
    return (
      <>
        <div className="mt-4">
          <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
            <h2 className="font-display font-bold mb-3" style={{ fontSize: "1.25rem" }}>
              <BiIcon name="bi-wallet2" className="text-gold me-2" />{t("earnings_payouts")}
            </h2>
            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <div className="stat-tile">
                  <div className="value font-display">{price(availableBalance)}</div>
                  <div className="label">{t("available_balance")}</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="stat-tile">
                  <div className="value font-display">{fmtNum(downloads)}</div>
                  <div className="label">{t("stat_downloads")}</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="stat-tile">
                  <div className="value font-display">{payouts.length}</div>
                  <div className="label">{t("payouts_made")}</div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link href="/payout" className="btn btn-gold"><BiIcon name="bi-arrow-up-right" className="me-2" style={{ fontSize: "18px", color: "#0b0906" }} />{t("request_a_payout")}</Link>
              <Link href="/dashboard" className="btn btn-ghost"><BiIcon name="bi-grid-1x2" className="me-2" style={{ fontSize: "18px" }} />{t("dashboard")}</Link>
            </div>
            {payouts.length > 0 && (
              <div className="mt-4">
                <div className="gallery-label">{t("recent_payouts")}</div>
                <div style={{ maxHeight: 220, overflow: "auto" }}>
                  {payouts.map((p) => (
                    <div key={p.id} className="flex justify-between py-2" style={{ borderBottom: "1px solid var(--ap-border)" }}>
                      <div>
                        <div className="fw-semibold" style={{ fontSize: "0.88rem" }}>{p.reference}</div>
                        <div className="text-muted-2" style={{ fontSize: "0.75rem" }}>
                          {p.method} · {p.account_name} · {p.status}
                        </div>
                      </div>
                      <div className="text-right">
                         <div className="text-gold font-bold">{price(p.amount)}</div>
                        <div className="text-muted-2" style={{ fontSize: "0.7rem" }}>{formatDate(p.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <section className="mt-4">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="gallery-label">{t("my_works")}</div>
              <h2 className="font-display font-bold mb-0" style={{ fontSize: "1.3rem" }}>
                <BiIcon name="bi-images" className="text-gold me-2" />{t("published_photographs")}
              </h2>
              <p className="text-muted-2 mb-0" style={{ fontSize: "0.85rem" }}>
                {t("featured_count", { count: String(featured) })}
              </p>
            </div>
            <Link href="/dashboard" className="btn btn-gold btn-sm">{t("manage")} <BiIcon name="bi-arrow-right" className="ms-1" /></Link>
          </div>
          {myPhotos.length === 0 ? (
            <EmptyState
              icon="bi-images"
              title={t("no_photos_published_yet")}
              action={<Link href="/dashboard" className="btn btn-gold">{t("publish_first_photo")}</Link>}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">{myPhotos.map((p) => <PhotoCard key={p.id} photo={p} />)}</div>
          )}
        </section>
      </>
    );
  }

  return (
    <section className="mt-4">
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="gallery-label">{t("my_collections")}</div>
          <h2 className="font-display font-bold mb-0" style={{ fontSize: "1.3rem" }}>
            <BiIcon name="bi-heart" className="text-gold me-2" />{t("saved_collections")}
          </h2>
          <p className="text-muted-2 mb-0" style={{ fontSize: "0.85rem" }}>
            {t("saved_collections_sub")}
          </p>
        </div>
        <Link href="/photos" className="btn btn-gold btn-sm">{t("discover")} <BiIcon name="bi-arrow-right" className="ms-1" /></Link>
      </div>
      {collections.length === 0 ? (
        <EmptyState
          icon="bi-bookmark-heart"
          title={t("profile_no_collections")}
          action={<Link href="/photos" className="btn btn-gold">{t("create_first_collection")}</Link>}
        />
      ) : (
        <div className="row g-3">
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
                  <div style={{ fontSize: "0.75rem", opacity: 0.85 }}>{t("photos_plural_count", { count: String(c.photoCount) })}</div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
