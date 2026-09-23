import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "lib/auth";
import { db } from "db";
import { photos } from "db/schema";
import { eq } from "drizzle-orm";
import { processAndSavePhotoBytes, isAllowedImageMime, assertValidImageBytes, MAX_HD_BYTES } from "lib/upload";
import { isUniqueViolation } from "lib/pg-errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const uploadFormSchema = z
  .object({
    title: z.string().trim().max(200).nullish(),
    licenseType: z.enum(["free", "limited"]).default("free"),
    totalEditions: z.coerce
      .number({ error: "Le nombre d'éditions doit être un nombre." })
      .int("Le nombre d'éditions doit être un entier.")
      .min(1, "Le nombre d'éditions doit être au moins 1.")
      .max(100_000, "Le nombre d'éditions ne peut pas dépasser 100 000.")
      .nullish(),
  })
  /* Invariant métier encodé dans la validation : une licence limitée doit
   * avoir un stock d'éditions positif. Rejeté en 400 clair, jamais laissé
   * filer jusqu'au CHECK `photos_edition_bounds` (qui produirait un 500). */
  .superRefine((data, ctx) => {
    if (data.licenseType === "limited" && data.totalEditions == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalEditions"],
        message: "Le nombre d'éditions est requis pour une licence limitée.",
      });
    }
  });

export async function POST(request: NextRequest) {
  const user = await requireCreator();
  if (!user) {
    return NextResponse.json(
      { error: user ? "Accès refusé." : "Authentification requise." },
      { status: user ? 403 : 401 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  /* Strict MIME allowlist — première barrière (header client spoofable). */
  if (!isAllowedImageMime(file.type)) {
    return NextResponse.json(
      { error: "Format d'image non supporté (JPEG, PNG ou WebP uniquement)." },
      { status: 415 },
    );
  }

  if (file.size > MAX_HD_BYTES) {
    return NextResponse.json(
      { error: `Fichier trop volumineux (max ${MAX_HD_BYTES / 1024 / 1024} Mo).` },
      { status: 413 },
    );
  }

  const parsed = uploadFormSchema.safeParse({
    title: form.get("title"),
    licenseType: form.get("licenseType"),
    totalEditions: form.get("totalEditions") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }
  const { title, licenseType, totalEditions } = parsed.data;
  const editions = licenseType === "limited" ? totalEditions : null;

  const bytes = Buffer.from(await file.arrayBuffer());

  // Zero-Trust : sniff des magic bytes réels via sharp (failOn:"error").
  // Un attaquant peut envoyer `file.type="image/jpeg"` avec un SVG/polyglot.
  try {
    await assertValidImageBytes(bytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fichier image invalide.";
    return NextResponse.json({ error: message }, { status: 415 });
  }

  let processed;
  try {
    processed = await processAndSavePhotoBytes(file.type as Parameters<typeof processAndSavePhotoBytes>[0], bytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process image";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const slugBase = title?.trim() || file.name.replace(/\.[^/.]+$/, "");
  const slug = slugBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200) || "photo";

  let finalSlug = slug;
  let counter = 0;
  while (true) {
    const existing = await db
      .select({ id: photos.id })
      .from(photos)
      .where(eq(photos.slug, finalSlug))
      .limit(1);
    if (!existing.length) break;
    counter++;
    finalSlug = `${slug}-${counter}`;
  }

  try {
    const [insertedPhoto] = await db
      .insert(photos)
      .values({
        title: title?.trim() || file.name,
        slug: finalSlug,
        imageUrl: processed.fullUrl,
        thumbUrl: processed.thumbUrl,
        width: processed.width,
        height: processed.height,
        orientation: processed.orientation,
        exif: processed.exif,
        licenseType,
        photographerId: user.id,
        totalEditions: editions,
        availableStock: editions,
        hdPath: processed.hdPath,
        hdMime: processed.hdMime,
        hdSize: processed.hdSize,
        isPublished: false,
      })
      .returning();

    return NextResponse.json(insertedPhoto, { status: 201 });
  } catch (error) {
    console.error("Database insert error:", error);
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A photo with this title already exists. Please try a different title." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to save photo" }, { status: 500 });
  }
}