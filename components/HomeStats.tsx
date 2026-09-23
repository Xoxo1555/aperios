"use client";

import { useLanguage } from "lib/i18n";
import { formatNumber } from "lib/utils";

interface HomeStatsProps {
  stats: {
    photos: number;
    photographers: number;
    free: number;
    limited: number;
    downloads: number;
  };
}

export default function HomeStats({ stats }: HomeStatsProps) {
  const { t } = useLanguage();

  const tiles = [
    { value: stats.photos, label: t("stat_photographs") },
    { value: stats.photographers, label: t("stat_artists") },
    { value: stats.free, label: t("stat_free_downloads") },
    { value: stats.limited, label: t("stat_limited_prints") },
    { value: stats.downloads, label: t("stat_total_downloads"), full: true },
  ];

  return (
    <div className="col-lg-7">
      <div className="gallery-label mb-3" style={{ fontFamily: "var(--font-accent)" }}>{t("home_by_numbers_label")}</div>
      <h2 className="font-serif font-bold mb-6" style={{ fontSize: "clamp(1.6rem, 2.5vw, 2.1rem)", color: "var(--ap-title)", lineHeight: 1.1 }}>
        {t("home_by_numbers_title")}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        {tiles.map((s) => (
          <div key={s.label} className={s.full ? "col-span-2" : ""}>
            <div className="stat-tile h-full flex flex-col items-center justify-center py-6">
              <div className="value" style={{ fontFamily: "var(--font-sans)" }}>{formatNumber(s.value)}</div>
              <div className="label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
