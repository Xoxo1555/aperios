"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";
import { useCart } from "lib/cart";
import { computeUnitPrice } from "lib/pricing";
import { round2 } from "lib/utils";
import { useLanguage } from "lib/i18n";
import { usePrice } from "lib/currency";
import type { MountDto, PhotoDto, PrintSizeDto } from "lib/types";
import { BiIcon } from "components/BiIcon";

interface Props {
  photo: PhotoDto;
  sizes: PrintSizeDto[];
  mounts: MountDto[];
}

export default function PrintCustomizer({ photo, sizes, mounts }: Props) {
  const { user } = useSession();
  const { t } = useLanguage();
  const { addItem, setOpen } = useCart();
  const price = usePrice();
  const router = useRouter();
  const [sizeId, setSizeId] = useState<number>(sizes.find((s) => s.multiplier === 1)?.id ?? sizes[0]?.id ?? 0);
  const [mountId, setMountId] = useState<number>(mounts[0]?.id ?? 0);
  const [added, setAdded] = useState(false);

  const size = sizes.find((s) => s.id === sizeId) ?? sizes[0];
  const mount = mounts.find((m) => m.id === mountId) ?? mounts[0];

  const unitPrice = useMemo(() => {
    if (!size || !mount) return 0;
    return computeUnitPrice(photo.basePrice, size.multiplier, mount.multiplier, mount.surcharge);
  }, [photo.basePrice, size, mount]);

  const sold = photo.totalEditions !== null && photo.availableStock !== null
    ? photo.totalEditions - photo.availableStock
    : 0;
  const nextEdition = sold + 1;
  const percentAvailable = photo.totalEditions && photo.availableStock !== null
    ? Math.round((photo.availableStock / photo.totalEditions) * 100)
    : 0;

  function addToCart() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/photo/${photo.slug}`)}`);
      return;
    }
    addItem({
      photoId: photo.id,
      slug: photo.slug,
      title: photo.title,
      imageUrl: photo.thumbUrl ?? photo.imageUrl,
      photographerName: photo.photographer.name,
      sizeLabel: size.label,
      mountName: mount.name,
      editionNumber: nextEdition,
      unitPrice,
      qty: 1,
    });
    setAdded(true);
    setTimeout(() => setOpen(true), 150);
  }

  if (!size || !mount) return null;

  return (
    <div>
      {/* Edition status */}
      <div className="limited-note mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="font-bold text-sm">
            <span className="inline-flex items-center justify-center shrink-0 me-1"><BiIcon name="bi-patch-check" /></span>
            {t("limited_edition_label")}
          </span>
          <span className="badge-limited badge rounded-pill text-sm">
            {t("editions_left", { count: String(photo.availableStock) })}
          </span>
        </div>
        <div className="progress-editions mb-1">
          <div className="bar" style={{ width: `${percentAvailable}%` }} />
        </div>
        <div className="text-muted-2 text-sm">
          {t("copies_sold", { sold: String(sold), total: String(photo.totalEditions ?? 0) })}
        </div>
        <div className="text-muted-2 text-sm">
          {t("edition_assigned_at_payment")}
        </div>
      </div>

      {/* Dimensions */}
      <div className="mb-3">
        <div className="filter-title">{t("print_size")}</div>
        <div className="row g-2" role="radiogroup" aria-label={t("print_size")}>
          {sizes.map((s) => (
            <div className="col-6 col-md-4" key={s.id}>
              <div
                role="radio"
                aria-checked={sizeId === s.id}
                tabIndex={0}
                className={`size-option text-center ${sizeId === s.id ? "active" : ""}`}
                onClick={() => setSizeId(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSizeId(s.id);
                  }
                }}
              >
                <div className="font-bold text-sm">{s.label}</div>
                <div className="text-gold font-bold mt-1 text-sm">
                  {price(computeUnitPrice(photo.basePrice, s.multiplier, mount.multiplier, mount.surcharge))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Support / Finition */}
      <div className="mb-3">
        <div className="filter-title">{t("mount_framing")}</div>
        <div className="grid gap-2" role="radiogroup" aria-label={t("mount_framing")}>
          {mounts.map((m) => {
            const mPrice = computeUnitPrice(photo.basePrice, size.multiplier, m.multiplier, m.surcharge);
            const delta = round2(mPrice - unitPrice);
            return (
              <div
                key={m.id}
                role="radio"
                aria-checked={mountId === m.id}
                tabIndex={0}
                className={`mount-option ${mountId === m.id ? "active" : ""}`}
                onClick={() => setMountId(m.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setMountId(m.id);
                  }
                }}
              >
                <div>
                  <div className="font-bold text-sm">{m.name}</div>
                  <div className="text-muted-2 text-sm">{m.description}</div>
                </div>
                <div className="ms-auto whitespace-nowrap fw-semibold text-sm">
                  {mountId === m.id ? (
                    <span className="text-gold font-bold text-sm" style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {t("selected_label")}
                    </span>
                  ) : delta > 0 ? (
                    <>+{price(delta)}</>
                  ) : (
                    <span className="text-muted-2">{price(delta)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Price + CTA */}
      <div className="flex items-center justify-between mt-4 mb-3">
        <div>
          <div className="text-muted-2 text-sm">{t("total_price")}</div>
          <div className="font-display font-bold" style={{ fontSize: "2rem", color: "var(--ap-gold-dark)" }}>
            {price(unitPrice)}
          </div>
          <div className="text-muted-2 text-sm">
            {t("cert_included")}
          </div>
        </div>
      </div>
      <button className="btn btn-gold btn-lg w-full" onClick={addToCart} disabled={added}>
        {added ? <><span className="inline-flex items-center justify-center shrink-0 me-2"><BiIcon name="bi-check-circle" /></span>{t("added_to_cart")}</> : <><span className="inline-flex items-center justify-center shrink-0 me-2"><BiIcon name="bi-bag" /></span>{t("add_to_cart")}</>}
      </button>
      <p className="text-muted-2 mt-2 mb-0 text-center text-sm">
        <span className="inline-flex items-center justify-center shrink-0 me-1"><BiIcon name="bi-lock" /></span> {t("secure_payment_hint")}
      </p>
    </div>
  );
}