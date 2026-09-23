"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";
import { blurDataUrl, formatNumber } from "lib/utils";
import { useLanguage } from "lib/i18n";
import { useMounted } from "lib/hooks";
import { usePrice } from "lib/currency";
import { BiIcon } from "components/BiIcon";
import { useToast } from "components/ui/toast";
import CommentDrawer from "./CommentDrawer";
import Image from "next/image";
import type { PhotoDto } from "lib/types";

export default function PhotoCard({ photo, priority = false }: { photo: PhotoDto; priority?: boolean }) {
  const { user } = useSession();
  const { t } = useLanguage();
  const mounted = useMounted();
  const router = useRouter();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(photo.likesCount);
  const [bookmarked, setBookmarked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commentDrawerOpen, setCommentDrawerOpen] = useState(false);
  const { show: toast } = useToast();
  const price = usePrice();

  async function toggleLike(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/photo/${photo.slug}`)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    const action = liked ? "unlike" : "like";
    try {
      const res = await fetch(`/api/photos/${photo.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setLiked(!liked);
        setLikeCount((c) => Math.max(0, c + (liked ? -1 : 1)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookmark(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/photo/${photo.slug}`)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    const action = bookmarked ? "unbookmark" : "bookmark";
    try {
      const res = await fetch(`/api/photos/${photo.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setBookmarked(!bookmarked);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleShare(e: React.MouseEvent) {
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
        toast({ title: t("link_copied"), description: "", variant: "default" });
      }
    } catch {
      // Ignore
    }
  }

  async function download(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (photo.licenseType === "free") {
      fetch(`/api/photos/${photo.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download" }),
      }).catch(() => undefined);
      toast({ title: t("download_started"), description: "", variant: "success" });
      const a = document.createElement("a");
      a.href = `/api/photos/${photo.id}/free-file`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (user) {
      router.push(`/photo/${photo.slug}`);
    } else {
      router.push(`/login?next=${encodeURIComponent(`/photo/${photo.slug}`)}`);
    }
  }

  function openCommentDrawer(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCommentDrawerOpen(true);
  }

  const stockLeft =
    photo.availableStock !== null && photo.totalEditions !== null
      ? Math.min(photo.availableStock, photo.totalEditions)
      : photo.availableStock;

  const freeLabel = mounted ? t("free_label") : "Free";
  const downloadLabel = mounted ? t("download_for_free") : "Download for free";
  const badgeLimited = mounted ? t("badge_limited_art") : "Limited Edition";
  const badgeFree = mounted ? t("badge_free") : "Free";
  const editionsLeftLabel = mounted ? t("editions_left") : "{count} left";

  return (
    <>
    <div
      className="group ap-card-reveal flex flex-col w-full h-full overflow-hidden rounded-[16px] bg-card border border-zinc-200 border-border transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1.5 hover:scale-[1.01] hover:shadow-[0_20px_44px_-14px_rgba(0,0,0,0.25)] hover:border-amber-500/50"
    >
      {/* Image — ratio homogène aspect-[4/3] object-cover */}
      <div className="relative overflow-hidden">
        <Link
          href={`/photo/${photo.slug}`}
          aria-label={photo.title}
          className="block relative aspect-[4/3] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-inset"
        >
          <Image
            src={photo.imageUrl}
            alt={photo.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized={process.env.NODE_ENV === "development"}
            className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
            loading={priority ? "eager" : "lazy"}
            priority={priority}
            quality={90}
            placeholder="blur"
            blurDataURL={blurDataUrl(photo.color)}
          />
        </Link>

        {/* Badges — 10% Inter Tight uppercase, sobre et lisible */}
        <div className="absolute inset-0 z-10 pointer-events-none p-2.5 flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {photo.licenseType === "limited" && (
              <span className="pointer-events-auto inline-flex items-center bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10 text-amber-400 text-[11px] font-semibold tracking-wider uppercase">
                {badgeLimited}
              </span>
            )}
            {photo.licenseType === "free" && (
              <span className="pointer-events-auto inline-flex items-center bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10 text-zinc-200 text-[11px] font-medium tracking-wider uppercase">
                {badgeFree}
              </span>
            )}
          </div>
          {photo.licenseType === "limited" && stockLeft !== null && (
            <span className="pointer-events-auto inline-flex items-center bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10 text-zinc-200 text-[11px] font-medium tracking-wider uppercase">
              {editionsLeftLabel.replace("{count}", `${stockLeft}/${photo.totalEditions}`)}
            </span>
          )}
        </div>
      </div>

      {/* Content — bloc p-4 surface harmonisée (clair/sombre) */}
      <div className="flex flex-1 flex-col p-4 bg-card text-zinc-900 dark:text-zinc-100 gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link href={`/photo/${photo.slug}`} className="group/title">
              <h3 className="line-clamp-1 text-sm font-bold capitalize leading-tight group-hover/title:text-amber-600 dark:group-hover/title:text-amber-500 transition-colors font-serif text-zinc-900 dark:text-zinc-100">
                {photo.title}
              </h3>
            </Link>
            <p className="mt-1 truncate text-sm font-medium font-sans text-zinc-700 dark:text-zinc-300">
              {photo.photographer.name}
            </p>
          </div>
          <div className="shrink-0 pt-0.5">
            {photo.licenseType === "free" ? (
              <button
                className="inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-sm font-bold transition-all duration-300 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98] font-accent tracking-wider"
                aria-label={downloadLabel}
                title={downloadLabel}
                onClick={download}
              >
                {freeLabel}
              </button>
            ) : (
              <span className="whitespace-nowrap text-sm font-bold text-amber-700 dark:text-amber-500" suppressHydrationWarning>
                {price(photo.basePrice)}
              </span>
            )}
          </div>
        </div>

        {/* Actions — alignées, compactes */}
        <div className="flex items-center justify-between text-muted-foreground text-sm mt-3 pt-3 border-t border-zinc-200 border-border">
          <div className="flex items-center gap-1.5">
            <button
              className="group/btn flex h-8 items-center justify-center gap-1.5 rounded-full transition-all duration-300 hover:bg-rose-600/10 dark:hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 text-zinc-300"
              style={{ background: "#1C1C1F", border: "none", padding: "0 10px" }}
              aria-label={liked ? (mounted ? t("unlike") : "Unlike") : (mounted ? t("like") : "Like")}
              title={liked ? (mounted ? t("unlike") : "Unlike") : (mounted ? t("like") : "Like")}
              onClick={toggleLike}
            >
              <span className="inline-flex items-center justify-center shrink-0">
                <BiIcon name={liked ? "bi-heart-fill" : "bi-heart"} className={`transition-colors ${liked ? "fill-current text-rose-500" : "text-zinc-400"}`} style={{ fontSize: 14 }} />
              </span>
              <span className="text-sm font-medium tabular-nums" style={{ color: liked ? "#F43F5E" : "#D6D3D1" }}>
                {formatNumber(likeCount)}
              </span>
            </button>
            <button
              className="group/btn flex h-8 items-center justify-center gap-1.5 rounded-full transition-all duration-300 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 text-zinc-300"
              style={{ background: "#1C1C1F", border: "none", padding: "0 10px" }}
              aria-label={mounted ? t("comment") : "Comment"}
              title={mounted ? t("comment") : "Comment"}
              onClick={openCommentDrawer}
            >
              <span className="inline-flex items-center justify-center shrink-0">
                <BiIcon name="bi-chat-left" className="text-zinc-300" style={{ fontSize: 14 }} />
              </span>
              <span className="text-sm font-medium tabular-nums text-zinc-300">
                {formatNumber(photo.commentsCount)}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="group/btn flex h-8 items-center justify-center gap-1.5 rounded-full transition-all duration-300 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 text-zinc-300"
              style={{ background: "#1C1C1F", border: "none", padding: "0 10px" }}
              aria-label={bookmarked ? (mounted ? t("unbookmark") : "Unsave") : (mounted ? t("bookmark") : "Save")}
              title={bookmarked ? (mounted ? t("unbookmark") : "Unsave") : (mounted ? t("bookmark") : "Save")}
              onClick={toggleBookmark}
            >
              <span className="inline-flex items-center justify-center shrink-0">
                <BiIcon name={bookmarked ? "bi-bookmark-fill" : "bi-bookmark"} className={`transition-colors ${bookmarked ? "fill-current text-amber-500" : "text-zinc-300"}`} style={{ fontSize: 14 }} />
              </span>
            </button>
            <button
              className="group/btn flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 text-zinc-300"
              style={{ background: "#1C1C1F", border: "none" }}
              aria-label={mounted ? t("share") : "Share"}
              title={mounted ? t("share") : "Share"}
              onClick={handleShare}
            >
              <span className="inline-flex items-center justify-center shrink-0">
                <BiIcon name="bi-share" className="text-zinc-300" style={{ fontSize: 14 }} />
              </span>
            </button>
          </div>
        </div>
      </div>

    </div>

    <CommentDrawer photo={photo} isOpen={commentDrawerOpen} onClose={() => setCommentDrawerOpen(false)} />
    </>
  );
}