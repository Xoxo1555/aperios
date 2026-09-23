"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "components/SessionProvider";
import { useLanguage } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const initialEmail = searchParams.get("email") || "";
  const { setUser } = useSession();
  const { t } = useLanguage();

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("invalid_code"));
        setBusy(false);
        return;
      }
      setUser(data.user);
      setMessage(t("email_verified"));
      setTimeout(() => {
        router.push(next);
        router.refresh();
      }, 700);
    } catch {
      setError(t("try_again_please"));
      setBusy(false);
    }
  }

  async function resend() {
    if (!email) {
      setError(t("please_enter_email"));
      return;
    }
    setResending(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend", email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("unable_resend"));
        setResending(false);
        return;
      }
      setMessage(t("new_code_sent"));
    } finally {
      setResending(false);
    }
  }

  const verifySub = t("verify_sub").split("{email}");

  return (
    <div className="container py-5" style={{ maxWidth: 540 }}>
      <div className="bg-surface rounded-2xl p-4 p-md-5 border shadow-sm" style={{ borderColor: "var(--ap-border)" }}>
        <div className="text-center mb-4">
          <span
            className="inline-flex items-center justify-center rounded-lg mb-3"
            style={{ width: 60, height: 60, background: "linear-gradient(135deg, var(--ap-gold), var(--ap-gold-dark))", color: "var(--ap-ivory)" }}
          >
            <BiIcon name="bi-envelope-check" style={{ fontSize: "1.6rem" }} />
          </span>
          <h1 className="font-display font-bold mb-2">{t("verify_your_account")}</h1>
          <p className="text-muted-2 mb-0" style={{ fontSize: "0.92rem", lineHeight: 1.6 }}>
            {verifySub[0]}
            <strong className="text-gold">{email || t("your_email")}</strong>
            {verifySub[1]}
          </p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.86rem" }}>
            <BiIcon name="bi-exclamation-triangle" className="me-2" />{error}
          </div>
        )}
        {message && (
          <div className="alert alert-success py-2 mb-3" style={{ fontSize: "0.86rem" }}>
            <BiIcon name="bi-check-circle" className="me-2" />{message}
          </div>
        )}

        <form onSubmit={verify}>
          <div className="mb-3">
            <label className="form-label">{t("account_email")}</label>
            <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="mb-4">
            <label className="form-label">{t("confirmation_code_6")}</label>
            <input
              className="form-control text-center font-display"
              style={{ letterSpacing: "0.45em", fontSize: "1.4rem", fontWeight: 700 }}
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <button className="btn btn-gold w-full btn-lg mb-3" type="submit" disabled={busy}>
            {busy ? <span className="spinner-border spinner-border-sm" /> : <><BiIcon name="bi-shield-check" className="me-2" />{t("confirm_my_registration")}</>}
          </button>
        </form>

        <div className="flex justify-between items-center pt-3 border-t">
          <button className="btn btn-ghost btn-sm" onClick={resend} disabled={resending || busy} type="button">
            {resending ? <span className="spinner-border spinner-border-sm me-1" /> : <BiIcon name="bi-arrow-clockwise" className="me-1" />}
            {t("resend_email")}
          </button>
          <Link href="/login" className="text-muted-2" style={{ fontSize: "0.85rem" }}>
            {t("back_to_login")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="container py-5 text-center"><div className="spinner-border text-warning" /></div>}>
      <VerifyForm />
    </Suspense>
  );
}