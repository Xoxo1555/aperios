"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLanguage, type DictKey } from "lib/i18n";
import type { CategoryDto } from "lib/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFromBi } from "lib/faIcon";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faBuilding, faCircleQuestion, faCompass, faFileLines, faFolder, faUser } from "@fortawesome/free-regular-svg-icons";
import { faChevronDown, faFeather, faGlobe, faHammer, faLeaf, faLocationDot, faPalette, faPlane, faShield, faTableCells, faTree } from "@fortawesome/free-solid-svg-icons";

const ICONS: Record<string, IconDefinition> = {
  madagascar: faGlobe,
  "nature-landscapes": faTree,
  "urban-architecture": faBuilding,
  wildlife: faFeather,
  people: faUser,
  travel: faCompass,
  street: faLocationDot,
  abstract: faPalette,
  macro: faLeaf,
  "fine-art-still-life": faLeaf,
  aerial: faPlane,
  artisanat: faHammer,
};

function catHref(c: CategoryDto): string {
  return c.kind === "art" ? `/prints?category=${c.slug}` : `/photos?category=${c.slug}`;
}

const MORE_LINKS: { href: string; key: DictKey; icon: IconDefinition; fallback: string }[] = [
  { href: "/about", key: "about", icon: faGlobe, fallback: "Ãƒâ‚¬ propos" },
  { href: "/help", key: "help_faq", icon: faCircleQuestion, fallback: "FAQ" },
  { href: "/contact", key: "contact", icon: faCompass, fallback: "Contact" },
  { href: "/terms", key: "nav_terms", icon: faFileLines, fallback: "Conditions" },
  { href: "/licenses", key: "nav_licenses", icon: faShield, fallback: "Licences" },
];

const ART_ARTISANAT_SLUGS = new Set([
  "fine-art-still-life",
  "artcraft",
  "art-artisanat",
  "artisanat",
  "malagasy-craft",
  "malagasy-art",
]);

function Icon({ name, size, className }: { name: IconDefinition; size?: number; className?: string }) {
  return (
    <span className="inline-flex items-center justify-center shrink-0">
      <FontAwesomeIcon icon={name} style={size ? { fontSize: size } : undefined} className={className} aria-hidden="true" />
    </span>
  );
}

