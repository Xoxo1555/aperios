"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "lib/cart";
import { useMounted } from "lib/hooks";
import { computeTotals } from "lib/pricing";
import { usePrice, useCurrency } from "lib/currency";
import { useLanguage, type DictKey } from "lib/i18n";
import Image from "next/image";
import type { MountDto, PrintSizeDto } from "lib/types";
import { BiIcon } from "components/BiIcon";

type PendingState =
  | { mode: "manual_confirmation"; orderNumber: string; amount: number; currency: string; instructions: string }
  | { mode: "pending_customer_confirmation"; orderNumber: string; reference: string };

const PAYMENT_METHODS = [
  {
    id: "card",
    nameKey: "pay_method_card" as DictKey,
    hintKey: "pay_method_card_hint" as DictKey,
    logo: (
      <span className="inline-flex items-center justify-center bg-white rounded shadow-sm px-1" style={{ width: 50, height: 32, border: "1px solid rgba(0,0,0,0.12)" }}>
        <Image src="/images/payments/visa.svg" alt="Visa" width={42} height={16} className="object-contain" />
      </span>
    ),
  },
  {
    id: "orange-money",
    name: "Orange Money",
    hintKey: "pay_method_orange_hint" as DictKey,
    logo: (
      <span className="inline-flex items-center justify-center bg-white rounded shadow-sm px-1" style={{ width: 50, height: 32, border: "1px solid rgba(0,0,0,0.12)" }}>
        <Image src="/images/payments/orange-money.svg" alt="Orange" width={42} height={18} className="object-contain" style={{ width: "auto", height: "auto" }} />
      </span>
    ),
  },
  {
    id: "mvola",
    name: "Yas Money (Mvola)",
    hintKey: "pay_method_yas_hint" as DictKey,
    logo: (
      <span className="inline-flex items-center justify-center bg-white rounded shadow-sm px-1" style={{ width: 50, height: 32, border: "1px solid rgba(0,0,0,0.12)" }}>
        <Image src="/images/payments/yas.svg" alt="Yas" width={42} height={22} className="object-contain" style={{ width: "auto", height: "auto" }} />
      </span>
    ),
  },
  {
    id: "airtel-money",
    name: "Airtel Money",
    hintKey: "pay_method_airtel_hint" as DictKey,
    logo: (
      <span className="inline-flex items-center justify-center bg-white rounded shadow-sm px-1" style={{ width: 50, height: 32, border: "1px solid rgba(0,0,0,0.12)" }}>
        <Image src="/images/payments/airtel.svg" alt="Airtel" width={42} height={22} className="object-contain" style={{ width: "auto", height: "auto" }} />
      </span>
    ),
  },
];

