"use client";

import { useState } from "react";
import Lightbox from "./Lightbox";
import { useLanguage } from "lib/i18n";
import { blurDataUrl } from "lib/utils";
import Image from "next/image";
import { BiIcon } from "components/BiIcon";

interface Props {
  src: string;
  alt: string;
  color?: string | null;
  priority?: boolean;
}

export default function PhotoImage({ src, alt, color, priority = true }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="photo-image-wrap relative w-full aspect-[4/3] overflow-hidden rounded-xl"
        onClick={() => setOpen(true)}
        aria-label={t("enlarge_title", { title: alt })}
        style={{ background: "#141416" }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 58vw"
          unoptimized={process.env.NODE_ENV === "development"}
          className="object-contain"
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          quality={95}
          placeholder="blur"
          blurDataURL={blurDataUrl(color)}
        />
        <span className="photo-zoom-hint inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500" style={{ background: "rgba(20,20,22,0.60)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)", color: "#FFFFFF", fontSize: "0.78rem", fontWeight: 600 }}>
          <BiIcon name="bi-zoom-in" className="text-white" style={{ fontSize: 18 }} />{t("click_to_enlarge")}
        </span>
      </button>
      <Lightbox src={src} alt={alt} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
