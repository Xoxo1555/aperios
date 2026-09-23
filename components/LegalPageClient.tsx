"use client";

import Link from "next/link";
import { useLanguage, type DictKey } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

type LegalVariant = "legal" | "terms" | "privacy";

interface LegalPageClientProps {
  variant: LegalVariant;
}

const TITLE_KEY: Record<LegalVariant, DictKey> = {
  legal: "legal_notice",
  terms: "terms_of_sale",
  privacy: "privacy_policy",
};

const INTRO_KEY: Record<LegalVariant, DictKey> = {
  legal: "legal_intro",
  terms: "terms_intro",
  privacy: "privacy_intro",
};

interface Section {
  title: DictKey;
  body: DictKey;
  vars?: Record<string, string>;
}

const SECTIONS: Record<LegalVariant, Section[]> = {
  legal: [
    { title: "legal_publisher_title", body: "legal_publisher_body" },
    { title: "legal_hosting_title", body: "legal_hosting_body" },
    { title: "legal_contact_title", body: "legal_contact_body" },
  ],
  terms: [
    { title: "terms_pricing_title", body: "terms_pricing_body" },
    { title: "terms_shipping_title", body: "terms_shipping_body", vars: { threshold: "100", shipping: "20" } },
    { title: "terms_rights_title", body: "terms_rights_body" },
    { title: "terms_refund_title", body: "terms_refund_body" },
  ],
  privacy: [
    { title: "privacy_collect_title", body: "privacy_collect_body" },
    { title: "privacy_use_title", body: "privacy_use_body" },
    { title: "privacy_cookies_title", body: "privacy_cookies_body" },
    { title: "privacy_rights_title", body: "privacy_rights_body" },
  ],
};

const SIBLING_LINKS: { href: string; label: DictKey }[] = [
  { href: "/legal", label: "legal_notice" },
  { href: "/terms", label: "terms_of_sale" },
  { href: "/privacy", label: "privacy_policy" },
  { href: "/cookies", label: "privacy_cookies_title" },
  { href: "/licenses", label: "help_btn_licenses" },
  { href: "/pricing", label: "help_btn_pricing" },
  { href: "/contact", label: "help_btn_contact" },
];

export default function LegalPageClient({ variant }: LegalPageClientProps) {
  const { t } = useLanguage();
  const title = t(TITLE_KEY[variant]);
  const sections = SECTIONS[variant];

  return (
    <div className="bg-background text-foreground">
      <div className="container py-5" style={{ maxWidth: 860 }}>
        {/* Header */}
        <div className="text-center mb-5 pt-4">
          <div className="gallery-label mb-3" style={{ color: "var(--ap-gold-2)" }}>{t("legal_section_label")}</div>
          <h1 className="font-serif font-bold mb-3" style={{ fontSize: "clamp(1.9rem, 4vw, 2.8rem)" }}>
            {title}
          </h1>
          <p className="text-muted-foreground mx-auto mb-0" style={{ maxWidth: 680, fontSize: "1.02rem", lineHeight: 1.7 }}>
            {t(INTRO_KEY[variant])}
          </p>
        </div>

        {/* Content */}
        <div className="bg-card rounded-2xl p-4 p-md-5 mb-5 border border-border">
          <div className="grid gap-4">
            {sections.map((s) => (
              <div key={s.title}>
                <h6 className="font-bold mb-2" style={{ color: "var(--ap-gold-2)", fontSize: "0.95rem" }}>
                  <BiIcon name="bi-chevron-right" className="me-2" style={{ fontSize: "0.75rem" }} />
                  {t(s.title)}
                </h6>
                <p className="text-muted-foreground mb-0" style={{ fontSize: "0.92rem", lineHeight: 1.7 }}>
                  {s.vars ? t(s.body, s.vars) : t(s.body)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Sibling navigation */}
        <div className="text-center bg-card rounded-2xl p-4 border border-border">
          <h5 className="font-bold mb-3" style={{ color: "var(--ap-gold-light)" }}>{t("legal_section_label")}</h5>
          <div className="flex gap-2 justify-center flex-wrap pb-2">
            {SIBLING_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  link.href === `/${variant}`
                    ? "inline-flex items-center bg-card text-white hover:opacity-90 font-semibold px-4 py-2 rounded-xl transition-colors"
                    : "inline-flex items-center text-white border border-white/30 hover:border-amber-400 hover:text-amber-400 font-medium px-4 py-2 rounded-xl transition-colors"
                }
              >
                {t(link.label)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
