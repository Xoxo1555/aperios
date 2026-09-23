"use client";

import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { BiIcon } from "components/BiIcon";
import Image from "next/image";

type ImageType = "avatar" | "cover";

interface LightboxContextValue {
  isOpen: boolean;
  currentImage: ImageType | null;
  openLightbox: (type: ImageType) => void;
  closeLightbox: () => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

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
      <LightboxModal isOpen={isOpen} currentImage={currentImage} onClose={closeLightbox} />
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

interface LightboxModalProps {
  isOpen: boolean;
  currentImage: ImageType | null;
  onClose: () => void;
}

function LightboxModal({ isOpen, currentImage, onClose }: LightboxModalProps) {
  // This will receive avatarUrl and coverImage from the page via props
  // For now, we'll need to pass them through context or props
  // Let's use a separate context for the image URLs
  return null;
}

// Separate component for the actual modal that receives image URLs
interface LightboxContentProps {
  avatarUrl: string | null;
  coverImage: string | null;
  userName: string;
}

export function LightboxContent({ avatarUrl, coverImage, userName }: LightboxContentProps) {
  const { isOpen, currentImage, closeLightbox } = useLightbox();

  const imageSrc = currentImage === "avatar" ? avatarUrl : coverImage;

  if (!isOpen || !imageSrc) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${currentImage === "avatar" ? "Profile photo" : "Cover photo"} of ${userName}`}
    >
      <div
        className="absolute inset-0 bg-black/95 backdrop-blur-sm"
        onClick={closeLightbox}
        aria-hidden="true"
      />
      <button
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        onClick={closeLightbox}
        aria-label="Close"
      >
        <BiIcon name="bi-x-lg" style={{ fontSize: "24px" }} />
      </button>
      <div className="relative z-10 max-h-[90vh] max-w-[90vw]">
        <Image
          src={imageSrc}
          alt={`${userName}'s ${currentImage === "avatar" ? "profile photo" : "cover photo"}`}
          fill
          sizes="90vw"
          className="object-contain rounded-lg shadow-2xl"
          unoptimized={process.env.NODE_ENV === "development"}
          loading="lazy"
        />
      </div>
    </div>
  );
}