"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "lib/i18n";
import { blurDataUrl } from "lib/utils";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExpand, faMagnifyingGlassPlus, faMinus, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";

interface Props {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

export default function Lightbox({ src, alt, open, onClose }: Props) {
  const { t } = useLanguage();
  const [scale, setScale] = useState(1);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    setScale(1);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(4, s + 0.5));
      if (e.key === "-") setScale((s) => Math.max(1, s - 0.5));
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const controlStyle = {
    width: 44,
    height: 44,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    backdropFilter: "blur(12px)",
  } as const;

  const content = (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      {/* Bouton de fermeture dédié, ancré au viewport : reste visible et
          tapable (48×48) même sur mobile, indépendamment du contenu de la
          fiche qui peut être décalé horizontalement. */}
      <button
        type="button"
        aria-label={t("close")}
        title={t("close")}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: "fixed",
          top: "max(0.75rem, env(safe-area-inset-top))",
          right: "max(0.75rem, env(safe-area-inset-right))",
          zIndex: 2010,
          width: 48,
          height: 48,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          background: "rgba(20,20,22,0.78)",
          border: "1px solid rgba(255,255,255,0.28)",
          color: "#fff",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
          cursor: "pointer",
        }}
      >
        <FontAwesomeIcon icon={faXmark} style={{ fontSize: 22 }} />
      </button>

      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()} style={{ paddingRight: "4.75rem" }}>
        <div className="lightbox-hint">
          <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="me-1" /> {Math.round(scale * 100)}%
        </div>
        <div className="flex items-center gap-2">
          <button className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500" type="button" aria-label={t("zoom_in")} title={t("zoom_in")} onClick={() => setScale((s) => Math.min(4, s + 0.5))} style={controlStyle}>
            <FontAwesomeIcon icon={faPlus} className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
          </button>
          <button className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500" type="button" aria-label={t("zoom_out")} title={t("zoom_out")} onClick={() => setScale((s) => Math.max(1, s - 0.5))} style={controlStyle}>
            <FontAwesomeIcon icon={faMinus} className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
          </button>
          <button className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500" type="button" aria-label={t("actual_size")} title={t("actual_size")} onClick={() => setScale(1)} style={controlStyle}>
            <FontAwesomeIcon icon={faExpand} className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
          </button>
        </div>
      </div>
      <div className="lightbox-stage" onClick={(e) => e.stopPropagation()}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes="90vw"
          className="object-contain"
          unoptimized={process.env.NODE_ENV === "development"}
          style={{ transform: `scale(${scale})`, transition: "transform 0.25s ease" }}
          loading="lazy"
          quality={100}
          placeholder="blur"
          blurDataURL={blurDataUrl()}
        />
      </div>
    </div>
  );

  /* Portail vers <body> : le visualiseur échappe au conteneur `overflow-hidden`
     de la fiche (et à tout décalage horizontal de la page), ce qui garantit
     que le bouton X est bien ancré au coin supérieur droit du viewport. */
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
