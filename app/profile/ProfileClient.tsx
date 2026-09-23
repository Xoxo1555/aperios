"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BiIcon } from "components/BiIcon";
import { useSession } from "components/SessionProvider";
import { langLocale, useLanguage } from "lib/i18n";
import { formatDate } from "lib/utils";
import Image from "next/image";

interface FullUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "photographer" | "buyer";
  avatarUrl: string | null;
  coverImage: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  phone: string | null;
  country: string | null;
  specialties: string | null;
  interests: string | null;
  instagram: string | null;
  donationLink: string | null;
  payoutMethod: string | null;
  payoutAccount: string | null;
  payoutName: string | null;
  availableBalance: string;
  createdAt: string;
}

const INTERESTS = [
  "Landscapes", "Contemporary art", "Wildlife", "Portraits", "Craft",
  "Malagasy photography", "Street photography", "Macro", "Black & white",
];
const SPECIALTIES = [
  "Landscapes", "Wildlife", "Portraits", "Street", "Fashion", "Macro", "Craft",
  "Contemporary art", "Black & white", "Sport",
];

export default function ProfileClient({
  user,
  stats,
  onAvatarClick,
}: {
  user: FullUser;
  stats?: {
    photoCount: number;
    views: number;
    likes: number;
  };
  onAvatarClick?: () => void;
}) {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { setUser, user: sessionUser } = useSession();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: user.name, bio: user.bio ?? "", location: user.location ?? "",
    website: user.website ?? "", phone: user.phone ?? "", country: user.country ?? "",
    instagram: user.instagram ?? "",
    specialties: user.specialties ?? "",
    interests: user.interests ?? "",
  });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [msg, setMsg] = useState("");

  const isCreator = user.role === "photographer" || user.role === "admin";
  const roleLabel = user.role === "photographer" ? t("role_artist_creator") : user.role === "admin" ? t("administrator") : t("collector");
  const roleBadgeStyle = user.role === "photographer"
    ? { background: "rgba(245,158,11,0.16)", color: "var(--ap-gold-dark)" }
    : user.role === "admin"
    ? { background: "rgba(214,117,117,0.16)", color: "var(--ap-red)" }
    : { background: "rgba(125,189,140,0.16)", color: "var(--ap-green-ink)" };

  const [coverUploading, setCoverUploading] = useState(false);

  async function uploadAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setMsg("");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          const res = await fetch("/api/me/avatar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: dataUrl }),
          });
          const data = await res.json();
          if (!res.ok) { setMsg(data.error ?? t("upload_failed")); setAvatarUploading(false); return; }
          setUser(data.user);
          setMsg(t("profile_photo_updated"));
          setAvatarUploading(false);
          router.refresh();
        } catch { setMsg(t("upload_failed")); setAvatarUploading(false); }
      };
      reader.readAsDataURL(file);
    } catch { setMsg(t("unsupported_file")); setAvatarUploading(false); }
  }

  async function removeAvatar() {
    setAvatarUploading(true);
    const res = await fetch("/api/me/avatar", { method: "DELETE" });
    const data = await res.json();
    if (res.ok) { setUser(data.user); router.refresh(); }
    setAvatarUploading(false);
  }

  async function uploadCover(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    setMsg("");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          const res = await fetch("/api/me/cover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: dataUrl }),
          });
          const data = await res.json();
          if (!res.ok) { setMsg(data.error ?? t("upload_failed")); setCoverUploading(false); return; }
          setUser(data.user);
          setMsg(t("cover_photo_updated"));
          setCoverUploading(false);
          router.refresh();
        } catch { setMsg(t("upload_failed")); setCoverUploading(false); }
      };
      reader.readAsDataURL(file);
    } catch { setMsg(t("unsupported_file")); setCoverUploading(false); }
  }

  async function removeCover() {
    setCoverUploading(true);
    const res = await fetch("/api/me/cover", { method: "DELETE" });
    const data = await res.json();
    if (res.ok) { setUser(data.user); router.refresh(); }
    setCoverUploading(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? t("unable_save")); return; }
      setUser(data.user);
      setEditing(false);
      setMsg(t("profile_updated"));
      router.refresh();
    } catch { setMsg(t("save_failed")); }
  }

  return (
    <div className="profile-card border border-border flex flex-col sm:flex-row gap-4 w-full">
      <div className="profile-avatar relative z-10 -mt-12 md:-mt-16 shrink-0" onClick={onAvatarClick} style={onAvatarClick ? { cursor: "zoom-in" } : {}}>
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={user.name}
            width={128}
            height={128}
            className="rounded-full object-cover"
            unoptimized={process.env.NODE_ENV === "development"}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-card flex items-center justify-center rounded-full">
            <BiIcon name="bi-person" className="w-12 h-12 text-muted-foreground" style={{ fontSize: "3rem" }} />
          </div>
        )}
        <label className="upload-overlay" title={t("change_profile_photo")}>
          <BiIcon name="bi-camera" className="text-gold" style={{ fontSize: "1.6rem" }} />
          <input type="file" accept="image/*" hidden onChange={uploadAvatar} disabled={avatarUploading} />
        </label>
      </div>

      <div className="grow flex flex-col gap-2">
        <div className="w-fit max-w-full inline-flex items-center gap-3 flex-wrap p-2 px-4">
          {editing ? (
            <input
              className="form-control font-display font-bold !bg-card !border-border !text-card-foreground placeholder:!text-muted-foreground focus:!border-accent"
              style={{ fontSize: "1.5rem", maxWidth: 300 }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          ) : (
            <h1 className="w-auto max-w-full break-words whitespace-normal text-2xl md:text-3xl font-bold">{user.name}</h1>
          )}
          <span className="badge rounded-pill uppercase" style={{
            ...roleBadgeStyle,
            border: "1px solid rgba(255,255,255,0.1)",
            fontSize: "0.62rem",
            letterSpacing: "0.08em",
          }}>
            {user.role === "photographer" && <BiIcon name="bi-palette" className="me-1" />}
            {user.role === "buyer" && <BiIcon name="bi-heart-pulse" className="me-1" />}
            {user.role === "admin" && <BiIcon name="bi-shield-check" className="me-1" />}
            {roleLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-muted-foreground mt-1" style={{ fontSize: "0.88rem" }}>
          {user.location && <span><BiIcon name="bi-geo-alt" className="me-1" />{user.location}</span>}
          <span><BiIcon name="bi-calendar" className="me-1" />{t("member_since", { date: formatDate(user.createdAt, langLocale(lang)) })}</span>
          {isCreator && user.specialties && <span><BiIcon name="bi-palette" className="me-1" />{user.specialties}</span>}
        </div>

        {editing ? (
          <div className="mt-2">
            <div className="row g-2">
              <div className="col-md-6"><label className="form-label">{t("location")}</label><input className="form-control form-control-sm !bg-card !border-border !text-card-foreground placeholder:!text-muted-foreground focus:!border-accent" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div className="col-md-6"><label className="form-label">{t("country_label")}</label><input className="form-control form-control-sm !bg-card !border-border !text-card-foreground placeholder:!text-muted-foreground focus:!border-accent" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
              <div className="col-12"><label className="form-label">{t("bio")}</label><textarea className="form-control form-control-sm !bg-card !border-border !text-card-foreground placeholder:!text-muted-foreground focus:!border-accent" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
              <div className="col-md-6"><label className="form-label">{t("website")}</label><input className="form-control form-control-sm !bg-card !border-border !text-card-foreground placeholder:!text-muted-foreground focus:!border-accent" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></div>
              <div className="col-md-6"><label className="form-label">{t("instagram")}</label><input className="form-control form-control-sm !bg-card !border-border !text-card-foreground placeholder:!text-muted-foreground focus:!border-accent" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@username" /></div>
              <div className="col-md-6"><label className="form-label">{t("phone")}</label><input className="form-control form-control-sm !bg-card !border-border !text-card-foreground placeholder:!text-muted-foreground focus:!border-accent" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 6 12 34 56 78" /></div>
              <div className="col-md-6"><label className="form-label">{t("email_address")}</label><input className="form-control form-control-sm !bg-card/50 !border-border !text-muted-foreground cursor-not-allowed" value={user.email} disabled /></div>
              {isCreator && <div className="col-md-6"><label className="form-label">{t("specialties")}</label><input className="form-control form-control-sm !bg-card !border-border !text-card-foreground placeholder:!text-muted-foreground focus:!border-accent" value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} placeholder={t("specialties_placeholder")} /></div>}
              {!isCreator && <div className="col-12">
                <label className="form-label">{t("interests_label")}</label>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((i) => {
                    const selected = form.interests.split(",").map((s) => s.trim()).includes(i);
                    return (
                      <button
                        key={i} type="button" className="chip !bg-card !text-muted-foreground !border-border hover:!border-accent/50 hover:!text-card-foreground"
                        style={selected ? { background: "rgba(245,158,11,0.15)", color: "var(--ap-gold-dark)", borderColor: "var(--ap-gold)" } : undefined}
                        onClick={() => {
                          const list = form.interests.split(",").map((s) => s.trim()).filter(Boolean);
                          const next = selected ? list.filter((x) => x !== i) : [...list, i];
                          setForm({ ...form, interests: next.join(", ") });
                        }}
                      >{i}</button>
                    );
                  })}
                </div>
              </div>}
            </div>
          </div>
        ) : (
          <>
            {user.bio && <p className="text-muted-foreground mt-1 mb-0 italic" style={{ fontSize: "0.9rem", maxWidth: 640, lineHeight: 1.65 }}>{user.bio}</p>}
            {!user.bio && !isCreator && (
              <p className="text-muted-foreground mt-1 mb-0 italic" style={{ fontSize: "0.85rem" }}>
                {t("introduce_yourself")}
              </p>
            )}
            {user.interests && (
              <div className="mt-2">
                {user.interests.split(",").map((s) => s.trim()).filter(Boolean).map((i) => (
                  <span key={i} className="chip !bg-card !text-muted-foreground !border-border"><BiIcon name="bi-heart" className="text-gold" style={{ fontSize: "0.6rem" }} />{i}</span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-border">
          {editing ? (
            <>
              <button className="btn btn-gold btn-sm" onClick={save}><BiIcon name="bi-check-lg" className="me-1" />{t("save")}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>{t("cancel")}</button>
            </>
          ) : (
            <>
              <button className="btn btn-gold btn-sm" onClick={() => setEditing(true)}><BiIcon name="bi-pencil" className="me-1" />{t("edit_profile")}</button>
              {user.avatarUrl && <button className="btn btn-ghost btn-sm" onClick={removeAvatar}><BiIcon name="bi-trash" className="me-1" />{t("remove_photo")}</button>}
              <a href="/dashboard" className="btn btn-ghost btn-sm inline-flex items-center"><BiIcon name="bi-grid-1x2" className="me-1" style={{ fontSize: "16px" }} />{t("dashboard")}</a>
            </>
          )}
        </div>
        {msg && <div className="mt-2 text-gold" style={{ fontSize: "0.82rem" }}>{msg}</div>}
      </div>

      {isCreator && stats && (
        <div className="profile-stats">
          <div className="ps-item"><div className="ps-value">{stats.photoCount}</div><div className="ps-label">{t("photos_short")}</div></div>
          <div className="ps-item"><div className="ps-value">{stats.views.toLocaleString()}</div><div className="ps-label">{t("stat_views")}</div></div>
          <div className="ps-item"><div className="ps-value">{stats.likes.toLocaleString()}</div><div className="ps-label">{t("stat_likes")}</div></div>
        </div>
      )}
    </div>
  );
}
