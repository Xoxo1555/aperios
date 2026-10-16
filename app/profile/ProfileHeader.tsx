"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useSession } from "components/SessionProvider";
import { useLanguage } from "lib/i18n";
import { useLightbox } from "./ProfileLightbox";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faUser } from "@fortawesome/free-regular-svg-icons";
import { faMagnifyingGlassPlus, faTrash } from "@fortawesome/free-solid-svg-icons";

interface ProfileHeaderUser {
  name: string;
  avatarUrl: string | null;
}

/**
 * Section avatar du profil : affiche la photo, permet de l'agrandir
 * (lightbox partagée du profil) et de la changer / retirer.
 *
 * L'upload passe par l'endpoint existant POST /api/me/avatar (JSON
 * `{ image: <data-URL> }`), et rafraîchit la session + le composant serveur.
 * Doit être rendu à l'intérieur de `LightboxProvider` (app/profile/page.tsx).
 */
export function ProfileAvatarSection({ user }: { user: ProfileHeaderUser }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { setUser } = useSession();
  const { openLightbox } = useLightbox();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      {/* Photo de profil : un clic l'agrandit (lightbox du profil) */}
      <div
        onClick={() => user.avatarUrl && openLightbox("avatar")}
        className="profile-avatar group relative z-10"
        style={{ cursor: user.avatarUrl ? "zoom-in" : "default" }}
        title={user.avatarUrl ? user.name : undefined}
        role={user.avatarUrl ? "button" : undefined}
        aria-label={user.avatarUrl ? t("change_profile_photo") : undefined}
      >
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
            <FontAwesomeIcon icon={faUser} className="text-muted-foreground" style={{ fontSize: "3rem" }} />
          </div>
        )}

        {user.avatarUrl && (
          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
            <FontAwesomeIcon icon={faMagnifyingGlassPlus} style={{ fontSize: "1.1rem" }} />
          </div>
        )}
      </div>

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
        {user.avatarUrl && (
          <button
            type="button"
            onClick={removeAvatar}
            disabled={uploading}
            className="text-xs text-muted-foreground hover:text-gold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
          >
            <FontAwesomeIcon icon={faTrash} />
            {t("remove_photo")}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
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
