"use client";

import { useState } from "react";
import Link from "next/link";
import { BiIcon } from "components/BiIcon";
import { useLanguage } from "lib/i18n";
import { usePrice } from "lib/currency";

interface PricingClientProps {
  commissionPct: number;
  creatorSharePct: number;
  freeShippingThreshold: number;
  standardShipping: number;
}

export default function PricingClient({
  commissionPct,
  creatorSharePct,
  freeShippingThreshold,
  standardShipping,
}: PricingClientProps) {
  const { t } = useLanguage();
  const price = usePrice();
  const [salePrice, setSalePrice] = useState<number>(100);

  const artistShare = salePrice * (creatorSharePct / 100);
  const aperioFee = salePrice * (commissionPct / 100);

  return (
    <div>
      {/* Hero — dark premium band */}
      <div className="bg-background text-foreground border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20">
          <div className="text-center">
            <span className="text-amber-800 dark:text-amber-400 text-xs font-bold uppercase tracking-widest block mb-2 text-center">
              {t("pricing_title")}
            </span>
            <h1 className="font-display text-card-foreground font-extrabold text-4xl sm:text-5xl tracking-tight text-center">
              {t("pricing_title")}
            </h1>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto text-center mt-3 mb-10">
              {t("pricing_subtitle")}
            </p>
          </div>

          {/* For Creators / For Buyers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch max-w-6xl mx-auto">
            {/* For Creators */}
            <div className="bg-card border border-border shadow-xl rounded-3xl p-8 flex flex-col justify-between">
              <div>
                <h2 className="text-card-foreground font-bold text-xl flex items-center gap-2 mb-2">
                  <BiIcon name="bi-person-circle" />
                  {t("pricing_creators_title")}
                </h2>
                <p className="text-muted-foreground text-sm mb-6">
                  {t("pricing_creators_li_1", {
                    share: String(creatorSharePct),
                    fee: String(commissionPct),
                  })}
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-secondary border border-border rounded-2xl p-4 text-card-foreground flex items-center gap-4">
                  <span className="shrink-0 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-xl p-2.5">
                    <BiIcon name="bi-arrow-up-circle" className="text-xl" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-2xl leading-none mb-1">{creatorSharePct}%</div>
                    <div className="text-sm font-medium text-muted-foreground leading-snug">
                      {t("pricing_creators_li_1", {
                        share: String(creatorSharePct),
                        fee: String(commissionPct),
                      })}
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-500/15 border border-emerald-600/30 rounded-2xl p-4 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-400 flex items-center gap-4">
                  <span className="shrink-0 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-xl p-2.5">
                    <BiIcon name="bi-heart" className="text-xl" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-2xl leading-none mb-1">100%</div>
                    <div className="text-sm font-medium text-emerald-800 leading-snug dark:text-emerald-300/90">
                      {t("pricing_creators_li_2")}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <BiIcon name="bi-check-circle" className="w-4 h-4 text-amber-500/80 shrink-0" style={{ flexShrink: 0 }} />
                  <span>{t("pricing_creators_li_3")}</span>
                </div>
              </div>
            </div>

            {/* For Buyers */}
            <div className="bg-card border border-border shadow-xl rounded-3xl p-8 space-y-4">
              <div>
                <h2 className="text-card-foreground font-bold text-xl flex items-center gap-2 mb-2">
                  <BiIcon name="bi-bag" />
                  {t("pricing_buyers_title")}
                </h2>
                <p className="text-muted-foreground text-sm mb-6">{t("pricing_buyers_li_1")}</p>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-secondary border border-border">
                <span className="shrink-0 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-xl p-2.5">
                  <BiIcon name="bi-unlock" className="text-xl" />
                </span>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-amber-500 leading-none mb-1">0€</div>
                  <div className="text-sm text-muted-foreground leading-snug">{t("pricing_buyers_li_1")}</div>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-secondary border border-border">
                <span className="shrink-0 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-xl p-2.5">
                  <BiIcon name="bi-calculator" className="text-xl" />
                </span>
                <div className="font-semibold text-card-foreground text-sm leading-snug">
                  {t("pricing_buyers_li_2")}
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-secondary border border-border">
                <span className="shrink-0 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-xl p-2.5">
                  <BiIcon name="bi-truck" className="text-xl" />
                </span>
                <div className="text-sm text-muted-foreground leading-snug">
                  {t("pricing_buyers_li_3", { threshold: String(freeShippingThreshold) })}
                  <div className="mt-1 font-bold text-amber-500">{price(standardShipping)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Light content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-16">
        {/* How a print price is calculated */}
        <section className="my-12">
          <h3
            className="font-display font-bold text-center mb-8"
            style={{ fontSize: "1.6rem", color: "var(--ap-gold)" }}
          >
            <BiIcon name="bi-calculator" className="me-2" />
            {t("pricing_formula_title")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto my-12">
            {([
              { key: "pricing_formula_li_1", icon: "bi-currency-euro" },
              { key: "pricing_formula_li_2", icon: "bi-aspect-ratio" },
              { key: "pricing_formula_li_3", icon: "bi-bounding-box" },
            ] as const).map((step, i) => (
              <div
                key={step.key}
                className="bg-card border border-border rounded-2xl p-6 text-center shadow-sm hover:shadow-md transition-shadow"
              >
                <span className="text-amber-800 dark:text-amber-400 font-extrabold text-sm uppercase tracking-widest block mb-1">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="bg-amber-100 dark:bg-amber-500/15 border border-amber-300/80 dark:border-amber-500/30 rounded-2xl w-12 h-12 flex items-center justify-center mx-auto mb-3">
                  <BiIcon name={step.icon} className="text-amber-600 dark:text-amber-400" style={{ fontSize: "1.5rem" }} />
                </span>
                <p className="text-muted-foreground font-medium text-sm leading-relaxed mb-0">
                  {t(step.key)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Earnings simulator */}
        <div className="bg-card border border-border rounded-3xl p-8 md:p-10 shadow-xl max-w-5xl mx-auto my-12 text-card-foreground">
          <h3 className="text-2xl font-bold text-card-foreground flex items-center gap-3">
            <BiIcon name="bi-graph-up-arrow" className="text-amber-500" />
            {t("pricing_simulator_title")}
          </h3>
          <p className="text-muted-foreground text-sm mt-1 mb-8">{t("pricing_simulator_sub")}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-2">
                {t("price_header")}
              </label>
              <input
                type="number"
                min={0}
                step={10}
                value={Number.isFinite(salePrice) ? salePrice : ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setSalePrice(Number.isFinite(v) && v >= 0 ? v : 0);
                }}
                className="w-full bg-card text-foreground font-bold text-2xl rounded-xl px-5 py-3 border border-border focus:ring-2 focus:ring-accent outline-none"
                aria-label={t("pricing_simulator_title")}
              />
            </div>

            <div className="md:col-span-2 space-y-3">
              <div className="bg-emerald-500/15 border border-emerald-600/30 text-emerald-800 font-bold rounded-xl p-4 flex items-center justify-between gap-4 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-400">
                <span className="flex items-center gap-2 text-sm min-w-0">
                  <BiIcon name="bi-person-circle" />
                  {t("pricing_sim_artist", { share: String(creatorSharePct) })}
                </span>
                 <span className="text-xl whitespace-nowrap">{price(artistShare)}</span>
              </div>
              <div className="bg-secondary border border-border text-card-foreground font-bold rounded-xl p-4 flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-sm min-w-0">
                  <BiIcon name="bi-bank" />
                  {t("pricing_sim_fee", { fee: String(commissionPct) })}
                </span>
                 <span className="text-xl whitespace-nowrap">{price(aperioFee)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Our transparency promise */}
        <div className="bg-card border border-border rounded-3xl p-8 text-center max-w-5xl mx-auto my-8 shadow-sm">
          <h3
            className="font-display font-bold mb-3"
            style={{ fontSize: "1.3rem", color: "var(--ap-gold)" }}
          >
            <BiIcon name="bi-eye" className="me-2" />
            {t("pricing_transparency_title")}
          </h3>
          <p
            className="text-neutral-600 text-muted-foreground mx-auto mb-0 leading-relaxed"
            style={{ maxWidth: 660, fontSize: "0.95rem" }}
          >
            {t("pricing_transparency_sub")}
          </p>
        </div>

        {/* CTA */}
        <div className="flex items-center justify-center gap-4 my-8">
          <Link
            href="/register"
            className="bg-card text-card-foreground hover:opacity-90 font-semibold px-6 py-3.5 rounded-xl shadow-md transition-all inline-flex items-center gap-2"
          >
            <BiIcon name="bi-person-add" />
            {t("become_creator")}
          </Link>
          <Link
            href="/prints"
            className="bg-card hover:bg-secondary text-card-foreground border border-border font-semibold px-6 py-3.5 rounded-xl shadow-sm transition-all inline-flex items-center gap-2"
          >
            <BiIcon name="bi-bag" />
            {t("fine_art_prints")}
          </Link>
        </div>
      </div>
    </div>
  );
}
