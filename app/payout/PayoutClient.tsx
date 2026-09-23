"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BiIcon } from "components/BiIcon";
import { useSession } from "components/SessionProvider";
import { useLanguage, type DictKey } from "lib/i18n";

interface Props {
  user: {
    id: number;
    availableBalance: string;
    payoutMethod: string | null;
    payoutAccount: string | null;
    payoutName: string | null;
  };
}

function monogramTextColor(hexColor: string): string {
  const h = hexColor.replace("#", "");
  const n = parseInt(h, 16);
  const cR = ((n >> 16) & 255) / 255;
  const cG = ((n >> 8) & 255) / 255;
  const cB = (n & 255) / 255;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(cR) + 0.7152 * lin(cG) + 0.0722 * lin(cB);
  return 1.05 / (L + 0.05) >= 4.5 ? "#ffffff" : "#141416";
}

const METHODS: { id: string; name: string; hintKey: DictKey; placeholder: string; icon: string; color: string }[] = [
  { id: "orange-money", name: "Orange Money", hintKey: "payout_method_orange_hint", placeholder: "034 XX XX XX", icon: "OM", color: "#ff6600" },
  { id: "mvola", name: "Mvola (Telma)", hintKey: "payout_method_mvola_hint", placeholder: "034 XX XX XX", icon: "MV", color: "#009966" },
  { id: "airtel-money", name: "Airtel Money", hintKey: "payout_method_airtel_hint", placeholder: "033 XX XX XX", icon: "AM", color: "#c81e2b" },
  { id: "stripe", name: "Stripe", hintKey: "payout_method_stripe_hint", placeholder: "Stripe", icon: "S", color: "#635bff" },
  { id: "bank-transfer", name: "Bank transfer", hintKey: "payout_method_bank_hint", placeholder: "FR76 XXXX XXXX …", icon: "IBAN", color: "#4f7cff" },
  { id: "paypal", name: "PayPal", hintKey: "payout_method_paypal_hint", placeholder: "you@email.com", icon: "PP", color: "#003087" },
];

