"use client";

import { BiIcon } from "components/BiIcon";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import * as exifr from "exifr";
import { formatNumber } from "lib/utils";
import { useLanguage, type DictKey } from "lib/i18n";
import { usePrice } from "lib/currency";
import Image from "next/image";
import type { CategoryDto } from "lib/types";

interface DashboardData {
  stats: {
    photoCount: number;
    downloads: number;
    likes: number;
    views: number;
    revenue: number;
    revenueLabel: string;
    grossSales: string;
    commission: string;
    availableBalance: number;
    availableBalanceLabel: string;
  };
  recentOrders: Array<{
    orderNumber: string;
    date: string;
    status: string;
    total: string;
    item: string;
    slug: string;
    edition: number | null;
    qty: number;
    size: string | null;
    mount: string | null;
  }>;
  myPhotos: Array<{
    id: number;
    slug: string;
    title: string;
    imageUrl: string;
    licenseType: string;
    downloads: number;
    likes: number;
    views: number;
    price: number;
    available: number | null;
    total: number | null;
  }>;
}

const PALETTE = [
  "#2F3E46", "#B23A48", "#3A5A40", "#4A4E69", "#CA6702", "#0077B6",
  "#6B705C", "#9B5DE5", "#D62828", "#1D3557", "#F4A261", "#2A9D8F",
  "#E63946", "#264653", "#7B2CBF", "#E9C46A",
];

const STATUS_KEY: Record<string, DictKey> = {
  pending: "status_pending",
  paid: "status_paid",
  shipped: "status_shipped",
  delivered: "status_delivered",
  cancelled: "status_cancelled",
};

