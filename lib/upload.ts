import { mkdir, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { join, normalize, extname } from "path";
import sharp from "sharp";
import * as exifr from "exifr";
import { orientationFrom } from "./utils";

/**
 * Upload security policy.
 *
 *  - Only real raster image formats are accepted: JPEG, PNG, WebP.
 *    SVG, GIF, HEIC/HEIF, TIFF etc. are rejected — SVG can carry scripts and
 *    HEIC/TIFF are not consistently re-encoded by sharp on every runtime.
 *  - Size caps: 10 MB for profile previews (avatar / cover), 50 MB for the
 *    original HD source of a photo.
 *  - HD source files (destined for print) are written under `storage/hd/`,
 *    OUTSIDE of `public/`, and are never served as static URLs — they can
 *    only be fetched through the authenticated `/api/photos/[id]/file`
 *    endpoint after an ownership / purchase entitlement check.
 */

export const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const MAX_PREVIEW_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MAX_HD_BYTES = 50 * 1024 * 1024; // 50 Mo

export function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime);
}

export function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/** Formats réellement autorisés après sniffing des magic bytes via sharp. */
const ALLOWED_SHARP_FORMATS = new Set(["jpeg", "jpg", "png", "webp"]);

/**
 * Valide le contenu binaire réel de l'image (magic bytes) via sharp.
 * Ne fait JAMAIS confiance au header `file.type` envoyé par le navigateur.
 * `failOn:"error"` garantit qu'un SVG/polyglot ou un fichier corrompu est rejeté.
 */
export async function assertValidImageBytes(bytes: Buffer): Promise<void> {
  let meta: any;
  try {
    meta = await sharp(bytes, { failOn: "error" }).metadata();
  } catch {
    throw new Error("Fichier image invalide ou corrompu.");
  }
  if (!meta.format || !ALLOWED_SHARP_FORMATS.has(meta.format)) {
    throw new Error("Format d'image non supporté (JPEG, PNG ou WebP uniquement) — contenu réel invalide.");
  }
  if (!meta.width || !meta.height) {
    throw new Error("Image sans dimensions valides.");
  }
}

/** Sanitizes a filename so it can never escape its directory or collide. */
function safeFileName(input: string): string {
  const cleaned = input.replace(/[^a-z0-9.-]/gi, "").replace(/\.{2,}/g, ".");
  const base = extname(cleaned).toLowerCase();
  return base === ".jpg" || base === ".png" || base === ".webp" ? cleaned : "image";
}

/**
 * Validates a base64 data-URL and returns { mime, bytes } or throws.
 * Only JPEG/PNG/WebP, size-capped, and never trusting the caller's extension.
 */
