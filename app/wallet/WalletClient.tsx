"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BiIcon } from "components/BiIcon";
import { useLanguage, type DictKey } from "lib/i18n";
import { usePrice, useCurrency } from "lib/currency";
import { formatDate } from "lib/utils";
import type {
  WalletPaymentMethod,
  WalletTransactionDto,
  WalletTxStatus,
  WalletTxType,
} from "lib/types";

interface Props {
  balance: string;
  transactions: WalletTransactionDto[];
}

interface DepositResponse {
  mode?: "redirect" | "pending_customer_confirmation" | "manual_confirmation";
  url?: string;
  reference?: string;
  providerRef?: string;
  amount?: number;
  currency?: string;
  instructions?: string;
  error?: string;
}

const WALLET_MIN = 5;
const WALLET_MAX = 1000;
const PRESETS = [10, 20, 50, 100, 250];

const METHODS: {
  id: WalletPaymentMethod;
  name: string;
  hintKey: DictKey;
  logo: React.ReactNode;
  needsPhone: boolean;
}[] = [
  {
    id: "stripe",
    name: "Card · Stripe",
    hintKey: "wallet_method_stripe_hint",
    logo: (
      <span className="inline-flex items-center justify-center bg-white rounded shadow-sm px-1" style={{ width: 50, height: 32, border: "1px solid rgba(0,0,0,0.12)" }}>
        <Image src="/images/payments/visa.svg" alt="Visa" width={42} height={16} className="object-contain" style={{ width: "auto", height: "auto" }} />
      </span>
    ),
    needsPhone: false,
  },
  {
    id: "orange_money",
    name: "Orange Money",
    hintKey: "wallet_method_om_hint",
    logo: (
      <span className="inline-flex items-center justify-center bg-white rounded shadow-sm px-1" style={{ width: 50, height: 32, border: "1px solid rgba(0,0,0,0.12)" }}>
        <Image src="/images/payments/orange-money.svg" alt="Orange Money" width={42} height={18} className="object-contain" style={{ width: "auto", height: "auto" }} />
      </span>
    ),
    needsPhone: false,
  },
  {
    id: "mvola",
    name: "Yas Money (Mvola)",
    hintKey: "wallet_method_mvola_hint",
    logo: (
      <span className="inline-flex items-center justify-center bg-white rounded shadow-sm px-1" style={{ width: 50, height: 32, border: "1px solid rgba(0,0,0,0.12)" }}>
        <Image src="/images/payments/yas.svg" alt="Yas Money" width={42} height={22} className="object-contain" style={{ width: "auto", height: "auto" }} />
      </span>
    ),
    needsPhone: true,
  },
  {
    id: "airtel_money",
    name: "Airtel Money",
    hintKey: "wallet_method_airtel_hint",
    logo: (
      <span className="inline-flex items-center justify-center bg-white rounded shadow-sm px-1" style={{ width: 50, height: 32, border: "1px solid rgba(0,0,0,0.12)" }}>
        <Image src="/images/payments/airtel.svg" alt="Airtel Money" width={42} height={22} className="object-contain" style={{ width: "auto", height: "auto" }} />
      </span>
    ),
    needsPhone: true,
  },
];

const TX_TYPE_LABELS: Record<WalletTxType, DictKey> = {
  deposit: "wallet_tx_deposit",
  payout: "wallet_tx_payout",
  purchase: "wallet_tx_purchase",
  clawback: "wallet_tx_clawback",
};

const TX_STATUS_LABELS: Record<WalletTxStatus, DictKey> = {
  pending: "wallet_status_pending",
  completed: "wallet_status_completed",
  failed: "wallet_status_failed",
};

const METHOD_LABELS: Record<WalletPaymentMethod, DictKey> = {
  stripe: "wallet_method_stripe",
  orange_money: "wallet_method_orange",
  mvola: "wallet_method_mvola",
  airtel_money: "wallet_method_airtel",
};