export default function CategoryMenu({ categories }: { categories: CategoryDto[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams.get("category");
  const { t, lang } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setGalleryOpen(false);
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fermeture du menu aprÃƒÂ¨s navigation, volontaire
    setGalleryOpen(false);
    setMoreOpen(false);
  }, [pathname, category]);

  const isActiveCat = (c: CategoryDto) =>
    pathname === (c.kind === "art" ? "/prints" : "/photos") && category === c.slug;
  const isFreeActive = pathname === "/photos" && category !== "madagascar" && !ART_ARTISANAT_SLUGS.has(category ?? "");
  const isPremiumActive = pathname === "/prints" && (!category || (!ART_ARTISANAT_SLUGS.has(category) && category !== "madagascar"));
  const isMadagascarActive = (pathname === "/photos" || pathname === "/prints") && category === "madagascar";
  const isArtArtisanatActive = pathname === "/prints" && !!category && ART_ARTISANAT_SLUGS.has(category);

  const overlayOpen = galleryOpen || moreOpen;

  return (
    <div ref={rootRef} className="ap-catmenu flex items-center gap-1 w-full">
      {/* Backdrop Ã¢â‚¬â€ isole le mega-menu du reste de la page (clic = fermeture) */}
      {overlayOpen && (
        <div
          className="ap-mega-backdrop fixed inset-0 bg-black/40 backdrop-blur-sm"
          aria-hidden="true"
          onClick={() => { setGalleryOpen(false); setMoreOpen(false); }}
        />
      )}

      {/* CatÃƒÂ©gories Ã¢â€“Â¾ Ã¢â‚¬â€ dÃƒÂ©clencheur du mega-menu */}
      <div className="relative" style={{ flexShrink: 0 }}>
        <button
          type="button"
          className={`ap-cat-trigger${galleryOpen ? " is-open" : ""}`}
          aria-expanded={galleryOpen}
          aria-haspopup="true"
          onClick={() => setGalleryOpen((v) => !v)}
        >
          <Icon name={faFolder} size={15} />
          <span>{mounted ? t("nav_categories") : "CatÃƒÂ©gories"}</span>
          <Icon name={faChevronDown} size={14} className="ap-cat-chev" />
        </button>

        {galleryOpen && (
          <div className="ap-mega-dropdown absolute left-0 top-full mt-2">
            <div className="ap-mega-head">
              <span className="ap-mega-kicker">{t("mega_gallery_header")}</span>
              <span className="ap-mega-sub">{t("mega_gallery_sub")}</span>
            </div>
            <div className="ap-mega-grid">
              {categories.map((c) => {
                const iconName = ICONS[c.slug] ?? (c.icon ? faFromBi(c.icon) : faTableCells);
                const labelKey = `cat_${c.slug.replace(/-/g, "_")}` as const;
                // i18n: use t("cat_aerial"), t("cat_travel"), etc. avec fallback sur c.name si clÃƒÂ© manquante
                const translated = mounted ? (t as (k: string) => string)(labelKey) : c.name;
                const displayName = translated === labelKey ? c.name : translated;
                return (
                  <Link
                    key={c.id}
                    href={catHref(c)}
                    className={`ap-mega-item${isActiveCat(c) ? " is-active" : ""}`}
                    onClick={() => setGalleryOpen(false)}
                  >
                    <span className="ap-mega-ico">
                      <Icon name={iconName} size={16} />
                    </span>
                    <span className="ap-mega-text">
                      <span className="ap-mega-name">{displayName}</span>
                      {c.description && <span className="ap-mega-desc">{c.description}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Barre horizontale principale Ã¢â‚¬â€ liens fixes sur une seule ligne Ã¢â‚¬â€ traductions dynamiques FR/EN */}
      <nav className="ap-catbar flex items-center gap-6 lg:gap-8 px-4 py-2.5 grow">
        <Link href="/photos" className={`ap-catlink${isFreeActive ? " is-active" : ""}`}>
          {mounted ? t("nav_free") : "Gratuit"}
        </Link>
        <Link href="/prints" className={`ap-catlink${isPremiumActive ? " is-active" : ""}`}>
          {mounted ? t("nav_limited_editions") : "Ãƒâ€°ditions LimitÃƒÂ©es"}
        </Link>
        <Link
          href="/photos?category=madagascar"
          className={`ap-catlink${isMadagascarActive ? " is-active" : ""}`}
        >
          {mounted ? t("nav_madagascar") : "Madagascar"}
        </Link>
        <Link
          href="/prints?category=artisanat"
          className={`ap-catlink${isArtArtisanatActive ? " is-active" : ""}`}
        >
          {mounted ? t("nav_art_crafts") : "Art & Artisanat"}
        </Link>
      </nav>

      {/* ... Plus Ã¢â€“Â¾ Ã¢â‚¬â€ pages d'information, alignÃƒÂ© ÃƒÂ  droite */}
      <div className="relative ms-auto" style={{ flexShrink: 0 }}>
        <button
          type="button"
          className={`ap-cat-trigger ap-more-trigger${moreOpen ? " is-open" : ""}`}
          aria-expanded={moreOpen}
          aria-haspopup="true"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span>{mounted ? t("nav_more") : "Plus"}</span>
          <Icon name={faChevronDown} size={14} className="ap-cat-chev" />
        </button>

        {moreOpen && (
          <div
            className="ap-more-dropdown absolute right-0 top-full mt-2"
            role="menu"
          >
            {MORE_LINKS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                role="menuitem"
                className={`ap-more-item${pathname === s.href ? " is-active" : ""}`}
                onClick={() => setMoreOpen(false)}
              >
                <Icon name={s.icon} size={15} className="opacity-60 shrink-0" />
                {mounted ? t(s.key) : s.fallback}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

