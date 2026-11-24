const FALLBACK = "/";

/**
 * Keeps same-origin paths intact (path, query, hash) and falls back to "/" for
 * anything that could escape the origin. Shared by the proxy, the login page
 * and the Google OAuth flow so a callback like `/purchases` is never dropped.
 */
export function resolveCallbackUrl(value: string | null | undefined): string {
  if (!value) return FALLBACK;
  const candidate = value.trim();
  if (!candidate || !candidate.startsWith("/")) return FALLBACK;
  if (candidate.startsWith("//") || candidate.includes("\\")) return FALLBACK;

  try {
    const parsed = new URL(candidate, "http://aperio.local");
    if (parsed.origin !== "http://aperio.local") return FALLBACK;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return FALLBACK;
  }
}
