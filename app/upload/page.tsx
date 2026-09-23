"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "components/SessionProvider";
import { useLanguage } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

export default function UploadPage() {
  const router = useRouter();
  const { user } = useSession();
  const { t } = useLanguage();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [licenseType, setLicenseType] = useState<"free" | "limited">("free");
  const [totalEditions, setTotalEditions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadedPhoto, setUploadedPhoto] = useState<{ id: number; title: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (user === null) {
      router.replace("/login");
    }
  }, [user, router]);

  function handleFileChange(f: File | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  if (!user) {
    return null;
  }

  if (user.role === "buyer") {
    return (
      <div className="container py-5 text-center">
        <div className="mx-auto" style={{ maxWidth: 480 }}>
          <BiIcon name="bi-camera" style={{ fontSize: "2.5rem", color: "var(--ap-muted)" }} />
          <h1 className="font-display font-bold mt-3 mb-2">{t("creator_only")}</h1>
          <p className="text-muted-2 mb-4">
            {t("creator_only_sub")}
          </p>
          <Link href="/profile" className="btn btn-gold">
            <BiIcon name="bi-person-circle" className="me-2" />
            {t("go_to_profile")}
          </Link>
        </div>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!file) {
      setError(t("select_image_file"));
      return;
    }
    if (licenseType === "limited" && (!totalEditions || parseInt(totalEditions, 10) <= 0)) {
      setError(t("valid_editions"));
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (title.trim()) formData.append("title", title.trim());
      formData.append("licenseType", licenseType);
      if (licenseType === "limited") formData.append("totalEditions", totalEditions);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("upload_failed"));
        setLoading(false);
        return;
      }

      setUploadedPhoto({ id: data.id, title: data.title });
      setLoading(false);
    } catch {
      setError(t("something_went_wrong"));
      setLoading(false);
    }
  }

  async function publishNow() {
    if (!uploadedPhoto) return;
    setPublishing(true);
    setError("");
    try {
      const res = await fetch(`/api/photos/${uploadedPhoto.id}/publish`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("unable_publish"));
        setPublishing(false);
        return;
      }
      setPublished(true);
      setPublishing(false);
      setTimeout(() => router.push("/profile"), 1200);
    } catch {
      setError(t("something_went_wrong"));
      setPublishing(false);
    }
  }

  if (uploadedPhoto) {
    return (
      <div className="container py-5 text-center">
        <div className="mx-auto" style={{ maxWidth: 480 }}>
          <BiIcon name="bi-check-circle" style={{ fontSize: "2.5rem", color: "var(--ap-green, #2f8f56)" }} />
          <h1 className="font-display font-bold mt-3 mb-2">{t("photo_uploaded")}</h1>
          <p className="text-muted-2 mb-4">
            {t("photo_uploaded_sub", { title: uploadedPhoto.title })}
          </p>

          {error && (
            <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.85rem" }}>
              <BiIcon name="bi-exclamation-triangle" className="me-2" />
              {error}
            </div>
          )}

          {published ? (
            <div className="alert alert-success py-2" style={{ fontSize: "0.9rem" }}>
              <BiIcon name="bi-check-lg" className="me-2" />
              {t("published_redirecting")}
            </div>
          ) : (
            <div className="grid gap-2">
              <button className="btn btn-gold btn-lg" onClick={publishNow} disabled={publishing}>
                {publishing ? <span className="spinner-border spinner-border-sm" /> : t("publish_now")}
              </button>
              <Link href="/profile" className="btn btn-ghost">
                {t("publish_later")}
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <div className="mx-auto" style={{ maxWidth: 640 }}>
        <h1 className="font-display font-bold mb-1">{t("upload_photo")}</h1>
        <p className="text-muted-2 mb-4" style={{ fontSize: "0.92rem" }}>
          {t("upload_photo_sub")}
        </p>

        {error && (
          <div className="alert alert-danger py-2" style={{ fontSize: "0.85rem" }}>
            <BiIcon name="bi-exclamation-triangle" className="me-2" />
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="mb-3">
            <label className="form-label">{t("photo_file")}</label>
            <input
              className="form-control"
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              required
            />
          </div>

          {previewUrl && (
            <div className="mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={t("preview_label")}
                style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, objectFit: "cover" }}
              />
            </div>
          )}

          <div className="mb-3">
            <label className="form-label">{t("title_optional")}</label>
            <input
              className="form-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("title_placeholder")}
            />
          </div>

          <div className="mb-3">
            <label className="form-label">{t("license_label")}</label>
            <div className="grid gap-2">
              <label className={`role-card ${licenseType === "free" ? "active" : ""}`}>
                <input
                  type="radio"
                  name="licenseType"
                  className="form-check-input"
                  checked={licenseType === "free"}
                  onChange={() => setLicenseType("free")}
                />
                <span className="role-icon">
                  <BiIcon name="bi-download" />
                </span>
                <span>
                  <span className="role-title">{t("free_download")}</span>
                  <span className="role-desc">{t("free_download_desc")}</span>
                </span>
              </label>
              <label className={`role-card ${licenseType === "limited" ? "active" : ""}`}>
                <input
                  type="radio"
                  name="licenseType"
                  className="form-check-input"
                  checked={licenseType === "limited"}
                  onChange={() => setLicenseType("limited")}
                />
                <span className="role-icon">
                  <BiIcon name="bi-award" />
                </span>
                <span>
                  <span className="role-title">{t("limited_print")}</span>
                  <span className="role-desc">{t("limited_print_desc")}</span>
                </span>
              </label>
            </div>
          </div>

          {licenseType === "limited" && (
            <div className="mb-3">
              <label className="form-label">{t("number_of_editions")}</label>
              <input
                className="form-control"
                type="number"
                min={1}
                value={totalEditions}
                onChange={(e) => setTotalEditions(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={t("editions_example")}
                required
              />
            </div>
          )}

          <button className="btn btn-gold w-full btn-lg" type="submit" disabled={loading}>
            {loading ? <span className="spinner-border spinner-border-sm" /> : t("upload_photo")}
          </button>
        </form>
      </div>
    </div>
  );
}
