import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { photoTags, photos, tags } from "db/schema";
import { requireCreator } from "lib/auth";
import { isAdmin } from "lib/rbac";
import { orientationFrom, slugify } from "lib/utils";
import { processAndSavePhoto } from "lib/upload";
import { z } from "zod";

export const dynamic = "force-dynamic";

const uploadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullish(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{3,8}$/, "Couleur invalide")
    .nullish(),
  licenseType: z.enum(["free", "limited"]).default("free"),
  categoryId: z.coerce.number().int().positive().nullish(),
  basePrice: z.coerce.number().min(0).max(1_000_000).nullish(),
  totalEditions: z.coerce
    .number({ error: "Le nombre d'éditions doit être un nombre." })
    .int("Le nombre d'éditions doit être un entier.")
    .min(1, "Le nombre d'éditions doit être au moins 1.")
    .max(100_000, "Le nombre d'éditions ne peut pas dépasser 100 000.")
    .nullish(),
  tags: z.array(z.string().trim().max(60)).max(12).default([]),
  imageBase64: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/, "Format d'image non supporté").nullish(),
  imageUrl: z.string().trim().max(1000).nullish(),
  width: z.coerce.number().int().positive().nullish(),
  height: z.coerce.number().int().positive().nullish(),
});

export async function POST(req: NextRequest) {
  const user = await requireCreator();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise." },
      { status: user ? 403 : 401 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = uploadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const title = body.title;
  const licenseType = body.licenseType;
  const categoryId = body.categoryId ?? null;
  const basePrice = licenseType === "limited" ? Math.max(0, body.basePrice ?? 150) : 0;
  /* Zod garantit déjà un entier ≥ 1 ; le défaut 30 s'applique uniquement quand
   * le champ est absent (jamais une valeur invalide). */
  const totalEditions =
    licenseType === "limited" ? body.totalEditions ?? 30 : null;
  const description = body.description?.trim() || null;
  const color = body.color?.trim() || null;

  let imageUrl: string;
  let thumbUrl: string;
  let width: number;
  let height: number;
  let orientation: "landscape" | "portrait" | "square";
  let exif: Record<string, unknown> | null = null;
  let hdPath: string | null = null;
  let hdMime: string | null = null;
  let hdSize: number | null = null;

  if (body.imageBase64) {
    /* Real upload path: decode the actual file, generate thumbnail + full
     * resolution JPEGs on disk, extract genuine EXIF from the bytes, and
     * isolate the original HD source in private storage. */
    try {
      const processed = await processAndSavePhoto(body.imageBase64);
      imageUrl = processed.fullUrl;
      thumbUrl = processed.thumbUrl;
      width = processed.width;
      height = processed.height;
      orientation = processed.orientation;
      exif = processed.exif;
      hdPath = processed.hdPath;
      hdMime = processed.hdMime;
      hdSize = processed.hdSize;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Échec du traitement de l'image.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else if (body.imageUrl && body.imageUrl.trim()) {
    /* Legacy/manual path: an already-hosted image URL. Restricted to admins
     * so a photographer can never point the marketplace at an arbitrary URL. */
    if (!isAdmin(user)) {
      return NextResponse.json(
        { error: "Le téléversement par URL est réservé aux administrateurs." },
        { status: 403 },
      );
    }
    const candidate = body.imageUrl.trim();
    const isLocal = /^\/images\//.test(candidate) || /^\/uploads\//.test(candidate);
    const isTrustedRemote = /^https:\/\/(images\.|www\.|api\.)?unsplash\.com\//.test(candidate) ||
      /^https:\/\/[a-z0-9-]+\.(supabase\.co|cloudinary\.com|amazonaws\.com)\//.test(candidate);
    if (!isLocal && !isTrustedRemote) {
      return NextResponse.json(
        { error: "URL d'image non autorisée." },
        { status: 400 },
      );
    }
    imageUrl = candidate;
    thumbUrl = candidate;
    width = body.width ?? 1600;
    height = body.height ?? 1067;
    orientation = orientationFrom(width, height);
    exif = null;
  } else {
    return NextResponse.json({ error: "Veuillez sélectionner un fichier image à téléverser." }, { status: 400 });
  }

  const base = slugify(title) || "photo";
  const inserted = await db
    .insert(photos)
    .values({
      title,
      slug: `${base}-${Date.now().toString(36)}`,
      description,
      imageUrl,
      thumbUrl,
      width,
      height,
      orientation,
      color,
      licenseType,
      categoryId,
      photographerId: user.id,
      basePrice: String(basePrice),
      totalEditions,
      availableStock: totalEditions,
      exif,
      hdPath,
      hdMime,
      hdSize,
      isPublished: true,
    })
    .returning();

  const photo = inserted[0];

  // attach tags (get-or-create)
  const tagNames: string[] = body.tags ?? [];
  for (const name of tagNames.slice(0, 12)) {
    const trimmed = name.trim().toLowerCase().replace(/^#/, "");
    if (!trimmed) continue;
    const existing = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slugify(trimmed))).limit(1);
    let tagId: number;
    if (existing[0]) {
      tagId = existing[0].id;
    } else {
      const created = await db
        .insert(tags)
        .values({ name: trimmed, slug: slugify(trimmed) })
        .returning();
      tagId = created[0].id;
    }
    await db.insert(photoTags).values({ photoId: photo.id, tagId }).onConflictDoNothing();
  }

  return NextResponse.json(
    { photo: { id: photo.id, slug: photo.slug, title: photo.title, imageUrl: photo.imageUrl, exif: photo.exif } },
    { status: 201 },
  );
}