export default function PayoutClient({ user }: Props) {
  const router = useRouter();
  const { setUser } = useSession();
  const { t } = useLanguage();
  const balance = parseFloat(user.availableBalance) || 0;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(user.payoutMethod ?? "orange-money");
  const [account, setAccount] = useState(user.payoutAccount ?? "");
  const [accountName, setAccountName] = useState(user.payoutName ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState<any>(null);

  const fee = 0; // Aperio does not charge any commission on payouts
  const net = Math.max(0, (parseFloat(amount) || 0) - fee);
  const methodData = METHODS.find((m) => m.id === method)!;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(""); setMsg("");
    if (!amount || parseFloat(amount) < 10) { setErr(t("payout_min_amount", { amount: "10" })); return; }
    if (parseFloat(amount) > balance) { setErr(t("payout_available_balance", { balance: balance.toFixed(2) })); return; }
    if (!account.trim()) { setErr(t("account_number_required")); return; }
    if (!accountName.trim()) { setErr(t("account_name_required")); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount), method, account: account.trim(), accountName: accountName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? t("payout_request_failed")); setBusy(false); return; }
      setSuccess(data.payout);
      /* Refresh session to get updated balance */
      const me = await fetch("/api/me");
      if (me.ok) { const d = await me.json(); setUser(d.user); }
      setMsg(t("payout_submitted_msg"));
      setAmount("");
      router.refresh();
    } catch {
      setErr(t("something_went_wrong"));
    } finally { setBusy(false); }
  }

  if (success) {
    return (
      <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid rgba(125,189,140,0.3)" }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="icon-btn" style={{ width: 56, height: 56, background: "rgba(125,189,140,0.15)", borderColor: "rgba(125,189,140,0.4)" }}>
            <BiIcon name="bi-check-circle" style={{ fontSize: "1.6rem", color: "var(--ap-green)" }} />
          </span>
          <div>
            <h3 className="font-display font-bold mb-0">{t("payout_submitted")}</h3>
            <p className="text-muted-2 mb-0" style={{ fontSize: "0.85rem" }}>
              {t("reference_label")}: <strong className="text-gold">{success.reference}</strong>
            </p>
          </div>
        </div>
        <div className="bg-surface-2 rounded-lg p-3 mb-3">
              <div className="flex justify-between mb-1"><span className="text-muted-2">{t("amount_label")}</span><strong>{parseFloat(success.amount).toFixed(2)} €</strong></div>
          <div className="flex justify-between mb-1"><span className="text-muted-2">{t("method_label")}</span><strong>{success.method}</strong></div>
          <div className="flex justify-between mb-1"><span className="text-muted-2">{t("account_label")}</span><strong>{success.account}</strong></div>
          <div className="flex justify-between"><span className="text-muted-2">{t("status_label")}</span><span className="badge rounded-pill" style={{ background: "rgba(245,158,11,0.15)", color: "var(--ap-gold-dark)" }}>{success.status}</span></div>
        </div>
        <p className="text-muted-2 mb-0" style={{ fontSize: "0.85rem" }}>
          <BiIcon name="bi-clock" className="me-1" />{t("payout_processing")}
        </p>
        <div className="flex gap-2 mt-3">
          <button className="btn btn-gold" onClick={() => setSuccess(null)}>{t("new_payout")}</button>
          <button className="btn btn-ghost" onClick={() => router.push("/profile")}>{t("back_to_profile")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
      {err && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.85rem" }}><BiIcon name="bi-exclamation-triangle" className="me-2" />{err}</div>}
      {msg && <div className="alert alert-success py-2 mb-3" style={{ fontSize: "0.85rem" }}><BiIcon name="bi-check-circle" className="me-2" />{msg}</div>}

      <form onSubmit={submit}>
        <div className="mb-3">
          <label className="form-label">{t("payment_method")}</label>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            {METHODS.map((m) => (
              <label key={m.id} className={`mount-option ${method === m.id ? "active" : ""}`}>
                <input type="radio" name="method" className="form-check-input me-2" checked={method === m.id} onChange={() => setMethod(m.id)} />
                <span className="inline-flex items-center justify-center me-2" style={{ width: 28, height: 22, borderRadius: 4, background: m.color, color: monogramTextColor(m.color), fontSize: "0.62rem", fontWeight: 800 }}>{m.icon}</span>
                <div>
                  <div className="font-bold" style={{ fontSize: "0.85rem" }}>{m.name}</div>
                  <div className="text-muted-2" style={{ fontSize: "0.7rem" }}>{t(m.hintKey)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">{t("amount_to_withdraw")}</label>
            <input
              className="form-control font-display"
              type="number" min="10" step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`${balance.toFixed(2)} € max`}
              required
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">{t("account_number")}</label>
            <input
              className="form-control"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={methodData.placeholder}
              required
            />
          </div>
          <div className="col-12">
            <label className="form-label">{t("account_holder_name")}</label>
            <input className="form-control" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder={t("full_name")} required />
          </div>
        </div>

        <div className="bg-surface-2 rounded-lg p-3 mb-3">
          <div className="flex justify-between mb-1"><span className="text-muted-2">{t("amount_label")}</span><span>{parseFloat(amount || "0").toFixed(2)} €</span></div>
          <div className="flex justify-between mb-1"><span className="text-muted-2">{t("fees")}</span><span className="text-gold">€0.00</span></div>
          <hr className="divider my-2" />
          <div className="flex justify-between items-center">
            <span className="font-bold">{t("you_will_receive")}</span>
            <span className="font-display font-bold text-gold" style={{ fontSize: "1.4rem" }}>{net.toFixed(2)} €</span>
          </div>
        </div>

        <button className="btn btn-gold btn-lg w-full" type="submit" disabled={busy}>
          {busy ? <span className="spinner-border spinner-border-sm" /> : <><BiIcon name="bi-arrow-up" className="me-2" style={{ fontSize: "18px", color: "#0b0906" }} />{t("confirm_payout")}</>}
        </button>
        <p className="text-muted-2 mt-2 mb-0 text-center" style={{ fontSize: "0.75rem" }}>
          <BiIcon name="bi-lock" className="me-1" />{t("secure_transactions")}
        </p>
      </form>
    </div>
  );
}