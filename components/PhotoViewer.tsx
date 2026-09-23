"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";
import { useCurrency } from "lib/currency";
import PrintCustomizer from "./PrintCustomizer";
import { formatNumber, resizeUrl } from "lib/utils";
import { useLanguage } from "lib/i18n";
import { useToast } from "components/ui/toast";
import Image from "next/image";
import { BiIcon } from "components/BiIcon";
import CommentDrawer from "./CommentDrawer";
import type { CollectionDto, MountDto, PhotoDto, PrintSizeDto } from "lib/types";

interface Props {
  photo: PhotoDto;
  sizes: PrintSizeDto[];
  mounts: MountDto[];
  initialLiked: boolean;
  collections: CollectionDto[];
  initialCollectionIds: number[];
}

export default function PhotoViewer({
  photo,
  sizes,
  mounts,
  initialLiked,
  collections,
  initialCollectionIds,
}: Props) {
  const { user } = useSession();
  const { t } = useLanguage();
  const router = useRouter();
  const { currency } = useCurrency();
  const [dlCount, setDlCount] = useState(photo.downloads);
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(photo.likesCount);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(photo.bookmarksCount);
  const [shareCount, setShareCount] = useState(photo.sharesCount);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set(initialCollectionIds));
  const [saveOpen, setSaveOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [newCollName, setNewCollName] = useState("");
  const [colls, setColls] = useState<CollectionDto[]>(collections);
  const [busy, setBusy] = useState(false);
  const [licenseType, setLicenseType] = useState<"personal" | "commercial">("personal");
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const { show: toast, hide } = useToast();

  const presets = useMemo(() => {
    const w = photo.width ?? 1600;
    const h = photo.height ?? 1067;
    const ar = h / w;
    const mk = (width: number) => resizeUrl(photo.imageUrl, width, Math.round(width * ar));
    return [
      { key: "original", label: t("size_original"), dims: `${w} × ${h} px`, url: photo.imageUrl },
      { key: "large", label: t("size_large"), dims: t("px_wide", { width: "1600" }), url: mk(1600) },
      { key: "medium", label: t("size_medium"), dims: t("px_wide", { width: "800" }), url: mk(800) },
      { key: "text-sm", label: t("size_small"), dims: t("px_wide", { width: "400" }), url: mk(400) },
    ];
  }, [photo, t]);

  async function requireLogin() {
    router.push(`/login?next=${encodeURIComponent(`/photo/${photo.slug}`)}`);
  }

  async function toggleLike() {
    if (!user) return requireLogin();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/photos/${photo.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: liked ? "unlike" : "like" }),
      });
      if (res.ok) {
        setLiked(!liked);
        setLikeCount((c) => Math.max(0, c + (liked ? -1 : 1)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookmark() {
    if (!user) return requireLogin();
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
        setBookmarkCount((c) => Math.max(0, c + (bookmarked ? -1 : 1)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    try {
      await fetch(`/api/photos/${photo.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "share", platform: "web" }),
      });
      setShareCount((c) => c + 1);
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

  async function freeDownload() {
    fetch(`/api/photos/${photo.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "download" }),
    }).catch(() => undefined);
    setDlCount((c) => c + 1);
    toast({ title: t("download_started"), description: "", variant: "success" });
    const a = document.createElement("a");
    a.href = `/api/photos/${photo.id}/free-file`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function toggleCollection(c: CollectionDto) {
    if (!user) return requireLogin();
    const action = savedIds.has(c.id) ? "remove" : "add";
    const res = await fetch(`/api/collections/${c.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, photoId: photo.id }),
    });
    if (res.ok) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (action === "add") next.add(c.id);
        else next.delete(c.id);
        return next;
      });
    }
  }

  async function createCollection() {
    if (!user || !newCollName.trim()) return;
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCollName.trim() }),
    });
    if (res.ok) {
      const created = await res.json();
      setColls((prev) => [created.collection, ...prev]);
      setNewCollName("");
      const addRes = await fetch(`/api/collections/${created.collection.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", photoId: photo.id }),
      });
      if (addRes.ok) setSavedIds((prev) => new Set(prev).add(created.collection.id));
    }
  }

  async function purchaseHd() {
    if (!user) return requireLogin();
    if (purchasing) return;
    setPurchasing(true);
    setPurchaseError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: photo.id, licenseType, currency }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPurchaseError(data.error ?? t("something_went_wrong"));
        return;
      }
      window.location.href = data.url; // real Stripe-hosted checkout page
    } catch {
      setPurchaseError(t("something_went_wrong"));
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <div>
      {/* Title + actions · 60-30-10 : Playfair pour titre, Inter pour métadonnées */}
      <div className="flex justify-between items-start gap-3 mb-4">
        <div>
          <h1 className="font-serif font-bold mb-2 text-zinc-900 dark:text-zinc-100" style={{ fontSize: "clamp(1.5rem, 3vw, 2.1rem)", lineHeight: 1.15 }}>
            {photo.title}
          </h1>
          <div className="flex items-center gap-2 flex-wrap text-sm text-zinc-700 dark:text-zinc-300" style={{ fontFamily: "var(--font-sans)" }}>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-800 dark:text-amber-500" style={{ fontFamily: "var(--font-accent)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {photo.licenseType === "free" ? t("royalty_free_photo") : t("limited_edition_label")}
            </span>
            <span className="text-muted-foreground dark:text-zinc-600">·</span>
            <span className="inline-flex items-center text-sm"><span className="inline-flex items-center justify-center shrink-0 me-1"><BiIcon name="bi-eye" style={{ color: "#A8A29E", fontSize: 14 }} /></span>{t("views_count", { count: formatNumber(photo.views) })}</span>
            <span className="text-muted-foreground dark:text-zinc-600">·</span>
            <span className="inline-flex items-center text-sm"><span className="inline-flex items-center justify-center shrink-0 me-1"><BiIcon name="bi-cloud-download" style={{ color: "#A8A29E", fontSize: 14 }} /></span>{t("downloads_count", { count: formatNumber(dlCount) })}</span>
            {photo.category && (
              <>
                <span className="text-muted-foreground dark:text-zinc-600">·</span>
                <Link href={`/${photo.licenseType === "free" ? "photos" : "prints"}?category=${photo.category.slug}`} className="inline-flex items-center text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-amber-600 dark:hover:text-amber-500 transition-colors">
                  <span className="inline-flex items-center justify-center shrink-0 me-1"><BiIcon name={photo.category.icon} /></span>
                  {photo.category.name}
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-[#F43F5E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E] text-white"
            aria-label={t("like")}
            onClick={toggleLike}
            style={{ width: 44, height: 44, background: "#1C1C1F", border: liked ? "1px solid #F43F5E" : "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}
            title={liked ? t("unlike") : t("like")}
          >
            <span className="inline-flex items-center justify-center shrink-0">
              <BiIcon name={liked ? "bi-heart-fill" : "bi-heart"} className={liked ? "fill-current text-rose-500 dark:text-rose-500" : "text-white group-hover:text-rose-500 dark:group-hover:text-rose-500"} style={{ fontSize: 18 }} />
            </span>
            <span
              style={{
                position: "absolute",
                bottom: -8,
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "#FFFFFF",
                background: "#1C1C1F",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                padding: "0 0.32rem",
                lineHeight: 1.3,
              }}
            >
              {formatNumber(likeCount)}
            </span>
          </button>
          <button
            className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 text-white"
            aria-label={t("comment")}
            onClick={() => setCommentOpen(true)}
            style={{ width: 44, height: 44, background: "#1C1C1F", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}
          >
            <span className="inline-flex items-center justify-center shrink-0">
              <BiIcon name="bi-chat-left" className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
            </span>
            <span
              style={{
                position: "absolute",
                bottom: -8,
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "#FFFFFF",
                background: "#1C1C1F",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                padding: "0 0.32rem",
                lineHeight: 1.3,
              }}
            >
              {formatNumber(photo.commentsCount)}
            </span>
          </button>
          <button
            className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 text-white"
            aria-label={bookmarked ? t("unbookmark") : t("bookmark")}
            onClick={toggleBookmark}
            style={{ width: 44, height: 44, background: bookmarked ? "rgba(245,158,11,0.18)" : "#1C1C1F", border: bookmarked ? "1px solid #fbbf24" : "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}
            title={bookmarked ? t("unbookmark") : t("bookmark")}
          >
            <span className="inline-flex items-center justify-center shrink-0">
              <BiIcon name={bookmarked ? "bi-bookmark-fill" : "bi-bookmark"} className={bookmarked ? "fill-current text-amber-500" : "text-white group-hover:text-amber-400"} style={{ fontSize: 18 }} />
            </span>
            <span
              style={{
                position: "absolute",
                bottom: -8,
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "#FFFFFF",
                background: "#1C1C1F",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                padding: "0 0.32rem",
                lineHeight: 1.3,
              }}
            >
              {formatNumber(bookmarkCount)}
            </span>
          </button>
          <button
            className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 text-white"
            aria-label={t("share")}
            onClick={handleShare}
            style={{ width: 44, height: 44, background: "#1C1C1F", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}
          >
            <span className="inline-flex items-center justify-center shrink-0">
              <BiIcon name="bi-share" className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
            </span>
            <span
              style={{
                position: "absolute",
                bottom: -8,
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "#FFFFFF",
                background: "#1C1C1F",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                padding: "0 0.32rem",
                lineHeight: 1.3,
              }}
            >
              {formatNumber(shareCount)}
            </span>
          </button>
          <div style={{ position: "relative" }}>
            <button className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500 text-white" aria-label={t("save_to_collection")} onClick={() => setSaveOpen(!saveOpen)} style={{ width: 44, height: 44, background: "#1C1C1F", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}>
              <span className="inline-flex items-center justify-center shrink-0">
                <BiIcon name="bi-bookmark-plus" className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
              </span>
            </button>
            {saveOpen && (
              <div className="dropdown-menu show absolute right-0 mt-2" style={{ minWidth: 280 }}>
                <div className="dropdown-header px-3 py-1">{t("save_to_collection")}</div>
                <div className="px-2" style={{ maxHeight: 220, overflow: "auto" }}>
                  {colls.length === 0 && (
                    <div className="text-muted-2 px-2 py-2" style={{ fontSize: "0.82rem" }}>
                      {t("no_collections_yet")}
                    </div>
                  )}
                  {colls.map((c) => (
                    <button
                      key={c.id}
                      className="dropdown-item flex justify-between items-center"
                      onClick={() => toggleCollection(c)}
                    >
                      <span className="inline-flex items-center text-sm"><span className="inline-flex items-center justify-center shrink-0 me-2"><BiIcon name="bi-folder" /></span>{c.name}</span>
                      {savedIds.has(c.id) && <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-check-lg" className="text-gold" /></span>}
                    </button>
                  ))}
                </div>
                <hr className="dropdown-divider" />
                <div className="px-2 pb-2 flex gap-2">
                  <input
                    className="form-control form-control-sm"
                    placeholder={t("new_collection_placeholder")}
                    value={newCollName}
                    onChange={(e) => setNewCollName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createCollection()}
                  />
                  <button className="btn btn-gold btn-sm" onClick={createCollection}>
                    <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-plus-lg" /></span>
                  </button>
                </div>
              </div>
            )}
          </div>
          {photo.licenseType === "free" && (
            <button
              className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 text-white"
              aria-label={t("download_for_free")}
              title={t("download_for_free")}
              onClick={freeDownload}
              style={{ width: 44, height: 44, background: "#1C1C1F", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}
            >
              <span className="inline-flex items-center justify-center shrink-0">
                <BiIcon name="bi-cloud-download" className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Photographe · carte auteur normalisée : avatar cercle parfait + textes alignés */}
      <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl w-full mb-4">
        {photo.photographer.avatarUrl ? (
          <Image
            src={photo.photographer.avatarUrl}
            alt={photo.photographer.name}
            width={48}
            height={48}
            className="w-12 h-12 rounded-full object-cover shrink-0"
            unoptimized={process.env.NODE_ENV === "development"}
            loading="lazy"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center font-semibold text-lg shrink-0">
            {photo.photographer.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col justify-center min-w-0 overflow-hidden">
          <span className="font-medium text-card-foreground text-sm truncate">{t("photo_by", { name: photo.photographer.name })}</span>
          <span className="text-muted-foreground text-sm truncate mt-0.5">
            {photo.photographer.location ?? t("around_the_world")} · {photo.photographer.bio ?? t("photographer_on_aperio")}
          </span>
        </div>
        {photo.licenseType === "free" && photo.photographer.donationLink && (
          <a className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 hover:scale-105 bg-card text-card-foreground border border-border" href={photo.photographer.donationLink} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--font-accent)", whiteSpace: "nowrap" }}>
            <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-cup-hot" style={{ fontSize: 14 }} /></span> {t("support")}
          </a>
        )}
      </div>

      {/* Licence HD · conteneur sombre harmonisé */}
      {photo.hasHd && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex justify-between items-center mb-3">
            <div className="font-bold flex items-center gap-1.5 text-sm" style={{ color: "#fbbf24", fontFamily: "var(--font-accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-download" style={{ color: "#fbbf24", fontSize: 14 }} /></span>
              {t("purchase_hd_title")}
            </div>
            <span className="rounded-full px-2.5 py-1 text-sm" style={{ background: "rgba(245,158,11,0.14)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.30)", fontFamily: "var(--font-accent)", fontWeight: 700 }}>
              {t("digital_license_label")}
            </span>
          </div>
          <p className="mb-3 text-sm" style={{ color: "#E5E5E5", lineHeight: 1.6, fontFamily: "var(--font-sans)" }}>
            {t("purchase_hd_sub")}
          </p>

          <div className="grid gap-2 mb-3" role="radiogroup" aria-label={t("license_type")}>
            <label className={`mount-option ${licenseType === "personal" ? "active" : ""}`} style={{ cursor: "pointer", background: "#1C1C1F", borderColor: licenseType === "personal" ? "#f59e0b" : "rgba(255,255,255,0.08)" }}>
              <input type="radio" name="licenseType" className="form-check-input me-2" checked={licenseType === "personal"} onChange={() => setLicenseType("personal")} />
              <div>
                <div className="font-bold text-sm" style={{ color: "#FFFFFF" }}>{t("license_personal")}</div>
                <div className="text-sm" style={{ color: "#E5E5E5" }}>{t("license_personal_desc")}</div>
              </div>
            </label>
            <label className={`mount-option ${licenseType === "commercial" ? "active" : ""}`} style={{ cursor: "pointer", background: "#1C1C1F", borderColor: licenseType === "commercial" ? "#f59e0b" : "rgba(255,255,255,0.08)" }}>
              <input type="radio" name="licenseType" className="form-check-input me-2" checked={licenseType === "commercial"} onChange={() => setLicenseType("commercial")} />
              <div>
                <div className="font-bold text-sm" style={{ color: "#FFFFFF" }}>{t("license_commercial")}</div>
                <div className="text-sm" style={{ color: "#E5E5E5" }}>{t("license_commercial_desc")}</div>
              </div>
            </label>
          </div>

          {purchaseError && (
            <div className="alert alert-danger py-2 mb-2 flex items-center gap-1 text-sm">
              <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-exclamation-triangle" /></span>{purchaseError}
            </div>
          )}
          <button className="btn btn-gold w-full" onClick={purchaseHd} disabled={purchasing}>
            {purchasing ? <span className="spinner-border spinner-border-sm" /> : <><span className="inline-flex items-center justify-center shrink-0 me-2"><BiIcon name="bi-download" /></span>{t("buy_hd_photo")}</>}
          </button>
          <div className="flex items-center justify-center gap-2 text-center text-sm mt-2" style={{ color: "#A3A3A3" }}>
            <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-lock" className="text-amber-500" style={{ flexShrink: 0 }} /></span>
            <span>{t("digital_delivery_note")}</span>
          </div>
        </div>
      )}

      {/* Content depends on the engine (free or limited edition) */}
      {photo.licenseType === "free" ? (
        <>
          <div className="filter-title">{t("download_for_free")}</div>
          <div className="row g-2 mb-3">
            {presets.map((p) => (
              <div className="col-6" key={p.key}>
                <button
                  type="button"
                  className="btn btn-ghost w-full flex flex-col items-start py-2 px-3 shadow-sm"
                  onClick={freeDownload}
                  style={{ textAlign: "left" }}
                >
                  <span className="font-bold flex items-center text-sm">
                    <span className="inline-flex items-center justify-center shrink-0 me-2 text-gold"><BiIcon name="bi-cloud-download" /></span>
                    {p.label}
                  </span>
                  <span className="text-muted-2 mt-1 text-sm">
                    {p.dims}
                  </span>
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 text-center text-sm mt-3 mb-3 px-3 py-2 rounded-full" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)", color: "#E5E5E5" }}>
            <span className="inline-flex items-center justify-center shrink-0"><BiIcon name="bi-info-circle" className="text-amber-400/90" style={{ flexShrink: 0 }} /></span>
            <span><strong style={{ color: "#FFFFFF" }}>{t("free_to_use")}</strong> · {t("free_use_note", { name: photo.photographer.name })}</span>
          </div>
        </>
      ) : (
        <PrintCustomizer photo={photo} sizes={sizes} mounts={mounts} />
      )}

      {/* Tags */}
      {photo.tags.length > 0 && (
        <div className="mt-3">
          <div className="filter-title">{t("tags_label")}</div>
          <div>
            {photo.tags.map((t) => (
              <Link key={t.slug} href={`/photos?q=${encodeURIComponent(t.name)}`} className="chip">
                #{t.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <CommentDrawer photo={photo} isOpen={commentOpen} onClose={() => setCommentOpen(false)} />
    </div>
  );
}