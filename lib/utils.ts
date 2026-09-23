export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Aperio is a single-currency (EUR) platform — no currency selector. */
export function formatPrice(value: number | string, currency = "EUR"): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    notation: n >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatDate(d: Date | string | number, locale = "fr-FR"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(d));
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function orientationFrom(width: number, height: number): "landscape" | "portrait" | "square" {
  if (width > height) return "landscape";
  if (height > width) return "portrait";
  return "square";
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function timeAgo(input: Date | string): string {
  const date = new Date(input);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const intervals: Array<[number, string]> = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [secs, label] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function estimateFileSize(width: number, height: number, quality: "original" | "large" | "medium" | "small"): string {
  const pixels = width * height;
  const bytes = Math.round(pixels * 0.25 * (quality === "original" ? 2.4 : quality === "large" ? 1.6 : quality === "medium" ? 1 : 0.6));
  const mb = bytes / (1024 * 1024);
  if (mb > 10) return `${mb.toFixed(0)} MB`;
  return `${mb.toFixed(1)} MB`;
}

export function resizeUrl(url: string, w: number, h: number): string {
  // Adjust image URL dimensions by suffix
  return url.replace(/\/\d+\/\d+(\?.*)?$/, `/${w}/${h}`);
}

/** Resolve an image/asset URL to an absolute URL. Already-absolute URLs
    (http(s):// or protocol-relative //) are returned as-is; relative paths
    are prefixed with the canonical site origin so og:image / JSON-LD always
    point to real, fetchable files. */
export function resolveAssetUrl(url: string): string {
  if (/^(https?:)?\/\//i.test(url)) return url;
  const base = (process.env.NEXT_PUBLIC_URL || "https://aperio.com").replace(/\/+$/, "");
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

const FALLBACK_BLUR = "#e5e7eb";

/**
 * Generates an ultra-light SVG data URI (dominant-color placeholder) meant to
 * be passed to next/image's `blurDataURL`. Weighs a few hundred bytes instead
 * of a base64-encoded blurred JPEG, so the browser can paint it instantly and
 * avoid a flash of empty space while the real image streams in.
 */
export function blurDataUrl(color?: string | null): string {
  const safe = color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : FALLBACK_BLUR;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="${safe}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
