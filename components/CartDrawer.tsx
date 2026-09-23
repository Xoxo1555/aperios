"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "lib/cart";
import { computeTotals } from "lib/pricing";
import { usePrice } from "lib/currency";
import { useLanguage } from "lib/i18n";
import { useMounted } from "lib/hooks";
import { useSession } from "./SessionProvider";
import Image from "next/image";
import { BiIcon } from "components/BiIcon";

export default function CartDrawer() {
  const { items, isOpen, setOpen, removeItem, setQty, clear } = useCart();
  const { user } = useSession();
  const { t } = useLanguage();
  const mounted = useMounted();
  const router = useRouter();
  const price = usePrice();
  const totals = computeTotals(items.map((i) => ({ unitPrice: i.unitPrice, qty: i.qty })));

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, setOpen]);

  function goCheckout() {
    setOpen(false);
    if (!user) {
      router.push(`/login?next=${encodeURIComponent("/checkout")}`);
      return;
    }
    router.push("/checkout");
  }

  const cartMy = mounted ? t("cart_my") : "My cart";
  const closeLabel = mounted ? t("close") : "Close";
  const cartEmpty = mounted ? t("cart_empty") : "Your cart is empty.";
  const cartEmptySub = mounted ? t("cart_empty_sub") : "Browse our limited edition prints to get started.";
  const browsePrints = mounted ? t("browse_prints") : "Browse prints";
  const editionAssigned = mounted ? t("edition_assigned_at_payment") : "Edition number assigned at payment";
  const removeLabel = mounted ? t("remove") : "Remove";
  const decreaseQty = mounted ? t("decrease_qty") : "Decrease quantity";
  const increaseQty = mounted ? t("increase_qty") : "Increase quantity";
  const subtotalLabel = mounted ? t("subtotal") : "Subtotal";
  const shippingLabel = mounted ? t("shipping") : "Shipping";
  const freeLabel = mounted ? t("free_label") : "Free";
  const totalLabel = mounted ? t("total") : "Total";
  const checkoutLabel = mounted ? t("checkout") : "Checkout";
  const clearCartLabel = mounted ? t("clear_cart") : "Clear cart";

  return (
    <>
      {isOpen && <div className="ap-drawer-backdrop" onClick={() => setOpen(false)} />}
      <aside
        className={`ap-drawer ${isOpen ? "open" : ""}`}
        aria-hidden={!isOpen}
        role="dialog"
        aria-modal="true"
        aria-label={cartMy}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--ap-border)" }}>
          <h5 className="mb-0 font-serif font-bold text-xl text-card-foreground">
            <span className="inline-flex items-center justify-center shrink-0 me-2" style={{ width: 24, height: 24 }}>
              <BiIcon name="bi-bag" style={{ fontSize: 20, color: "var(--ap-gold)" }} />
            </span>
            {cartMy}
            <span className="text-stone-300 ms-2" style={{ fontSize: "0.875rem" }}>
              ({items.reduce((s, i) => s + i.qty, 0)})
            </span>
          </h5>
          <button className="icon-btn icon-btn-onlight" aria-label={closeLabel} onClick={() => setOpen(false)}>
            <span className="inline-flex items-center justify-center shrink-0">
              <BiIcon name="bi-x-lg" style={{ fontSize: 20 }} />
            </span>
          </button>
        </div>

        <div className="grow overflow-auto px-4">
          {items.length === 0 ? (
            <div className="text-center py-10 px-4">
              <span className="inline-flex items-center justify-center rounded-circle mx-auto mb-4" style={{ width: 72, height: 72, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
                <BiIcon name="bi-bag" style={{ fontSize: 40, color: "var(--ap-gold)" }} />
              </span>
              <p className="font-display font-bold text-card-foreground text-base mb-1">{cartEmpty}</p>
              <p className="text-muted-foreground text-sm mb-6">{cartEmptySub}</p>
              <button
                className="btn btn-gold w-full py-3 px-6"
                onClick={() => { setOpen(false); router.push("/prints"); }}
              >
                {browsePrints}
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div className="cart-item flex gap-3 py-4 border-b" key={item.key} style={{ borderColor: "var(--ap-border)" }}>
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  width={80}
                  height={80}
                  className="object-cover rounded-lg shrink-0"
                  unoptimized={process.env.NODE_ENV === "development"}
                  loading="lazy"
                />
                <div className="grow min-w-0">
                  <Link href={`/photo/${item.slug}`} className="font-medium text-card-foreground text-base hover:text-[#D97706] transition-colors block truncate">
                    {item.title}
                  </Link>
                  <div className="text-muted-foreground text-sm mt-0.5">
                    {item.sizeLabel} · {item.mountName} · {editionAssigned}
                  </div>
                  <div className="text-[#D97706] font-bold text-base mt-1">{price(item.unitPrice)}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="inline-flex items-center border border-border rounded-lg overflow-hidden">
                      <button
                        className="btn btn-ghost btn-sm px-3 py-1.5 flex items-center justify-center"
                        disabled={item.qty <= 1}
                        onClick={() => setQty(item.key, item.qty - 1)}
                        aria-label={decreaseQty}
                        style={{ minWidth: 36, minHeight: 36 }}
                      >
                        <span className="inline-flex items-center justify-center shrink-0">
                          <BiIcon name="bi-dash" style={{ fontSize: 14 }} />
                        </span>
                      </button>
                      <span className="px-3 py-1.5 text-center text-card-foreground font-medium text-sm" style={{ minWidth: 40, background: "transparent" }}>
                        {item.qty}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm px-3 py-1.5 flex items-center justify-center"
                        onClick={() => setQty(item.key, item.qty + 1)}
                        aria-label={increaseQty}
                        style={{ minWidth: 36, minHeight: 36 }}
                      >
                        <span className="inline-flex items-center justify-center shrink-0">
                          <BiIcon name="bi-plus" style={{ fontSize: 14 }} />
                        </span>
                      </button>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm text-rose-600 dark:text-rose-500 hover:bg-rose-600/10 dark:hover:bg-rose-500/10 flex items-center justify-center"
                      onClick={() => removeItem(item.key)}
                      aria-label={removeLabel}
                    >
                      <span className="inline-flex items-center justify-center shrink-0">
                        <BiIcon name="bi-trash" style={{ fontSize: 14 }} />
                      </span>
                      <span className="hidden sm:inline">{removeLabel}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 border-t" style={{ borderColor: "var(--ap-border)" }}>
            <div className="flex justify-between mb-1.5 text-base">
              <span className="text-muted-foreground">{subtotalLabel}</span>
              <span className="font-semibold text-card-foreground">{price(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between mb-1.5 text-base">
              <span className="text-muted-foreground">{shippingLabel}</span>
              <span className="font-semibold text-card-foreground">{totals.shipping === 0 ? freeLabel : price(totals.shipping)}</span>
            </div>
            <div className="flex justify-between mb-4 text-lg">
              <span className="font-bold text-card-foreground">{totalLabel}</span>
              <span className="font-bold text-[#D97706]">{price(totals.total)}</span>
            </div>
            <div className="grid gap-2">
              <button className="py-3 px-6 bg-card hover:bg-card text-card-foreground font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2" onClick={goCheckout}>
                {checkoutLabel}
                <span className="inline-flex items-center justify-center shrink-0">
                  <BiIcon name="bi-arrow-right" style={{ fontSize: 16 }} />
                </span>
              </button>
              <button className="btn btn-ghost" onClick={clear}>
                {clearCartLabel}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
