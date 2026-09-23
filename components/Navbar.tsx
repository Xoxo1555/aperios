"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "./SessionProvider";
import { useCart, cartCount } from "lib/cart";
import { useMounted } from "lib/hooks";
import { useLanguage } from "lib/i18n";
import Logo from "./Logo";
import LangCurrencySwitcher from "./LangCurrencySwitcher";
import CategoryMenu from "./CategoryMenu";
import ThemeToggle from "./ThemeToggle";
import Image from "next/image";
import { BiIcon } from "components/BiIcon";
import type { CategoryDto, PhotoDto } from "lib/types";

interface Props { categories: CategoryDto[]; }

/* /login and /register carry their own self-contained branding (a large
   logo over the side photo) — showing the full site navbar on top of it
   duplicated the Aperio logo on screen. /verify-email has no such logo,
   so it keeps the regular navbar for normal site navigation. */
const NAVBAR_HIDDEN_ROUTES = ["/login", "/register"];

export default function Navbar({ categories }: Props) {
  const { user, setUser } = useSession();
  const { items, setOpen } = useCart();
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams.get("category");
  const mounted = useMounted();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<PhotoDto[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const count = mounted ? cartCount(items) : 0;
  const searchLabel = mounted ? t("search_aria") : "Search";

  const visibleSuggestions = q.trim() ? suggestions : [];

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/photos?q=${encodeURIComponent(q)}&limit=6`);
        if (res.ok) { const d = await res.json(); setSuggestions(d.photos ?? []); }
      } catch { setSuggestions([]); }
    }, 260);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setUserOpen(false); setGuestOpen(false); setShowSug(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  /* Any navigation (e.g. clicking a main row link while a flyout is open)
     must close every open menu — otherwise a dropdown stays hanging over
     the next page. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fermeture des menus après navigation, volontaire
    setUserOpen(false); setGuestOpen(false); setShowSug(false); setExpanded(false);
  }, [pathname]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/photos?q=${encodeURIComponent(q)}`);
    setShowSug(false);
  }

  async function logout() {
    try {
      await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    } catch { /* ignore */ }
    setUser(null); setUserOpen(false); router.push("/"); router.refresh();
  }

  /* Where a given category links to depends on its kind: "stock" only
     categories browse in the free-photos catalog, "art" only ones in
     the limited-edition prints catalog. "both" categories default to
     the free catalog, which is the site's main storefront. */
  function categoryHref(c: CategoryDto): string {
    return c.kind === "art" ? `/prints?category=${c.slug}` : `/photos?category=${c.slug}`;
  }

  // Art & Artisanat aliases for active state detection
  const ART_ARTISANAT_SLUGS = new Set([
    "fine-art-still-life",
    "artcraft",
    "art-artisanat",
    "artisanat",
    "malagasy-craft",
    "malagasy-art",
  ]);

  // "Madagascar" already has its own fixed nav link above — every other
  // category lives under the "More ▾" dropdown.
  const otherCategories = categories.filter((c) => c.slug !== "madagascar");

  /* Active nav-link detection — drives the animated gold underline
     indicator below the current page's link (Home, Free, Premium,
     Madagascar, Collections). */
  const isHomeActive = pathname === "/";
  const isFreeActive = pathname === "/photos" && category !== "madagascar";
  // "Édition limitée" (General) = /prints with NO category filter OR with a category that's NOT Art & Artisanat
  const isPremiumActive = pathname === "/prints" && (!category || !ART_ARTISANAT_SLUGS.has(category)) && category !== "madagascar";
  const isMadagascarActive = (pathname === "/photos" || pathname === "/prints") && category === "madagascar";
  // "Art & Artisanat" = /prints with Art & Artisanat category (aliases)
  const isArtArtisanatActive = pathname === "/prints" && category && ART_ARTISANAT_SLUGS.has(category);
  const isCollectionsActive = pathname.startsWith("/collections");

  if (NAVBAR_HIDDEN_ROUTES.includes(pathname)) return null;

  return (
    <header
      ref={rootRef}
      className="ap-navbar-wrap surface-dark"
      style={{
        width: "100vw",
        maxWidth: "100vw",
        position: "relative",
        left: "50%",
        right: "50%",
        marginLeft: "-50vw",
        marginRight: "-50vw",
      }}
    >
      {/* ROW 1 — MAIN (logo · search · actions) */}
      <div className="ap-nav-main-row w-full px-4 py-3 flex items-center justify-between gap-3 border-b border-secondary border-opacity-25">
        {/* A. LOGO — identité officielle standardisée */}
        <div style={{ flexShrink: 0 }} onClick={() => setExpanded(false)}>
          <Logo />
        </div>

        {/* B. BARRE DE RECHERCHE CENTRALE (Unified Fluid Style - Dark) */}
        <form className="ap-nav-search hidden hidden lg:block grow mx-3" style={{ maxWidth: "650px" }} onSubmit={submitSearch} role="search">
          <div className="flex items-center w-full max-w-xl rounded-full bg-card/90 backdrop-blur-md border border-neutral-700/50 overflow-hidden">
            <input
              type="text"
              className="flex-1 bg-transparent px-4 py-2 text-white placeholder:text-muted-foreground focus:outline-none border-0 text-sm"
              placeholder={t("search_photos_placeholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setShowSug(true)}
              aria-label={searchLabel}
            />
            <button type="button" className="px-3 text-muted-foreground hover:text-white bg-transparent" aria-label={t("visual_search")} onClick={() => fileInputRef.current?.click()}>
              <BiIcon name="bi-camera" style={{ fontSize: 20 }} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { /* image sélectionnée */ } e.target.value = ""; }} />
            <button type="submit" className="bg-card hover:bg-zinc-800 transition-all duration-200 shadow-md active:scale-95 text-white font-semibold px-5 py-2.5 flex items-center gap-2" aria-label={searchLabel}>
              <BiIcon name="bi-search" className="me-1" />{searchLabel}
            </button>
          </div>
          {showSug && visibleSuggestions.length > 0 && (
            <div className="search-suggestions mt-2">
              {visibleSuggestions.map((p) => (
                <Link
                  key={p.id}
                  href={`/photo/${p.slug}`}
                  className="suggestion-item text-decoration-none"
                  onClick={() => { setShowSug(false); setQ(""); }}
                >
                  <Image
                    src={p.imageUrl}
                    alt={p.title}
                    width={36}
                    height={36}
                    className="rounded object-cover"
                    unoptimized={process.env.NODE_ENV === "development"}
                    loading="lazy"
                  />
                  <div className="leading-none">
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ap-text)" }}>{p.title}</div>
                    <div className="text-muted-2" style={{ fontSize: "0.72rem" }}>{p.photographer.name}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </form>

        {/* C. ACTIONS ET SÉLECTEURS (Droite) */}
        <div className="ap-nav-actions flex items-center gap-3" style={{ flexShrink: 0 }}>
          {/* Langue / Devise */}
          <div className="hidden hidden lg:block">
            <LangCurrencySwitcher />
          </div>

          {/* Compte / Connexion */}
          {mounted && user ? (
            <div className="relative hidden hidden lg:block">
              <button
                className="flex items-center gap-2 rounded-full border border-border bg-white/5 p-1 pr-2.5 transition-all hover:border-gold/50 hover:bg-white/10"
                aria-label={t("account_aria")}
                aria-expanded={userOpen}
                onClick={() => setUserOpen(!userOpen)}
              >
                {user.avatarUrl ? (
                  <span className="relative flex h-8 w-8 items-center justify-center rounded-full overflow-hidden border-2 border-gold">
                    <Image
                      src={user.avatarUrl}
                      alt={user.name}
                      width={32}
                      height={32}
                      className="h-full w-full object-cover"
                      unoptimized={process.env.NODE_ENV === "development"}
                      loading="lazy"
                    />
                  </span>
                ) : (
                  <span className="relative flex h-8 w-8 items-center justify-center rounded-full overflow-hidden border-2 border-gold text-xs font-semibold text-white">{user.name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("")}</span>
                )}
                <span className="ap-account-name hidden d-xl-inline">
                  <span className="text-muted-foreground block" style={{ fontSize: "0.72rem", lineHeight: 1.2 }}>{t("hello")}</span>
                  <span className="font-semibold block" style={{ lineHeight: 1.2 }}>{user.name.split(" ")[0]}</span>
                </span>
                {userOpen ? <BiIcon name="bi-chevron-up" className="w-4 h-4 text-muted-foreground shrink-0" /> : <BiIcon name="bi-chevron-down" className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>
              {userOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-background border border-border shadow-2xl py-1.5 z-50 ap-pop">
                  <div className="px-4 py-2 border-b border-border mb-1">
                    <span className="text-xs text-muted-foreground font-medium block mb-0.5">{t('hello')}</span>
                    <div className="font-semibold text-white text-sm truncate">{user.name}</div>
                    <div className="text-muted-foreground text-xs truncate">{user.email}</div>
                  </div>
                  <Link className="flex items-center gap-3 px-4 py-2.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 hover:translate-x-1 transition-all duration-200" href="/profile" onClick={() => setUserOpen(false)}>
                    <BiIcon name="bi-person-circle" className="w-4 h-4 text-muted-foreground shrink-0" />{t("my_profile")}
                  </Link>
                  <Link className="flex items-center gap-3 px-4 py-2.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 hover:translate-x-1 transition-all duration-200" href="/purchases" onClick={() => setUserOpen(false)}>
                    <BiIcon name="bi-download" className="w-4 h-4 text-muted-foreground shrink-0" />{t("my_orders")}
                  </Link>
                  <Link className="flex items-center gap-3 px-4 py-2.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 hover:translate-x-1 transition-all duration-200" href="/collections" onClick={() => setUserOpen(false)}>
                    <BiIcon name="bi-heart" className="w-4 h-4 text-muted-foreground shrink-0" />{t("favorites")}
                  </Link>
                  <Link className="flex items-center gap-3 px-4 py-2.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 hover:translate-x-1 transition-all duration-200" href="/wallet" onClick={() => setUserOpen(false)}>
                    <BiIcon name="bi-wallet2" className="w-4 h-4 text-muted-foreground shrink-0" />{t("my_wallet")}
                  </Link>
                  {(user.role === "photographer" || user.role === "admin") && (
                    <Link className="flex items-center gap-3 px-4 py-2.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 hover:translate-x-1 transition-all duration-200" href="/dashboard" onClick={() => setUserOpen(false)}>
                      <BiIcon name="bi-grid-1x2" className="w-4 h-4 text-muted-foreground shrink-0" />{t("dashboard")}
                    </Link>
                  )}
                  <div className="border-t border-border my-1" />
                  <button className="flex items-center gap-3 px-4 py-2.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 hover:translate-x-1 transition-all duration-200 w-full text-left bg-transparent border-0 cursor-pointer" onClick={logout}>
                    <BiIcon name="bi-box-arrow-right" className="w-4 h-4 text-muted-foreground shrink-0" />{t("log_out")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="relative hidden hidden lg:block">
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/30 bg-card/50 hover:bg-neutral-800 text-xs font-medium text-white transition-colors"
                aria-label={t("account_aria")}
                aria-expanded={guestOpen}
                onClick={() => setGuestOpen(!guestOpen)}
              >
                <BiIcon name="bi-person" className="w-4 h-4 text-neutral-300 shrink-0" />
                <span className="whitespace-nowrap">{t("account")}</span>
                {guestOpen ? <BiIcon name="bi-chevron-up" className="w-4 h-4 text-muted-foreground shrink-0" /> : <BiIcon name="bi-chevron-down" className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>
              {guestOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-background border border-border shadow-2xl py-1.5 z-50 ap-pop">
                  <Link className="flex items-center gap-3 px-4 py-2.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 hover:translate-x-1 transition-all duration-200" href="/login" onClick={() => setGuestOpen(false)}>
                    <BiIcon name="bi-box-arrow-in-right" className="w-4 h-4 text-muted-foreground shrink-0" />{t("log_in")}
                  </Link>
                  <Link className="flex items-center gap-3 px-4 py-2.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 hover:translate-x-1 transition-all duration-200" href="/register" onClick={() => setGuestOpen(false)}>
                    <BiIcon name="bi-person-add" className="w-4 h-4 text-muted-foreground shrink-0" />{t("sign_up")}
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Mode clair / sombre */}
          <ThemeToggle className="hidden lg:inline-flex" />

          {/* Panier (Fine Art Prints) */}
          <button type="button" className="relative rounded-full p-2.5 flex items-center justify-center transition-colors bg-neutral-800/80 hover:bg-neutral-700 text-white border border-neutral-700/60" aria-label={t("cart_aria")} onClick={() => setOpen(true)}>
            <BiIcon name="bi-bag" style={{ fontSize: 20 }} />
            {count > 0 && <span className="badge-count">{count}</span>}
          </button>

          {/* Toggler mobile */}
          <button
            className="navbar-toggler lg:hidden"
            type="button"
            aria-label={t("menu_label")}
            aria-expanded={expanded}
            aria-controls="ap-mobile-menu"
            style={{ border: "1px solid var(--ap-border)" }}
            onClick={() => setExpanded(!expanded)}
          >
            <span className="navbar-toggler-icon" style={{ filter: "invert(1)" }} />
          </button>
        </div>
      </div>

      {/* ROW 2 — Barre catégories : hauteur fixe, une seule ligne, fond sombre */}
      <div className="ap-nav-sub-row w-full px-4 hidden hidden lg:flex items-center h-12 bg-background/70 backdrop-blur-md border-b border-border">
        <CategoryMenu categories={categories} />
      </div>

      {/* MENU MOBILE (collapse) */}
      <div id="ap-mobile-menu" className={`collapse navbar-collapse ap-navbar order-lg-4 w-full lg:hidden ${expanded ? "show" : ""}`}>
        <div className="lg:hidden flex flex-col gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--ap-border)" }}>
          <form
            role="search"
            className="mb-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!q.trim()) return;
              setExpanded(false);
              router.push(`/photos?q=${encodeURIComponent(q)}`);
              setQ("");
            }}
          >
            <div className="input-group">
              <input
                className="form-control"
                type="search"
                placeholder={t("search_placeholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={searchLabel}
              />
              <button className="btn btn-gold" type="submit" aria-label={searchLabel}>
                <BiIcon name="bi-search" />
              </button>
            </div>
          </form>
          <ul className="navbar-nav gap-1 mb-2">
            <li className="nav-item"><Link className={`nav-link${isHomeActive ? " active" : ""}`} href="/" onClick={() => setExpanded(false)}>{t("nav_home")}</Link></li>
            <li className="nav-item"><Link className={`nav-link${isFreeActive ? " active" : ""}`} href="/photos" onClick={() => setExpanded(false)}>{t("nav_free")}</Link></li>
            <li className="nav-item"><Link className={`nav-link${isPremiumActive ? " active" : ""}`} href="/prints" onClick={() => setExpanded(false)}>{t("nav_premium")}</Link></li>
            <li className="nav-item"><Link className={`nav-link${isMadagascarActive ? " active" : ""}`} href="/photos?category=madagascar" onClick={() => setExpanded(false)}>{t("nav_madagascar")}</Link></li>
            {otherCategories.map((c) => (
              <li className="nav-item" key={c.id}>
                <Link className="nav-link" href={categoryHref(c)} onClick={() => setExpanded(false)}>
                  <BiIcon name={c.icon} className="me-1" /> {c.name}
                </Link>
              </li>
            ))}
            {user && (
              <li className="nav-item"><Link className={`nav-link${isCollectionsActive ? " active" : ""}`} href="/collections" onClick={() => setExpanded(false)}><BiIcon name="bi-heart" className="me-1" />{t("nav_collections")}</Link></li>
            )}
          </ul>
          <div className="flex items-center gap-2 mb-1">
            <ThemeToggle />
            <span className="text-xs" style={{ color: "var(--ap-muted)" }}>{t("appearance")}</span>
          </div>
          {mounted && user ? (
            <>
              <Link href="/profile" className="btn btn-ghost btn-sm" onClick={() => setExpanded(false)}>
                <BiIcon name="bi-person-circle" className="me-2" />{t("my_profile")}
              </Link>
              <Link href="/wallet" className="btn btn-ghost btn-sm" onClick={() => setExpanded(false)}>
                <BiIcon name="bi-wallet2" className="me-2" />{t("my_wallet")}
              </Link>
              {(user.role === "photographer" || user.role === "admin") && (
                <Link href="/dashboard" className="ap-dash-btn flex items-center gap-2 px-3 py-1.5 rounded-pill" onClick={() => setExpanded(false)}>
                  <BiIcon name="bi-grid-1x2" className="me-2 text-gold" style={{ fontSize: 16 }} />{t("dashboard")}
                </Link>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => { setExpanded(false); logout(); }}>
                <BiIcon name="bi-box-arrow-right" className="me-2" />{t("log_out")}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-auth-outline btn-sm" onClick={() => setExpanded(false)}>{t("log_in")}</Link>
              <Link href="/register" className="btn btn-gold btn-sm" onClick={() => setExpanded(false)}>{t("sign_up")}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}