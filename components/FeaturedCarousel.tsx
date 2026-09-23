"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";
import { formatNumber, blurDataUrl } from "lib/utils";
import { useLanguage } from "lib/i18n";
import { usePrice } from "lib/currency";
import Image from "next/image";
import { BiIcon } from "components/BiIcon";
import type { PhotoDto } from "lib/types";

interface Props {
  photos: PhotoDto[];
  variant?: "landscape" | "portrait";
  accent?: string;
}

export default function FeaturedCarousel({ photos, variant = "landscape", accent }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { user } = useSession();
  const { t } = useLanguage();
  const router = useRouter();
  const price = usePrice();
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const pausedRef = useRef(false);

  const cardWidth = variant === "landscape" ? 380 : 300;

  const prefersReducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scrollBy = useCallback(
    (dir: 1 | -1) => {
      const el = trackRef.current;
      if (!el) return;
      el.scrollBy({ left: dir * (cardWidth + 16), behavior: prefersReducedMotion() ? "auto" : "smooth" });
    },
    [cardWidth],
  );

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= max - 8) {
        el.scrollTo({ left: 0, behavior });
      } else {
        el.scrollBy({ left: cardWidth + 16, behavior });
      }
    }, 4500);
    return () => clearInterval(timer);
  }, [cardWidth, photos.length]);

  async function toggleLike(e: React.MouseEvent, photo: PhotoDto) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/photo/${photo.slug}`)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    const action = likedIds.has(photo.id) ? "unlike" : "like";
    try {
      const res = await fetch(`/api/photos/${photo.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (action === "like") next.add(photo.id);
          else next.delete(photo.id);
          return next;
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookmark(e: React.MouseEvent, photo: PhotoDto) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/photo/${photo.slug}`)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    const action = bookmarkedIds.has(photo.id) ? "unbookmark" : "bookmark";
    try {
      const res = await fetch(`/api/photos/${photo.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          if (action === "bookmark") next.add(photo.id);
          else next.delete(photo.id);
          return next;
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleShare(e: React.MouseEvent, photo: PhotoDto) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/photos/${photo.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "share", platform: "web" }),
      });
      if (navigator.share) {
        await navigator.share({
          title: photo.title,
          text: photo.description ?? "",
          url: window.location.origin + `/photo/${photo.slug}`,
        });
      } else {
        await navigator.clipboard.writeText(window.location.origin + `/photo/${photo.slug}`);
        alert(t("link_copied"));
      }
    } catch {
      // Ignore share errors
    }
  }

  async function download(e: React.MouseEvent, photo: PhotoDto) {
    e.preventDefault();
    e.stopPropagation();
    fetch(`/api/photos/${photo.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "download" }),
    }).catch(() => undefined);
    const a = document.createElement("a");
    a.href = `/api/photos/${photo.id}/free-file`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (photos.length === 0) return null;

  const aspect = variant === "landscape" ? "16 / 10" : "3 / 4";

  return (
    <div
      className="featured-carousel"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
    >
      <div ref={trackRef} className="carousel-track">
        {photos.map((p, i) => (
          <div key={p.id} className="carousel-card" style={{ width: cardWidth, aspectRatio: aspect }}>
            <Link href={`/photo/${p.slug}`} className="carousel-media relative">
              <Image
                src={p.imageUrl}
                alt={p.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                unoptimized={process.env.NODE_ENV === "development"}
                className="object-cover"
                priority={i < 2}
                loading={i < 2 ? "eager" : "lazy"}
                quality={90}
                placeholder="blur"
                blurDataURL={blurDataUrl(p.color)}
              />
              <span className={`badge ${p.licenseType === "free" ? "badge-free" : "badge-limited"} rounded-pill carousel-badge`}>
                {p.licenseType === "free" ? "FREE" : "LIMITED EDITION"}
              </span>
              {p.licenseType === "limited" && p.availableStock !== null && (
                <span className="badge-edition badge rounded-pill">
                  {t("editions_left", {
                    count: `${p.totalEditions !== null ? Math.min(p.availableStock, p.totalEditions) : p.availableStock}/${p.totalEditions}`,
                  })}
                </span>
              )}
              <div className="carousel-gradient" />
              <div className="carousel-info">
                <div className="carousel-title">{p.title}</div>
                <div className="carousel-sub">
                  {p.photographer.avatarUrl ? (
                    <Image
                      src={p.photographer.avatarUrl}
                      alt=""
                      width={26}
                      height={26}
                      className="rounded-full object-cover shrink-0"
                      style={{ objectFit: "cover" }}
                      unoptimized={process.env.NODE_ENV === "development"}
                      loading="lazy"
                    />
                  ) : (
                    <span className="w-[26px] h-[26px] rounded-full bg-amber-500 text-amber-950 flex items-center justify-center font-semibold text-[0.7rem] shrink-0">
                      {p.photographer.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span>{p.photographer.name}</span>
                  <span className="ms-auto flex items-center gap-2">
                    <span className="flex items-center gap-1" style={{ color: likedIds.has(p.id) ? "#d62828" : "var(--ap-muted)" }}>
                      <BiIcon name={likedIds.has(p.id) ? "bi-heart-fill" : "bi-heart"} style={{ fontSize: 14 }} />
                      {formatNumber(p.likesCount)}
                    </span>
                    <span className="flex items-center gap-1" style={{ color: "var(--ap-muted)" }}>
                      <BiIcon name="bi-chat-left" style={{ fontSize: 14 }} />
                      {formatNumber(p.commentsCount)}
                    </span>
                    <span className="flex items-center gap-1" style={{ color: bookmarkedIds.has(p.id) ? "#d97706" : "var(--ap-muted)" }}>
                      <BiIcon name={bookmarkedIds.has(p.id) ? "bi-bookmark-fill" : "bi-bookmark"} style={{ fontSize: 14 }} />
                      {formatNumber(p.bookmarksCount)}
                    </span>
                    <span className="flex items-center gap-1" style={{ color: "var(--ap-muted)" }}>
                      <BiIcon name="bi-share" style={{ fontSize: 14 }} />
                      {formatNumber(p.sharesCount)}
                    </span>
                  </span>
                </div>
              </div>
            </Link>
            <div className="carousel-actions">
              {p.licenseType === "free" ? (
                <button className="btn btn-gold btn-sm" onClick={(e) => download(e, p)}>
                  <BiIcon name="bi-cloud-download" className="me-1" /> {t("download")}
                </button>
              ) : (
                <Link href={`/photo/${p.slug}`} className="btn btn-gold btn-sm">
                  <BiIcon name="bi-bag" className="me-1" /> {price(p.basePrice)}
                </Link>
              )}
              <button
                className="icon-btn icon-btn-onlight"
                aria-label={t("like")}
                onClick={(e) => toggleLike(e, p)}
                style={likedIds.has(p.id) ? { background: "rgba(214,40,40,0.9)", border: "none", color: "#fff" } : undefined}
              >
                <BiIcon name={likedIds.has(p.id) ? "bi-heart-fill" : "bi-heart"} style={{ fontSize: 18 }} />
              </button>
              <button
                className="icon-btn icon-btn-onlight"
                aria-label={t("comment")}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/photo/${p.slug}#comments`); }}
              >
                <BiIcon name="bi-chat-left" style={{ fontSize: 18 }} />
              </button>
              <button
                className="icon-btn icon-btn-onlight"
                aria-label={bookmarkedIds.has(p.id) ? t("unbookmark") : t("bookmark")}
                onClick={(e) => toggleBookmark(e, p)}
                style={bookmarkedIds.has(p.id) ? { background: "rgba(245,158,11,0.9)", border: "none", color: "#fff" } : undefined}
              >
                <BiIcon name={bookmarkedIds.has(p.id) ? "bi-bookmark-fill" : "bi-bookmark"} style={{ fontSize: 18 }} />
              </button>
              <button
                className="icon-btn icon-btn-onlight"
                aria-label={t("share")}
                onClick={(e) => handleShare(e, p)}
              >
                <BiIcon name="bi-share" style={{ fontSize: 18 }} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="carousel-arrow left" aria-label={t("previous")} onClick={() => scrollBy(-1)}>
        <BiIcon name="bi-chevron-compact-left" />
      </button>
      <button className="carousel-arrow right" aria-label={t("next")} onClick={() => scrollBy(1)}>
        <BiIcon name="bi-chevron-compact-right" />
      </button>
      {accent && <span className="carousel-accent">{accent}</span>}
    </div>
  );
}