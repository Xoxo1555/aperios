import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, photoTags, photos, tags, users } from "@/db/schema";
import { photoRowToDto } from "@/lib/dto";
import { requireSession } from "@/lib/auth";
import { canManageResource } from "@/lib/rbac";
import { deleteHdSource } from "@/lib/upload";
import { unlink } from "fs/promises";
import { join, normalize } from "path";

export const dynamic = "force-dynamic";

/**
 * Photo detail — accepts either a numeric id or a slug.
 * GET /api/photos/123   or   GET /api/photos/golden-meadow
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numeric = /^\d+$/.test(id);

  const conditions = numeric
    ? [eq(photos.id, parseInt(id, 10)), eq(photos.isPublished, true)]
    : [eq(photos.slug, id), eq(photos.isPublished, true)];

  const rows = await db
    .select({ photo: photos, category: categories, photographer: users })
    .from(photos)
    .leftJoin(categories, eq(photos.categoryId, categories.id))
    .innerJoin(users, eq(photos.photographerId, users.id))
    .where(and(...conditions))
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  const tagRows = await db
    .select({ name: tags.name, slug: tags.slug })
    .from(photoTags)
    .innerJoin(tags, eq(photoTags.tagId, tags.id))
    .where(inArray(photoTags.photoId, [rows[0].photo.id]));

  const dto = photoRowToDto({ ...rows[0], tags: tagRows });
  return NextResponse.json({ photo: dto });
}

/**
 * DELETE /api/photos/[id] — deletes a photo. Ownership enforced server-side:
 * only the owning photographer or an admin may delete. The private HD source
 * and the public previews are removed best-effort afterwards.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const { id } = await params;
  const photoId = parseInt(id, 10);
  if (Number.isNaN(photoId) || photoId <= 0) {
    return NextResponse.json({ error: "Identifiant de photo invalide." }, { status: 400 });
  }

  const [photo] = await db
    .select({
      id: photos.id,
      photographerId: photos.photographerId,
      hdPath: photos.hdPath,
      imageUrl: photos.imageUrl,
      thumbUrl: photos.thumbUrl,
    })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);

  if (!photo) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  if (!canManageResource(user, photo.photographerId)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  await db.delete(photos).where(eq(photos.id, photoId));

  /* Best-effort file cleanup — never let a failed unlink abort the delete. */
  await deleteHdSource(photo.hdPath);
  for (const url of [photo.imageUrl, photo.thumbUrl]) {
    if (!url?.startsWith("/uploads/")) continue;
    try {
      const abs = normalize(join(process.cwd(), "public", url.replace(/^\//, "")));
      if (abs.startsWith(normalize(join(process.cwd(), "public")))) {
        await unlink(abs);
      }
    } catch {
      /* file already gone — ignore */
    }
  }

  return new NextResponse(null, { status: 204 });
}