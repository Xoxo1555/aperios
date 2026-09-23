"use client";

import { useSyncExternalStore, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "components/SessionProvider";
import Logo from "components/Logo";
import PasswordField from "components/PasswordField";
import GoogleButton from "components/GoogleButton";
import { useLanguage } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

const SIDE_IMAGE = "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?q=80&w=1600&auto=format&fit=crop";

const FIELD_GROUP = "flex flex-col gap-1.5";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useSession();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const googleError = useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof window === "undefined") return "";
      const code = new URLSearchParams(window.location.search).get("error");
      if (!code) return "";
      if (code === "google_not_configured") return t("google_not_configured");
      if (code.startsWith("google")) return t("google_error");
      return "";
    },
    () => "",
  );
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsVerification) { router.push(`/verify-email?email=${encodeURIComponent(data.email)}`); return; }
        setError(data.error ?? t("unable_log_in")); setLoading(false); return;
      }
      setUser(data.user); router.refresh();
      const params = new URLSearchParams(window.location.search);
      const callbackUrl = params.get("callbackUrl") ?? params.get("next");
      if (callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")) {
        router.push(callbackUrl);
      } else {
        router.push("/");
      }
    } catch { setError(t("something_went_wrong")); setLoading(false); }
  }

  return (
    <div className="auth-shell surface-dark">
      {/* Panneau héroïque gauche (desktop uniquement) */}
      <div className="auth-visual" style={{ backgroundImage: `url(${SIDE_IMAGE})` }}>
        <div className="z-50 relative select-none">
          <Logo />
        </div>
        <div className="auth-quote">
          <p>{t("quote_light")}</p>
          <span>· Aperio Studio</span>
        </div>
        <div className="auth-credit">{t("auth_credit_baobabs")}</div>
      </div>

      {/* Colonne droite : carte formulaire flottante / centrée */}
      <div className="auth-form-col">
        <div className="auth-form-wrap animate-[apFadeUp_0.35s_ease_both]">
          <div className="lg:hidden flex justify-center mb-6">
            <Logo />
          </div>
          <h1 className="font-serif font-bold mb-1 text-3xl">{t("welcome_back")}</h1>
          <p className="text-muted-2 mb-5 text-sm">
            {t("login_sub")}
          </p>

          <GoogleButton />
          <div className="auth-divider"><span>{t("or_with_email")}</span></div>

          {(error || googleError) && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 mb-4 text-red-700 text-sm">
              <BiIcon name="bi-exclamation-triangle" style={{ width: 16, height: 16 }} className="shrink-0" />
              <span>{error || googleError}</span>
            </div>
          )}

          <form onSubmit={submit} noValidate={false}>
            <div className="flex flex-col gap-4">
              <div className={FIELD_GROUP}>
                <label htmlFor="login-email" className="form-label">{t("email_address")}</label>
                <input
                  id="login-email"
                  name="email"
                  className="form-control"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  required
                  autoComplete="email"
                />
              </div>
              <PasswordField label={t("password_label")} value={password} onChange={setPassword} autoComplete="current-password" />
              <div className="flex justify-end -mt-1">
                <Link href="/forgot-password" className="text-muted-2 link-underline-anim text-[0.82rem]">{t("forgot_password_question")}</Link>
              </div>
              <button className="btn btn-gold w-full btn-lg whitespace-nowrap" type="submit" disabled={loading}>
                {loading ? <span className="spinner-border spinner-border-sm" /> : t("log_in")}
              </button>
            </div>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '20px', width: '100%', textAlign: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'inline-block' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <span style={{ fontSize: '12px', color: '#a1a1aa', whiteSpace: 'nowrap' }}>
              Email vérifié · Confidentialité garantie · Données protégées
            </span>
          </div>

          <p className="text-center mt-5 mb-0 text-muted-2 text-sm">
            {t("new_to_aperio")}{" "}
            <Link href="/register" className="text-amber-400 hover:text-amber-300 font-semibold underline-offset-4 hover:underline">{t("create_account")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}