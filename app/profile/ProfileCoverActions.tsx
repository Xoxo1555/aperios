"use client";

import { useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { useSession } from "components/SessionProvider";
import { useLanguage } from "lib/i18n";
import { useRouter } from "next/navigation";
import { BiIcon } from "components/BiIcon";

interface ProfileCoverActionsProps {
  coverImage: string | null;
}

export default function ProfileCoverActions({ coverImage }: ProfileCoverActionsProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { setUser } = useSession();
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
          const res = await fetch("/api/me/cover", {
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
    // Reset input so same file can be selected again
    if (e.target) e.target.value = "";
  }

  function triggerFileInput(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  }

  async function removeCover() {
    if (!confirm(t("remove_cover_photo"))) return;
    setUploading(true);
    try {
      const res = await fetch("/api/me/cover", { method: "DELETE" });
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

  const buttonStyle = {
    position: "absolute" as const,
    bottom: "1rem",
    right: "1rem",
    zIndex: 20,
    background: "rgba(0, 0, 0, 0.75)",
    border: "1px solid rgba(255, 255, 255, 0.25)",
    color: "white",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    padding: "0.5rem 0.875rem",
    borderRadius: "0.5rem",
    fontSize: "0.75rem",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    cursor: "pointer",
    transition: "all 0.2s ease",
    opacity: uploading ? 0.6 : 1,
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)",
  } as React.CSSProperties;

  const hoverStyle = {
    background: "rgba(0, 0, 0, 0.95)",
    borderColor: "rgba(255, 255, 255, 0.5)",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
  } as React.CSSProperties;

  const removeButtonStyle = {
    ...buttonStyle,
    bottom: "3rem",
    padding: "0.5rem",
    background: "rgba(214, 117, 117, 0.8)",
    borderColor: "rgba(214, 117, 117, 0.4)",
  } as React.CSSProperties;

  const removeHoverStyle = {
    background: "rgba(214, 117, 117, 0.95)",
    borderColor: "rgba(214, 117, 117, 0.6)",
  } as React.CSSProperties;

  return (
    <>
      <button
        style={buttonStyle}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverStyle)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, buttonStyle)}
        onClick={triggerFileInput}
        disabled={uploading}
        aria-label={t("change_cover_photo")}
      >
        {uploading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>{t("uploading")}</span>
          </>
        ) : (
          <>
            <BiIcon name="bi-camera" style={{ fontSize: "0.875rem" }} />
            <span>{t("change_cover_photo")}</span>
          </>
        )}
      </button>
      {coverImage && (
        <button
          style={removeButtonStyle}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, removeHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, removeButtonStyle)}
          onClick={removeCover}
          disabled={uploading}
          aria-label={t("remove_cover_photo")}
        >
          <BiIcon name="bi-trash" style={{ fontSize: "0.875rem" }} />
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />
    </>
  );
}