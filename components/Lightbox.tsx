"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "lib/i18n";
import { blurDataUrl } from "lib/utils";
import Image from "next/image";
import { BiIcon } from "components/BiIcon";

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

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-hint">
          <BiIcon name="bi-zoom-in" className="me-1" /> {Math.round(scale * 100)}%
        </div>
        <div className="flex items-center gap-2">
          <button className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500" aria-label={t("zoom_in")} onClick={() => setScale((s) => Math.min(4, s + 0.5))} style={{ width: 44, height: 44, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}>
            <BiIcon name="bi-plus-lg" className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
          </button>
          <button className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500" aria-label={t("zoom_out")} onClick={() => setScale((s) => Math.max(1, s - 0.5))} style={{ width: 44, height: 44, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}>
            <BiIcon name="bi-dash-lg" className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
          </button>
          <button className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500" aria-label={t("actual_size")} onClick={() => setScale(1)} style={{ width: 44, height: 44, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}>
            <BiIcon name="bi-expand" className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
          </button>
          <button className="group flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500" aria-label={t("close")} onClick={onClose} style={{ width: 44, height: 44, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}>
            <BiIcon name="bi-x-lg" className="text-white group-hover:text-amber-400" style={{ fontSize: 18 }} />
          </button>
        </div>
      </div>
      <div
        className="lightbox-stage"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) =>
          setScale((s) => Math.min(4, Math.max(1, s + (e.deltaY < 0 ? 0.2 : -0.2))))
        }
      >
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
}