export default function WalletClient({ balance, transactions }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const price = usePrice();
  const { currency } = useCurrency();

  const [liveBalance, setLiveBalance] = useState(balance);
  const [liveTx, setLiveTx] = useState(transactions);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<WalletPaymentMethod>("stripe");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<DepositResponse | null>(null);
  const [redirected, setRedirected] = useState(
    searchParams.get("deposit") === "success",
  );

  const methodData = METHODS.find((m) => m.id === method)!;
  const needsPhone = method === "mvola" || method === "airtel_money";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet");
      if (res.ok) {
        const d = await res.json();
        setLiveBalance(d.balance ?? "0");
        setLiveTx(d.transactions ?? []);
      }
    } catch {
      /* keep current values */
    }
  }, []);

  /* Re-sync the balance & history with the server on mount (e.g. after a
     Stripe redirect back to /wallet?deposit=success). */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/wallet")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) {
          setLiveBalance(d.balance ?? "0");
          setLiveTx(d.transactions ?? []);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function validatePhone(raw: string): boolean {
    const cleaned = raw.replace(/[^\d]/g, "").replace(/^261/, "0");
    return /^(\+\d{1,3}[- ]?)?\d{9,15}$/.test(cleaned) || /^3[2-9]\d{7}$/.test(cleaned);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(""); setMsg(""); setPending(null);

    const numeric = parseFloat(amount);
    if (!amount || !Number.isFinite(numeric)) {
      setError(t("wallet_amount_required"));
      return;
    }
    if (numeric < WALLET_MIN) {
      setError(t("wallet_min_amount", { amount: String(WALLET_MIN) }));
      return;
    }
    if (numeric > WALLET_MAX) {
      setError(t("wallet_max_amount", { amount: String(WALLET_MAX) }));
      return;
    }
    if (needsPhone && !phone.trim()) {
      setError(t("wallet_phone_required"));
      return;
    }
    if (needsPhone && !validatePhone(phone)) {
      setError(t("wallet_phone_invalid"));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numeric,
          paymentMethod: method,
          ...(needsPhone ? { phone: phone.trim() } : {}),
          ...(currency !== "EUR" ? { currency } : {}),
        }),
      });
      const data: DepositResponse = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("something_went_wrong"));
        setBusy(false);
        return;
      }

      if (data.url) {
        /* Stripe / Orange Money hosted checkout — redirect the browser. */
        setMsg(t("wallet_redirecting"));
        window.location.assign(data.url);
        return;
      }
      if (data.mode === "pending_customer_confirmation" || data.mode === "manual_confirmation") {
        setPending(data);
        setAmount("");
        refresh();
      }
      router.refresh();
    } catch {
      setError(t("something_went_wrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="gallery-label">{t("wallet_title")}</div>

      <div className="row g-3 mb-4">
        <div className="col-md-6 col-lg-4">
          <div className="stat-tile">
            <div className="value font-display">{price(liveBalance)}</div>
            <div className="label">{t("available_balance")}</div>
          </div>
        </div>
        <div className="col-md-6 col-lg-4">
          <div className="stat-tile">
            <div className="value font-display">{liveTx.filter((x) => x.type === "deposit" && x.status === "completed").length}</div>
            <div className="label">{t("wallet_deposits_count")}</div>
          </div>
        </div>
        <div className="col-md-6 col-lg-4">
          <div className="stat-tile">
            <div className="value font-display">{liveTx.filter((x) => x.status === "pending").length}</div>
            <div className="label">{t("wallet_pending_count")}</div>
          </div>
        </div>
      </div>

      {redirected && (
        <div className="alert alert-success py-2 mb-3" style={{ fontSize: "0.88rem" }}>
          <BiIcon name="bi-check-circle" className="me-2" />{t("wallet_deposit_success")}
          <button type="button" className="btn-close float-end" aria-label="Close" onClick={() => setRedirected(false)} />
        </div>
      )}
      {error && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.85rem" }}><BiIcon name="bi-exclamation-triangle" className="me-2" />{error}</div>}
      {msg && <div className="alert alert-info py-2 mb-3" style={{ fontSize: "0.85rem" }}><BiIcon name="bi-info-circle" className="me-2" />{msg}</div>}

      {/* Deposit form */}
      <div className="bg-surface rounded-2xl p-4 mb-4" style={{ border: "1px solid var(--ap-border)" }}>
        <h2 className="font-display font-bold mb-1" style={{ fontSize: "1.25rem" }}>
          <BiIcon name="bi-plus-circle" className="text-gold me-2" />{t("wallet_top_up")}
        </h2>
        <p className="text-muted-2 mb-3" style={{ fontSize: "0.85rem" }}>{t("wallet_topup_desc")}</p>

        {pending && (
          <div className="bg-surface-2 rounded-lg p-3 mb-3">
            {pending.mode === "pending_customer_confirmation" ? (
              <>
                <div className="fw-semibold mb-1">
                  <BiIcon name="bi-phone" className="me-2 text-gold" />{t("wallet_deposit_pending_title")}
                </div>
                <p className="text-muted-2 mb-2" style={{ fontSize: "0.85rem" }}>{t("wallet_deposit_pending_desc")}</p>
                <div className="flex justify-between mb-1"><span className="text-muted-2">{t("reference_label")}</span><strong>{pending.reference}</strong></div>
              </>
            ) : (
              <>
                <div className="fw-semibold mb-1">
                  <BiIcon name="bi-phone" className="me-2 text-gold" />{t("wallet_deposit_manual_title")}
                </div>
                <p className="text-muted-2 mb-2" style={{ fontSize: "0.85rem" }}>{t("wallet_deposit_manual_desc")}</p>
                <div className="bg-surface rounded p-2 mb-2" style={{ fontSize: "0.85rem" }}>{pending.instructions}</div>
                <div className="flex justify-between mb-1"><span className="text-muted-2">{t("reference_label")}</span><strong>{pending.reference}</strong></div>
                <div className="flex justify-between"><span className="text-muted-2">{t("amount_label")}</span><strong>{price(String(pending.amount ?? 0))}</strong></div>
              </>
            )}
            <div className="flex gap-2 mt-3">
              <button className="btn btn-ghost btn-sm" onClick={() => setPending(null)}>{t("new_payout")}</button>
            </div>
          </div>
        )}

        <form onSubmit={submit}>
          <div className="mb-3">
            <label className="form-label">{t("wallet_amount_label")}</label>
            <div className="d-flex flex-wrap gap-2 mb-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`btn btn-sm ${String(p) === amount ? "btn-gold" : "btn-ghost"}`}
                  onClick={() => setAmount(String(p))}
                >
                  {p}€
                </button>
              ))}
            </div>
            <input
              className="form-control font-display"
              type="number" min={WALLET_MIN} max={WALLET_MAX} step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("wallet_amount_placeholder")}
              required
            />
            <div className="text-muted-2 mt-1" style={{ fontSize: "0.75rem" }}>
              {t("wallet_min_amount", { amount: String(WALLET_MIN) })} · {t("wallet_max_amount", { amount: String(WALLET_MAX) })}
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">{t("payment_method")}</label>
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
              {METHODS.map((m) => (
                <label key={m.id} className={`mount-option ${method === m.id ? "active" : ""}`}>
                  <input type="radio" name="wallet-payment" className="form-check-input me-2" checked={method === m.id} onChange={() => setMethod(m.id)} />
                <span className="me-2">{m.logo}</span>
                  <div>
                    <div className="font-bold" style={{ fontSize: "0.85rem" }}>{m.name}</div>
                    <div className="text-muted-2" style={{ fontSize: "0.7rem" }}>{t(m.hintKey)}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {needsPhone && (
            <div className="mb-3 col-md-6 p-0">
              <label className="form-label">{t("wallet_phone_label")}</label>
              <input
                className="form-control"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={method === "airtel_money" ? "033 XX XX XXX" : "034 XX XX XXX"}
                required
              />
            </div>
          )}

          <button className="btn btn-gold btn-lg w-full" type="submit" disabled={busy}>
            {busy ? <span className="spinner-border spinner-border-sm" /> : <><BiIcon name="bi-arrow-down-circle" className="me-2" style={{ fontSize: "18px", color: "#0b0906" }} />{t("wallet_start_deposit")}</>}
          </button>
          <p className="text-muted-2 mt-2 mb-0 text-center" style={{ fontSize: "0.75rem" }}>
            <BiIcon name="bi-lock" className="me-1" />{t("secure_transactions")}
          </p>
        </form>
      </div>

      {/* History */}
      <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
        <h2 className="font-display font-bold mb-3" style={{ fontSize: "1.25rem" }}>
          <BiIcon name="bi-clock-history" className="text-gold me-2" />{t("wallet_transactions_title")}
        </h2>

        {liveTx.length === 0 ? (
          <p className="text-muted-2 mb-0" style={{ fontSize: "0.88rem" }}>{t("wallet_empty")}</p>
        ) : (
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {liveTx.map((tx) => {
              const outgoing = tx.type === "payout" || tx.type === "purchase";
              return (
                <div key={tx.id} className="flex justify-between align-items-center py-2" style={{ borderBottom: "1px solid var(--ap-border)" }}>
                  <div className="d-flex align-items-center gap-2">
                    <span className={`icon-btn d-inline-flex align-items-center justify-content-center`} style={{ width: 40, height: 40, background: "rgba(125,189,140,0.1)", borderColor: "rgba(125,189,140,0.25)" }}>
                      <BiIcon name={tx.type === "deposit" ? "bi-arrow-down-circle" : tx.type === "payout" ? "bi-arrow-up-circle" : "bi-bag"} style={{ color: "var(--ap-green-dark)" }} />
                    </span>
                    <div>
                      <div className="fw-semibold" style={{ fontSize: "0.88rem" }}>
                        {t(TX_TYPE_LABELS[tx.type])} · {t(METHOD_LABELS[tx.paymentMethod] ?? "wallet_method_stripe")}
                      </div>
                      <div className="text-muted-2" style={{ fontSize: "0.75rem" }}>
                        {tx.reference} · {formatDate(new Date(tx.createdAt))}
                      </div>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className={`fw-bold ${outgoing ? "text-danger" : "text-gold"}`} style={{ fontSize: "0.9rem" }}>
                      {outgoing ? "−" : "+"}{price(Math.abs(parseFloat(tx.amount)))}
                    </div>
                    <span className={`badge rounded-pill`} style={{ fontSize: "0.68rem", background: tx.status === "completed" ? "rgba(125,189,140,0.15)" : tx.status === "failed" ? "rgba(231,76,91,0.15)" : "rgba(245,158,11,0.15)", color: tx.status === "completed" ? "var(--ap-green-dark)" : tx.status === "failed" ? "#e74c5b" : "var(--ap-gold-dark)" }}>
                      {t(TX_STATUS_LABELS[tx.status])}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3">
          <Link href="/payout" className="btn btn-ghost btn-sm"><BiIcon name="bi-arrow-up-right" className="me-2" style={{ fontSize: 16 }} />{t("request_a_payout")}</Link>
        </div>
      </div>
    </>
  );
}