"use client";

import { useTheme } from "lib/theme";
import { useLanguage } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  /* isDark dérive directement de l'attribut [data-theme] de <html> (source
     unique de vérité via useSyncExternalStore) : l'icône reflète TOUJOURS
     le thème réel, et bascule dès que le clic écrit l'attribut. */
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t(isDark ? "switch_to_light" : "switch_to_dark")}
      title={t(isDark ? "switch_to_light" : "switch_to_dark")}
      className={`ap-theme-toggle relative inline-flex items-center justify-center rounded-full p-2.5 transition-all bg-neutral-800/80 hover:bg-neutral-700 text-white border border-neutral-700/60 ${className}`}
    >
      <BiIcon name={isDark ? "bi-moon-stars" : "bi-sun"} style={{ fontSize: 18 }} className="text-amber-400" />
    </button>
  );
}