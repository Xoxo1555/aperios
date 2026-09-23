"use client";

import { useState } from "react";
import Link from "next/link";
import { BiIcon } from "components/BiIcon";
import { useLanguage, type DictKey } from "lib/i18n";

type CategoryId = "licenses" | "prints" | "payments" | "creators";

interface HelpItem {
  id: string;
  category: CategoryId;
  q: DictKey;
  a: DictKey;
}

interface CategoryMeta {
  id: CategoryId;
  key: DictKey;
  icon: string;
}

export default function HelpClient() {
  const { t } = useLanguage();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const categories: CategoryMeta[] = [
    { id: "licenses", key: "help_cat_licenses", icon: "bi-shield-check" },
    { id: "prints", key: "help_cat_prints", icon: "bi-image" },
    { id: "payments", key: "help_cat_payment", icon: "bi-credit-card" },
    { id: "creators", key: "help_cat_creators", icon: "bi-camera" },
  ];

  const helpItems: HelpItem[] = [
    { id: "lic-1", category: "licenses", q: "help_lic_q1", a: "help_lic_a1" },
    { id: "lic-2", category: "licenses", q: "help_lic_q2", a: "help_lic_a2" },
    { id: "lic-3", category: "licenses", q: "help_lic_q3", a: "help_lic_a3" },
    { id: "prt-1", category: "prints", q: "help_prt_q1", a: "help_prt_a1" },
    { id: "prt-2", category: "prints", q: "help_prt_q2", a: "help_prt_a2" },
    { id: "prt-3", category: "prints", q: "help_prt_q3", a: "help_prt_a3" },
    { id: "pay-1", category: "payments", q: "help_pay_q1", a: "help_pay_a1" },
    { id: "pay-2", category: "payments", q: "help_pay_q2", a: "help_pay_a2" },
    { id: "cre-1", category: "creators", q: "help_cre_q1", a: "help_cre_a1" },
    { id: "cre-2", category: "creators", q: "help_cre_q2", a: "help_cre_a2" },
  ];

  const activeCat = categories.find((c) => c.id === activeCategory);

  const normalized = searchQuery.trim().toLowerCase();
  const filtered = helpItems.filter((item) => {
    const matchesCategory = !activeCategory || item.category === activeCategory;
    const matchesSearch =
      !normalized ||
      t(item.q).toLowerCase().includes(normalized) ||
      t(item.a).toLowerCase().includes(normalized);
    return matchesCategory && matchesSearch;
  });

  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  const resetFilters = () => {
    setSearchQuery("");
    setActiveCategory(null);
  };

  return (
    <div className="bg-background text-foreground">
      <div className="container py-5" style={{ maxWidth: 900 }}>
        {/* ---- Hero ---- */}
        <div className="text-center mb-5 pt-4">
          <span className="gallery-stamp on-light mb-3">
            <BiIcon name="bi-question-circle" style={{ fontSize: 14 }} />
            {t("help_title")}
          </span>
          <h1 className="font-serif font-bold mb-2" style={{ fontSize: "clamp(1.9rem, 4vw, 2.7rem)" }}>
            {t("help_hero_title")}
          </h1>
          <p className="text-muted-foreground mb-4" style={{ maxWidth: 620, marginInline: "auto", lineHeight: 1.6 }}>
            {t("help_subtitle")}
          </p>
          <div className="relative mx-auto" style={{ maxWidth: 560 }}>
            <BiIcon
              name="bi-search"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: "var(--ap-gold-2)", fontSize: 20 }}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-border bg-card py-3 pl-12 pr-10 text-[0.95rem] text-card-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/30"
              placeholder={t("help_search_placeholder")}
              aria-label={t("search_aria")}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label={t("close")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors hover:text-amber-500"
              >
                <BiIcon name="bi-x" style={{ fontSize: 18 }} />
              </button>
            )}
          </div>
        </div>

        {/* ---- Category filter ---- */}
        <div className="grid grid-cols-2 gap-3 mb-5 lg:grid-cols-4">
          {categories.map((c) => {
            const active = activeCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory((prev) => (prev === c.id ? null : c.id))}
                aria-pressed={active}
                className={`group cursor-pointer rounded-2xl border bg-card p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-lg ${
                  active ? "border-amber-500 ring-2 ring-amber-500/20" : "border-border"
                }`}
              >
                <span
                  className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
                    active
                      ? "bg-amber-500/25 text-amber-500"
                      : "bg-amber-500/15 text-amber-500 group-hover:bg-amber-500/25"
                  }`}
                >
                  <BiIcon name={c.icon} style={{ fontSize: 22 }} />
                </span>
                <span className="block text-sm font-bold leading-snug text-card-foreground">
                  {t(c.key)}
                </span>
              </button>
            );
          })}
        </div>

        {/* ---- FAQ ---- */}
        <div id="aide" style={{ scrollMarginTop: "100px" }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="!text-card-foreground font-serif font-bold mb-0" style={{ fontSize: "1.4rem", color: "var(--ap-gold-light)" }}>
              {t("help_faq_title")}
            </h2>
            {activeCat && (
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.78rem] font-bold transition-colors hover:bg-amber-500/30"
                style={{ background: "rgba(245,158,11,0.18)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.4)" }}
              >
                {t(activeCat.key)}
                <BiIcon name="bi-x" style={{ fontSize: 14 }} />
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <span className="inline-flex items-center justify-center rounded-circle mx-auto mb-4" style={{ width: 72, height: 72, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
                <BiIcon name="bi-search" style={{ fontSize: 28, color: "var(--ap-gold)" }} />
              </span>
              <p className="mb-1 font-display font-bold text-[1.05rem] text-card-foreground">
                {t("help_no_results")}
              </p>
              <p className="mb-4 text-sm text-muted-foreground">{t("help_no_results_sub")}</p>
              <button type="button" onClick={resetFilters} className="btn btn-gold">
                {t("help_filter_all")}
              </button>
            </div>
          ) : (
            <div className="mb-5">
              {filtered.map((item) => {
                const open = openId === item.id;
                return (
                  <div
                    key={item.id}
                    className="bg-card border border-border rounded-2xl overflow-hidden mb-3 transition-colors hover:border-amber-500/40"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/5"
                    >
                      <BiIcon name="bi-question-circle" className="shrink-0" style={{ color: "var(--ap-gold-2)", fontSize: 20 }} />
                      <span className="flex-1 text-[0.95rem] font-bold text-card-foreground">
                        {t(item.q)}
                      </span>
                      <BiIcon
                        name="bi-chevron-down"
                        className={`shrink-0 text-amber-500 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
                        style={{ fontSize: 20 }}
                      />
                    </button>
                    <div
                      className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="px-5 pb-5 text-[0.9rem] leading-relaxed text-muted-foreground">
                          {t(item.a)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- Still have questions? ---- */}
          <div className="rounded-2xl border border-border bg-card p-6 text-center ring-1 ring-amber-500/10">
            <div
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: "rgba(245,158,11,0.16)", color: "#f59e0b" }}
            >
              <BiIcon name="bi-life-preserver" style={{ fontSize: 26 }} />
            </div>
            <h5 className="!text-card-foreground font-serif text-2xl font-semibold mb-1">{t("help_support_title")}</h5>
            <p className="mb-4 text-[0.9rem] text-muted-foreground">{t("help_support_sub")}</p>
            <div className="flex gap-2 justify-center flex-wrap pb-2">
              <Link href="/licenses" className="inline-flex items-center text-white border border-white/30 hover:border-amber-400 hover:text-amber-400 px-4 py-2 rounded-xl transition-colors font-medium">{t("help_btn_licenses")}</Link>
              <Link href="/pricing" className="inline-flex items-center text-white border border-white/30 hover:border-amber-400 hover:text-amber-400 px-4 py-2 rounded-xl transition-colors font-medium">{t("help_btn_pricing")}</Link>
              <Link href="/contact" className="inline-flex items-center bg-card text-card-foreground hover:opacity-90 font-semibold px-4 py-2 rounded-xl transition-colors">{t("help_btn_contact")}</Link>
            </div>
          </div>

          {/* ---- Legal mentions ---- */}
          <div className="mt-5 pb-6">
            <div className="text-zinc-200 text-xs font-semibold tracking-wider uppercase mb-3">
              {t("legal_section_label")}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/legal" className="inline-flex items-center text-white border border-white/30 hover:border-amber-400 hover:text-amber-400 px-4 py-2 rounded-xl transition-colors font-medium">{t("legal_notice")}</Link>
              <Link href="/terms" className="inline-flex items-center text-white border border-white/30 hover:border-amber-400 hover:text-amber-400 px-4 py-2 rounded-xl transition-colors font-medium">{t("terms_of_sale")}</Link>
              <Link href="/privacy" className="inline-flex items-center text-white border border-white/30 hover:border-amber-400 hover:text-amber-400 px-4 py-2 rounded-xl transition-colors font-medium">{t("privacy_policy")}</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}