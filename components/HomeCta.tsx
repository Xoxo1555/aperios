"use client";

import Link from "next/link";
import { useLanguage } from "lib/i18n";
import { useSession } from "./SessionProvider";
import BubbleField from "./BubbleField";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera } from "@fortawesome/free-regular-svg-icons";
import { faTableCells, faUpload } from "@fortawesome/free-solid-svg-icons";

/* Final CTA of the home page. Client component so its labels follow the
   active language, and so the single call-to-action can adapt to the session:
   guest → /register, creator → /dashboard (premium dark / amber-outlined
   style instead of the plain gold button), buyer → /profile. */
export default function HomeCta() {
  const { t } = useLanguage();
  const { user } = useSession();

  /* /dashboard is RBAC-gated in proxy.ts (photographer | admin): a buyer is
     bounced back to "/", so only creators can be sent there. */
  const isCreator = user?.role === "photographer" || user?.role === "admin";

  /* A logged-in user must never land on /register: proxy.ts redirects any
     authenticated visitor away from /register and /login, so the old hardcoded
     href silently bounced creators back to the home page. Guests keep the
     register CTA; creators go to their dashboard; a buyer has no creator
     application route yet, so /profile (auth-only) is their landing spot. */
  const destination = !user ? "/register" : isCreator ? "/dashboard" : "/profile";
  const ctaLabel = !user
    ? t("start_publishing")
    : isCreator
      ? t("view_dashboard")
      : t("become_creator");
  const ctaIcon = isCreator ? faTableCells : faUpload;

  return (
    <section className="container py-5">
      <div className="rounded-2xl p-5 text-center relative overflow-hidden" style={{ border: "1px solid var(--ap-border)", background: "linear-gradient(120deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))" }}>
        <div className="pattern-lamba" style={{ position: "absolute", inset: 0, opacity: 0.3 }} />
        <BubbleField variant="compact" />
        <div className="relative z-10">
          <div className="gallery-stamp mb-4 mx-auto">
            <FontAwesomeIcon icon={faCamera} />
            {t("cta_stamp")}
          </div>
          <h2 className="font-serif font-bold mb-3" style={{ fontSize: "2rem" }}>{t("cta_title")}</h2>
          <p className="gallery-sub mx-auto mb-4">
            {t("cta_desc")}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href={destination}
              className={`btn btn-lg ${isCreator ? "btn-premium" : "btn-gold"}`}
            >
              <FontAwesomeIcon icon={ctaIcon} className="me-2" style={isCreator ? { fontSize: 18 } : undefined} />
              {ctaLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
