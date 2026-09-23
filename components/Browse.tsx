"use client";

import { BiIcon } from "components/BiIcon";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PhotoCard from "./PhotoCard";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./ui/EmptyState";
import { useLanguage, type DictKey } from "lib/i18n";
import type { CategoryDto, PhotoDto } from "lib/types";

const PALETTE = [
  "#2F3E46", "#B23A48", "#3A5A40", "#4A4E69", "#CA6702", "#0077B6",
  "#9B5DE5", "#D62828", "#1D3557", "#F4A261", "#2A9D8F", "#E9C46A",
];

const ORIENTATIONS: Array<{ value: string; icon: string; labelKey: DictKey }> = [
  { value: "landscape", icon: "bi-arrow-left-right", labelKey: "orientation_landscape" },
  { value: "portrait", icon: "bi-arrow-up-down", labelKey: "orientation_portrait" },
  { value: "square", icon: "bi-square", labelKey: "orientation_square" },
];

const ART_ARTISANAT_ALIASES = new Set([
  "artcraft", "art-artisanat", "artisanat", "malagasy-craft", "malagasy-art", "fine-art-still-life"
]);

function isArtArtisanatCategory(slug: string): boolean {
  const normalized = slug.toLowerCase().trim();
  return ART_ARTISANAT_ALIASES.has(normalized);
}

function isCategoryActive(catSlug: string, currentCategory: string): boolean {
  if (ART_ARTISANAT_ALIASES.has(catSlug)) {
    return ART_ARTISANAT_ALIASES.has(currentCategory);
  }
  return currentCategory === catSlug;
}

interface Props {
  license: "free" | "limited";
  categories: CategoryDto[];
}

