"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BiIcon } from "./BiIcon";
import { useToast } from "./ui/toast";

export type DownloadButtonVariant = "gold" | "dark" | "ghost" | "outline";
export type DownloadButtonSize = "sm" | "md" | "lg";

interface DownloadButtonProps {
  /** ID de l'œuvre (photo.id) */
  artworkId: number;
  /** Variante visuelle — s'intègre au design system Aperio */
  variant?: DownloadButtonVariant;
  size?: DownloadButtonSize;
  /** Label du bouton (défaut: Télécharger) */
  label?: string;
  /** Affiche l'icône (défaut: true) */
  showIcon?: boolean;
  /** Classe additionnelle */
  className?: string;
  /** Désactivé manuellement */
  disabled?: boolean;
  /** Callback après succès (ex: analytics) */
  onSuccess?: () => void;
}

/**
 * Bouton réutilisable "Télécharger" — Zero Trust & F12 Clean.
 *
 * - Déclenche GET /api/artworks/[id]/download (auth via cookie httpOnly)
 * - Ne jamais exposer le chemin serveur : seul le blob et le filename du
 *   Content-Disposition sont utilisés côté client.
 * - Gère 401/403/404 avec toasts génériques (pas de fuite d'info).
 * - Stream côté serveur, blob côté client via fetch + objectURL.
 */
export default function DownloadButton({
  artworkId,
  variant = "gold",
  size = "md",
  label = "Télécharger",
  showIcon = true,
  className = "",
  disabled = false,
  onSuccess,
}: DownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const { show: toast } = useToast();
  const router = useRouter();

  const sizeClasses: Record<DownloadButtonSize, string> = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const variantClasses: Record<DownloadButtonVariant, string> = {
    gold: "btn-gold",
    dark: "bg-card text-card-foreground border border-border hover:bg-secondary",
    ghost: "btn-ghost",
    outline: "bg-transparent border border-amber-500 text-amber-600 hover:bg-amber-50",
  };

  async function handleClick() {
    if (loading || disabled) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/artworks/${artworkId}/download`, {
        method: "GET",
        credentials: "include",
      });

      if (res.status === 401) {
        toast({ title: "Connexion requise", description: "Connectez-vous pour télécharger.", variant: "danger" });
        router.push(`/login?next=${encodeURIComponent(`/photo/${artworkId}`)}`);
        return;
      }

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Accès refusé",
          description: (data as { error?: string })?.error ?? "Achat ou licence HD requis.",
          variant: "danger",
        });
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string })?.error ?? "Téléchargement indisponible.";
        toast({ title: "Erreur", description: msg, variant: "danger" });
        return;
      }

      // Succès : blob + Content-Disposition
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      // Extraction filename*=UTF-8'' ou filename="..."
      let filename = `aperio-${artworkId}.jpg`;
      const matchStar = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const matchPlain = disposition.match(/filename="([^"]+)"/i);
      if (matchStar) {
        try {
          filename = decodeURIComponent(matchStar[1]);
        } catch {
          filename = matchStar[1];
        }
      } else if (matchPlain) {
        filename = matchPlain[1];
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      // Ne pas exposer le chemin serveur — seul le filename sanitizé est utilisé
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Délai court avant revoke pour laisser le navigateur amorcer le téléchargement
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast({ title: "Téléchargement réussi", description: filename, variant: "success" });
      onSuccess?.();
    } catch {
      // Pas de console.log du chemin/URL absolue — message générique
      toast({ title: "Échec du téléchargement", description: "Réessayez plus tard.", variant: "danger" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      aria-busy={loading}
      aria-label={label}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-60 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      style={{ fontFamily: "var(--font-accent)" }}
    >
      {loading ? (
        <span className="spinner-border spinner-border-sm" aria-hidden />
      ) : showIcon ? (
        <span className="inline-flex items-center justify-center shrink-0">
          <BiIcon name="bi-download" style={{ fontSize: 16 }} />
        </span>
      ) : null}
      <span>{loading ? "Téléchargement…" : label}</span>
    </button>
  );
}
