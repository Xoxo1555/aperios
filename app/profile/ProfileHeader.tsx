"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useSession } from "components/SessionProvider";
import { useLanguage } from "lib/i18n";
import Lightbox from "components/Lightbox";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera } from "@fortawesome/free-regular-svg-icons";
import { faMagnifyingGlassPlus, faTrash } from "@fortawesome/free-solid-svg-icons";

/** Image de repli servie depuis /public lorsque l'utilisateur n'a pas d'avatar. */
const DEFAULT_AVATAR = "/default-avatar.png";

export interface ProfileHeaderUser {
  name: string;
  /** Champ canonique côté serveur/session. */
  avatarUrl?: string | null;
  /** Alias historique parfois renvoyé par les API/DTO. */
  image?: string | null;
}

/**
 * Résout la meilleure source d'image disponible pour l'avatar.
 * Ordre de priorité : `avatarUrl` → `image` → image par défaut.
 * On ignore les chaînes vides ou composées uniquement d'espaces pour ne
 * jamais rendre une balise `<img>` avec une source vide (backdrop noir).
 */
export function resolveAvatarSrc(user: ProfileHeaderUser): string {
  const candidates = [user?.avatarUrl, user?.image];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return DEFAULT_AVATAR;
}

/**
 * Section avatar du profil : affiche la photo, permet de l'agrandir
 * (lightbox autonome) et de la changer / retirer.
 *
 * L'upload passe par l'endpoint existant POST /api/me/avatar (JSON
 * `{ image: <data-URL> }`), et rafraîchit la session + le composant serveur.
 */
export function ProfileAvatarSection({ user }: { user: ProfileHeaderUser }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { setUser } = useSession();
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarSrc = resolveAvatarSrc(user);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
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
          if (!res.ok) {
            alert(data.error ?? t("upload_failed"));
            setUploading(false);
            return;
          }
          setUser(data.user);
          setUploading(false);
          router.refresh();
        } catch {
          alert(t("upload_failed"));
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      alert(t("unsupported_file"));
      setUploading(false);
    }
    // Reset l'input pour pouvoir re-sélectionner le même fichier.
    if (e.target) e.target.value = "";
  }

  async function removeAvatar() {
    if (!confirm(t("remove_photo"))) return;
    setUploading(true);
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        router.refresh();
      } else {
        alert(data.error ?? t("unable_save"));
      }
    } catch {
      alert(t("unable_save"));
    }
    setUploading(false);
  }

  return (
    <div className="flex flex-col items-center">
      {/* Photo de profil : un clic l'agrandit dans la lightbox */}
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="profile-avatar group relative z-10 border-0 p-0"
        style={{ cursor: "zoom-in", background: "transparent" }}
        aria-label={user.name}
        title={user.name}
      >
        <Image
          src={avatarSrc}
          alt={user.name}
          width={128}
          height={128}
          className="rounded-full object-cover"
          unoptimized={process.env.NODE_ENV === "development"}
          loading="lazy"
        />

        <span
          className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          style={{ color: "#fff" }}
        >
          <FontAwesomeIcon icon={faMagnifyingGlassPlus} style={{ fontSize: "1.1rem" }} />
        </span>
      </button>

      {/* Boutons séparés : changer / retirer la photo */}
      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs text-muted-foreground hover:text-gold underline transition-colors disabled:opacity-60"
        >
          <FontAwesomeIcon icon={faCamera} className="me-1" />
          {uploading ? t("uploading") : t("change_profile_photo")}
        </button>
        {user.avatarUrl || user.image ? (
          <button
            type="button"
            onClick={removeAvatar}
            disabled={uploading}
            className="text-xs text-muted-foreground hover:text-gold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
          >
            <FontAwesomeIcon icon={faTrash} />
            {t("remove_photo")}
          </button>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />

      <Lightbox
        src={avatarSrc}
        alt={user.name}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}

/** En-tête de profil : avatar (avec ses actions) + nom. */
export default function ProfileHeader({ user }: { user: ProfileHeaderUser }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <ProfileAvatarSection user={user} />
      <h1 className="font-display font-bold text-2xl md:text-3xl">{user.name}</h1>
    </div>
  );
}