export default function Browse({ license, categories }: Props) {
  const { t } = useLanguage();

  const heroTitle = license === "limited" ? t("prints_hero_title") : t("photos_hero_title");
  const heroSubtitle = license === "limited" ? t("prints_hero_subtitle") : t("photos_hero_subtitle");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [orientation, setOrientation] = useState(searchParams.get("orientation") ?? "");
  const [color, setColor] = useState(searchParams.get("color") ?? "");
  const [minPrice, setMinPrice] = useState(searchParams.get("min") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("max") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "latest");
  const [page, setPage] = useState(1);

  const [photos, setPhotos] = useState<PhotoDto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const firstRun = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const isArtArtisanat = isArtArtisanatCategory(category);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

  const fetchPhotos = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams({
      license,
      perPage: "24",
      sort,
    });
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (orientation) params.set("orientation", orientation);
    if (color) params.set("color", color);
    if (minPrice) params.set("min", minPrice);
    if (maxPrice) params.set("max", maxPrice);
    if (page > 1) params.set("page", String(page));

    setLoading(true);
    try {
      const res = await fetch(`/api/photos?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { photos?: PhotoDto[]; total?: number; totalPages?: number };
      if (controller.signal.aborted) return;
      setPhotos(data.photos ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      if (controller.signal.aborted) return;
      setPhotos([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [license, q, category, orientation, color, minPrice, maxPrice, sort, page]);

  useEffect(() => {
    fetchPhotos();
    return () => abortRef.current?.abort();
  }, [fetchPhotos]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (orientation) params.set("orientation", orientation);
    if (color) params.set("color", color);
    if (minPrice) params.set("min", minPrice);
    if (maxPrice) params.set("max", maxPrice);
    if (sort !== "latest") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [q, category, orientation, color, minPrice, maxPrice, sort, page]);

  function resetFilters() {
    setQInput("");
    setQ("");
    setCategory("");
    setOrientation("");
    setColor("");
    setMinPrice("");
    setMaxPrice("");
    setSort("latest");
    setPage(1);
  }

  const activeFilters = [q, category, orientation, color, minPrice, maxPrice].filter(Boolean).length;

  return (
    <div className="container py-8 lg:py-10">
      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="font-serif font-bold mb-2" style={{ color: "var(--ap-title)", fontSize: "clamp(1.9rem, 3vw, 2.4rem)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>{heroTitle}</h1>
          <p className="mb-0 max-w-[640px] leading-relaxed" style={{ color: "var(--ap-muted)", fontSize: "0.98rem" }}>{heroSubtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline tabular-nums" style={{ fontSize: "0.85rem", color: "var(--ap-muted)" }} aria-live="polite">
            {loading ? t("loading") : t(total > 1 ? "photos_plural_count" : "photo_singular_count", { count: total.toLocaleString() })}
          </span>
          <select
            className="form-select form-select-sm"
            style={{ width: 190 }}
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
          >
            <option value="latest">{t("sort_newest")}</option>
            <option value="popular">{t("sort_popular")}</option>
            <option value="downloads">{t("sort_downloads")}</option>
            {license === "limited" && <option value="price_asc">{t("sort_price_asc")}</option>}
            {license === "limited" && <option value="price_desc">{t("sort_price_desc")}</option>}
          </select>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-3">
          <div className="filter-section">
            <div className="filter-title">{t("filter_search")}</div>
            <div className="relative">
              <input
                className="form-control form-control-sm"
                placeholder={t("keywords_placeholder")}
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
              {qInput && (
                <button
                  type="button"
                  className="btn btn-link btn-sm absolute right-0 top-1/2 translate-middle-y text-muted-2"
                  onClick={() => { setQInput(""); setQ(""); }}
                  style={{ textDecoration: "none" }}
                >
                  <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-x-lg" /></span>
                </button>
              )}
            </div>
          </div>

          <div className="filter-section">
            <div className="filter-title">{t("filter_categories")}</div>
            <ul className="filter-list">
              <li>
                  <button className={`${!category ? "active" : ""} group`} onClick={() => { setCategory(""); setPage(1); }}>
                  <span>{t("nav_all_categories")}</span>
                  {!category && <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-check" className="text-amber-500/80" /></span>}
                </button>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <button className={`${isCategoryActive(c.slug, category) ? "active" : ""} group`} onClick={() => { setCategory(c.slug); setPage(1); }}>
                    <span className="inline-flex items-center"><span className={`inline-flex items-center justify-center shrink-0 me-2 ${isCategoryActive(c.slug, category) ? "text-amber-400" : "text-muted-foreground group-hover:text-amber-400"}`}><BiIcon name={c.icon} /></span>{c.name}</span>
                    {isCategoryActive(c.slug, category) && <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-check" className="text-amber-500/80" /></span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="filter-section">
            <div className="filter-title">{t("filter_orientation")}</div>
            <div className="flex gap-2 flex-wrap">
              {ORIENTATIONS.map((o) => (
                <button
                  key={o.value}
                  className={`chip inline-flex items-center ${orientation === o.value ? "active" : ""}`}
                  onClick={() => { setOrientation(orientation === o.value ? "" : o.value); setPage(1); }}
                >
                  <span className="inline-flex items-center justify-center shrink-0 me-1"><BiIcon name={o.icon} /></span> {t(o.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <div className="filter-title">{t("dominant_color")}</div>
            <div className="flex gap-2 flex-wrap">
              {PALETTE.map((c) => (
                <span
                  key={c}
                  className={`ap-swatch ${color === c ? "active" : ""}`}
                  style={{ background: c }}
                  title={c}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setColor(color === c ? "" : c); setPage(1); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setColor(color === c ? "" : c);
                      setPage(1);
                    }
                  }}
                />
              ))}
            </div>
          </div>

          {license === "limited" && (
            <div className="filter-section">
              <div className="filter-title">{t("filter_price")}</div>
              <div className="price-range">
                <input
                  className="form-control form-control-sm"
                  placeholder={t("min_label")}
                  inputMode="numeric"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value.replace(/[^0-9]/g, ""))}
                />
                <span className="text-muted-2">–</span>
                <input
                  className="form-control form-control-sm"
                  placeholder={t("max_label")}
                  inputMode="numeric"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
              <button className="btn btn-gold w-full mt-2 py-2.5 px-6" onClick={() => setPage(1)}>
                {t("apply_price")}
              </button>
            </div>
          )}

          {activeFilters > 0 && (
            <button
              className="btn btn-outline w-full mt-3 inline-flex items-center justify-center gap-1.5 text-sm font-bold tracking-wider"
              onClick={resetFilters}
            >
              <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-circle-x" style={{ fontSize: 16 }} /></span> {t("reset_filters")}
            </button>
          )}
        </div>

        <div className="col-lg-9 browse-results" ref={resultsRef}>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true" aria-label={t("loading")}>
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} type="image" className="w-full" style={{ height: 280, borderRadius: 16 }} />
              ))}
            </div>
          ) : photos.length === 0 ? (
            isArtArtisanat ? (
              <EmptyState
                icon="bi-palette"
                title={t("art_artisanat_empty_title")}
                subtitle={t("art_artisanat_empty_sub")}
                action={<Link href="/prints" className="btn btn-gold shadow-sm">{t("art_artisanat_browse_all")}</Link>}
              />
            ) : (
              <EmptyState
                icon="bi-search"
                title={t("no_photos_found")}
                subtitle={t("no_photos_found_sub")}
                action={<button className="btn btn-gold shadow-sm" onClick={resetFilters}>{t("reset_filters")}</button>}
              />
            )
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {photos.map((p, i) => (
                  <PhotoCard key={p.id} photo={p} priority={i < 3} />
                ))}
              </div>
              {totalPages > 1 && (
                <nav className="flex justify-center mt-8">
                  <ul className="pagination">
                    <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                      <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous">
                        <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-chevron-left" style={{ fontSize: 16 }} /></span>
                      </button>
                    </li>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                      .map((n, idx, arr) => (
                        <span key={n} style={{ display: "contents" }}>
                          {idx > 0 && arr[idx - 1] !== n - 1 && (
                            <li className="page-item disabled"><span className="page-link">…</span></li>
                          )}
                          <li className={`page-item ${page === n ? "active" : ""}`}>
                            <button className="page-link min-w-[38px] justify-center" onClick={() => setPage(n)}>
                              {n}
                            </button>
                          </li>
                        </span>
                      ))}
                    <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
                      <button className="page-link" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next">
                        <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-chevron-right" style={{ fontSize: 16 }} /></span>
                      </button>
                    </li>
                  </ul>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}