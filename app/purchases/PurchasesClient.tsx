"use client";

import Link from "next/link";
import Image from "next/image";
import { langLocale, useLanguage, type DictKey } from "lib/i18n";
import { usePrice } from "lib/currency";
import { formatDate } from "lib/utils";
import { BiIcon } from "components/BiIcon";

export interface PurchaseRow {
  orderNumber: string;
  createdAt: string;
  total: string;
  status: string;
  itemId: number;
  photoId: number;
  title: string | null;
  slug: string | null;
  imageUrl: string | null;
  licenseType: string | null;
}

const STATUS_KEY: Record<string, DictKey> = {
  completed: "status_completed",
  paid: "status_paid",
};

export default function PurchasesClient({ rows }: { rows: PurchaseRow[] }) {
  const { t, lang } = useLanguage();
  const price = usePrice();

  const grouped = new Map<string, PurchaseRow[]>();
  for (const r of rows) {
    const arr = grouped.get(r.orderNumber) ?? [];
    arr.push(r);
    grouped.set(r.orderNumber, arr);
  }

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <div className="gallery-label">
        <BiIcon name="bi-download" className="me-1 text-gold" />HD
      </div>
      <h1 className="font-display font-bold mb-1">{t("my_hd_purchases")}</h1>
      <p className="text-muted-2 mb-4" style={{ fontSize: "0.95rem" }}>
        {t("purchases_intro")}
      </p>

      {grouped.size === 0 ? (
        <div className="text-center" style={{ background: "var(--ap-card)", border: "1px solid var(--ap-border)", borderRadius: 16, padding: "3rem 1rem", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <span className="inline-flex items-center justify-center rounded-circle mx-auto mb-3" style={{ width: 72, height: 72, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
            <BiIcon name="bi-bag" style={{ fontSize: "1.9rem", color: "var(--ap-gold)" }} />
          </span>
          <h2 className="font-display font-bold mb-1" style={{ fontSize: "1.25rem", color: "var(--ap-card-foreground)" }}>{t("purchases_empty_title")}</h2>
          <p className="text-muted-2 mb-4" style={{ maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>{t("purchases_empty_sub")}</p>
          <Link href="/photos" className="btn btn-gold">{t("browse_gallery")}</Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {[...grouped.entries()].map(([orderNumber, items]) => (
            <div key={orderNumber} className="bg-surface rounded-2xl p-4 border" style={{ borderColor: "var(--ap-border)" }}>
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <div>
                  <div className="font-bold" style={{ fontSize: "0.95rem" }}>{orderNumber}</div>
                  <div className="text-muted-2" style={{ fontSize: "0.78rem" }}>
                    {formatDate(items[0].createdAt, langLocale(lang))} · {price(parseFloat(items[0].total))}
                  </div>
                </div>
                <span className="badge rounded-pill" style={{ fontSize: "0.7rem", background: "rgba(125,189,140,0.15)", color: "var(--ap-green)", border: "1px solid rgba(125,189,140,0.4)", textTransform: "capitalize" }}>
                  <BiIcon name="bi-check-circle" className="me-1" />
                  {t(STATUS_KEY[items[0].status] ?? "status_paid")}
                </span>
              </div>

              <div className="grid gap-2">
                {items.map((item) => (
                  <div key={item.itemId} className="flex items-center gap-3 bg-surface-2 rounded-lg p-2" style={{ border: "1px solid var(--ap-border)" }}>
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.title ?? ""} width={56} height={56} className="object-cover" unoptimized={process.env.NODE_ENV === "development"} style={{ borderRadius: 6 }} />
                    ) : (
                      <span className="inline-flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 6, background: "var(--ap-surface)" }}>
                        <BiIcon name="bi-image" className="text-muted-2" />
                      </span>
                    )}
                    <div className="grow">
                      <Link href={`/photo/${item.slug}`} className="fw-semibold" style={{ fontSize: "0.85rem" }}>{item.title}</Link>
                      <div className="text-muted-2" style={{ fontSize: "0.72rem" }}>
                        {item.licenseType === "commercial" ? t("license_commercial") : t("license_personal")}
                      </div>
                    </div>
                    <a className="btn btn-gold btn-sm" href={`/api/photos/${item.photoId}/file`} download>
                      <BiIcon name="bi-download" className="me-1" />{t("download_hd")}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}