"use client";

import { useSyncExternalStore, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "components/SessionProvider";
import Logo from "components/Logo";
import PasswordField from "components/PasswordField";
import PhoneInput from "components/PhoneInput";
import GoogleButton from "components/GoogleButton";
import { useLanguage, type DictKey } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

const SIDE_IMAGE = "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?q=80&w=1600&auto=format&fit=crop";

const COUNTRIES = ["Madagascar", "France", "Réunion", "Mayotte", "Belgium", "Switzerland", "Canada", "Germany", "United States", "Other"];

const FIELD_GROUP = "flex flex-col gap-1.5";
const FIELD_GROUP_FULL = "flex flex-col gap-1.5 md:col-span-2";
const LABEL_CLS = "text-zinc-300 text-xs font-medium tracking-wide uppercase";

export default function RegisterPage() {
  const router = useRouter();
  const { setUser } = useSession();
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<"buyer" | "photographer">("buyer");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Madagascar");
  const [location, setLocation] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
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
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const INTERESTS: { value: string; labelKey: DictKey }[] = [
    { value: "Landscapes", labelKey: "interest_landscapes" },
    { value: "Contemporary art", labelKey: "interest_contemporary_art" },
    { value: "Wildlife", labelKey: "interest_wildlife" },
    { value: "Portraits", labelKey: "interest_portraits" },
    { value: "Craft", labelKey: "interest_craft" },
    { value: "Malagasy photography", labelKey: "interest_malagasy_photography" },
    { value: "Street photography", labelKey: "interest_street_photography" },
    { value: "Macro", labelKey: "interest_macro" },
    { value: "Black & white", labelKey: "interest_black_white" },
  ];

  function toggleInterest(i: string) {
    setInterests((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  }

  async function register(list: string[]) {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register", name, email, password, confirm, role,
          phone, country, location,
          specialties: role === "photographer" ? specialties : undefined,
          interests: role === "buyer" ? list.join(", ") : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t("unable_sign_up")); setLoading(false); return; }
      setUser(null);
      setRegisteredEmail(data.user.email);
    } catch { setError(t("something_went_wrong")); setLoading(false); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (role === "buyer" && interests.length === 0) {
      setError(t("choose_at_least_one"));
      return;
    }
    await register(interests);
  }

  function skipStep() {
    register([]);
  }

  if (registeredEmail) {
    return (
      <div className="auth-shell surface-dark">
        <div className="auth-visual" style={{ backgroundImage: `url(${SIDE_IMAGE})` }}>
          <div className="z-50 relative select-none">
            <Logo />
          </div>
          <div className="auth-quote"><p>{t("quote_single_glance")}</p><span>Â· Aperio Studio</span></div>
          <div className="auth-credit">{t("auth_credit_rice")}</div>
        </div>
        <div className="auth-form-col">
          <div className="auth-form-wrap animate-[apFadeUp_0.35s_ease_both]">
            <span className="inline-flex items-center justify-center rounded-xl mb-4 w-14 h-14 bg-green-50 border border-green-200">
              <BiIcon name="bi-mailbox" style={{ fontSize: 28, color: "var(--ap-green)" }} />
            </span>
            <h1 className="font-serif font-bold mb-2 text-3xl">{t("check_your_inbox")}</h1>
            <p className="text-muted-2 mb-4 text-sm leading-relaxed">
              {t("verification_code_sent", { email: registeredEmail })}
            </p>
            <div className="p-4 mb-5 rounded-xl text-left bg-[#f8f6f0] border border-border">
              <div className="flex items-center gap-2 mb-2 font-semibold text-sm text-gray-900">
                <BiIcon name="bi-info-circle" style={{ fontSize: 16, color: "rgba(245,158,11,0.9)" }} className="shrink-0" />
                {t("verification_instructions")}:
              </div>
              <ul className="mb-0 pl-5 list-disc text-muted-2 text-[0.86rem] leading-relaxed space-y-1">
                <li>{t("instr_check_emails", { email: registeredEmail })}</li>
                <li>{t("instr_check_spam")}</li>
                <li>{t("instr_enter_code")}</li>
              </ul>
            </div>
            <div className="grid gap-2">
              <button className="btn btn-gold btn-lg whitespace-nowrap" onClick={() => router.push(`/verify-email?email=${encodeURIComponent(registeredEmail)}`)}>
                <BiIcon name="bi-shield-check" style={{ fontSize: 20 }} className="me-2" />{t("enter_my_confirmation_code")}
              </button>
              <Link href="/login" className="btn btn-ghost whitespace-nowrap">{t("already_verified_account")}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell surface-dark">
      {/* Panneau héroïque gauche (desktop uniquement) */}
      <div className="auth-visual" style={{ backgroundImage: `url(${SIDE_IMAGE})` }}>
        <div className="z-50 relative select-none">
          <Logo />
        </div>
        <div className="auth-quote">
          <p>{t("quote_red_island")}</p>
          <span>· Aperio Studio</span>
        </div>
        <div className="auth-credit">{t("auth_credit_rice")}</div>
      </div>

      {/* Colonne droite : carte formulaire flottante / centrée */}
      <div className="auth-form-col">
        <div className="auth-form-wrap !max-w-[520px] animate-[apFadeUp_0.35s_ease_both]">
          <div className="lg:hidden flex justify-center mb-6">
            <Logo />
          </div>
          <h1 className="font-serif font-bold mb-1 text-3xl">{t("join_aperio")}</h1>
          <p className="text-muted-2 mb-5 text-sm">
            {t("register_sub")}
          </p>

          <GoogleButton />
          <div className="auth-divider"><span>{t("or_with_email")}</span></div>

          {(error || googleError) && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 mb-4 text-red-700 text-sm">
              <BiIcon name="bi-exclamation-triangle" style={{ fontSize: 16 }} className="shrink-0" />
              <span>{error || googleError}</span>
            </div>
          )}

          <form onSubmit={submit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start w-full">
              <div className={FIELD_GROUP}>
                <label htmlFor="reg-name" className={LABEL_CLS}>{t("username")}</label>
                <input id="reg-name" className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rakoto R." required minLength={2} />
              </div>
              <div className={FIELD_GROUP}>
                <label className={LABEL_CLS}>{t("phone_optional")}</label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
              <div className={FIELD_GROUP_FULL}>
                <label htmlFor="reg-email" className={LABEL_CLS}>{t("email_address")}</label>
                <input id="reg-email" className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" required autoComplete="email" />
              </div>
              <div className={FIELD_GROUP}>
                <PasswordField value={password} onChange={setPassword} label={t("password_label")} autoComplete="new-password" minLength={8} />
              </div>
              <div className={FIELD_GROUP}>
                <PasswordField value={confirm} onChange={setConfirm} label={t("confirm_label")} autoComplete="new-password" minLength={8} />
              </div>
              <div className={FIELD_GROUP}>
                <label htmlFor="reg-country" className={LABEL_CLS}>{t("country_label")}</label>
                <select id="reg-country" className="form-select" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className={FIELD_GROUP}>
                <label htmlFor="reg-city" className={LABEL_CLS}>{t("city_region")}</label>
                <input id="reg-city" className="form-control" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Antananarivo, Paris…" />
              </div>

              <div className={FIELD_GROUP_FULL}>
                <label className={LABEL_CLS}>{t("i_want_to")}</label>
                <div className="grid gap-2">
                  <label className={`role-card ${role === "buyer" ? "active" : ""}`}>
                    <input type="radio" name="role" className="form-check-input sr-only" checked={role === "buyer"} onChange={() => setRole("buyer")} />
                    <span className="role-icon"><BiIcon name="bi-hand-thumbs-up" style={{ fontSize: 20 }} /></span>
                    <span className="min-w-0"><span className="role-title">{t("role_collector")}</span><span className="role-desc">{t("role_collector_desc")}</span></span>
                  </label>
                  <label className={`role-card ${role === "photographer" ? "active" : ""}`}>
                    <input type="radio" name="role" className="form-check-input sr-only" checked={role === "photographer"} onChange={() => setRole("photographer")} />
                    <span className="role-icon"><BiIcon name="bi-palette" style={{ fontSize: 20 }} /></span>
                    <span className="min-w-0"><span className="role-title">{t("role_artist")}</span><span className="role-desc">{t("role_artist_desc")}</span></span>
                  </label>
                </div>
              </div>

              {role === "photographer" && (
                <div className={FIELD_GROUP_FULL}>
                  <div className="!text-white font-semibold mb-1">{t("interests_artist_title")}</div>
                  <p className="text-muted-2 mb-2 text-sm">
                    {t("interests_artist_sub")}
                  </p>
                  <label htmlFor="reg-specialties" className={LABEL_CLS}>{t("photography_specialties")}</label>
                  <input id="reg-specialties" className="form-control" value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder={t("specialties_placeholder")} />
                </div>
              )}
              {role === "buyer" && (
                <div className={FIELD_GROUP_FULL}>
                  <div className="!text-white font-semibold mb-1">{t("interests_buyer_title")}</div>
                  <p className="text-muted-2 mb-2 text-sm">
                    {t("interests_buyer_sub")}
                  </p>
                  {interests.length === 0 && (
                    <p className="mb-2 flex items-center gap-1 text-[0.78rem] text-[var(--ap-gold-dark)]">
                      <BiIcon name="bi-info-circle" style={{ fontSize: 14 }} className="shrink-0" />{t("choose_at_least_one")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((it) => {
                      const selected = interests.includes(it.value);
                      return (
                        <button key={it.value} type="button"
                          className={`chip inline-flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 ${selected ? "!border-[var(--ap-accent)] !bg-[rgba(154,123,28,0.12)] !text-[var(--ap-gold-dark)]" : ""}`}
                          onClick={() => toggleInterest(it.value)}>
                          {selected && <BiIcon name="bi-check" style={{ fontSize: 16 }} />} {t(it.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={`${FIELD_GROUP_FULL} !gap-2 mt-1`}>
                <button className="btn btn-gold w-full btn-lg whitespace-nowrap" type="submit" disabled={loading}>
                  {loading ? <span className="spinner-border spinner-border-sm" /> : t(role === "buyer" ? "interests_buyer_cta" : "interests_artist_cta")}
                </button>
                {role === "buyer" && (
                  <button type="button" className="btn btn-link w-full text-muted-2 mt-1 text-sm whitespace-nowrap hover:text-[var(--ap-gold-dark)]" onClick={skipStep}>
                    {t("interests_buyer_skip")}
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '20px', width: '100%', textAlign: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'inline-block' }}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="m9 12 2 2 4-4"/>
                  </svg>
                  <span style={{ fontSize: '12px', color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                    Email vérifié · Confidentialité garantie · Données protégées
                  </span>
                </div>
              </div>
            </div>
          </form>

          <p className="text-center mt-5 mb-0 text-muted-2 text-sm">
            {t("already_member")} <Link href="/login" className="text-amber-400 hover:text-amber-300 font-semibold underline-offset-4 hover:underline">{t("log_in")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
