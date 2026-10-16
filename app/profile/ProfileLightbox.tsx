"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Lightbox from "components/Lightbox";

type ImageType = "avatar" | "cover";

interface LightboxContextValue {
  isOpen: boolean;
  currentImage: ImageType | null;
  openLightbox: (type: ImageType) => void;
  closeLightbox: () => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

/** Replis servis depuis /public : jamais de chaîne vide en entrée de <Image>. */
const DEFAULT_AVATAR = "/images/logo-badge.png";
const DEFAULT_COVER = "/images/isalo.jpg";

/**
 * Garantit une source d'image non vide et nettoyée. Renvoie toujours une
 * chaîne valide (au pire le repli fourni), afin d'éviter un rendu noir /
 * transparent quand la donnée est absente ou composée d'espaces.
 */
function safeImageSrc(src: string | null | undefined, fallback: string): string {
  return typeof src === "string" && src.trim() ? src.trim() : fallback;
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState<ImageType | null>(null);

  const openLightbox = (type: ImageType) => {
    setCurrentImage(type);
    setIsOpen(true);
  };

  const closeLightbox = () => {
    setIsOpen(false);
    setCurrentImage(null);
  };

  return (
    <LightboxContext.Provider value={{ isOpen, currentImage, openLightbox, closeLightbox }}>
      {children}
    </LightboxContext.Provider>
  );
}

export function useLightbox() {
  const context = useContext(LightboxContext);
  if (!context) {
    throw new Error("useLightbox must be used within a LightboxProvider");
  }
  return context;
}

interface LightboxContentProps {
  avatarUrl: string | null;
  coverImage: string | null;
  userName: string;
}

/**
 * Affiche l'agrandissement de l'avatar ou de la couverture via le composant
 * global `components/Lightbox` (taille explicite via `.lightbox-stage`, zoom,
 * portail vers <body>). Remplace l'ancien `<Image fill>` dont le conteneur
 * n'avait aucune dimension intrinsèque et s'écrasait à 0px.
 */
export function LightboxContent({ avatarUrl, coverImage, userName }: LightboxContentProps) {
  const { isOpen, currentImage, closeLightbox } = useLightbox();

  if (!isOpen || !currentImage) return null;

  const isAvatar = currentImage === "avatar";
  const src = isAvatar
    ? safeImageSrc(avatarUrl, DEFAULT_AVATAR)
    : safeImageSrc(coverImage, DEFAULT_COVER);
  const label = isAvatar ? "Profile photo" : "Cover photo";

  return (
    <Lightbox
      src={src}
      alt={`${label} of ${userName}`}
      open={isOpen}
      onClose={closeLightbox}
    />
  );
}