export default function CheckoutPage() {
  const mounted = useMounted();
  const router = useRouter();
  const { items, clear, setOpen } = useCart();
  const { t } = useLanguage();
  const price = usePrice();
  const { currency } = useCurrency();
  const [sizes, setSizes] = useState<PrintSizeDto[]>([]);
  const [mounts, setMounts] = useState<MountDto[]>([]);
  const [ship, setShip] = useState({ name: "", email: "", line1: "", city: "", state: "", zip: "", country: "France" });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [payment, setPayment] = useState("card");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingState | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  /** Clé d'idempotence (UUID) du paiement wallet EN COURS. Une clé = une
   *  tentative de paiement : elle reste stable tant que l'utilisateur réessaie
   *  le même paiement (la route la reréutilise pour reprendre le PENDING ordre
   *  au lieu de créer un doublon / re-débiter). Elle est régénérée quand le
   *  contenu du panier change et après un paiement réussi. */
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/meta").then((r) => r.json()).then((d) => { setSizes(d.sizes ?? []); setMounts(d.mounts ?? []); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.balance) setWalletBalance(parseFloat(d.balance)); })
      .catch(() => undefined);
  }, []);

  /** Signature du panier : nouveau contenu ⇒ nouvelle tentative ⇒ nouvelle
   *  clé d'idempotence (on ne veut PAS reréutiliser la clé d'un panier
   *  différent — la route répondrait 422). */
  const cartSignature = useMemo(
    () => items.map((i) => `${i.photoId}:${i.sizeLabel}:${i.mountName}:${i.qty}`).join("|"),
    [items],
  );

  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [cartSignature]);

  const sizeByLabel = useMemo(() => new Map(sizes.map((s) => [s.label, s])), [sizes]);
  const mountByName = useMemo(() => new Map(mounts.map((m) => [m.name, m])), [mounts]);
  const totals = computeTotals(items.map((i) => ({ unitPrice: i.unitPrice, qty: i.qty })));

  const walletEnabled = walletBalance !== null && walletBalance > 0;
  const walletSufficient = walletEnabled && walletBalance! >= totals.total;

  const paymentMethods = walletEnabled
    ? [
        ...PAYMENT_METHODS,
        {
          id: "wallet",
          nameKey: "pay_method_wallet" as DictKey,
          hintKey: "pay_method_wallet_hint" as DictKey,
          logo: (
            <span className="inline-flex items-center justify-center rounded" style={{ width: 50, height: 32, border: "1px solid var(--ap-border)" }}>
              <BiIcon name="bi-wallet2" style={{ fontSize: "1.1rem", color: "var(--ap-gold)" }} />
            </span>
          ),
        },
      ]
    : PAYMENT_METHODS;

  function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validatePhone(phone: string): boolean {
    const cleaned = phone.replace(/[^\d]/g, "").replace(/^261/, "0");
    return /^(\+\d{1,3}[- ]?)?\d{9,15}$/.test(cleaned) || /^3[2-9]\d{7}$/.test(cleaned);
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!ship.name.trim()) errors.name = t("checkout_ship_incomplete");
    if (!ship.email.trim()) errors.email = t("checkout_ship_incomplete");
    else if (!validateEmail(ship.email)) errors.email = t("checkout_email_invalid");
    if (!ship.line1.trim()) errors.line1 = t("checkout_ship_incomplete");
    if (!ship.city.trim()) errors.city = t("checkout_ship_incomplete");
    if (!ship.zip.trim()) errors.zip = t("checkout_ship_incomplete");
    if (!ship.country.trim()) errors.country = t("checkout_ship_incomplete");

    if (payment !== "card" && payment !== "wallet" && !phone.trim()) {
      errors.phone = t("checkout_phone_required");
    } else if (payment !== "card" && payment !== "wallet" && phone.trim() && !validatePhone(phone)) {
      errors.phone = t("checkout_phone_invalid");
    }

    const invalidItems = items.filter(
      (i) => !sizeByLabel.has(i.sizeLabel) || !mountByName.has(i.mountName)
    );
    if (invalidItems.length > 0) {
      errors.cart = t("checkout_cart_changed");
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function placeOrder(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    if (!validateForm()) {
      setBusy(false);
      return;
    }
    const payloadItems = items.map((i) => ({
      photoId: i.photoId,
      sizeId: sizeByLabel.get(i.sizeLabel)?.id ?? null,
      mountId: mountByName.get(i.mountName)?.id ?? null,
      qty: i.qty,
    }));
    const shipping = {
      shipName: ship.name,
      shipEmail: ship.email,
      shipAddress: { line1: ship.line1, city: ship.city, state: ship.state, zip: ship.zip, country: ship.country },
    };

    try {
      if (payment === "card") {
        const res = await fetch("/api/checkout/stripe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: payloadItems, ...shipping, currency }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) { router.push(`/login?next=${encodeURIComponent("/checkout")}`); return; }
          setError((data as { error?: string }).error ?? t("checkout_card_unavailable")); setBusy(false); return;
        }
        clear();
        window.location.href = (data as { url: string }).url;
        return;
      }

      if (payment === "wallet") {
        // Génère la clé au premier essai d'une tentative de paiement.
        if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
        const res = await fetch("/api/checkout/wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKeyRef.current },
          body: JSON.stringify({ items: payloadItems, ...shipping, currency }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // 402 (solde insuffisant) : on GARDE la même clé. La route l'associe
          // à l'ordre "pending" déjà créé ; en re-essayant après rechargement
          // du portefeuille, la retry reprend CE même paiement au lieu de
          // créer une commande ou un débit en double.
          if (res.status === 401) { router.push(`/login?next=${encodeURIComponent("/checkout")}`); return; }
          setError((data as { error?: string }).error ?? t("something_went_wrong")); setBusy(false); return;
        }
        // Paiement réussi : tentative terminée ⇒ régénérer la clé.
        idempotencyKeyRef.current = null;
        clear();
        router.push(`/checkout/success?order=${(data as { orderNumber: string }).orderNumber}`);
        return;
      }

      if (!phone.trim()) { setError(t("checkout_phone_required")); setBusy(false); return; }
      const res = await fetch("/api/checkout/mobile-money", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payloadItems, ...shipping, provider: payment, phone, currency }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) { router.push(`/login?next=${encodeURIComponent("/checkout")}`); return; }
        setError((data as { error?: string }).error ?? t("checkout_mm_failed")); setBusy(false); return;
      }

      if ((data as { mode?: string; url?: string }).mode === "redirect" && (data as { url?: string }).url) {
        clear();
        window.location.href = (data as { url: string }).url;
        return;
      }
      clear();
      setPending(data as PendingState);
    } catch {
      setError(t("something_went_wrong"));
    } finally {
      setBusy(false);
    }
  }

  async function checkStatus() {
    if (!pending) return;
    setCheckingStatus(true);
    try {
      const res = await fetch(`/api/orders/${pending.orderNumber}`);
      const data = await res.json();
      if (res.ok && data.order.status === "paid") {
        router.push(`/checkout/success?order=${pending.orderNumber}`);
        return;
      }
      setError(t("checkout_not_confirmed"));
    } finally {
      setCheckingStatus(false);
    }
  }

  if (!mounted) return null;

  if (pending) {
    return (
      <div className="container py-5" style={{ maxWidth: 640 }}>
        <div className="bg-surface rounded-2xl p-5 border text-center" style={{ borderColor: "var(--ap-border)" }}>
          <span className="inline-flex items-center justify-center rounded-circle mb-4" style={{ width: 80, height: 80, background: "rgba(245,158,11,0.12)", border: "1px solid var(--ap-border)" }}>
            <BiIcon name="bi-smartphone" style={{ fontSize: "2.2rem", color: "var(--ap-gold)" }} />
          </span>
          <h1 className="font-display font-bold mb-1">
            {pending.mode === "pending_customer_confirmation" ? t("checkout_confirm_phone") : t("checkout_finalize_payment")}
          </h1>
          <p className="text-muted-2 mb-3">
            {t("cert_order")} <span className="text-gold font-bold">{pending.orderNumber}</span>
          </p>
          {pending.mode === "manual_confirmation" ? (
            <div className="text-left bg-surface-2 rounded-2xl p-3 mb-4" style={{ border: "1px solid var(--ap-border)" }}>
              <div className="gallery-label mb-2">{t("checkout_payment_instructions")}</div>
              <p className="mb-2">{pending.instructions}</p>
              <p className="mb-0 font-bold">{t("checkout_amount", { amount: price(pending.amount) })}</p>
            </div>
          ) : (
            <p className="mb-4">{t("checkout_mm_instruction")}</p>
          )}
          {error && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.85rem" }}>{error}</div>}
          <div className="flex gap-2 justify-center flex-wrap">
            <button className="btn btn-gold" onClick={checkStatus} disabled={checkingStatus}>
              {checkingStatus ? <span className="spinner-border spinner-border-sm" /> : <>{t("checkout_check_status")} <BiIcon name="bi-arrow-clockwise" className="ms-1" /></>}
            </button>
            <button className="btn btn-ghost" onClick={() => router.push("/")}>{t("back_to_gallery")}</button>
          </div>
          <p className="text-muted-2 mt-3 mb-0" style={{ fontSize: "0.78rem" }}>
            {t("checkout_saved_note")}
          </p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container py-5" style={{ maxWidth: 560 }}>
        <div className="text-center" style={{ background: "var(--ap-card)", border: "1px solid var(--ap-border)", borderRadius: 18, padding: "3rem 1.5rem", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <span className="inline-flex items-center justify-center rounded-circle mx-auto mb-3" style={{ width: 72, height: 72, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
            <BiIcon name="bi-bag" style={{ fontSize: "1.9rem", color: "var(--ap-gold)" }} />
          </span>
          <h1 className="font-display font-bold mb-1" style={{ color: "var(--ap-card-foreground)" }}>{t("cart_empty")}</h1>
          <p className="text-muted-2 mb-4">{t("checkout_empty_sub")}</p>
          <button className="btn btn-gold" onClick={() => router.push("/prints")}>{t("browse_prints")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4" style={{ maxWidth: 1100 }}>
      <div className="gallery-label">{t("checkout_complete_order")}</div>
      <h1 className="font-display font-bold mb-1">{t("checkout_secure")}</h1>
      <p className="text-muted-2 mb-4" style={{ fontSize: "0.95rem" }}>
        {t("checkout_sub")}
      </p>

      {error && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.85rem" }}><BiIcon name="bi-exclamation-triangle" className="me-2" />{error}</div>}
      {validationErrors.cart && <div className="alert alert-warning py-2 mb-3" style={{ fontSize: "0.85rem" }}><BiIcon name="bi-exclamation-triangle" className="me-2" />{validationErrors.cart}</div>}

      <form onSubmit={placeOrder}>
        <div className="row g-4">
          <div className="col-lg-7">
            <div className="bg-surface rounded-2xl p-4 mb-4" style={{ border: "1px solid var(--ap-border)" }}>
              <h5 className="font-display font-bold mb-3"><BiIcon name="bi-truck" className="me-2 text-gold" />{t("checkout_shipping_details")}</h5>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">{t("full_name")} <span className="text-danger">*</span></label>
                  <input className="form-control" value={ship.name} onChange={(e) => { setShip({ ...ship, name: e.target.value }); setValidationErrors(prev => ({ ...prev, name: "" })); }} aria-required="true" />
                  {validationErrors.name && <div className="text-danger text-sm mt-1">{validationErrors.name}</div>}
                </div>
                <div className="col-md-6">
                  <label className="form-label">{t("email_label")} <span className="text-danger">*</span></label>
                  <input className="form-control" type="email" value={ship.email} onChange={(e) => { setShip({ ...ship, email: e.target.value }); setValidationErrors(prev => ({ ...prev, email: "" })); }} aria-required="true" />
                  {validationErrors.email && <div className="text-danger text-sm mt-1">{validationErrors.email}</div>}
                </div>
                <div className="col-12">
                  <label className="form-label">{t("checkout_address")} <span className="text-danger">*</span></label>
                  <input className="form-control" value={ship.line1} onChange={(e) => { setShip({ ...ship, line1: e.target.value }); setValidationErrors(prev => ({ ...prev, line1: "" })); }} placeholder={t("checkout_street_placeholder")} aria-required="true" />
                  {validationErrors.line1 && <div className="text-danger text-sm mt-1">{validationErrors.line1}</div>}
                </div>
                <div className="col-md-4">
                  <label className="form-label">{t("checkout_city")} <span className="text-danger">*</span></label>
                  <input className="form-control" value={ship.city} onChange={(e) => { setShip({ ...ship, city: e.target.value }); setValidationErrors(prev => ({ ...prev, city: "" })); }} aria-required="true" />
                  {validationErrors.city && <div className="text-danger text-sm mt-1">{validationErrors.city}</div>}
                </div>
                <div className="col-md-4">
                  <label className="form-label">{t("checkout_state")}</label>
                  <input className="form-control" value={ship.state} onChange={(e) => setShip({ ...ship, state: e.target.value })} />
                </div>
                <div className="col-md-4">
                  <label className="form-label">{t("checkout_zip")} <span className="text-danger">*</span></label>
                  <input className="form-control" value={ship.zip} onChange={(e) => { setShip({ ...ship, zip: e.target.value }); setValidationErrors(prev => ({ ...prev, zip: "" })); }} aria-required="true" />
                  {validationErrors.zip && <div className="text-danger text-sm mt-1">{validationErrors.zip}</div>}
                </div>
                <div className="col-12">
                  <label className="form-label">{t("country_label")} <span className="text-danger">*</span></label>
                  <input className="form-control" value={ship.country} onChange={(e) => { setShip({ ...ship, country: e.target.value }); setValidationErrors(prev => ({ ...prev, country: "" })); }} aria-required="true" />
                  {validationErrors.country && <div className="text-danger text-sm mt-1">{validationErrors.country}</div>}
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
              <h5 className="font-display font-bold mb-3"><BiIcon name="bi-lock" className="me-2 text-gold" />{t("payment_method")}</h5>

              <div className="grid gap-2 mb-3">
                {paymentMethods.map((m) => (
                  <label key={m.id} className={`mount-option ${payment === m.id ? "active" : ""}`}>
                    <input type="radio" name="payment" className="form-check-input me-2" checked={payment === m.id} onChange={() => setPayment(m.id)} />
                    <span className="me-2">{m.logo}</span>
                    <div className="grow">
                      <div className="font-bold" style={{ fontSize: "0.9rem" }}>{m.nameKey ? t(m.nameKey) : m.name}</div>
                      <div className="text-muted-2" style={{ fontSize: "0.75rem" }}>{t(m.hintKey)}</div>
                    </div>
                  </label>
                ))}
              </div>

              {payment === "card" ? (
                <div className="p-3 bg-surface-2 rounded-lg" style={{ border: "1px solid var(--ap-border)" }}>
                  <div style={{ fontSize: "0.85rem" }}>
                    <BiIcon name="bi-lock" className="text-gold me-1" />
                    {t("checkout_stripe_note")}
                  </div>
                </div>
              ) : payment === "wallet" ? (
                <div className="p-3 bg-surface-2 rounded-lg" style={{ border: "1px solid var(--ap-border)" }}>
                  <div className="flex justify-between items-center mb-2">
                    <span style={{ fontSize: "0.85rem" }}>
                      <BiIcon name="bi-wallet2" className="text-gold me-1" />
                      {t("checkout_wallet_balance", { balance: price(walletBalance ?? 0) })}
                    </span>
                    {walletSufficient ? (
                      <span className="badge rounded-pill" style={{ fontSize: "0.68rem", background: "rgba(52,211,153,0.15)", color: "var(--ap-green)" }}>
                        <BiIcon name="bi-check-circle" className="me-1" />{t("checkout_verified")}
                      </span>
                    ) : (
                      <Link href="/wallet" className="btn btn-ghost btn-sm">
                        <BiIcon name="bi-plus-circle" className="me-1" />{t("reload_wallet")}
                      </Link>
                    )}
                  </div>
                  {!walletSufficient && (
                    <div className="alert alert-warning py-2 mb-0" style={{ fontSize: "0.82rem" }}>
                      <BiIcon name="bi-exclamation-triangle" className="me-1" />{t("checkout_wallet_insufficient")}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <label className="form-label">{t("checkout_mm_number")} <span className="text-danger">*</span></label>
                  <input className="form-control" value={phone} onChange={(e) => { setPhone(e.target.value); setValidationErrors(prev => ({ ...prev, phone: "" })); }} placeholder="034 XX XXX XX" aria-required="true" />
                  {validationErrors.phone && <div className="text-danger text-sm mt-1">{validationErrors.phone}</div>}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-4 p-3 rounded-lg" style={{ background: "rgba(125,189,140,0.08)", border: "1px solid rgba(125,189,140,0.3)" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--ap-green)" }}><BiIcon name="bi-lock" className="me-1" />{t("checkout_ssl")}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--ap-green)" }}><BiIcon name="bi-patch-check" className="me-1" />{t("checkout_verified")}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--ap-green)" }}><BiIcon name="bi-phone" className="me-1" />{t("checkout_support")}</span>
              </div>
            </div>
          </div>

          <div className="col-lg-5">
            <div className="bg-surface rounded-2xl p-4 ap-sticky-summary" style={{ border: "1px solid var(--ap-border)" }}>
              <h5 className="font-display font-bold mb-3">{t("checkout_order_summary")}</h5>
              {items.map((i) => (
                <div key={i.key} className="flex gap-3 py-2" style={{ borderBottom: "1px solid var(--ap-border)" }}>
                  <Image
                    src={i.imageUrl}
                    alt={i.title}
                    width={56}
                    height={56}
                    className="object-cover"
                    style={{ borderRadius: 6 }}
                    unoptimized={process.env.NODE_ENV === "development"}
                    loading="lazy"
                  />
                  <div className="grow">
                    <Link href={`/photo/${i.slug}`} className="fw-semibold" style={{ fontSize: "0.85rem" }}>{i.title}</Link>
                    <div className="text-muted-2" style={{ fontSize: "0.72rem" }}>
                      {i.sizeLabel} · {i.mountName} · {t("edition_assigned_at_payment")} · ×{i.qty}
                    </div>
                  </div>
                   <div className="fw-semibold whitespace-nowrap" style={{ fontSize: "0.85rem" }}>{price(i.unitPrice * i.qty)}</div>
                </div>
              ))}
              <div className="pt-3">
                 <div className="flex justify-between py-1" style={{ fontSize: "0.9rem" }}><span className="text-muted-2">{t("subtotal")}</span><span>{price(totals.subtotal)}</span></div>
                <div className="flex justify-between py-1" style={{ fontSize: "0.9rem" }}><span className="text-muted-2">{t("shipping")}</span><span>{totals.shipping === 0 ? t("free_label") : price(totals.shipping)}</span></div>
                <div className="flex justify-between py-1" style={{ fontSize: "0.9rem" }}><span className="text-muted-2">{t("tax")}</span><span>{price(totals.tax)}</span></div>
                <hr className="divider" />
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold">{t("total")}</span>
                  <span className="font-display font-bold text-gold" style={{ fontSize: "1.5rem" }}>{price(totals.total)}</span>
                </div>
                <button
                  className="btn btn-gold btn-lg w-full"
                  type="submit"
                  disabled={busy || (payment === "wallet" && !walletSufficient)}
                >
                  {busy ? <span className="spinner-border spinner-border-sm" /> : <><BiIcon name="bi-lock" className="ms-1" />{payment === "wallet" ? t("pay_with_wallet") : t("pay_amount", { amount: price(totals.total) })}</>}
                </button>
                <button className="btn btn-ghost w-full mt-2" type="button" onClick={() => setOpen(true)}>
                  <BiIcon name="bi-arrow-left" className="me-1" />{t("back_to_cart")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}