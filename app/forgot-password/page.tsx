"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "components/SessionProvider";
import PasswordField from "components/PasswordField";
import { useLanguage } from "lib/i18n";
import Logo from "components/Logo";
import { BiIcon } from "components/BiIcon";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { setUser } = useSession();
  const { t } = useLanguage();

  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("something_went_wrong"));
        setBusy(false);
        return;
      }
      setMessage(data.message ?? t("reset_code_sent_generic"));
      setStep("reset");
    } catch {
      setError(t("try_again_please"));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("unable_resend"));
        return;
      }
      setMessage(t("new_reset_code_sent"));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", email, code, password, confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("unable_reset"));
        setBusy(false);
        return;
      }
      setUser(data.user);
      setMessage(t("password_updated"));
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 700);
    } catch {
      setError(t("try_again_please"));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(217,119,6,0.12),rgba(255,255,255,0))] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-[#141416] backdrop-blur-xl border border-white/10 rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] flex flex-col items-center">
        <div className="mb-6">
          <Logo />
        </div>
        {/* Header & Icône Clé */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-[#fbbf24]/20 to-[#fbbf24]/5 border border-[#fbbf24]/30 flex items-center justify-center mb-6 shadow-inner">
          {step === "request" ? (
            <BiIcon name="bi-key" className="text-[#fbbf24]" style={{ fontSize: "24px" }} />
          ) : (
            <BiIcon name="bi-shield-check" className="text-[#fbbf24]" style={{ fontSize: "24px" }} />
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-card-foreground tracking-tight mb-3 text-center block" style={{ color: "#FFFFFF" }}>
          {step === "request" ? (
            // &nbsp; avant ? empêche le saut de ligne isolé en français
            <span className="whitespace-nowrap inline-block">Mot de passe oublié&nbsp;?</span>
          ) : (
            t("reset_your_password")
          )}
        </h1>
        <p className="text-stone-300 text-sm leading-relaxed mb-6 text-center block max-w-xs">
          {step === "request"
            ? t("forgot_sub_request")
            : t("forgot_sub_reset", { email })}
        </p>

        {error && (
          <div className="w-full flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 mb-4 text-red-400 text-sm text-left">
            <BiIcon name="bi-exclamation-triangle" className="shrink-0" style={{ fontSize: "16px" }} />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div className="w-full flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 mb-4 text-emerald-400 text-sm text-left">
            <BiIcon name="bi-check-circle" className="shrink-0" style={{ fontSize: "16px" }} />
            <span>{message}</span>
          </div>
        )}

        {step === "request" ? (
          <form onSubmit={requestCode} className="w-full">
            <label className="block text-xs font-semibold text-stone-300 uppercase tracking-widest mb-2 text-left w-full">
              {t("account_email")}
            </label>
            <input
              className="w-full bg-card border border-border rounded-xl px-4 py-3.5 text-card-foreground placeholder:text-muted-foreground text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all duration-200"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
              autoFocus
            />
            <button
              className="btn btn-gold w-full mt-6 py-3.5 px-6 text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              type="submit"
              disabled={busy}
            >
              {busy ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <BiIcon name="bi-send" style={{ fontSize: "16px" }} />
                  {t("send_reset_code")}
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="w-full text-left">
            <label className="block text-xs font-semibold text-stone-300 uppercase tracking-widest mb-2 text-left w-full">
              {t("reset_code_6")}
            </label>
            <input
              className="w-full bg-card border border-border rounded-xl px-4 py-3.5 text-card-foreground placeholder:text-muted-foreground text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all duration-200 text-center tracking-[0.45em] font-bold text-lg mb-4"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
            <div className="mb-3 [&_label]:!text-xs [&_label]:!font-semibold [&_label]:!text-muted-foreground [&_label]:!uppercase [&_label]:!tracking-widest [&_input]:!bg-card [&_input]:!border-border [&_input]:!text-card-foreground [&_input]:!rounded-xl">
              <PasswordField label={t("new_password")} value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
            </div>
            <div className="mb-2 [&_label]:!text-xs [&_label]:!font-semibold [&_label]:!text-muted-foreground [&_label]:!uppercase [&_label]:!tracking-widest [&_input]:!bg-card [&_input]:!border-border [&_input]:!text-card-foreground [&_input]:!rounded-xl">
              <PasswordField label={t("confirm_new_password")} value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} />
            </div>
            <button
              className="w-full mt-6 bg-card hover:bg-card text-card-foreground font-bold py-3.5 px-6 rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              type="submit"
              disabled={busy}
            >
              {busy ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <BiIcon name="bi-shield-check" style={{ fontSize: "16px" }} />
                  {t("reset_password_btn")}
                </>
              )}
            </button>
          </form>
        )}

        {step === "reset" ? (
          <div className="w-full flex justify-between items-center mt-6 pt-4 border-t border-border">
            <button className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-card-foreground transition-colors disabled:opacity-50" onClick={resend} disabled={busy} type="button">
              <BiIcon name="bi-arrow-clockwise" style={{ fontSize: "16px" }} />
              {t("resend_code")}
            </button>
            <Link href="/login" className="mt-6 inline-flex items-center justify-center gap-2 text-sm text-[#D97706] hover:text-card-foreground font-medium transition-colors duration-200">
              <BiIcon name="bi-arrow-left" />
              <span>Retour à la connexion</span>
            </Link>
          </div>
        ) : (
          <Link href="/login" className="mt-6 inline-flex items-center justify-center gap-2 text-sm text-[#D97706] hover:text-card-foreground font-medium transition-colors duration-200">
            <BiIcon name="bi-arrow-left" />
            <span>Retour à la connexion</span>
          </Link>
        )}
      </div>
    </div>
  );
}
