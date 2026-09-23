"use client";

import { useLanguage } from "lib/i18n";
import { blurDataUrl } from "lib/utils";
import Image from "next/image";

export default function HomeSignature() {
  const { t } = useLanguage();

  return (
    <div className="col-lg-5">
      <div className="relative h-full rounded-[16px] overflow-hidden" style={{ border: "1px solid var(--ap-border-card)", minHeight: 360, boxShadow: "var(--ap-shadow-card)" }}>
        <Image
          src="/images/isalo.jpg"
          alt={t("home_isalo_title")}
          fill
          sizes="(min-width: 1024px) 42vw, 100vw"
          className="object-cover"
          style={{ position: "absolute", inset: 0 }}
          priority
          quality={95}
          placeholder="blur"
          blurDataURL={blurDataUrl("#2b2b2b")}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(10,10,11,0.88) 0%, rgba(10,10,11,0.35) 45%, transparent 65%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "1.5rem", color: "#fff" }}>
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.62rem] font-bold uppercase tracking-wider border backdrop-blur-md mb-2" style={{ background: "rgba(245,158,11,0.14)", borderColor: "rgba(245,158,11,0.32)", color: "#f59e0b", fontFamily: "var(--font-accent)" }}>
            <i className="bi bi-geo-alt-fill" style={{ fontSize: 12 }} />{t("home_isalo_label")}
          </div>
          <h3 className="font-serif font-bold mb-2" style={{ fontSize: "1.5rem", color: "#FFFFFF" }}>{t("home_isalo_title")}</h3>
          <p className="mb-0" style={{ fontSize: "0.88rem", color: "#D6D3D1", lineHeight: 1.5 }}>{t("home_isalo_desc")}</p>
        </div>
      </div>
    </div>
  );
}