export default function DashboardClient({ userName }: { userName: string }) {
  const { t } = useLanguage();
  const price = usePrice();
  const [data, setData] = useState<DashboardData | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    imageUrl: "",
    color: "#2F3E46",
    licenseType: "free" as "free" | "limited",
    categoryId: "",
    basePrice: "250",
    totalEditions: "30",
    tags: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [exifPreview, setExifPreview] = useState<Record<string, string> | null>(null);
  const [exifMsg, setExifMsg] = useState("");
  const [preview, setPreview] = useState("");

  const load = useCallback(async () => {
    try {
      const [dRes, mRes] = await Promise.all([fetch("/api/dashboard"), fetch("/api/meta")]);
      if (!dRes.ok) throw new Error("dashboard");
      setData(await dRes.json());
      setCategories((await mRes.json()).categories ?? []);
    } catch {
      setLoadError(t("unable_load_dashboard"));
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de données au montage, pattern volontaire
    load();
  }, [load]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  /** Live client-side EXIF preview only — the server re-extracts real EXIF
   *  from the uploaded bytes as the single source of truth on publish. */
  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setExifMsg(t("reading_exif"));
    try {
      const meta = await exifr.parse(f, {
        pick: ["Make", "Model", "LensModel", "FocalLength", "ISO", "FNumber", "ExposureTime", "DateTimeOriginal"],
      });
      if (meta && (meta.Make || meta.Model || meta.LensModel)) {
        setExifPreview({
          [t("exif_camera")]: [meta.Make, meta.Model].filter(Boolean).join(" "),
          [t("exif_lens")]: meta.LensModel ?? "—",
          "ISO": meta.ISO ? String(meta.ISO) : "—",
          [t("exif_focal")]: meta.FocalLength ? `${Math.round(meta.FocalLength)}mm` : "—",
          [t("exif_aperture")]: meta.FNumber ? `f/${Number(meta.FNumber).toFixed(1)}` : "—",
        });
        setExifMsg(t("exif_detected"));
      } else {
        setExifPreview(null);
        setExifMsg(t("exif_none"));
      }
    } catch {
      setExifPreview(null);
      setExifMsg(t("exif_none"));
    }
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    setUploading(true);
    setUploadError("");
    setSaved("");

    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        color: form.color,
        licenseType: form.licenseType,
        categoryId: form.categoryId || undefined,
        basePrice: form.basePrice,
        totalEditions: form.totalEditions,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      };

      if (file) {
        payload.imageBase64 = await fileToBase64(file);
      } else if (form.imageUrl.trim()) {
        payload.imageUrl = form.imageUrl.trim();
      } else {
        setUploadError(t("select_file_url"));
        setUploading(false);
        return;
      }

      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const resData = await res.json();
      if (!res.ok) {
        setUploadError(resData.error ?? t("publishing_failed"));
        setUploading(false);
        return;
      }
      setSaved(t("photo_published", { title: resData.photo.title }));
      setForm((f) => ({ ...f, title: "", description: "", tags: "", imageUrl: "" }));
      setFile(null);
      setPreview("");
      setExifPreview(null);
      setExifMsg("");
      load();
    } catch {
      setUploadError(t("publishing_failed"));
    } finally {
      setUploading(false);
    }
  }

  if (loadError) {
    return <div className="alert alert-danger m-4">{loadError}</div>;
  }
  if (!data) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-warning" role="status" />
      </div>
    );
  }

  const s = data.stats;

  return (
    <div className="container py-4">
      <div className="flex flex-wrap items-center justify-between mb-4">
        <div>
          <div className="gallery-label">{t("creator_space")}</div>
          <h1 className="font-display font-bold mb-1">{t("dashboard")}</h1>
          <p className="text-muted-2 mb-0">{t("welcome_creator", { name: userName })}</p>
        </div>
        <a href="#upload" className="btn btn-gold">
          <BiIcon name="bi-cloud-upload" className="me-2" />{t("publish_a_photo")}
        </a>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: t("stat_published_photos"), value: s.photoCount, icon: "bi-images" },
          { label: t("stat_downloads"), value: formatNumber(s.downloads), icon: "bi-cloud-arrow-down" },
          { label: t("stat_likes"), value: formatNumber(s.likes), icon: "bi-heart-fill" },
          { label: t("stat_views"), value: formatNumber(s.views), icon: "bi-eye" },
          { label: t("stat_net_earnings"), value: s.revenueLabel, icon: "bi-cash-stack", hint: t("stat_net_earnings_hint", { gross: s.grossSales }) },
          { label: t("available_balance"), value: s.availableBalanceLabel, icon: "bi-wallet2" },
        ].map((tile) => (
          <div className="col-6 col-md-4 col-lg text-center" key={tile.label} title={tile.hint}>
            <div className="stat-tile h-full flex flex-col items-center justify-center py-4">
              <BiIcon name={tile.icon} className="text-gold" style={{ fontSize: "1.2rem" }} />
              <div className="value font-display mt-1">{tile.value}</div>
              <div className="label">{tile.label}</div>
              {tile.hint && (
                <div className="flex justify-center">
                  <BiIcon name="bi-question-circle" className="text-muted-2" style={{ fontSize: "0.75rem" }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="row g-4">
        {/* Upload wizard */}
        <div className="col-lg-6">
          <div className="bg-surface rounded-2xl p-4" id="upload" style={{ border: "1px solid var(--ap-border)" }}>
            <h5 className="font-display font-bold mb-3">
              <BiIcon name="bi-cloud-upload" className="me-2 text-gold" />{t("publishing_wizard")}
            </h5>
            {saved && <div className="alert alert-success py-2" style={{ fontSize: "0.85rem" }}>{saved}</div>}
            {uploadError && <div className="alert alert-danger py-2" style={{ fontSize: "0.85rem" }}>{uploadError}</div>}
            <form onSubmit={upload}>
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label">{t("title_label")} *</label>
                  <input className="form-control" value={form.title} onChange={(e) => set("title", e.target.value)} required />
                </div>
                <div className="col-12">
                  <label className="form-label">{t("photo_file_exif")}</label>
                  <input className="form-control" type="file" accept="image/*" onChange={handleFile} />
                  {exifMsg && (
                    <div className="form-text" style={{ fontSize: "0.75rem" }}>
                      <BiIcon name="bi-camera" className="me-1" />{exifMsg}
                    </div>
                  )}
                  {preview && (
                    <div className="flex items-start gap-3 mt-2">
                      <Image
                        src={preview}
                        alt={t("photo_header")}
                        width={140}
                        height={100}
                        className="object-cover"
                        style={{ borderRadius: 8, border: "1px solid var(--ap-border)" }}
                        loading="lazy"
                      />
                      {exifPreview && (
                        <div className="exif-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", flex: 1 }}>
                          {Object.entries(exifPreview).map(([k, v]) => (
                            <div className="exif-tile" key={k}>
                              <div className="k">{k}</div>
                              <div className="v">{v}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {!file && (
                  <div className="col-12">
                    <label className="form-label">{t("or_paste_url")}</label>
                    <input className="form-control" value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://example.com/my-photograph.jpg" />
                  </div>
                )}
                <div className="col-12">
                  <label className="form-label">{t("description_label")}</label>
                  <textarea className="form-control" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label">{t("dominant_color")}</label>
                  <select className="form-select" value={form.color} onChange={(e) => set("color", e.target.value)}>
                    {PALETTE.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">{t("category_label")}</label>
                  <select className="form-select" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                    <option value="">{t("choose_placeholder")}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label">{t("license_type")}</label>
                  <div className="flex gap-3">
                    <label className="form-check">
                      <input className="form-check-input" type="radio" name="license" checked={form.licenseType === "free"} onChange={() => set("licenseType", "free")} />
                      <span className="form-check-label">{t("free_photo_donations")}</span>
                    </label>
                    <label className="form-check">
                      <input className="form-check-input" type="radio" name="license" checked={form.licenseType === "limited"} onChange={() => set("licenseType", "limited")} />
                      <span className="form-check-label">{t("limited_edition_for_sale")}</span>
                    </label>
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label">{t("keywords_label")}</label>
                  <input className="form-control" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="landscape, sunrise, minimal" />
                </div>
                {form.licenseType === "limited" && (
                  <>
                    <div className="col-md-6">
                      <label className="form-label">{t("base_price_label")}</label>
                      <input className="form-control" type="number" min="50" value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">{t("number_of_copies")}</label>
                      <input className="form-control" type="number" min="1" value={form.totalEditions} onChange={(e) => set("totalEditions", e.target.value)} />
                    </div>
                  </>
                )}
                <div className="col-12">
                  <button className="btn btn-gold w-full" type="submit" disabled={uploading}>
                    {uploading ? <span className="spinner-border spinner-border-sm" /> : <><BiIcon name="bi-rocket" className="me-2" />{t("publish_photo")}</>}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Photos + orders */}
        <div className="col-lg-6">
          <div className="bg-surface rounded-2xl p-4 mb-4" style={{ border: "1px solid var(--ap-border)" }}>
            <h5 className="font-display font-bold mb-3"><BiIcon name="bi-images" className="me-2 text-gold" />{t("my_photos_count", { count: String(s.photoCount) })}</h5>
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              <table className="table table-dark-ap table-sm align-middle">
                <thead>
                  <tr>
                    <th>{t("photo_header")}</th>
                    <th>{t("license_header")}</th>
                    <th className="text-right">DL</th>
                    <th className="text-right">{t("stat_likes")}</th>
                    <th className="text-right">{t("price_header")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.myPhotos.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/photo/${p.slug}`} className="flex items-center gap-2">
                          <Image
                            src={p.imageUrl}
                            alt={p.title}
                            width={40}
                            height={40}
                            className="object-cover"
                            style={{ borderRadius: 6 }}
                            unoptimized={process.env.NODE_ENV === "development"}
                            loading="lazy"
                          />
                          <span className="truncate" style={{ maxWidth: 160, fontSize: "0.82rem" }}>{p.title}</span>
                        </Link>
                      </td>
                      <td>
                        {p.licenseType === "free" ? (
                          <span className="badge-free badge rounded-pill">FREE</span>
                        ) : (
                          <span className="badge-limited badge rounded-pill">{p.available}/{p.total}</span>
                        )}
                      </td>
                      <td className="text-right" style={{ fontSize: "0.82rem" }}>{formatNumber(p.downloads)}</td>
                      <td className="text-right" style={{ fontSize: "0.82rem" }}>{formatNumber(p.likes)}</td>
                      <td className="text-right" style={{ fontSize: "0.82rem" }}>
                        {p.licenseType === "limited" ? price(p.price) : "—"}
                      </td>
                    </tr>
                  ))}
                  {data.myPhotos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-4">
                        <span className="inline-flex items-center justify-center rounded-circle mx-auto mb-2" style={{ width: 56, height: 56, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
                          <BiIcon name="bi-images" style={{ fontSize: "1.4rem", color: "var(--ap-gold)" }} />
                        </span>
                        <div className="font-display font-bold" style={{ fontSize: "0.98rem", color: "var(--ap-card-foreground)" }}>{t("no_photos_yet")}</div>
                        <div className="text-muted-2" style={{ fontSize: "0.85rem" }}>{t("no_photos_yet_sub")}</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
            <h5 className="font-display font-bold mb-3"><BiIcon name="bi-receipt" className="me-2 text-gold" />{t("recent_sales")}</h5>
            {data.recentOrders.length === 0 ? (
              <div className="text-center py-3">
                <span className="inline-flex items-center justify-center rounded-circle mx-auto mb-2" style={{ width: 56, height: 56, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
                  <BiIcon name="bi-receipt" style={{ fontSize: "1.4rem", color: "var(--ap-gold)" }} />
                </span>
                <div className="font-display font-bold" style={{ fontSize: "0.98rem", color: "var(--ap-card-foreground)" }}>{t("no_sales_yet")}</div>
                <div className="text-muted-2" style={{ fontSize: "0.85rem" }}>{t("no_sales_yet_sub")}</div>
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                {data.recentOrders.map((o, i) => (
                  <div key={i} className="flex justify-between items-center py-2" style={{ borderBottom: "1px solid var(--ap-border)" }}>
                    <div>
                      <Link href={`/photo/${o.slug}`} className="fw-semibold" style={{ fontSize: "0.88rem" }}>{o.item}</Link>
                      <div className="text-muted-2" style={{ fontSize: "0.72rem" }}>
                        {o.orderNumber} · {o.size ?? "—"} · {o.mount ?? "—"}{o.edition != null ? ` · Ed. ${o.edition}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-gold font-bold" style={{ fontSize: "0.9rem" }}>{o.total}</div>
                      <span className="badge rounded-pill uppercase" style={{ fontSize: "0.6rem", background: "rgba(52,211,153,0.15)", color: "var(--ap-green)" }}>{t(STATUS_KEY[o.status] ?? "status_pending")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
