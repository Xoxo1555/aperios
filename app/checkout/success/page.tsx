"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePrice } from "lib/currency";
import { useLanguage } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

interface OrderItem {
  id: number;
  title: string | null;
  slug: string | null;
  imageUrl: string | null;
  licenseType: string;
}

interface OrderStatus {
  order: { orderNumber: string; status: string; kind: string | null; total: string; currency: string; paymentProvider: string | null };
  items: OrderItem[];
  certificates: Array<{ serialNumber: string; watermarkHash: string }>;
}

function SuccessInner() {
  const params = useSearchParams();
  const orderNumber = params.get("order") ?? "";
  const { t } = useLanguage();
  const price = usePrice();
  const [data, setData] = useState<OrderStatus | null>(null);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!orderNumber) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderNumber}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(json.error ?? t("order_not_found")); return; }
        setData(json);
        if (json.order.status !== "paid" && json.order.status !== "completed" && attempts < 8) {
          setTimeout(() => setAttempts((a) => a + 1), 1500);
        }
      } catch {
        if (!cancelled) setError(t("something_went_wrong"));
      }
    }
    poll();
    return () => { cancelled = true; };
  }, [orderNumber, attempts, t]);

  if (error) {
    return (
      <div className="max-w-[560px] mx-auto px-4 py-14 text-center">
        <BiIcon name="bi-exclamation-triangle" style={{ fontSize: "3rem", color: "var(--ap-red)" }} />
        <h1 className="font-serif font-bold mt-4 text-2xl">{error}</h1>
        <Link href="/" className="btn btn-gold mt-5 whitespace-nowrap">{t("back_to_gallery")}</Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-[700px] mx-auto px-4 py-14 text-center">
        <span className="inline-flex items-center justify-center" style={{ fontSize: "2.25rem", color: "var(--ap-accent)" }}>
          <BiIcon name="bi-arrow-clockwise" className="animate-spin" style={{ fontSize: "2.25rem" }} />
        </span>
        <p className="text-muted-2 mt-4">{t("checking_payment")}</p>
      </div>
    );
  }

  const isPaid = data.order.status === "paid" || data.order.status === "completed";
  const isDigital = data.order.kind === "digital";

  return (
    <div className="max-w-[700px] mx-auto px-4 py-10">
      <div
        className={`bg-card rounded-2xl p-6 sm:p-8 border text-center shadow-md animate-[apFadeUp_0.35s_ease_both] ${
          isPaid ? "border-green-200 dark:border-green-800" : "border-border"
        }`}
      >
        <span
          className={`inline-flex items-center justify-center rounded-full mb-5 w-20 h-20 border ${
            isPaid ? "bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-700" : "bg-[rgba(154,123,28,0.08)] border-border"
          }`}
        >
          {isPaid ? (
            <BiIcon name="bi-check-circle" style={{ fontSize: "2.5rem", color: "var(--ap-green)" }} />
          ) : (
            <BiIcon name="bi-hourglass-split" style={{ fontSize: "2.5rem", color: "var(--ap-accent)" }} />
          )}
        </span>
        <h1 className="font-serif font-bold mb-1.5 text-2xl sm:text-3xl">{isPaid ? t("payment_confirmed") : t("verification_in_progress")}</h1>
        <p className="text-muted-2 mb-1">{isPaid ? (isDigital ? t("hd_ready_note") : t("prints_in_production")) : t("waiting_confirmation")}</p>
        <p className="mb-6 text-sm">
          {t("cert_order")} <span className="text-gold font-bold">{data.order.orderNumber}</span> · <strong>{price(parseFloat(data.order.total))}</strong>
        </p>

        {isPaid && isDigital && data.items.length > 0 && (
          <div className="text-left bg-[#f8f6f0] bg-secondary rounded-xl p-4 mb-5 border border-border">
            <div className="gallery-label mb-2">{t("digital_license_label")}</div>
            {data.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center gap-3 py-2.5 border-b border-border last:border-b-0">
                <div className="grow min-w-0">
                  <div className="font-semibold truncate text-sm text-gray-900 dark:text-zinc-100">{item.title ?? `#${item.id}`}</div>
                  <div className="text-muted-2 text-xs mt-0.5">
                    {item.licenseType === "commercial" ? t("license_commercial") : t("license_personal")}
                  </div>
                </div>
                <a
                  className="btn btn-gold btn-sm shrink-0 whitespace-nowrap"
                  href={`/api/photos/${item.id}/file`}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <BiIcon name="bi-download" className="me-1" />{t("download_hd")}
                </a>
              </div>
            ))}
            {data.items.length > 0 && (
              <div className="mt-4 grid gap-2">
                <button
                  className="btn btn-gold w-full whitespace-nowrap"
                  onClick={() => {
                    for (const item of data.items) {
                      window.open(`/api/photos/${item.id}/file`, "_blank");
                    }
                  }}
                >
                  <BiIcon name="bi-download" className="me-1" />{t("download_hd_certified")}
                </button>
                <button
                  className="btn btn-ghost w-full whitespace-nowrap"
                  onClick={() => {
                    const firstItem = data.items[0];
                    window.open(`/api/photos/${firstItem.id}/file`, "_blank");
                  }}
                >
                  {t("download_all_photos")}
                </button>
              </div>
            )}
          </div>
        )}

        {isPaid && data.certificates.length > 0 && (
          <div className="text-left bg-[#f8f6f0] bg-secondary rounded-xl p-4 mb-5 border border-border">
            <div className="gallery-label mb-2">{t("certificates_of_auth")}</div>
            {data.certificates.map((c) => (
              <div key={c.serialNumber} className="flex justify-between items-center gap-3 py-2.5 border-b border-border last:border-b-0">
                <div className="min-w-0">
                  <div className="font-semibold truncate text-sm text-gray-900 dark:text-zinc-100">{c.serialNumber}</div>
                  <div className="text-muted-2 text-xs mt-0.5 truncate">{t("fingerprint_short")} {c.watermarkHash.slice(0, 16)}…</div>
                </div>
                <Link href={`/certificates/${c.serialNumber}`} className="btn btn-ghost btn-sm shrink-0 whitespace-nowrap">
                  {t("view")} <BiIcon name="bi-box-arrow-up-right" className="ms-1" />
                </Link>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 justify-center flex-wrap">
          {isDigital && isPaid && <Link href="/purchases" className="btn btn-gold whitespace-nowrap">{t("view_my_purchases")}</Link>}
          {!isDigital && <Link href="/prints" className="btn btn-gold whitespace-nowrap">{t("continue_shopping")}</Link>}
          <Link href="/" className="btn btn-ghost whitespace-nowrap">{t("back_to_gallery")}</Link>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="max-w-[700px] mx-auto px-4 py-14 text-center">
        <span className="inline-flex items-center justify-center" style={{ fontSize: "2.25rem", color: "var(--ap-accent)" }}>
          <BiIcon name="bi-arrow-clockwise" className="animate-spin" style={{ fontSize: "2.25rem" }} />
        </span>
      </div>
    }>
      <SuccessInner />
    </Suspense>
  );
}
