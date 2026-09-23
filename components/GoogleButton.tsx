"use client";

import { usePathname } from "next/navigation";
import { useLanguage } from "lib/i18n";

export default function GoogleButton() {
  const { t } = useLanguage();
  const pathname = usePathname();

  // Prefer an explicit ?next= return path (e.g. /login?next=/photo/...);
  // otherwise return the user to the page they are currently on.
  const next = (() => {
    if (typeof window === "undefined") return pathname;
    const p = new URLSearchParams(window.location.search).get("next");
    return p && p.startsWith("/") && !p.startsWith("//") ? p : pathname;
  })();

  // Use a native anchor so the browser performs a full navigation to the API
  // route (which 302-redirects to Google). A Next.js <Link> would instead try
  // to load the API route through the client router, triggering an RSC payload
  // fetch / hydration warning.
  const href = `/api/auth/google?next=${encodeURIComponent(next)}`;

  return (
    <a href={href} className="btn btn-google w-full">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"/>
      </svg>
      {t("continue_google")}
    </a>
  );
}
