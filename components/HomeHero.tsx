"use client";

import Link from "next/link";
import { useLanguage } from "lib/i18n";
import BubbleField from "./BubbleField";
import AuroraGlow from "./AuroraGlow";

export default function HomeHero() {
  const { t } = useLanguage();

  const title = t("hero_title");
  const commaIdx = title.indexOf(",");
  const splitTitle = commaIdx > -1;
  const titleFirst = splitTitle ? title.slice(0, commaIdx + 1) : title;
  const titleSecond = splitTitle ? title.slice(commaIdx + 1).trim() : "";

  return (
    <section className="ap-hero" style={{ backgroundImage: "url(/images/isalo.jpg)" }}>
      <AuroraGlow />
      <BubbleField />
      <div className="container py-12 lg:py-16">
        <div className="row justify-center">
          <div className="col-12 col-lg-10 col-xl-8 text-center mx-auto flex flex-col items-center max-w-3xl">
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.18em] backdrop-blur-md border mb-5 ap-fade-up"
              style={{ background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.32)", color: "#f59e0b", fontFamily: "var(--font-accent)" }}
            >
              {t("hero_stamp")}
            </div>
            <h1
              className="font-serif font-bold ap-fade-up text-center mx-auto"
              style={{ fontSize: "clamp(2.8rem, 6vw, 4.6rem)", lineHeight: 1.02, color: "#FFFFFF", letterSpacing: "-0.02em" }}
            >
              {titleFirst}
              {splitTitle && (
                <>
                  <br />
                  <span style={{ color: "#f59e0b", fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 400 }}>{titleSecond}</span>
                </>
              )}
            </h1>
            <p
              className="mt-5 mb-7 ap-fade-up text-center mx-auto"
              style={{ fontSize: "1.08rem", maxWidth: "680px", color: "#D6D3D1", lineHeight: 1.6 }}
            >
              {t("hero_subtitle")}
            </p>
            <form action="/photos" method="get" className="hero-search relative w-full max-w-2xl mx-auto mb-7 ap-fade-up">
              <div className="flex items-center w-full rounded-full backdrop-blur-md border overflow-hidden" style={{ background: "rgba(20,20,22,0.82)", borderColor: "rgba(255,255,255,0.14)" }}>
                <input
                  className="flex-1 bg-transparent px-5 py-3.5 text-white placeholder:text-[#A3A3A3] focus:outline-none border-0 text-[0.95rem]"
                  name="q"
                  placeholder={t("hero_search_placeholder")}
                  aria-label={t("search_aria")}
                />
                <button
                  className="m-1.5 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                  type="submit"
                  aria-label={t("search_aria")}
                  style={{ background: "#18181b", color: "#FFFFFF", fontFamily: "var(--font-accent)", letterSpacing: "0.04em" }}
                >
                  <i className="bi bi-search" style={{ fontSize: 16 }} />
                  {t("search_aria")}
                </button>
              </div>
            </form>
            <div className="flex items-center gap-3 overflow-x-auto w-full py-2 max-w-3xl mx-auto ap-fade-up justify-start sm:justify-center [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              <Link href="/photos" className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-6 py-3 min-h-[44px] text-[0.9rem] font-medium border shrink-0 backdrop-blur-md transition-all duration-200 hover:border-amber-500 hover:bg-amber-500 hover:text-[#141416]" style={{ background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.4)", color: "#FFFFFF" }}>
                {t("free_photos")}
              </Link>
              <Link href="/prints" className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-6 py-3 min-h-[44px] text-[0.9rem] font-medium border shrink-0 backdrop-blur-md transition-all duration-200 hover:border-amber-500 hover:bg-amber-500 hover:text-[#141416]" style={{ background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.4)", color: "#FFFFFF" }}>
                {t("fine_art_prints")}
              </Link>
              <Link href="/photos?category=madagascar" className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-6 py-3 min-h-[44px] text-[0.9rem] font-medium border shrink-0 backdrop-blur-md transition-all duration-200 hover:border-amber-500 hover:bg-amber-500 hover:text-[#141416]" style={{ background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.4)", color: "#FFFFFF" }}>
                {t("madagascar_collection")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
