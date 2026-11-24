"use client";

import { BiIcon } from "components/BiIcon";

import Link from "next/link";
import Logo from "./Logo";
import { useLanguage } from "lib/i18n";
import { useSession } from "./SessionProvider";
import Image from "next/image";

const SOCIALS = [
  { icon: "bi-facebook", href: "https://facebook.com", label: "Facebook" },
  { icon: "bi-twitter-x", href: "https://x.com", label: "X (Twitter)" },
  { icon: "bi-instagram", href: "https://instagram.com", label: "Instagram" },
  { icon: "bi-pinterest", href: "https://pinterest.com", label: "Pinterest" },
  { icon: "bi-youtube", href: "https://youtube.com", label: "YouTube" },
];

const PAYMENTS = [
  { src: "/images/payments/visa.svg", alt: "Visa", w: 56, h: 18 },
  { src: "/images/payments/mastercard.svg", alt: "Mastercard", w: 42, h: 32, auto: true },
  { src: "/images/payments/paypal.svg", alt: "PayPal", w: 52, h: 14 },
  { src: "/images/payments/yas.svg", alt: "Yas", w: 42, h: 38, auto: true },
  { src: "/images/payments/orange-money.svg", alt: "Orange", w: 58, h: 16, auto: true },
  { src: "/images/payments/airtel.svg", alt: "Airtel", w: 32, h: 34, auto: true },
];

export default function Footer() {
  const { t } = useLanguage();
  const { user } = useSession();

  /* /dashboard is gated by RBAC in proxy.ts (photographer | admin) and
     silently redirects anyone else to "/". Only advertise it to the roles
     that can actually reach it, otherwise visitors get a dead-end link. */
  const isCreator = user?.role === "photographer" || user?.role === "admin";

  /* proxy.ts bounces any authenticated user away from /register, so the
     "become a creator" link must not stay hardcoded for logged-in visitors.
     Creators keep a single entry pointing at their dashboard; pointing both
     this link and a second dashboard link at /dashboard would duplicate it.
     A buyer has no creator-application route yet, so /profile (auth-only) is
     their landing spot. */
  const creatorEntry = isCreator
    ? { href: "/dashboard", label: t("dashboard") }
    : { href: user ? "/profile" : "/register", label: t("become_creator") };

  const COL_HEADER = "text-zinc-200 text-xs font-semibold tracking-wider uppercase mb-4";
  const NAV_LINK = "text-muted-foreground hover:text-white text-sm transition-colors py-1 block w-fit";

  return (
    <footer className="bg-noir surface-dark text-muted-foreground border-t border-border pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Colonne 1 : Marque — logo officiel standardisé */}
        <div>
          <div className="mb-4">
            <Logo />
            <div className="!text-muted-foreground text-[10px] font-medium tracking-widest uppercase mt-1.5" style={{ color: '#a1a1aa' }}>
              Galerie d&apos;art · photographie
            </div>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-sm">{t("footer_tagline")}</p>

          {/* Les boutons Store restent masqués tant que les applications ne sont pas publiées. */}
        </div>

        {/* Colonne 2 : Explorer */}
        <div>
          <div className={COL_HEADER}>{t("explore")}</div>
          <ul className="list-none p-0 m-0">
            <li><Link href="/photos" className={NAV_LINK}>{t("free_photos")}</Link></li>
            <li><Link href="/prints" className={NAV_LINK}>{t("fine_art_prints")}</Link></li>
            <li><Link href="/photos?category=madagascar" className={NAV_LINK}>{t("madagascar_collection")}</Link></li>
            <li><Link href="/prints?category=malagasy-art" className={NAV_LINK}>{t("malagasy_art")}</Link></li>
            <li><Link href="/collections" className={NAV_LINK}>{t("nav_collections")}</Link></li>
            <li><Link href="/about" className={NAV_LINK}>{t("about")}</Link></li>
            <li><Link href="/contact" className={NAV_LINK}>{t("contact_us")}</Link></li>
          </ul>
        </div>

        {/* Colonne 3 : Pour les créateurs */}
        <div>
          <div className={COL_HEADER}>{t("for_artists")}</div>
          <ul className="list-none p-0 m-0">
            <li><Link href={creatorEntry.href} className={NAV_LINK}>{creatorEntry.label}</Link></li>
            <li><Link href="/pricing" className={NAV_LINK}>{t("pricing_commissions")}</Link></li>
            <li><Link href="/licenses" className={NAV_LINK}>{t("rights_licenses")}</Link></li>
            <li><Link href="/help" className={NAV_LINK}>{t("help_support")}</Link></li>
          </ul>
        </div>

        {/* Colonne 4 : Réseaux & Paiements */}
        <div>
          <div className={COL_HEADER}>{t("follow_us")}</div>
          <div className="flex flex-wrap gap-2.5 mb-5">
            {SOCIALS.map((s) => (
              <a
                key={s.icon}
                href={s.href}
                className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-neutral-300 hover:text-noir hover:bg-gold hover:border-gold transition-all shadow-sm"
                aria-label={s.label}
                title={s.label}
              >
                <BiIcon name={s.icon} />
              </a>
            ))}
          </div>

          <div className={COL_HEADER}>{t("secure_payment")}</div>
          <p className="text-muted-foreground text-sm leading-relaxed mb-3">{t("payment_desc")}</p>
          {/* Logos de paiement harmonisés */}
          <div className="grid grid-cols-3 gap-2">
            {PAYMENTS.map((p) => (
              <div
                key={p.alt}
                className="h-12 inline-flex items-center justify-center rounded-lg border border-border p-1.5 bg-surface/60 opacity-90 hover:opacity-100 transition-opacity"
                title={p.alt}
              >
                <Image
                  src={p.src}
                  alt={p.alt}
                  width={p.w}
                  height={p.h}
                  className="object-contain"
                  style={p.auto ? { width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%" } : { maxWidth: "100%", maxHeight: "100%" }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Barre de bas / Copyright */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground flex-wrap">
          <p className="m-0">© {new Date().getFullYear()} Aperio. {t("all_rights_reserved")} {t("crafted_with_care")}</p>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Link href="/privacy" className="hover:text-white transition-colors">{t("privacy_policy")}</Link>
            <span aria-hidden="true" className="text-neutral-600">•</span>
            <Link href="/terms" className="hover:text-white transition-colors">{t("terms_of_sale")}</Link>
            <span aria-hidden="true" className="text-neutral-600">•</span>
            <Link
              href="/cookies"
              className="hover:text-white transition-colors"
            >
              {t("cookies_title")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}