export function decodeImageDataUrl(base64: string, maxBytes: number): { mime: AllowedImageMime; bytes: Buffer } {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Format de fichier invalide.");
  const mime = match[1];
  if (!isAllowedImageMime(mime)) throw new Error("Format d'image non supporté.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) throw new Error("Fichier vide.");
  if (bytes.length > maxBytes) {
    throw new Error(`Fichier trop volumineux (max ${Math.round(maxBytes / 1024 / 1024)} Mo).`);
  }
  return { mime, bytes };
}

/** Private root for HD source files (never exposed through /public). */
export function hdStorageRoot(): string {
  return join(process.cwd(), "storage", "hd");
}

/** Resolves an HD path previously stored in `photos.hd_path` to an absolute path. */
export function resolveHdPath(storedPath: string): string {
  const root = normalize(hdStorageRoot());
  const absolute = normalize(join(root, storedPath));
  if (!absolute.startsWith(root)) {
    throw new Error("Chemin HD invalide.");
  }
  return absolute;
}

/** Writes the original HD source into private storage and returns its relative path. */
export async function saveHdSource(
  bytes: Buffer,
  mime: string,
): Promise<{ hdPath: string; hdMime: string; hdSize: number }> {
  const year = new Date().getFullYear();
  const dir = join(hdStorageRoot(), String(year));
  await mkdir(dir, { recursive: true });
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const filename = `${Date.now().toString(36)}-${hash}.${extFromMime(mime)}`;
  const relPath = `${year}/${filename}`;
  await writeFile(join(dir, filename), bytes);
  return { hdPath: relPath, hdMime: mime, hdSize: bytes.length };
}

/** Remove a stored HD source file (best-effort, used on photo deletion). */
export async function deleteHdSource(storedPath: string | null): Promise<void> {
  if (!storedPath) return;
  try {
    const { unlink } = await import("fs/promises");
    await unlink(resolveHdPath(storedPath));
  } catch {
    /* File already gone or unreadable — nothing to do. */
  }
}

/**
 * Save an uploaded avatar/cover preview to /public/uploads/<subdir>/.
 * Returns the public URL path. Only JPEG/PNG/WebP, max 10 MB.
 */
export async function saveUploadedFile(
  base64: string,
  subdir: "avatars" | "covers",
  originalName?: string,
): Promise<{ url: string; diskPath: string; sizeBytes: number }> {
  const { mime, bytes } = decodeImageDataUrl(base64, MAX_PREVIEW_BYTES);
  // Validation magic bytes même pour les avatars/covers (SVG polyglot bloqué)
  await assertValidImageBytes(bytes);
  const ext = extFromMime(mime);
  const prefix = subdir === "avatars" ? "av" : "cv";
  const nameBase = safeFileName(originalName ?? "image").replace(/\.[a-z0-9]+$/i, "");
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const filename = `${prefix}-${Date.now().toString(36)}-${hash}-${nameBase.slice(0, 32)}.${ext}`;

  const relDir = `public/uploads/${subdir}`;
  const absDir = join(process.cwd(), relDir);
  await mkdir(absDir, { recursive: true });
  const absPath = join(absDir, filename);
  await writeFile(absPath, bytes);

  return {
    url: `/uploads/${subdir}/${filename}`,
    diskPath: absPath,
    sizeBytes: bytes.length,
  };
}

export interface ProcessedPhoto {
  fullUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
  exif: Record<string, unknown> | null;
  hdPath: string | null;
  hdMime: string | null;
  hdSize: number | null;
}

const EXIF_FIELDS = [
  "Make", "Model", "LensModel", "FocalLength", "FocalLengthIn35mmFormat",
  "ISO", "FNumber", "ExposureTime", "DateTimeOriginal",
] as const;

function formatShutter(exposureTime: number | undefined): string | undefined {
  if (!exposureTime) return undefined;
  return exposureTime < 1 ? `1/${Math.round(1 / exposureTime)}s` : `${exposureTime}s`;
}

/**
 * Processes a real uploaded photo for the marketplace:
 *  - decodes the actual image bytes with `sharp` and re-encodes a
 *    high-resolution "full" JPEG (max 2400px on the long edge) plus a
 *    lightweight "thumb" (600px) for grids/carousels.
 *  - extracts genuine EXIF metadata from the original bytes via `exifr`.
 *  - stores the untouched original HD source privately in `storage/hd/<year>/`
 *    (never in /public) so it can only be downloaded through the protected
 *    `/api/photos/[id]/file` endpoint.
 * Only JPEG/PNG/WebP are accepted, capped at 50 MB (HD source).
 */
export async function processAndSavePhoto(base64: string): Promise<ProcessedPhoto> {
  const { mime, bytes } = decodeImageDataUrl(base64, MAX_HD_BYTES);
  return processAndSavePhotoBytes(mime, bytes);
}

/** Buffer variant used by the FormData upload route (avoids re-encoding). */
export async function processAndSavePhotoBytes(
  mime: AllowedImageMime,
  original: Buffer,
): Promise<ProcessedPhoto> {
  if (!isAllowedImageMime(mime)) throw new Error("Format d'image non supporté.");
  if (original.length === 0) throw new Error("Fichier vide.");
  if (original.length > MAX_HD_BYTES) {
    throw new Error(`Fichier trop volumineux (max ${Math.round(MAX_HD_BYTES / 1024 / 1024)} Mo).`);
  }
  // Sécurité : sniff des magic bytes — le header `file.type` est spoofable.
  await assertValidImageBytes(original);

  // Real EXIF extraction from the untouched original bytes (re-encoding strips EXIF)
  let exif: Record<string, unknown> | null = null;
  try {
    const meta = await exifr.parse(original, { pick: EXIF_FIELDS as unknown as string[] });
    if (meta) {
      const camera = [meta.Make, meta.Model].filter(Boolean).join(" ").trim();
      const focal = meta.FocalLengthIn35mmFormat ?? meta.FocalLength;
      exif = {
        ...(camera ? { camera } : {}),
        ...(meta.LensModel ? { lens: String(meta.LensModel) } : {}),
        ...(meta.ISO ? { iso: String(meta.ISO) } : {}),
        ...(focal ? { focalLength: `${Math.round(focal)}mm` } : {}),
        ...(meta.FNumber ? { aperture: `f/${Number(meta.FNumber).toFixed(1)}` } : {}),
        ...(formatShutter(meta.ExposureTime) ? { shutterSpeed: formatShutter(meta.ExposureTime) } : {}),
        ...(meta.DateTimeOriginal ? { takenAt: new Date(meta.DateTimeOriginal).toISOString().slice(0, 10) } : {}),
      };
      if (Object.keys(exif).length === 0) exif = null;
    }
  } catch {
    exif = null; // no readable EXIF — not an error, just nothing to report
  }

  const image = sharp(original, { failOn: "error" }).rotate(); // auto-orient from EXIF before stripping it
  const meta = await image.metadata();
  const width = meta.width ?? 1600;
  const height = meta.height ?? 1067;
  const orientation = orientationFrom(width, height);

  const year = new Date().getFullYear();
  const dir = `public/uploads/photos/${year}`;
  const absDir = join(process.cwd(), dir);
  await mkdir(absDir, { recursive: true });

  const hash = createHash("sha256").update(original).digest("hex").slice(0, 10);
  const base = `${Date.now().toString(36)}-${hash}`;

  const fullName = `${base}-full.jpg`;
  const thumbName = `${base}-thumb.jpg`;

  const fullBuffer = await sharp(original, { failOn: "error" })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  await writeFile(join(absDir, fullName), fullBuffer);

  const thumbBuffer = await sharp(original, { failOn: "error" })
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  await writeFile(join(absDir, thumbName), thumbBuffer);

  // Isolate the original HD source outside of /public.
  const hd = await saveHdSource(original, mime);

  return {
    fullUrl: `/uploads/photos/${year}/${fullName}`,
    thumbUrl: `/uploads/photos/${year}/${thumbName}`,
    width,
    height,
    orientation,
    exif,
    hdPath: hd.hdPath,
    hdMime: hd.hdMime,
    hdSize: hd.hdSize,
  };
}