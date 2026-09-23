"use client";

import { BiIcon } from "components/BiIcon";

import Link from "next/link";
import Logo from "./Logo";
import { useLanguage } from "lib/i18n";
import Image from "next/image";

/* SVG officiels (chemins Font Awesome / Google) — monochromes, nets,
   rendus en blanc via currentColor pour rester sobres et alignés. */
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={className} aria-hidden="true" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function GooglePlayLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true" fill="currentColor">
      <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
    </svg>
  );
}

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
              Art gallery · photography
            </div>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-sm">{t("footer_tagline")}</p>

          {/* Boutons Store */}
          <div>
            <div className="!text-zinc-200 text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: '#e4e4e7' }}>{t("mobile_app_label")}</div>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://apps.apple.com"
                className="bg-surface border border-border text-white rounded-xl p-2.5 flex items-center gap-3 hover:bg-neutral-800 transition-colors"
                aria-label="App Store"
              >
                <AppleLogo className="w-6 h-6 shrink-0" />
                <span className="flex flex-col leading-tight whitespace-nowrap">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{t("download_on_the")}</span>
                  <span className="text-xs font-semibold text-white">App Store</span>
                </span>
              </a>
              <a
                href="https://play.google.com/store"
                className="bg-surface border border-border text-white rounded-xl p-2.5 flex items-center gap-3 hover:bg-neutral-800 transition-colors"
                aria-label="Google Play"
              >
                <GooglePlayLogo className="w-6 h-6 shrink-0" />
                <span className="flex flex-col leading-tight whitespace-nowrap">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{t("get_it_on")}</span>
                  <span className="text-xs font-semibold text-white">Google Play</span>
                </span>
              </a>
            </div>
          </div>
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
            <li><Link href="/register" className={NAV_LINK}>{t("become_creator")}</Link></li>
            <li><Link href="/dashboard" className={NAV_LINK}>{t("dashboard")}</Link></li>
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
          <p className="m-0">© {new Date().getFullYear()} Aperio. {t("all_rights_reserved")} Crafted with care in Madagascar.</p>
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